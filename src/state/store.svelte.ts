import { nanoid } from 'nanoid';
import { ALL_GROUPS } from '../types';
import type {
  AppState, CalendarEvent, ConflictReport, GroupSelector,
  Teacher, Room, Subject, Group, Phase, ID, TimeWindow,
} from '../types';
import { saveState, loadState, createDefaultState, flushSave } from './persistence';
import {
  pushUndo, undoState, redoState, canUndo as _canUndo, canRedo as _canRedo, clearUndo,
  peekUndoLabel, peekRedoLabel,
} from './undo';
import { detectConflicts, attachConflicts } from '../conflicts/detector';
import { toast } from './ui.svelte';
import {
  timeDiffMinutes, addMinutesToTime, formatDate, orphanEvents, snapToSlot, phaseForDay,
  phaseGroups,
} from '../utils/timeUtils';

// ─── Core reactive state ──────────────────────────────────────────────────────

const _loaded = loadState();
const _loadedReports = detectConflicts(_loaded);

let _state: AppState = $state(attachConflicts(_loaded, _loadedReports));
// Detection is O(n²) per resource, so it runs once per mutation here and every
// view reads the same result instead of recomputing it.
let _conflicts: ConflictReport[] = $state(_loadedReports);
let _orphans: CalendarEvent[] = $state(orphanEvents(_loaded));

let _canUndoState: boolean = $state(false);
let _canRedoState: boolean = $state(false);

