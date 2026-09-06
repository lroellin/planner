import { nanoid } from 'nanoid';
import { ALL_GROUPS } from '../types';
import type {
  AppState, CalendarEvent, ConflictReport, GroupSelector,
  Teacher, Room, Subject, Group, Phase, ID, TimeWindow,
} from '../types';
import { saveState, loadState, createDefaultState, flushSave } from './persistence';
import { createSampleState } from './sampleData';
import {
  pushUndo, undoState, redoState, canUndo as _canUndo, canRedo as _canRedo, clearUndo,
  peekUndoLabel, peekRedoLabel, undoLabels,
} from './undo';
import { detectConflicts, attachConflicts } from '../conflicts/detector';
import { toast, flashEvents } from './ui.svelte';
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
// Mirrored into reactive state: the undo module's own peek functions are plain
// module variables, so a tooltip reading them re-rendered only by accident and
// sat one action behind the history menu next to it.
let _undoHistory: string[] = $state([]);
let _undoLabel: string | null = $state(null);
let _redoLabel: string | null = $state(null);

const HISTORY_DEPTH = 12;

function syncUndoState(): void {
  _canUndoState = _canUndo();
  _canRedoState = _canRedo();
  _undoHistory = undoLabels(HISTORY_DEPTH);
  _undoLabel = peekUndoLabel();
  _redoLabel = peekRedoLabel();
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export function getState(): AppState { return _state; }
export function getConflicts(): ConflictReport[] { return _conflicts; }
export function getOrphans(): CalendarEvent[] { return _orphans; }
/** Everything the toolbar and the conflict rail count as "needs attention". */
export function getIssueCount(): number { return _conflicts.length + _orphans.length; }

/**
 * How many *Lektionen* those issues involve. `getIssueCount` counts clash
 * relations: one badly placed lesson overlapping two others on both a
 * Ausbildner and a Raum raises four reports, and the same lesson is then
 * listed under a Ausbildner card *and* a Raum card. The relation count is the
 * right thing to sort and group by; it is the wrong thing to hand someone as
 * "how much is left to do", so both numbers are shown together.
 */
export function getAffectedEventCount(): number {
  const ids = new Set<ID>();
  for (const report of _conflicts) for (const id of report.involvedEventIds) ids.add(id);
  for (const ev of _orphans) ids.add(ev.id);
  return ids.size;
}
export function canUndo(): boolean { return _canUndoState; }
export function canRedo(): boolean { return _canRedoState; }
/** The actions undo would take back, most recent first — feeds the history menu. */
export function undoHistory(): string[] { return _undoHistory; }

// ─── State mutations ──────────────────────────────────────────────────────────

function snapshot(): AppState {
  return $state.snapshot(_state) as AppState;
}

/**
 * Which Lektionen differ between two states — what undo and redo just changed,
 * so the grid can point at it. Conflict annotations are re-derived on every
 * commit and would otherwise report every card as changed, so they are skipped.
 */
function changedEventIds(before: AppState, after: AppState): ID[] {
  const key = (ev: CalendarEvent): string => JSON.stringify([
    ev.subjectId, ev.groupId, ev.dayIndex, ev.startTime, ev.endTime, ev.teacherIds, ev.roomId,
  ]);
  const previous = new Map(before.events.map(ev => [ev.id, key(ev)]));
  const changed: ID[] = [];
  for (const ev of after.events) {
    const was = previous.get(ev.id);
    if (was === undefined || was !== key(ev)) changed.push(ev.id);
  }
  return changed;
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
  const { recordUndo = true, coalesceKey, label = 'Änderung' } = opts;
  if (recordUndo && !(coalesceKey !== undefined && coalesceKey === lastCoalesceKey)) {
    pushUndo(snapshot(), label);
  }
  lastCoalesceKey = coalesceKey ?? null;
  commit(next);
}

/** What Undo/Redo would act on next — shown in their tooltips. */
export function undoLabel(): string | null { return _undoLabel; }
export function redoLabel(): string | null { return _redoLabel; }

export function undo(): void { undoSteps(1); }

/**
 * Take back `steps` actions at once — what picking an entry from the history
 * menu does. Each hop still goes through `undoState`, so the redo stack is
 * built exactly as it would be by pressing Ctrl+Z that many times; only the
 * commit and the toast happen once, at the end.
 */
export function undoSteps(steps: number): void {
  const before = snapshot();
  let current = before;
  let entry = null as ReturnType<typeof undoState>;
  let taken = 0;
  for (let i = 0; i < steps; i++) {
    const next = undoState(current);
    if (!next) break;
    entry = next;
    current = next.state;
    taken++;
  }
  lastCoalesceKey = null;
  if (!entry) {
    syncUndoState();
    return;
  }
  commit(entry.state);
  // Undo used to change the schedule with no acknowledgement at all, which is
  // unnerving on a grid where the affected card may be off-screen. The toast
  // names the action; the flash answers "where".
  flashEvents(changedEventIds(before, entry.state));
  const message = taken === 1
    ? `Rückgängig: ${entry.label}`
    : `${taken} Schritte rückgängig — Stand vor «${entry.label}»`;
  toast(message, { label: 'Wiederholen', run: redo });
}

export function redo(): void {
  const before = snapshot();
  const entry = redoState(before);
  lastCoalesceKey = null;
  if (!entry) {
    syncUndoState();
    return;
  }
  commit(entry.state);
  flashEvents(changedEventIds(before, entry.state));
  toast(`Wiederhergestellt: ${entry.label}`, { label: 'Rückgängig', run: undo });
}

/**
 * Announce a deletion with the way back.
 *
 * Every one of these goes through `setState` with a label, so all of them are on
 * the undo stack — which made the `window.confirm()` they used to sit behind an
 * OS dialog interrupting for something one keystroke reverses. The consequence
 * is still named ("mit 12 Lektionen"), it is just named *after* the click, where
 * it costs nothing to read and can be acted on.
 */
function deletedToast(what: string, consequence?: string): void {
  toast(
    consequence ? `${what} gelöscht — ${consequence}` : `${what} gelöscht`,
    { label: 'Rückgängig', run: undo },
  );
}

/** German plural for the one noun these messages all end up counting. */
function lektionen(n: number): string {
  return `${n} ${n === 1 ? 'Lektion' : 'Lektionen'}`;
}

// ─── Event mutations ──────────────────────────────────────────────────────────

/** Subject name for an event id — undo labels name the thing that moved. */
function eventLabel(id: ID, verb: string): string {
  const ev = _state.events.find(e => e.id === id);
  const name = ev ? _state.subjects.find(s => s.id === ev.subjectId)?.name : undefined;
  return name ? `${name} ${verb}` : `Lektion ${verb}`;
}

/** The same, for a batch: naming twelve blocks individually says nothing. */
function eventsLabel(ids: ID[], verb: string): string {
  if (ids.length === 1) return eventLabel(ids[0]!, verb);
  return `${ids.length} Lektionen ${verb}`;
}

export function addEvent(ev: CalendarEvent, label?: string): void {
  const name = _state.subjects.find(s => s.id === ev.subjectId)?.name;
  setState(
    { ..._state, events: [..._state.events, ev] },
    { label: label ?? (name ? `${name} platzieren` : 'Lektion platzieren') },
  );
  // A placement made from a dialog rather than by dragging lands wherever the
  // day/lane selects pointed, which is often not where the user is looking.
  flashEvents([ev.id]);
}

export function updateEvent(
  id: ID,
  patch: Partial<Omit<CalendarEvent, 'id' | 'conflicts'>>,
  label?: string,
  opts: MutateOptions = {},
): void {
  setState({
    ..._state,
    events: _state.events.map(ev => ev.id === id ? { ...ev, ...patch } : ev),
  }, { label: label ?? eventLabel(id, 'bearbeiten'), ...opts });
}

export function removeEvent(id: ID): void {
  const label = eventLabel(id, 'löschen');
  setState({ ..._state, events: _state.events.filter(ev => ev.id !== id) }, { label });
}

/**
 * Apply the same edit to a set of events as one action. The patch is a function
 * because a nudge is relative: every block moves by its own 15 minutes, not to a
 * shared time. One undo entry covers the whole batch — taking back a move of
 * twelve blocks twelve times is not undo.
 */
export function updateEvents(
  ids: ID[],
  patch: (ev: CalendarEvent) => Partial<Omit<CalendarEvent, 'id' | 'conflicts'>>,
  verb: string,
): void {
  if (ids.length === 0) return;
  const targets = new Set(ids);
  setState({
    ..._state,
    events: _state.events.map(ev => (targets.has(ev.id) ? { ...ev, ...patch(ev) } : ev)),
  }, { label: eventsLabel(ids, verb) });
}

export function removeEvents(ids: ID[]): void {
  if (ids.length === 0) return;
  const label = eventsLabel(ids, 'löschen');
  const targets = new Set(ids);
  setState({ ..._state, events: _state.events.filter(ev => !targets.has(ev.id)) }, { label });
}

/**
 * Duplicate a set of events in place, returning the new ids so the caller can
 * select the copies — a duplicate that leaves the originals selected sends the
 * next arrow key to the wrong blocks.
 */
export function duplicateEvents(ids: ID[]): ID[] {
  const targets = new Set(ids);
  const copies: CalendarEvent[] = _state.events
    .filter(ev => targets.has(ev.id))
    .map(({ conflicts: _omit, ...ev }) => ({ ...ev, id: nanoid() }));
  if (copies.length === 0) return [];
  setState(
    { ..._state, events: [..._state.events, ...copies] },
    { label: eventsLabel(ids, 'duplizieren') },
  );
  // A copy is placed exactly on top of its original, so without this nothing on
  // screen changes at all and the action reads as a no-op.
  flashEvents(copies.map(c => c.id));
  return copies.map(c => c.id);
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
  const name = _state.subjects.find(s => s.id === source.subjectId)?.name ?? 'Lektion';
  setState(
    { ..._state, events: [..._state.events, ...copies] },
    { label: `${name} auf ${copies.length} Gruppe${copies.length === 1 ? '' : 'n'} kopieren` },
  );
  // Up to four cards appear at once, in lanes the user was not pointing at.
  flashEvents(copies.map(c => c.id));
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

/** What the Programmpunkt dialog collects — everything not fixed by the clicked cell. */
export interface ProgrammpunktDraft {
  name: string;
  color: string;
  durationMinutes: number;
  isMultiGroup: boolean;
}

/**
 * Create a *Programmpunkt* and place it, in one commit.
 *
 * A Programmpunkt is a Subject like any other — it just has `kind: 'oneoff'`, so
 * coverage leaves it alone. What makes it worth its own function is that the
 * definition and its first placement have to land in a single `setState`:
 * created as two actions, one Ctrl+Z would take back the card and leave an
 * orphan Thema behind in Konfiguration that nobody asked for.
 *
 * A name that already belongs to a Programmpunkt reuses that one instead of
 * making a second definition — that is the "Antreten again on Thursday" path,
 * and it is also what stops a delete-and-retype from silently accumulating
 * duplicates.
 *
 * Returns the new event's id so the caller can open the quick edit on it.
 */
export function createProgrammpunkt(
  draft: ProgrammpunktDraft,
  dayIndex: number,
  startTime: string,
  groupId: GroupSelector,
): ID {
  const name = draft.name.trim() || 'Programmpunkt';
  const existing = _state.subjects.find(
    s => s.kind === 'oneoff' && s.name.toLowerCase() === name.toLowerCase(),
  );

  const subject: Subject = existing ?? {
    id: nanoid(),
    name,
    shortName: '',
    color: draft.color,
    defaultTeacherIds: [],
    defaultRoomId: null,
    defaultDurationMinutes: draft.durationMinutes,
    kind: 'oneoff',
    isMultiGroup: draft.isMultiGroup,
    phaseId: null,
    content: { goals: [], notes: '' },
  };

  const event: CalendarEvent = {
    id: nanoid(),
    subjectId: subject.id,
    // The reused definition decides the lane rule, so placing "Antreten" again
    // cannot end up half all-lanes and half not.
    groupId: subject.isMultiGroup ? ALL_GROUPS : groupId,
    dayIndex,
    startTime,
    endTime: addMinutesToTime(startTime, draft.durationMinutes),
    teacherIds: 'inherit',
    roomId: 'inherit',
  };

  setState({
    ..._state,
    subjects: existing ? _state.subjects : [..._state.subjects, subject],
    events: [..._state.events, event],
  }, { label: `${name} anlegen und platzieren` });
  flashEvents([event.id]);
  return event.id;
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
  }, { label: eventLabel(id, 'teilen') });
  // Which two halves came out of the cut, on a grid where the seam is one rule.
  flashEvents([first.id, second.id]);
}

