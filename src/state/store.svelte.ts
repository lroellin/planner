import { nanoid } from 'nanoid';
import type { AppState, CalendarEvent, Teacher, Room, Subject, Group, Phase, ID } from '../types';
import { saveState, loadState } from './persistence';
import { pushUndo, undoState, redoState, canUndo as _canUndo, canRedo as _canRedo, clearUndo } from './undo';
import { createDefaultState } from './persistence';
import { annotateEventsWithConflicts } from '../conflicts/detector';
import { timeDiffMinutes, addMinutesToTime, formatDate } from '../utils/timeUtils';

// ─── Core reactive state ──────────────────────────────────────────────────────

let _state: AppState = $state(annotateEventsWithConflicts(loadState()));

let _canUndoState: boolean = $state(false);
let _canRedoState: boolean = $state(false);

function syncUndoState(): void {
  _canUndoState = _canUndo();
  _canRedoState = _canRedo();
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export function getState(): AppState { return _state; }
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
      teacherIds: ev.teacherIds === 'inherit'
        ? 'inherit'
        : ev.teacherIds.filter(tid => tid !== id),
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
      roomId: ev.roomId === id ? 'inherit' : ev.roomId,
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
  const events = _state.events
    .map(ev => {
      if (!Array.isArray(ev.groupId)) return ev;
      return { ...ev, groupId: ev.groupId.filter(gid => gid !== id) };
    })
    .filter(ev => {
      if (Array.isArray(ev.groupId)) return ev.groupId.length > 0;
      return ev.groupId !== id;
    });
  setState({
    ..._state,
    groups: _state.groups.filter(g => g.id !== id),
    phases: _state.phases.map(p => ({ ...p, groupIds: p.groupIds.filter(gid => gid !== id) })),
    events,
  });
}

// ─── Phase mutations ──────────────────────────────────────────────────────────

export function addPhase(label: string, startDay: number, endDay: number, groupIds: ID[]): void {
  setState({
    ..._state,
    phases: [..._state.phases, { id: nanoid(), label, startDay, endDay, groupIds }],
  });
}

export function updatePhase(id: ID, patch: Partial<Omit<Phase, 'id'>>): void {
  setState({
    ..._state,
    phases: _state.phases.map(p => p.id === id ? { ...p, ...patch } : p),
  });
}

export function removePhase(id: ID): void {
  setState({ ..._state, phases: _state.phases.filter(p => p.id !== id) });
}

// null for anything that isn't a real calendar date. A date input hands back ""
// when cleared, and Number("") is 0, so an unguarded parse used to store
// "NaN-NaN-NaN" — which makes every event's date unparseable and blanks the grid.
function snapToMonday(dateStr: string): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!parts) return null;
  const [y, m, d] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const dt = new Date(y, m - 1, d);
  dt.setFullYear(y); // years 0–99 would otherwise be remapped into the 1900s
  if (Number.isNaN(dt.getTime()) || dt.getMonth() !== m - 1) return null;
  const dow = dt.getDay();
  dt.setDate(dt.getDate() + (dow === 0 ? -6 : 1 - dow));
  return formatDate(dt);
}

export function resetToDefaults(): void {
  clearUndo();
  const fresh = createDefaultState();
  saveState(fresh);
  _state = annotateEventsWithConflicts(fresh);
  syncUndoState();
}

export function setWkStartDate(date: string): void {
  const monday = snapToMonday(date);
  if (!monday || monday === _state.wkStartDate) return;
  setState({ ..._state, wkStartDate: monday }, true);
}
