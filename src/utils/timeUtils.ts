import { ALL_GROUPS, isHardConflict } from '../types';
import type {
  AppState, CalendarEvent, ConflictKind, EventFilter, Group, ID, Phase, Subject,
} from '../types';
import type { EventInput } from 'fullcalendar';
import type { ResourceInput } from 'fullcalendar-scheduler';
import { roomShort, subjectShort, teacherShort } from './format';

// Weekday labels, 0=Mon … 4=Fri (matches CalendarEvent.dayIndex)
export const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr'] as const;

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Local "YYYY-MM-DD" — avoids the UTC shift of Date.toISOString()
export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Local "HH:MM" from a Date
export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Resolve the 'inherit' sentinel against the subject's defaults. The selector
// form is used by the event modal, which resolves values the user is still
// editing and has no event object to hand.
export function resolveTeacherIds(
  teacherIds: ID[] | 'inherit',
  subject: Subject | null | undefined,
): ID[] {
  return teacherIds === 'inherit' ? subject?.defaultTeacherIds ?? [] : teacherIds;
}

export function resolveRoomId(
  roomId: ID | null | 'inherit',
  subject: Subject | null | undefined,
): ID | null {
  // may be null (explicitly no room) or an ID string
  return roomId === 'inherit' ? subject?.defaultRoomId ?? null : roomId;
}

export function effectiveTeacherIds(
  ev: CalendarEvent | null | undefined,
  subject: Subject | null | undefined,
): ID[] {
  if (!ev) return subject?.defaultTeacherIds ?? [];
  return resolveTeacherIds(ev.teacherIds, subject);
}

export function effectiveRoomId(
  ev: CalendarEvent | null | undefined,
  subject: Subject | null | undefined,
): ID | null {
  // Not `ev?.roomId ?? 'inherit'`: null is a real value here ("explicitly no
  // room") and ?? would fold it back into the subject default.
  if (!ev) return subject?.defaultRoomId ?? null;
  return resolveRoomId(ev.roomId, subject);
}

export function toISOLocal(wkStartDate: string, dayIndex: number, time: string): string {
  const [year, month, day] = wkStartDate.split('-').map(Number);
  const d = new Date(year!, (month! - 1), day! + dayIndex);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}:00`;
}

// "YYYY-MM-DD" for the WK week's Monday + dayIndex
export function dayDate(wkStartDate: string, dayIndex: number): string {
  const [y, m, d] = wkStartDate.split('-').map(Number);
  return formatDate(new Date(y!, m! - 1, d! + dayIndex));
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const clampedMinutes = Math.max(0, Math.min(totalMinutes, 24 * 60 - 1));
  return `${pad(Math.floor(clampedMinutes / 60))}:${pad(clampedMinutes % 60)}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function snapToSlot(time: string, slotMinutes = 15): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = (h ?? 0) * 60 + (m ?? 0);
  const snapped = Math.round(totalMinutes / slotMinutes) * slotMinutes;
  return `${pad(Math.floor(snapped / 60))}:${pad(snapped % 60)}`;
}

/**
 * The hours the grid draws.
 *
 * The grid used to be a hardcoded 07:00–19:00 — 48 slots, ~1207px at normal
 * density in a viewport of ~834px — for a week that in practice runs 08:00 to
 * 17:00. Twelve of those slots were empty on every lane of every day, and they
 * made up most of the distance the user had to scroll.
 *
 * An explicit `gridStartTime` / `gridEndTime` wins outright. It is **one window
 * for the whole WK**, not one per Phase: the same hour has to sit at the same
 * height in every phase drawn beside it, or two segments of the same week stop
 * lining up. Otherwise the window is derived from the plan:
 *
 *   - it always contains the training day (08:00–17:00) and every Lektion,
 *     Pause and Programmpunkt in the plan;
 *   - **one hour above** and **half an hour below** that, as room to drag into
 *     and to click in. Without it the day would be walled in at both ends: a
 *     block could not be dragged past the last slot and an empty cell before
 *     the first one could not be clicked, so an 07:30 Antreten could never be
 *     created at all;
 *   - the start is snapped **down to the hour**, because `slotHeaderInterval`
 *     counts from `slotMinTime` and a window opening at 07:45 would label
 *     07:45, 08:45, 09:45. The end has no such constraint and keeps its half
 *     hour.
 *
 * That leaves 07:00–17:30 for the sample week: 42 slots against the old 48.
 * Trimming the last six is what the explicit setting is for — a plan whose
 * hours are known does not need the margin the derivation has to leave.
 */
