import type { AppState, CalendarEvent, EventFilter, Group, ID, Phase, Subject } from '../types';
import type { EventInput } from '@fullcalendar/core';
import type { ResourceInput } from '@fullcalendar/resource';

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

// Resolve an event's effective teachers/room.
// 'inherit' (or missing event) → fall back to subject defaults.
export function effectiveTeacherIds(
  ev: CalendarEvent | null | undefined,
  subject: Subject | null | undefined,
): ID[] {
  if (!ev || ev.teacherIds === 'inherit') return subject?.defaultTeacherIds ?? [];
  return ev.teacherIds;
}

export function effectiveRoomId(
  ev: CalendarEvent | null | undefined,
  subject: Subject | null | undefined,
): ID | null {
  if (!ev || ev.roomId === 'inherit') return subject?.defaultRoomId ?? null;
  return ev.roomId; // may be null (explicitly no room) or an ID string
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

export function groupIdsOf(ev: CalendarEvent): ID[] {
  return Array.isArray(ev.groupId) ? ev.groupId : [ev.groupId];
}

// The enabled lanes a phase renders, in column order.
export function phaseGroups(state: AppState, phase: Phase): Group[] {
  return state.groups
    .filter(g => g.enabled && phase.groupIds.includes(g.id))
    .sort((a, b) => a.order - b.order);
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
  return groupIdsOf(ev).some(gid => phase.groupIds.includes(gid) && isEnabled(state, gid));
}

// Events no phase will render, despite having a lane that is switched on — they
// would otherwise vanish silently from the grid. Events whose lanes are all
// disabled are excluded: hiding those is the point of disabling a group.
export function orphanEvents(state: AppState): CalendarEvent[] {
  return state.events.filter(
    ev =>
      groupIdsOf(ev).some(gid => isEnabled(state, gid)) &&
      !state.phases.some(p => eventInPhase(state, ev, p)),
  );
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
  return (Array.isArray(ev.groupId) ? ev.groupId : [ev.groupId]).includes(filter.id);
}

export function buildFCEvents(
  state: AppState,
  filter: EventFilter | null = null,
  phase: Phase | null = null,
): EventInput[] {
  return state.events
    .filter(ev => groupIdsOf(ev).some(gid => isEnabled(state, gid)))
    .filter(ev => phase === null || eventInPhase(state, ev, phase))
    .filter(ev => eventMatchesFilter(ev, state, filter))
    .map(ev => buildFCEvent(ev, state, phase));
}

export function buildFCEvent(ev: CalendarEvent, state: AppState, phase: Phase | null = null): EventInput {
  const subject = state.subjects.find(s => s.id === ev.subjectId);
  const hasConflict = (ev.conflicts?.length ?? 0) > 0;
  const color = subject?.color ?? '#888888';

  const teacherIds = effectiveTeacherIds(ev, subject);
  const teachers: FCEventTeacher[] = teacherIds
    .map(tid => state.teachers.find(t => t.id === tid))
    .filter(Boolean)
    .map(t => ({
      shortName: t!.shortName || t!.name.slice(0, 2).toUpperCase(),
      name: t!.name,
      color: t!.color,
    }));

  const roomId = effectiveRoomId(ev, subject);
  const roomEntity = roomId ? state.rooms.find(r => r.id === roomId) : null;
  const room: FCEventRoom | null = roomEntity
    ? { name: roomEntity.name, color: roomEntity.color }
    : null;

  // For multi-group events, filter to only enabled groups and use resourceIds (plural).
  // Lanes outside the rendering phase are dropped so FC never sees an unknown resource.
  const resourceProp: { resourceId: ID } | { resourceIds: ID[] } = Array.isArray(ev.groupId)
    ? {
        resourceIds: ev.groupId.filter(gid =>
          state.groups.find(g => g.id === gid)?.enabled &&
          (phase === null || phase.groupIds.includes(gid)),
        ),
      }
    : { resourceId: ev.groupId };

  return {
    id: ev.id,
    ...resourceProp,
    start: toISOLocal(state.wkStartDate, ev.dayIndex, ev.startTime),
    end: toISOLocal(state.wkStartDate, ev.dayIndex, ev.endTime),
    backgroundColor: color,
    borderColor: hasConflict ? '#e53e3e' : color,
    textColor: '#ffffff',
    title: subject?.name ?? '?',
    classNames: hasConflict ? ['fc-event-conflict'] : [],
    extendedProps: {
      eventId: ev.id,
      teachers,
      room,
      hasConflict,
      overrides: eventOverrides(ev, subject),
    },
  };
}

export function timeDiffMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return ((eh ?? 0) * 60 + (em ?? 0)) - ((sh ?? 0) * 60 + (sm ?? 0));
}