// ─── Teacher mutations ────────────────────────────────────────────────────────

export function addTeacher(name: string, shortName: string, color: string): ID {
  const teacher: Teacher = { id: nanoid(), name, shortName, color, unavailable: [] };
  setState({ ..._state, teachers: [..._state.teachers, teacher] }, { label: `${name} hinzufügen` });
  return teacher.id;
}

export function updateTeacher(id: ID, patch: Partial<Omit<Teacher, 'id'>>, opts: MutateOptions = {}): void {
  setState({
    ..._state,
    teachers: _state.teachers.map(t => t.id === id ? { ...t, ...patch } : t),
  }, { label: `${_state.teachers.find(t => t.id === id)?.name ?? 'Ausbildner'} bearbeiten`, ...opts });
}

/** Lektionen this Ausbildner is named on — what a deletion takes them off. */
export function eventCountForTeacher(id: ID): number {
  return _state.events.filter(ev =>
    ev.teacherIds === 'inherit'
      ? (_state.subjects.find(s => s.id === ev.subjectId)?.defaultTeacherIds ?? []).includes(id)
      : ev.teacherIds.includes(id),
  ).length;
}

export function removeTeacher(id: ID): void {
  const name = _state.teachers.find(t => t.id === id)?.name ?? 'Ausbildner';
  const label = `${name} löschen`;
  const affected = eventCountForTeacher(id);
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
  deletedToast(name, affected > 0 ? `von ${lektionen(affected)} entfernt` : undefined);
}

