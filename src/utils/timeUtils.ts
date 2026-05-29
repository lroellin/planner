import type { AppState, CalendarEvent, Group, ID, Subject } from '../types';
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

// Resolve an event's effective teachers/room, falling back to the subject defaults.
// null on the event means "inherit the subject default".
export function effectiveTeacherIds(
  ev: CalendarEvent | null | undefined,
  subject: Subject | null | undefined,
): ID[] {
  return ev?.teacherIds ?? subject?.defaultTeacherIds ?? [];
}

export function effectiveRoomId(
  ev: CalendarEvent | null | undefined,
  subject: Subject | null | undefined,
): ID | null {
  return ev?.roomId ?? subject?.defaultRoomId ?? null;
}

export function toISOLocal(wkStartDate: string, dayIndex: number, time: string): string {
  // wkStartDate is always a Monday ("YYYY-MM-DD")
  const [year, month, day] = wkStartDate.split('-').map(Number);
  const d = new Date(year!, (month! - 1), day! + dayIndex);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}:00`;
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
  // JS getDay(): 0=Sun, 1=Mon, ..., 5=Fri
  const d = date.getDay();
  return d === 0 ? 4 : d - 1; // Sunday maps to Friday as safety; normally Mon-Fri
}

export function groupsToResources(groups: Group[]): ResourceInput[] {
  return groups
    .filter(g => g.enabled)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map((g, i) => ({ id: g.id, title: g.label, order: i }));
}

export function buildFCEvents(state: AppState): EventInput[] {
  return state.events
    .filter(ev => state.groups.find(g => g.id === ev.groupId)?.enabled)
    .map(ev => buildFCEvent(ev, state));
}

export function buildFCEvent(ev: CalendarEvent, state: AppState): EventInput {
  const subject = state.subjects.find(s => s.id === ev.subjectId);
  const hasConflict = (ev.conflicts?.length ?? 0) > 0;
  const color = subject?.color ?? '#888888';

  return {
    id: ev.id,
    resourceId: ev.groupId,
    start: toISOLocal(state.wkStartDate, ev.dayIndex, ev.startTime),
    end: toISOLocal(state.wkStartDate, ev.dayIndex, ev.endTime),
    backgroundColor: color,
    borderColor: hasConflict ? '#e53e3e' : color,
    textColor: '#ffffff',
    title: subject?.name ?? '?',
    classNames: hasConflict ? ['fc-event-conflict'] : [],
    extendedProps: { eventId: ev.id },
  };
}

export function timeDiffMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return ((eh ?? 0) * 60 + (em ?? 0)) - ((sh ?? 0) * 60 + (sm ?? 0));
}
