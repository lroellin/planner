import { nanoid } from 'nanoid';
import type { AppState, CalendarEvent, Teacher, Room, Subject, Group, ID } from '../types';
import { saveState, loadState } from './persistence';
import { pushUndo, undoState, redoState, canUndo, canRedo } from './undo';
import { annotateEventsWithConflicts } from '../conflicts/detector';

let _state = $state<AppState>(loadState());

export function getState(): AppState {
  return _state;
}

function snapshot(): AppState {
  // $state.snapshot strips the Svelte reactive proxy, returning a plain object
  // that structuredClone (used in undo.ts) can safely clone.
  return $state.snapshot(_state) as AppState;
}

export function setState(next: AppState, recordUndo = true): void {
  if (recordUndo) pushUndo(snapshot());
  const annotated = annotateEventsWithConflicts(next);
  saveState(annotated);
  _state = annotated;
}

export function undo(): void {
  const prev = undoState(snapshot());
  if (prev) {
    const annotated = annotateEventsWithConflicts(prev);
    saveState(annotated);
    _state = annotated;
  }
}

export function redo(): void {
  const next = redoState(snapshot());
  if (next) {
    const annotated = annotateEventsWithConflicts(next);
    saveState(annotated);
    _state = annotated;
  }
}

export { canUndo, canRedo };

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

export function addTeacher(name: string, color: string): void {
  const teacher: Teacher = { id: nanoid(), name, color };
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
  const subject: Subject = { id: nanoid(), ...s };
  setState({ ..._state, subjects: [..._state.subjects, subject] });
}

export function updateSubject(id: ID, patch: Partial<Omit<Subject, 'id'>>): void {
  setState({
    ..._state,
    subjects: _state.subjects.map(s => s.id === id ? { ...s, ...patch } : s),
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
  const group: Group = { id: nanoid(), label, enabled: true, order: maxOrder + 1 };
  setState({ ..._state, groups: [..._state.groups, group] });
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

export function setWkStartDate(date: string): void {
  setState({ ..._state, wkStartDate: date }, true);
}