// ─── Room mutations ───────────────────────────────────────────────────────────

export function addRoom(name: string, color: string, excludeFromConflictCheck: boolean): ID {
  const room: Room = { id: nanoid(), name, shortName: '', color, excludeFromConflictCheck, unavailable: [] };
  setState({ ..._state, rooms: [..._state.rooms, room] }, { label: `${name} hinzufügen` });
  return room.id;
}

export function updateRoom(id: ID, patch: Partial<Omit<Room, 'id'>>, opts: MutateOptions = {}): void {
  setState({
    ..._state,
    rooms: _state.rooms.map(r => r.id === id ? { ...r, ...patch } : r),
  }, { label: `${_state.rooms.find(r => r.id === id)?.name ?? 'Raum'} bearbeiten`, ...opts });
}

/** Lektionen booked into this Raum — what a deletion un-rooms. */
export function eventCountForRoom(id: ID): number {
  return _state.events.filter(ev =>
    ev.roomId === 'inherit'
      ? _state.subjects.find(s => s.id === ev.subjectId)?.defaultRoomId === id
      : ev.roomId === id,
  ).length;
}

export function removeRoom(id: ID): void {
  const name = _state.rooms.find(r => r.id === id)?.name ?? 'Raum';
  const label = `${name} löschen`;
  const affected = eventCountForRoom(id);
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
  deletedToast(name, affected > 0 ? `${lektionen(affected)} sind jetzt ohne Raum` : undefined);
}