export const GRID_BUSINESS_START = '08:00';
export const GRID_BUSINESS_END = '17:00';
const GRID_AIR_BEFORE = 60;
const GRID_AIR_AFTER = 30;

export function gridWindow(state: AppState): { start: string; end: string } {
  let lo = timeToMinutes(GRID_BUSINESS_START);
  let hi = timeToMinutes(GRID_BUSINESS_END);

  for (const ev of state.events) {
    lo = Math.min(lo, timeToMinutes(ev.startTime));
    hi = Math.max(hi, timeToMinutes(ev.endTime));
  }

  const derivedStart = Math.floor((lo - GRID_AIR_BEFORE) / 60) * 60;
  const derivedEnd = hi + GRID_AIR_AFTER;

  const start = state.gridStartTime ?? minutesToTime(Math.max(0, derivedStart));
  const end = state.gridEndTime ?? minutesToTime(Math.min(24 * 60, derivedEnd));

  // A window the wrong way round collapses the grid to nothing, and an explicit
  // pair typed one field at a time passes through exactly that state.
  return timeToMinutes(end) <= timeToMinutes(start)
    ? { start, end: minutesToTime(Math.min(24 * 60, timeToMinutes(start) + 60)) }
    : { start, end };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(total, 24 * 60));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export function extractDayIndex(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 4 : d - 1;
}

/**
 * Where an event may be cut. Both halves need a slot of their own, so the only
 * legal cuts are the ones strictly inside it — which is also why an event of a
 * single slot cannot be split at all.
 */
export function splitRange(startTime: string, endTime: string): {
  from: string;
  to: string;
  canSplit: boolean;
} {
  return {
    from: addMinutesToTime(startTime, 15),
    to: addMinutesToTime(endTime, -15),
    canSplit: timeDiffMinutes(startTime, endTime) >= 30,
  };
}

/** Keep a day index inside the planned week. */
export function clampDayIndex(dayIndex: number): number {
  return Math.min(DAY_NAMES.length - 1, Math.max(0, dayIndex));
}

/**
 * The largest part of `delta` that keeps every one of `values` within
 * [`min`, `max`] — how far a *set* can move together.
 *
 * Clamping each block on its own is what a single dragged card wants and what a
 * selection must not have: the blocks already at the edge stop, the rest keep
 * going, and the selection silently changes shape under one undo entry. This
 * moves all of them or none of them, as far as the outermost one allows.
 */
export function clampGroupDelta(
  values: number[],
  delta: number,
  min: number,
  max: number,
): number {
  if (values.length === 0 || delta === 0) return 0;
  return delta > 0
    ? Math.max(0, Math.min(delta, max - Math.max(...values)))
    : Math.min(0, Math.max(delta, min - Math.min(...values)));
}

/**
 * Display order for subjects: alphabetical, everywhere. The stored array is in
 * insertion order, which is meaningless to look through once there are twenty
 * of them. Breaks are kept in their own list by the callers that separate them.
 */
