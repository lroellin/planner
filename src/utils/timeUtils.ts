import { ALL_GROUPS } from '../types';
import type { AppState, CalendarEvent, EventFilter, Group, ID, Phase, Subject } from '../types';
import type { EventInput } from '@fullcalendar/core';
import type { ResourceInput } from '@fullcalendar/resource';
import { teacherShort } from './format';

// Weekday labels, 0=Mon … 4=Fri (matches CalendarEvent.dayIndex)
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

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
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function snapToSlot(time: string, slotMinutes = 15): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = (h ?? 0) * 60 + (m ?? 0);
  const snapped = Math.round(totalMinutes / slotMinutes) * slotMinutes;
  return `${pad(Math.floor(snapped / 60))}:${pad(snapped % 60)}`;
}

export function extractDayIndex(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 4 : d - 1;
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

// The phase that owns a weekday. Phases are non-overlapping by contract; when
// they aren't, the first match wins and the config panel warns about it.
export function phaseForDay(state: AppState, dayIndex: number): Phase | null {
  return state.phases.find(p => dayIndex >= p.startDay && dayIndex <= p.endDay) ?? null;
}

// The lanes an event actually occupies. ALL_GROUPS resolves to the enabled lanes
// of the phase covering its day, so a lunch break follows the phase rather than
// the lane list that happened to exist when it was dropped.
export function eventGroupIds(state: AppState, ev: CalendarEvent): ID[] {
  if (ev.groupId !== ALL_GROUPS) {
    return isEnabled(state, ev.groupId) ? [ev.groupId] : [];
  }
  const phase = phaseForDay(state, ev.dayIndex);
  return phase ? phaseGroups(state, phase).map(g => g.id) : [];
}

export function isMultiGroupEvent(ev: CalendarEvent): boolean {
  return ev.groupId === ALL_GROUPS;
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
  if (ev.groupId === ALL_GROUPS) return phaseGroups(state, phase).length > 0;
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
  color: string;
}

// "7.9." for the calendar week's Monday + dayIndex
export function dayDateLabel(wkStartDate: string, dayIndex: number): string {
  const [y, m, d] = wkStartDate.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, (d ?? 1) + dayIndex);
  return `${dt.getDate()}.${dt.getMonth() + 1}.`;
}

// Which of the subject's defaults this instance departs from. Drives the
// "not in the series" marker on the calendar card.
export function eventOverrides(
  ev: CalendarEvent,
  subject: Subject | null | undefined,
): string[] {
  const out: string[] = [];
  if (ev.teacherIds !== 'inherit') out.push('teachers');
  if (ev.roomId !== 'inherit') out.push('room');
  if (subject && timeDiffMinutes(ev.startTime, ev.endTime) !== subject.defaultDurationMinutes) {
    out.push('duration');
  }
  return out;
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
  const hardConflict = kinds.has('teacher') || kinds.has('group');
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
    ? { name: roomEntity.name, color: roomEntity.color }
    : null;

  // Multi-group events occupy every lane the rendering phase draws; single-lane
  // events name their one resource.
  const resourceProp: { resourceId: ID } | { resourceIds: ID[] } = ev.groupId === ALL_GROUPS
    ? { resourceIds: phase ? phaseGroups(state, phase).map(g => g.id) : eventGroupIds(state, ev) }
    : { resourceId: ev.groupId };

  // No inline colours: the card is a neutral surface tinted from the subject
  // hue in CSS (which can mix against the current theme's background and give
  // dark mode a different recipe). Saturation is reserved for state — conflict,
  // selection, spotlight — so those can still be seen on a full week's grid.
  const classNames = [
    'wk-ev',
    `wk-dur-${durationBand(minutes)}`,
    subject?.isBreak ? 'wk-ev-break' : 'wk-ev-lesson',
    ...(ev.groupId === ALL_GROUPS ? ['wk-ev-multi'] : []),
    ...(hardConflict ? ['wk-ev-hard'] : hasConflict ? ['wk-ev-soft'] : []),
  ];

  return {
    id: ev.id,
    ...resourceProp,
    start: toISOLocal(state.wkStartDate, ev.dayIndex, ev.startTime),
    end: toISOLocal(state.wkStartDate, ev.dayIndex, ev.endTime),
    title: subject?.name ?? '?',
    classNames,
    extendedProps: {
      eventId: ev.id,
      subjectId: ev.subjectId,
      color,
      teachers,
      room,
      hasConflict,
      hardConflict,
      conflictKinds: [...kinds],
      minutes,
      isBreak: subject?.isBreak ?? false,
      overrides: eventOverrides(ev, subject),
    },
  };
}

export function timeDiffMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return ((eh ?? 0) * 60 + (em ?? 0)) - ((sh ?? 0) * 60 + (sm ?? 0));
}