function syncUndoState(): void {
  _canUndoState = _canUndo();
  _canRedoState = _canRedo();
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export function getState(): AppState { return _state; }
export function getConflicts(): ConflictReport[] { return _conflicts; }
export function getOrphans(): CalendarEvent[] { return _orphans; }
/** Everything the toolbar and the conflict rail count as "needs attention". */
export function getIssueCount(): number { return _conflicts.length + _orphans.length; }
export function canUndo(): boolean { return _canUndoState; }
export function canRedo(): boolean { return _canRedoState; }

// ─── State mutations ──────────────────────────────────────────────────────────

function snapshot(): AppState {
  return $state.snapshot(_state) as AppState;
}

/** Apply a new state: detect conflicts once, persist, publish. */
function commit(next: AppState): void {
  const reports = detectConflicts(next);
  const annotated = attachConflicts(next, reports);
  saveState(annotated);
  _state = annotated;
  _conflicts = reports;
  _orphans = orphanEvents(annotated);
  syncUndoState();
}

export interface MutateOptions {
  recordUndo?: boolean;
  /**
   * Consecutive mutations sharing a key collapse into a single undo entry.
   * Dragging a colour picker fires an input event per mouse move; without this
   * one drag pushed ~50 entries and evicted the real history.
   */
  coalesceKey?: string;
  /** Names the action in the undo toast and the Undo button's tooltip. */
  label?: string;
}

let lastCoalesceKey: string | null = null;

export function setState(next: AppState, opts: MutateOptions = {}): void {
  const { recordUndo = true, coalesceKey, label = 'change' } = opts;
  if (recordUndo && !(coalesceKey !== undefined && coalesceKey === lastCoalesceKey)) {
    pushUndo(snapshot(), label);
  }
  lastCoalesceKey = coalesceKey ?? null;
  commit(next);
}

/** What Undo/Redo would act on next — shown in their tooltips. */
export function undoLabel(): string | null { return peekUndoLabel(); }
export function redoLabel(): string | null { return peekRedoLabel(); }

export function undo(): void {
  const entry = undoState(snapshot());
  lastCoalesceKey = null;
  if (!entry) {
    syncUndoState();
    return;
  }
  commit(entry.state);
  // Undo used to change the schedule with no acknowledgement at all, which is
  // unnerving on a grid where the affected card may be off-screen.
  toast(`Undid ${entry.label}`, { label: 'Redo', run: redo });
}

export function redo(): void {
  const entry = redoState(snapshot());
  lastCoalesceKey = null;
  if (!entry) {
    syncUndoState();
    return;
  }
  commit(entry.state);
  toast(`Redid ${entry.label}`, { label: 'Undo', run: undo });
}

// ─── Event mutations ──────────────────────────────────────────────────────────

/** Subject name for an event id — undo labels name the thing that moved. */
function eventLabel(id: ID, verb: string): string {
  const ev = _state.events.find(e => e.id === id);
  const name = ev ? _state.subjects.find(s => s.id === ev.subjectId)?.name : undefined;
  return name ? `${verb} ${name}` : verb;
}

export function addEvent(ev: CalendarEvent, label?: string): void {
  const name = _state.subjects.find(s => s.id === ev.subjectId)?.name;
  setState(
    { ..._state, events: [..._state.events, ev] },
    { label: label ?? (name ? `placing ${name}` : 'placing an event') },
  );
}

export function updateEvent(
  id: ID,
  patch: Partial<Omit<CalendarEvent, 'id' | 'conflicts'>>,
  label?: string,
): void {
  setState({
    ..._state,
    events: _state.events.map(ev => ev.id === id ? { ...ev, ...patch } : ev),
  }, { label: label ?? eventLabel(id, 'editing') });
}

export function removeEvent(id: ID): void {
  const label = eventLabel(id, 'deleting');
  setState({ ..._state, events: _state.events.filter(ev => ev.id !== id) }, { label });
}

/**
 * Copy an event onto other lanes at the same time. Every group has to attend
 * every lesson, so the same block gets placed three or four times by hand; this
 * turns that into one action. Clashes are left to the conflict panel to report —
 * the app never refuses a placement.
 */
export function copyEventToLanes(id: ID, groupIds: ID[]): void {
  const source = _state.events.find(e => e.id === id);
  if (!source || groupIds.length === 0) return;
  const { conflicts: _omit, ...base } = source;
  const copies: CalendarEvent[] = groupIds.map(groupId => ({
    ...base,
    id: nanoid(),
    groupId,
  }));
  const name = _state.subjects.find(s => s.id === source.subjectId)?.name ?? 'event';
  setState(
    { ..._state, events: [..._state.events, ...copies] },
    { label: `copying ${name} to ${copies.length} lane${copies.length === 1 ? '' : 's'}` },
  );
}

/** The lanes of an event's phase that do not already hold it at that time. */
export function lanesWithoutEvent(id: ID): Group[] {
  const ev = _state.events.find(e => e.id === id);
  if (!ev || ev.groupId === ALL_GROUPS) return [];
  const phase = phaseForDay(_state, ev.dayIndex);
  if (!phase) return [];
  return phaseGroups(_state, phase).filter(g =>
    g.id !== ev.groupId &&
    !_state.events.some(other =>
      other.id !== ev.id &&
      other.subjectId === ev.subjectId &&
      other.groupId === g.id &&
      other.dayIndex === ev.dayIndex &&
      other.startTime === ev.startTime,
    ),
  );
}

/**
 * Place a subject on the grid. Shared by the drag-drop handler, the cell picker
 * and the keyboard placement dialog so the three paths cannot drift apart.
 * Multi-group subjects are stored against the ALL_GROUPS sentinel and follow
 * whichever lanes their phase draws.
 */
export function placeSubject(
  subjectId: ID,
  dayIndex: number,
  startTime: string,
  groupId: GroupSelector,
): void {
  const subject = _state.subjects.find(s => s.id === subjectId);
  if (!subject) return;
  addEvent({
    id: nanoid(),
    subjectId,
    groupId: subject.isMultiGroup ? ALL_GROUPS : groupId,
    dayIndex,
    startTime,
    endTime: addMinutesToTime(startTime, subject.defaultDurationMinutes),
    teacherIds: 'inherit',
    roomId: 'inherit',
  });
}

/** Cut an event in two at `atTime`; no-op when the time is outside the event. */
export function splitEvent(id: ID, atTime: string): void {
  const ev = _state.events.find(e => e.id === id);
  if (!ev) return;
  const at = snapToSlot(atTime);
  if (at <= ev.startTime || at >= ev.endTime) return;

  const first: CalendarEvent = { ...ev, endTime: at, conflicts: undefined };
  const second: CalendarEvent = { ...ev, id: nanoid(), startTime: at, conflicts: undefined };

  setState({
    ..._state,
    events: _state.events.filter(e => e.id !== id).concat([first, second]),
  }, { label: eventLabel(id, 'splitting') });
}

// ─── Teacher mutations ────────────────────────────────────────────────────────

export function addTeacher(name: string, shortName: string, color: string): ID {
  const teacher: Teacher = { id: nanoid(), name, shortName, color, unavailable: [] };
  setState({ ..._state, teachers: [..._state.teachers, teacher] }, { label: `adding ${name}` });
  return teacher.id;
}

export function updateTeacher(id: ID, patch: Partial<Omit<Teacher, 'id'>>, opts: MutateOptions = {}): void {
  setState({
    ..._state,
    teachers: _state.teachers.map(t => t.id === id ? { ...t, ...patch } : t),
  }, { label: `editing ${_state.teachers.find(t => t.id === id)?.name ?? 'teacher'}`, ...opts });
}

export function removeTeacher(id: ID): void {
  const label = `deleting ${_state.teachers.find(t => t.id === id)?.name ?? 'teacher'}`;
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
  }, { label });
}