export function sortSubjects<T extends { name: string }>(subjects: T[]): T[] {
  return [...subjects].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function groupsToResources(groups: Group[], allowedIds?: ID[]): ResourceInput[] {
  return groups
    .filter(g => g.enabled)
    .filter(g => allowedIds === undefined || allowedIds.includes(g.id))
    .sort((a, b) => a.order - b.order)
    .map(g => ({ id: g.id, title: g.label, order: g.order }));
}

// The enabled lanes a phase renders, in column order.
export function phaseGroups(state: AppState, phase: Phase): Group[] {
  return state.groups
    .filter(g => g.enabled && phase.groupIds.includes(g.id))
    .sort((a, b) => a.order - b.order);
}

/**
 * The lanes of a phase that take part in the *reckoning*: they owe every Thema,
 * coverage measures them, and an all-lanes *Thema* is placed for them.
 *
 * `phaseGroups` is the wider set — every lane the phase draws, and every lane an
 * all-lanes Pause or Programmpunkt reaches. A group with `excludeFromCoverage`
 * is drawn and planned like any other; it is simply not counted. The two are
 * deliberately different functions: reaching for the wrong one is a bug either
 * way round, and a name that says "counted" is easier to get right than a
 * boolean argument. `lanesForMultiGroup` picks between them.
 */
export function countedGroups(state: AppState, phase: Phase): Group[] {
  return phaseGroups(state, phase).filter(g => !g.excludeFromCoverage);
}

// Stored order is insertion order; the week always has to read left to right.
export function orderedPhases(state: AppState): Phase[] {
  return [...state.phases].sort((a, b) => a.startDay - b.startDay);
}

// The phase that owns a weekday. Phases are non-overlapping by contract; when
// they aren't, the first match wins and the config panel warns about it.
export function phaseForDay(state: AppState, dayIndex: number): Phase | null {
  return state.phases.find(p => dayIndex >= p.startDay && dayIndex <= p.endDay) ?? null;
}

/**
 * Which lanes an «alle Gruppen» placement of this subject reaches — and the one
 * place that question is answered, because getting it wrong is invisible until
 * someone reads a printed plan.
 *
 * It turns on what is being placed, not on who is in the phase:
 *
 * - A Pause or a Programmpunkt is the *frame of the day* — Mittagessen,
 *   Begrüssung, Kaderrapport, WK-Abschluss. Everyone drawn in the phase is at
 *   it, the group on its own programme included: KGS still eats at 12:00 and
 *   still stands at the Schlussrapport.
 * - A Thema is the *rotation*. Placing one for «alle Gruppen» — the Übung, the
 *   Wissenskontrolle — means the groups that sit the rotation, which is exactly
 *   the set coverage measures. KGS is off doing its own Aktualisieren
 *   Unterlagen and is not in the Übung.
 *
 * Both halves used to be wrong in turn: resolving against the counted lanes
 * alone denied that group its lunch, and resolving against every drawn lane put
 * it in an exercise it is not part of — on top of its own timetable.
 */
export function lanesForMultiGroup(
  state: AppState,
  phase: Phase,
  subject: Subject | null | undefined,
): Group[] {
  // An unknown subject (deleted out from under its events) is treated as the
  // frame: those events are dropped by their callers anyway.
  return subject?.kind === 'lesson' ? countedGroups(state, phase) : phaseGroups(state, phase);
}

function subjectOf(state: AppState, ev: CalendarEvent): Subject | undefined {
  return state.subjects.find(s => s.id === ev.subjectId);
}

/**
 * The lanes an event actually occupies. ALL_GROUPS resolves against the phase
 * covering its day, so a shared placement follows the phase rather than the lane
 * list that happened to exist when it was dropped — see `lanesForMultiGroup` for
 * which lanes that is.
 */
export function eventGroupIds(state: AppState, ev: CalendarEvent): ID[] {
  if (ev.groupId !== ALL_GROUPS) {
    return isEnabled(state, ev.groupId) ? [ev.groupId] : [];
  }
  const phase = phaseForDay(state, ev.dayIndex);
  return phase ? lanesForMultiGroup(state, phase, subjectOf(state, ev)).map(g => g.id) : [];
}

export function isMultiGroupEvent(ev: CalendarEvent): boolean {
  return ev.groupId === ALL_GROUPS;
}

/**
 * Is this event on the plan at all? An event whose every lane is switched off is
 * drawn nowhere and raises no conflicts — hiding it is the point of disabling a
 * group — so nothing that counts a week's work should count it either.
 */
export function isEventActive(state: AppState, ev: CalendarEvent): boolean {
  return eventGroupIds(state, ev).length > 0;
}

// Clamped: FullCalendar throws on a zero/negative `duration`, which blanks the
// whole grid, and a stored phase can still arrive inverted from localStorage.
export function phaseDayCount(phase: Phase): number {
  return Math.max(1, phase.endDay - phase.startDay + 1);
}

function isEnabled(state: AppState, groupId: ID): boolean {
  return state.groups.find(g => g.id === groupId)?.enabled ?? false;
}

// An event belongs to a phase when it falls in its days *and* uses one of the
// lanes that phase actually draws. Disabled lanes are not drawn, so they don't
// count — otherwise an event could pass this check and still render nowhere.
export function eventInPhase(state: AppState, ev: CalendarEvent, phase: Phase): boolean {
  if (ev.dayIndex < phase.startDay || ev.dayIndex > phase.endDay) return false;
  if (ev.groupId === ALL_GROUPS) {
    return lanesForMultiGroup(state, phase, subjectOf(state, ev)).length > 0;
  }
  return phase.groupIds.includes(ev.groupId) && isEnabled(state, ev.groupId);
}

// Events no phase will render, despite having a lane that is switched on — they
// would otherwise vanish silently from the grid. Events whose lanes are all
// disabled are excluded: hiding those is the point of disabling a group.
export function orphanEvents(state: AppState): CalendarEvent[] {
  return state.events.filter(ev => {
    if (ev.groupId === ALL_GROUPS) return phaseForDay(state, ev.dayIndex) === null;
    return isEnabled(state, ev.groupId) && !state.phases.some(p => eventInPhase(state, ev, p));
  });
}

// Resolved teacher data embedded in FC extendedProps — avoids store re-lookup in eventContent
export interface FCEventTeacher {
  shortName: string;
  name: string;
  color: string;
}

export interface FCEventRoom {
  name: string;
  /** 4–5 characters, so the room survives a narrow lane — see `roomShort`. */
  shortName: string;
  color: string;
}

// "7.9." for the calendar week's Monday + dayIndex
export function dayDateLabel(wkStartDate: string, dayIndex: number): string {
  const [y, m, d] = wkStartDate.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, (d ?? 1) + dayIndex);
  return `${dt.getDate()}.${dt.getMonth() + 1}.`;
}

