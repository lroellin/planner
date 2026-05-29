import { nanoid } from 'nanoid';
import type { AppState, CalendarEvent, Teacher, Room, Subject, Group, ID } from '../types';
import { saveState, loadState, loadStateForProject } from './persistence';
import { pushUndo, undoState, redoState, canUndo as _canUndo, canRedo as _canRedo, clearUndo } from './undo';
import { annotateEventsWithConflicts } from '../conflicts/detector';
import { generateInitials } from '../utils/colorUtils';
import { timeDiffMinutes, addMinutesToTime } from '../utils/timeUtils';
import {
  listProjects, createProject as _createProject, deleteProject as _deleteProject,
  renameProject, setActiveProjectId, getActiveProjectId,
  type ProjectMeta,
} from './projects';

// ─── Core reactive state ──────────────────────────────────────────────────────

let _state: AppState = $state(loadState());
let _projects: ProjectMeta[] = $state(listProjects());
let _activeProjectId: string | null = $state(getActiveProjectId());

// Reactive undo state — plain booleans synced after every mutation
let _canUndoState: boolean = $state(false);
let _canRedoState: boolean = $state(false);

function syncUndoState(): void {
  _canUndoState = _canUndo();
  _canRedoState = _canRedo();
}

function syncProjectState(): void {
  _projects = listProjects();
  _activeProjectId = getActiveProjectId();
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export function getState(): AppState { return _state; }
export function getProjects(): ProjectMeta[] { return _projects; }
export function getActiveProjectId2(): string | null { return _activeProjectId; }
export function canUndo(): boolean { return _canUndoState; }
export function canRedo(): boolean { return _canRedoState; }

// ─── State mutations ──────────────────────────────────────────────────────────

function snapshot(): AppState {
  return $state.snapshot(_state) as AppState;
}

export function setState(next: AppState, recordUndo = true): void {
  if (recordUndo) pushUndo(snapshot());
  const annotated = annotateEventsWithConflicts(next);
  saveState(annotated);
  _state = annotated;
  syncUndoState();
}

export function undo(): void {
  const prev = undoState(snapshot());
  if (prev) {
    const annotated = annotateEventsWithConflicts(prev);
    saveState(annotated);
    _state = annotated;
  }
  syncUndoState();
}

export function redo(): void {
  const next = redoState(snapshot());
  if (next) {
    const annotated = annotateEventsWithConflicts(next);
    saveState(annotated);
    _state = annotated;
  }
  syncUndoState();
}

// ─── Project management ───────────────────────────────────────────────────────

export function switchProject(id: ID): void {
  setActiveProjectId(id);
  clearUndo();
  syncProjectState();
  _state = annotateEventsWithConflicts(loadStateForProject(id));
  syncUndoState();
}

export function createNewProject(name: string): void {
  const project = _createProject(name);
  syncProjectState();
  switchProject(project.id);
}

export function renameCurrentProject(name: string): void {
  const id = getActiveProjectId();
  if (id) {
    renameProject(id, name);
    syncProjectState();
  }
}

export function deleteProjectById(id: ID): void {
  if (listProjects().length <= 1) return;
  _deleteProject(id);
  syncProjectState();
  if (getActiveProjectId() === id || _activeProjectId === id) {
    const remaining = listProjects();
    if (remaining[0]) switchProject(remaining[0].id);
  }
}

// ─── Event mutations ──────────────────────────────────────────────────────────

export function addEvent(ev: CalendarEvent): void {
  setState({ ..._state, events: [..._state.events, ev] });
}

export function updateEvent(id: ID, patch: Partial<Omit<CalendarEvent, 'id' | 'conflicts'>>): void {
  setState({
    ..._state,
    events: _state.events.map(ev => ev.id === id ? { ...ev, ...patch } : ev),
  });
}

export function removeEvent(id: ID): void {
  setState({ ..._state, events: _state.events.filter(ev => ev.id !== id) });
}

// ─── Teacher mutations ────────────────────────────────────────────────────────

export function addTeacher(name: string, shortName: string, color: string): void {
  const teacher: Teacher = { id: nanoid(), name, shortName, color };
  setState({ ..._state, teachers: [..._state.teachers, teacher] });
}

export function updateTeacher(id: ID, patch: Partial<Omit<Teacher, 'id'>>): void {
  setState({
    ..._state,
    teachers: _state.teachers.map(t => t.id === id ? { ...t, ...patch } : t),
  });
}

export function removeTeacher(id: ID): void {
  setState({
    ..._state,
    teachers: _state.teachers.filter(t => t.id !== id),
    subjects: _state.subjects.map(s => ({
      ...s,
      defaultTeacherIds: s.defaultTeacherIds.filter(tid => tid !== id),
    })),
    events: _state.events.map(ev => ({
      ...ev,
      teacherIds: ev.teacherIds ? ev.teacherIds.filter(tid => tid !== id) : null,
    })),
  });
}

// ─── Room mutations ───────────────────────────────────────────────────────────

export function addRoom(name: string, color: string, excludeFromConflictCheck: boolean): void {
  const room: Room = { id: nanoid(), name, color, excludeFromConflictCheck };
  setState({ ..._state, rooms: [..._state.rooms, room] });
}

export function updateRoom(id: ID, patch: Partial<Omit<Room, 'id'>>): void {
  setState({
    ..._state,
    rooms: _state.rooms.map(r => r.id === id ? { ...r, ...patch } : r),
  });
}

export function removeRoom(id: ID): void {
  setState({
    ..._state,
    rooms: _state.rooms.filter(r => r.id !== id),
    subjects: _state.subjects.map(s => ({
      ...s,
      defaultRoomId: s.defaultRoomId === id ? null : s.defaultRoomId,
    })),
    events: _state.events.map(ev => ({
      ...ev,
      roomId: ev.roomId === id ? null : ev.roomId,
    })),
  });
}

// ─── Subject mutations ────────────────────────────────────────────────────────

export function addSubject(s: Omit<Subject, 'id'>): void {
  setState({ ..._state, subjects: [..._state.subjects, { id: nanoid(), ...s }] });
}

export function updateSubject(id: ID, patch: Partial<Omit<Subject, 'id'>>): void {
  const oldSubject = _state.subjects.find(s => s.id === id);
  let events = _state.events;

  // When default duration changes, cascade to events whose duration still matches the old default
  if (
    oldSubject &&
    patch.defaultDurationMinutes !== undefined &&
    patch.defaultDurationMinutes !== oldSubject.defaultDurationMinutes
  ) {
    const oldDur = oldSubject.defaultDurationMinutes;
    const newDur = patch.defaultDurationMinutes;
    events = events.map(ev => {
      if (ev.subjectId !== id) return ev;
      if (timeDiffMinutes(ev.startTime, ev.endTime) !== oldDur) return ev; // manually overridden
      return { ...ev, endTime: addMinutesToTime(ev.startTime, newDur) };
    });
  }

  setState({
    ..._state,
    subjects: _state.subjects.map(s => s.id === id ? { ...s, ...patch } : s),
    events,
  });
}

export function removeSubject(id: ID): void {
  setState({
    ..._state,
    subjects: _state.subjects.filter(s => s.id !== id),
    events: _state.events.filter(ev => ev.subjectId !== id),
  });
}

// ─── Group mutations ──────────────────────────────────────────────────────────

export function addGroup(label: string): void {
  const maxOrder = _state.groups.reduce((m, g) => Math.max(m, g.order), -1);
  setState({ ..._state, groups: [..._state.groups, { id: nanoid(), label, enabled: true, order: maxOrder + 1 }] });
}

export function updateGroup(id: ID, patch: Partial<Omit<Group, 'id'>>): void {
  setState({
    ..._state,
    groups: _state.groups.map(g => g.id === id ? { ...g, ...patch } : g),
  });
}

export function removeGroup(id: ID): void {
  setState({
    ..._state,
    groups: _state.groups.filter(g => g.id !== id),
    events: _state.events.filter(ev => ev.groupId !== id),
  });
}

function snapToMonday(dateStr: string): string {
  // Parse as local date (split to avoid UTC offset issues)
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const dow = dt.getDay(); // 0=Sun, 1=Mon...
  const diff = dow === 0 ? -6 : 1 - dow; // shift back to Monday
  dt.setDate(dt.getDate() + diff);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function setWkStartDate(date: string): void {
  setState({ ..._state, wkStartDate: snapToMonday(date) }, true);
}