// ─── Room mutations ───────────────────────────────────────────────────────────

export function addRoom(name: string, color: string, excludeFromConflictCheck: boolean): ID {
  const room: Room = { id: nanoid(), name, color, excludeFromConflictCheck, unavailable: [] };
  setState({ ..._state, rooms: [..._state.rooms, room] }, { label: `adding ${name}` });
  return room.id;
}

export function updateRoom(id: ID, patch: Partial<Omit<Room, 'id'>>, opts: MutateOptions = {}): void {
  setState({
    ..._state,
    rooms: _state.rooms.map(r => r.id === id ? { ...r, ...patch } : r),
  }, { label: `editing ${_state.rooms.find(r => r.id === id)?.name ?? 'room'}`, ...opts });
}

export function removeRoom(id: ID): void {
  const label = `deleting ${_state.rooms.find(r => r.id === id)?.name ?? 'room'}`;
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
  }, { label });
}

// ─── Subject mutations ────────────────────────────────────────────────────────

export function addSubject(s: Omit<Subject, 'id'>): ID {
  const id = nanoid();
  setState(
    { ..._state, subjects: [..._state.subjects, { id, ...s }] },
    { label: `adding ${s.name}` },
  );
  return id;
}

export function updateSubject(id: ID, patch: Partial<Omit<Subject, 'id'>>, opts: MutateOptions = {}): void {
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
  }, { label: `editing ${oldSubject?.name ?? 'subject'}`, ...opts });
}

export function removeSubject(id: ID): void {
  const label = `deleting ${_state.subjects.find(s => s.id === id)?.name ?? 'subject'}`;
  setState({
    ..._state,
    subjects: _state.subjects.filter(s => s.id !== id),
    events: _state.events.filter(ev => ev.subjectId !== id),
  }, { label });
}

// ─── Group mutations ──────────────────────────────────────────────────────────

export function addGroup(label: string): void {
  const maxOrder = _state.groups.reduce((m, g) => Math.max(m, g.order), -1);
  setState(
    { ..._state, groups: [..._state.groups, { id: nanoid(), label, enabled: true, order: maxOrder + 1 }] },
    { label: `adding group ${label}` },
  );
}

export function updateGroup(id: ID, patch: Partial<Omit<Group, 'id'>>): void {
  setState({
    ..._state,
    groups: _state.groups.map(g => g.id === id ? { ...g, ...patch } : g),
  }, { label: `editing group ${_state.groups.find(g => g.id === id)?.label ?? ''}`.trimEnd() });
}

function reorderGroups(id: ID, delta: number): void {
  const sorted = [..._state.groups].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(g => g.id === id);
  const target = idx + delta;
  if (idx < 0 || target < 0 || target >= sorted.length) return;
  const tmp = sorted[target]!;
  sorted[target] = sorted[idx]!;
  sorted[idx] = tmp;
  setState(
    { ..._state, groups: _state.groups.map(g => ({ ...g, order: sorted.findIndex(s => s.id === g.id) })) },
    { label: 'reordering groups' },
  );
}

export function moveGroupUp(id: ID): void { reorderGroups(id, -1); }
export function moveGroupDown(id: ID): void { reorderGroups(id, 1); }