// "7.9.2026" — a stored ISO date shown to a user. The plain ISO string leaked
// into the import confirm, which is the one place the app names a date the user
// did not just pick from a date input.
export function fullDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}

// Which of the subject's defaults this instance departs from. Drives the
// "not in the series" marker on the calendar card.
export function eventOverrides(
  ev: CalendarEvent,
  subject: Subject | null | undefined,
): string[] {
  const out: string[] = [];
  if (ev.teacherIds !== 'inherit') out.push('Ausbildner');
  if (ev.roomId !== 'inherit') out.push('Raum');
  if (subject && timeDiffMinutes(ev.startTime, ev.endTime) !== subject.defaultDurationMinutes) {
    out.push('Dauer');
  }
  return out;
}

/**
 * The clash chips both event editors draw: which resource, named, and how bad.
 *
 * `EventPopover` and `EventModal` carried the same eight-line `kind === ...`
 * ladder each, resolving a `ConflictRef` against three different entity lists.
 * They are the same question about the same data — the popover and the modal are
 * two anchorings of one editor — so a copy each is a copy too many.
 */
export function describeConflicts(
  state: AppState,
  ev: CalendarEvent | null | undefined,
): { kind: ConflictKind; name: string; hard: boolean; others: ID[] }[] {
  return (ev?.conflicts ?? []).map(c => {
    const name =
      c.kind === 'teacher' || c.kind === 'teacher-absent'
        ? state.teachers.find(t => t.id === c.resourceId)?.name
      : c.kind === 'room' || c.kind === 'room-blocked'
        ? state.rooms.find(r => r.id === c.resourceId)?.name
        : state.groups.find(g => g.id === c.resourceId)?.label;
    return {
      kind: c.kind,
      name: name ?? c.resourceId,
      hard: isHardConflict(c.kind),
      others: c.collidingEventIds,
    };
  });
}

export function eventMatchesFilter(
  ev: CalendarEvent,
  state: AppState,
  filter: EventFilter | null,
): boolean {
  if (!filter) return true;
  const subject = state.subjects.find(s => s.id === ev.subjectId);
  if (filter.kind === 'teacher') return effectiveTeacherIds(ev, subject).includes(filter.id);
  if (filter.kind === 'room') return effectiveRoomId(ev, subject) === filter.id;
  return eventGroupIds(state, ev).includes(filter.id);
}

export function buildFCEvents(
  state: AppState,
  phase: Phase | null = null,
  filter: EventFilter | null = null,
): EventInput[] {
  return state.events
    .filter(ev => eventGroupIds(state, ev).length > 0)
    .filter(ev => phase === null || eventInPhase(state, ev, phase))
    .filter(ev => eventMatchesFilter(ev, state, filter))
    .map(ev => buildFCEvent(ev, state, phase));
}

/**
 * How much room the card has to say something. The renderer shows a different
 * amount at each band: a 15-minute Pause used to get the same three-row layout
 * as a three-hour block and broke its own title across four lines.
 */