// ─── Subject mutations ────────────────────────────────────────────────────────

export function addSubject(s: Omit<Subject, 'id'>): ID {
  const id = nanoid();
  setState(
    { ..._state, subjects: [..._state.subjects, { id, ...s }] },
    { label: `${s.name} hinzufügen` },
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
  }, { label: `${oldSubject?.name ?? 'Thema'} bearbeiten`, ...opts });
}

/** Placed Lektionen of this Thema — a deletion removes them from the grid. */
export function eventCountForSubject(id: ID): number {
  return _state.events.filter(ev => ev.subjectId === id).length;
}

export function removeSubject(id: ID): void {
  const name = _state.subjects.find(s => s.id === id)?.name ?? 'Thema';
  const label = `${name} löschen`;
  const affected = eventCountForSubject(id);
  setState({
    ..._state,
    subjects: _state.subjects.filter(s => s.id !== id),
    events: _state.events.filter(ev => ev.subjectId !== id),
  }, { label });
  deletedToast(name, affected > 0 ? `${lektionen(affected)} mitgelöscht` : undefined);
}

// ─── Group mutations ──────────────────────────────────────────────────────────

export function addGroup(label: string): void {
  const maxOrder = _state.groups.reduce((m, g) => Math.max(m, g.order), -1);
  setState(
    { ..._state, groups: [..._state.groups, { id: nanoid(), label, enabled: true, order: maxOrder + 1 }] },
    { label: `Gruppe ${label} hinzufügen` },
  );
}

export function updateGroup(id: ID, patch: Partial<Omit<Group, 'id'>>): void {
  setState({
    ..._state,
    groups: _state.groups.map(g => g.id === id ? { ...g, ...patch } : g),
  }, { label: `Gruppe ${_state.groups.find(g => g.id === id)?.label ?? ''} bearbeiten`.replace('  ', ' ') });
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
    { label: 'Gruppen neu ordnen' },
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
    { label: 'Gruppen neu ordnen' },
  );
}

/** How many events a group deletion would take with it — shown in the confirm. */
export function eventCountForGroup(id: ID): number {
  return _state.events.filter(ev => ev.groupId === id).length;
}