/** Drag-to-reorder lands here: one move, one undo entry. */
export function moveGroupToIndex(id: ID, index: number): void {
  const sorted = [..._state.groups].sort((a, b) => a.order - b.order);
  const from = sorted.findIndex(g => g.id === id);
  if (from < 0 || index < 0 || index >= sorted.length || from === index) return;
  const [moved] = sorted.splice(from, 1);
  sorted.splice(index, 0, moved!);
  setState(
    { ..._state, groups: _state.groups.map(g => ({ ...g, order: sorted.findIndex(s => s.id === g.id) })) },
    { label: 'reordering groups' },
  );
}

/** How many events a group deletion would take with it — shown in the confirm. */
export function eventCountForGroup(id: ID): number {
  return _state.events.filter(ev => ev.groupId === id).length;
}

export function removeGroup(id: ID): void {
  const label = `deleting group ${_state.groups.find(g => g.id === id)?.label ?? ''}`.trimEnd();
  setState({
    ..._state,
    groups: _state.groups.filter(g => g.id !== id),
    phases: _state.phases.map(p => ({ ...p, groupIds: p.groupIds.filter(gid => gid !== id) })),
    // Multi-group events keep going: they follow the phase, which simply has one
    // lane fewer now. Only events pinned to this lane have nowhere left to be.
    events: _state.events.filter(ev => ev.groupId !== id),
  }, { label });
}

// ─── Phase mutations ──────────────────────────────────────────────────────────

export function addPhase(label: string, startDay: number, endDay: number, groupIds: ID[]): void {
  setState({
    ..._state,
    phases: [..._state.phases, { id: nanoid(), label, startDay, endDay, groupIds }],
  }, { label: `adding phase ${label}` });
}

export function updatePhase(id: ID, patch: Partial<Omit<Phase, 'id'>>): void {
  setState({
    ..._state,
    phases: _state.phases.map(p => p.id === id ? { ...p, ...patch } : p),
  }, { label: `editing phase ${_state.phases.find(p => p.id === id)?.label ?? ''}`.trimEnd() });
}

/** Events that would stop being drawn if this phase went away. */
export function eventCountForPhase(id: ID): number {
  const phase = _state.phases.find(p => p.id === id);
  if (!phase) return 0;
  return _state.events.filter(ev => ev.dayIndex >= phase.startDay && ev.dayIndex <= phase.endDay).length;
}

export function removePhase(id: ID): void {
  const label = `deleting phase ${_state.phases.find(p => p.id === id)?.label ?? ''}`.trimEnd();
  setState({
    ..._state,
    phases: _state.phases.filter(p => p.id !== id),
    subjects: _state.subjects.map(s => (s.phaseId === id ? { ...s, phaseId: null } : s)),
  }, { label });
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

/**
 * Unavailability windows live on the entity, so they go through the same patch
 * path as a name or a colour. These wrappers exist to keep the array surgery —
 * and the undo label — out of the config components.
 */
export function setTeacherUnavailable(id: ID, unavailable: TimeWindow[]): void {
  updateTeacher(id, { unavailable }, { label: `editing ${_state.teachers.find(t => t.id === id)?.name ?? 'teacher'}'s absences` });
}

export function setRoomUnavailable(id: ID, unavailable: TimeWindow[]): void {
  updateRoom(id, { unavailable }, { label: `editing ${_state.rooms.find(r => r.id === id)?.name ?? 'room'}'s blocked times` });
}

// ─── Plan-level mutations ─────────────────────────────────────────────────────

export function setPlanName(name: string): void {
  if (name === _state.name) return;
  setState({ ..._state, name }, { label: 'renaming the plan', coalesceKey: 'plan-name' });
}

/**
 * Replace everything with an imported plan. Undo history is dropped rather than
 * kept: a stack whose entries describe a different week is worse than no stack,
 * because the first Ctrl+Z would silently restore the plan the user just left.
 */
export function replacePlan(next: AppState): void {
  clearUndo();
  lastCoalesceKey = null;
  commit(next);
  flushSave();
}

export function resetToDefaults(): void {
  clearUndo();
  lastCoalesceKey = null;
  commit(createDefaultState());
}

export function setWkStartDate(date: string): void {
  const monday = snapToMonday(date);
  if (!monday || monday === _state.wkStartDate) return;
  setState({ ..._state, wkStartDate: monday }, { label: 'changing the week' });
}