export type DurationBand = 'xs' | 'sm' | 'md' | 'lg';

export function durationBand(minutes: number): DurationBand {
  if (minutes <= 20) return 'xs';
  if (minutes <= 45) return 'sm';
  if (minutes <= 75) return 'md';
  return 'lg';
}

export function buildFCEvent(ev: CalendarEvent, state: AppState, phase: Phase | null = null): EventInput {
  const subject = state.subjects.find(s => s.id === ev.subjectId);
  const kinds = new Set((ev.conflicts ?? []).map(c => c.kind));
  const hasConflict = kinds.size > 0;
  // A room double-booking is advisory; a teacher or a group in two places at
  // once is not. They are drawn differently, so the card has to say which.
  const hardConflict = [...kinds].some(isHardConflict);
  const color = subject?.color ?? '#888888';
  const minutes = timeDiffMinutes(ev.startTime, ev.endTime);

  const teacherIds = effectiveTeacherIds(ev, subject);
  const teachers: FCEventTeacher[] = teacherIds
    .map(tid => state.teachers.find(t => t.id === tid))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map(t => ({ shortName: teacherShort(t), name: t.name, color: t.color }));

  const roomId = effectiveRoomId(ev, subject);
  const roomEntity = roomId ? state.rooms.find(r => r.id === roomId) : null;
  const room: FCEventRoom | null = roomEntity
    ? { name: roomEntity.name, shortName: roomShort(roomEntity), color: roomEntity.color }
    : null;

  // The lanes the card stands on, as labels. Resolved here for the same reason
  // `shortName` is: `eventDidMount` builds the card's accessible name and must
  // not reach back into the store to do it.
  const laneIds = ev.groupId === ALL_GROUPS
    ? (phase ? lanesForMultiGroup(state, phase, subject).map(g => g.id) : eventGroupIds(state, ev))
    : [ev.groupId];
  const laneLabels = laneIds
    .map(gid => state.groups.find(g => g.id === gid)?.label)
    .filter((l): l is string => Boolean(l));

  // Multi-group events occupy every lane the rendering phase draws; single-lane
  // events name their one resource.
  const resourceProp: { resourceId: ID } | { resourceIds: ID[] } = ev.groupId === ALL_GROUPS
    ? {
        resourceIds: phase
          ? lanesForMultiGroup(state, phase, subject).map(g => g.id)
          : eventGroupIds(state, ev),
      }
    : { resourceId: ev.groupId };

  // No inline colours: the card is a neutral surface tinted from the subject
  // hue in CSS (which can mix against the current theme's background and give
  // dark mode a different recipe). Saturation is reserved for state — conflict,
  // selection, spotlight — so those can still be seen on a full week's grid.

  const classNames = [
    'wk-ev',
    `wk-dur-${durationBand(minutes)}`,
    // A Programmpunkt is a lesson on the grid — same card, its own colour.
    subject?.kind === 'break' ? 'wk-ev-break' : 'wk-ev-lesson',
    ...(ev.groupId === ALL_GROUPS ? ['wk-ev-multi'] : []),
    ...(hardConflict ? ['wk-ev-hard'] : hasConflict ? ['wk-ev-soft'] : []),
  ];

  return {
    id: ev.id,
    ...resourceProp,
    start: toISOLocal(state.wkStartDate, ev.dayIndex, ev.startTime),
    end: toISOLocal(state.wkStartDate, ev.dayIndex, ev.endTime),
    title: subject?.name ?? '?',
    className: classNames.join(' '),
    extendedProps: {
      eventId: ev.id,
      subjectId: ev.subjectId,
      color,
      // What the card falls back to in a narrow lane. Resolved here rather than
      // in eventContent so the renderer never reaches back into the store.
      shortName: subjectShort(subject),
      startTime: ev.startTime,
      endTime: ev.endTime,
      dayIndex: ev.dayIndex,
      laneLabels,
      teachers,
      room,
      hasConflict,
      hardConflict,
      conflictKinds: [...kinds],
      minutes,
      isBreak: subject?.kind === 'break',
      overrides: eventOverrides(ev, subject),
    },
  };
}

export function timeDiffMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return ((eh ?? 0) * 60 + (em ?? 0)) - ((sh ?? 0) * 60 + (sm ?? 0));
}