export function removeGroup(id: ID): void {
  const name = `Gruppe ${_state.groups.find(g => g.id === id)?.label ?? ''}`.trim();
  const label = `${name} löschen`;
  const affected = eventCountForGroup(id);
  setState({
    ..._state,
    groups: _state.groups.filter(g => g.id !== id),
    phases: _state.phases.map(p => ({ ...p, groupIds: p.groupIds.filter(gid => gid !== id) })),
    // Multi-group events keep going: they follow the phase, which simply has one
    // lane fewer now. Only events pinned to this lane have nowhere left to be.
    events: _state.events.filter(ev => ev.groupId !== id),
  }, { label });
  deletedToast(name, affected > 0 ? `${lektionen(affected)} mitgelöscht` : undefined);
}

// ─── Phase mutations ──────────────────────────────────────────────────────────

export function addPhase(label: string, startDay: number, endDay: number, groupIds: ID[]): void {
  setState({
    ..._state,
    phases: [..._state.phases, { id: nanoid(), label, startDay, endDay, groupIds }],
  }, { label: `Phase ${label} hinzufügen` });
}

export function updatePhase(id: ID, patch: Partial<Omit<Phase, 'id'>>): void {
  setState({
    ..._state,
    phases: _state.phases.map(p => p.id === id ? { ...p, ...patch } : p),
  }, { label: `Phase ${_state.phases.find(p => p.id === id)?.label ?? ''} bearbeiten`.replace('  ', ' ') });
}

/** Events that would stop being drawn if this phase went away. */
export function eventCountForPhase(id: ID): number {
  const phase = _state.phases.find(p => p.id === id);
  if (!phase) return 0;
  return _state.events.filter(ev => ev.dayIndex >= phase.startDay && ev.dayIndex <= phase.endDay).length;
}

export function removePhase(id: ID): void {
  const name = `Phase ${_state.phases.find(p => p.id === id)?.label ?? ''}`.trim();
  const label = `${name} löschen`;
  const affected = eventCountForPhase(id);
  setState({
    ..._state,
    phases: _state.phases.filter(p => p.id !== id),
    subjects: _state.subjects.map(s => (s.phaseId === id ? { ...s, phaseId: null } : s)),
  }, { label });
  deletedToast(name, affected > 0 ? `${lektionen(affected)} werden nicht mehr angezeigt` : undefined);
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
  updateTeacher(id, { unavailable }, { label: `Abwesenheiten von ${_state.teachers.find(t => t.id === id)?.name ?? 'Ausbildner'} bearbeiten` });
}

export function setRoomUnavailable(id: ID, unavailable: TimeWindow[]): void {
  updateRoom(id, { unavailable }, { label: `Sperrzeiten von ${_state.rooms.find(r => r.id === id)?.name ?? 'Raum'} bearbeiten` });
}

// ─── Plan-level mutations ─────────────────────────────────────────────────────

export function setPlanName(name: string): void {
  if (name === _state.name) return;
  setState({ ..._state, name }, { label: 'Plan umbenennen', coalesceKey: 'plan-name' });
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

/** Replaces the (pristine) plan with the demonstration week. See `isPristineState`. */
export function loadSampleData(): void {
  replacePlan(createSampleState());
}

export function setWkStartDate(date: string): void {
  const monday = snapToMonday(date);
  if (!monday || monday === _state.wkStartDate) return;
  setState({ ..._state, wkStartDate: monday }, { label: 'Woche ändern' });
}

// ─── Export freshness ─────────────────────────────────────────────────────────

/**
 * Record that the plan has just been written to a file. Deliberately not an undo
 * entry: it is a fact about the outside world, and taking it back would claim a
 * file that exists does not.
 */
export function markExported(): void {
  setState(
    { ..._state, lastExportedAt: new Date().toISOString() },
    { recordUndo: false, label: 'Plan exportiert' },
  );
}

/**
 * How stale the only copy of this plan is. The week lives in one browser's
 * localStorage — one "clear site data" from gone — and the app said so exactly
 * once, on the last tab of a dialog. A plan worth losing is one with real
 * content, so an almost-empty plan never nags.
 */
const EXPORT_REMINDER_DAYS = 3;
const EXPORT_REMINDER_MIN_EVENTS = 8;

export function exportStaleness(): { stale: boolean; days: number | null } {
  if (_state.events.length < EXPORT_REMINDER_MIN_EVENTS) return { stale: false, days: null };
  const last = _state.lastExportedAt;
  if (last === null) return { stale: true, days: null };
  const then = Date.parse(last);
  if (Number.isNaN(then)) return { stale: true, days: null };
  const days = Math.floor((Date.now() - then) / 86_400_000);
  return { stale: days >= EXPORT_REMINDER_DAYS, days };
}
