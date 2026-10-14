/**
 * The Belegung view: the WK week as one row per Ausbildner and one per Raum.
 *
 * The planning grid answers "what does G2 do on Wednesday"; this answers the
 * two questions it cannot — "is Anna booked twice" and "when is the Turnhalle
 * free" — by turning the lanes ninety degrees. Everything here is pure: the
 * component hands the result to FullCalendar's resource-timeline and adds
 * nothing of its own to the data.
 *
 * One stored Lektion becomes **one bar per row it occupies**: a bar in each of
 * its Ausbildner's rows and one in its Raum's. A multi-group Lektion is still one
 * Lektion — it is not repeated per lane, it names its lanes in its label.
 */

import { CONFLICT_KIND_LABELS, isHardConflict } from '../types';
import type { AppState, CalendarEvent, ConflictKind, EventFilter, ID, TimeWindow } from '../types';
import type { EventInput } from 'fullcalendar';
import type { ResourceInput } from 'fullcalendar-scheduler';
import {
  DAY_NAMES, dayDate, effectiveRoomId, effectiveTeacherIds, eventGroupIds, eventMatchesFilter,
  isEventActive, toISOLocal,
} from './timeUtils';
import { roomShort, subjectShort, teacherShort } from './format';

export type TimelineRowKind = 'teacher' | 'room';

/** The two headings the rows are grouped under, in display order. */
export const TIMELINE_SECTIONS: Record<TimelineRowKind, string> = {
  teacher: 'Ausbildner',
  room: 'Räume',
};

/**
 * Row ids carry their kind, because an Ausbildner and a Raum are two different
 * id spaces that FullCalendar sees as one.
 */
export function timelineRowId(kind: TimelineRowKind, id: ID): string {
  return `${kind === 'teacher' ? 't' : 'r'}:${id}`;
}

/** What the row label renders; carried as the resource's extended props. */
export interface TimelineRowProps {
  kind: TimelineRowKind;
  entityId: ID;
  short: string;
  color: string;
  /** A Raum outside the conflict check: several Lektionen at once are fine. */
  shared: boolean;
}

/**
 * Ausbildner first, then Räume, each in the order Konfiguration keeps them —
 * the same order the legend and the filter menu list them in. `section` is the
 * grouping field and `order` keeps FullCalendar from sorting by title.
 */
export function timelineResources(state: AppState): ResourceInput[] {
  const teachers = state.teachers.map((t, i): ResourceInput => ({
    id: timelineRowId('teacher', t.id),
    title: t.name,
    section: TIMELINE_SECTIONS.teacher,
    order: i,
    extendedProps: {
      kind: 'teacher', entityId: t.id, short: teacherShort(t), color: t.color, shared: false,
    } satisfies TimelineRowProps,
  }));
  const rooms = state.rooms.map((r, i): ResourceInput => ({
    id: timelineRowId('room', r.id),
    title: r.name,
    section: TIMELINE_SECTIONS.room,
    order: state.teachers.length + i,
    extendedProps: {
      kind: 'room', entityId: r.id, short: roomShort(r), color: r.color,
      shared: r.excludeFromConflictCheck,
    } satisfies TimelineRowProps,
  }));
  return [...teachers, ...rooms];
}

/**
 * The days the timeline spans: from the first Phase's first day to the last
 * Phase's last, the same days the planning grid draws side by side. A plan with
 * no Phase at all still gets the working week rather than an empty axis.
 */
export function timelineDays(state: AppState): { startDay: number; dayCount: number } {
  if (state.phases.length === 0) return { startDay: 0, dayCount: DAY_NAMES.length };
  const first = Math.min(...state.phases.map(p => p.startDay));
  const last = Math.max(...state.phases.map(p => p.endDay));
  return { startDay: first, dayCount: Math.max(1, last - first + 1) };
}

/**
 * How a Lektion's conflicts read *in one row*.
 *
 * The ring belongs to the row the clash is about: Anna's row shows that Anna
 * is booked twice, and the Raum row of the same Lektion stays quiet unless the
 * Raum is double-booked as well — otherwise a teacher clash would paint every
 * room it touches red and the view would point at the wrong resource. A
 * conflict elsewhere (a Gruppe, another Ausbildner of the same Lektion) is still
 * said, as a small flag, so a bar never looks cleaner than its card does.
 */
export function rowConflict(
  ev: CalendarEvent,
  kind: TimelineRowKind,
  entityId: ID,
): { here: 'hard' | 'soft' | null; elsewhere: 'hard' | 'soft' | null } {
  const refs = ev.conflicts ?? [];
  const concernsRow = (k: ConflictKind, resourceId: ID): boolean =>
    resourceId === entityId &&
    (kind === 'teacher' ? k === 'teacher' || k === 'teacher-absent' : k === 'room' || k === 'room-blocked');

  const level = (kinds: ConflictKind[]): 'hard' | 'soft' | null =>
    kinds.length === 0 ? null : kinds.some(isHardConflict) ? 'hard' : 'soft';

  return {
    here: level(refs.filter(c => concernsRow(c.kind, c.resourceId)).map(c => c.kind)),
    elsewhere: level(refs.filter(c => !concernsRow(c.kind, c.resourceId)).map(c => c.kind)),
  };
}

/** The props the bar renderer reads, so it never reaches back into the store. */
export interface TimelineBarProps {
  eventId: ID;
  color: string;
  /** "Funk", "SchuKad" — the Thema's Kürzel. */
  subjectShort: string;
  /** "G1", "G1 G2 G3" — every lane the Lektion stands on. */
  lanes: string;
  conflictHere: 'hard' | 'soft' | null;
  conflictElsewhere: 'hard' | 'soft' | null;
}

/**
 * One bar per (Lektion × row). Lektionen hidden by a disabled Gruppe are left
 * out, as everywhere else; one with neither an Ausbildner nor a Raum — a bare
 * Pause — books nobody and has no row to stand in. The toolbar filter narrows
 * this view exactly as it narrows the grid.
 */
export function buildTimelineEvents(
  state: AppState,
  filter: EventFilter | null = null,
): EventInput[] {
  const subjectById = new Map(state.subjects.map(s => [s.id, s]));
  const teacherIds = new Set(state.teachers.map(t => t.id));
  const roomIds = new Set(state.rooms.map(r => r.id));
  const out: EventInput[] = [];

  for (const ev of state.events) {
    if (!isEventActive(state, ev) || !eventMatchesFilter(ev, state, filter)) continue;
    const subject = subjectById.get(ev.subjectId);
    if (!subject) continue;

    const rows: { kind: TimelineRowKind; id: ID }[] = [
      ...effectiveTeacherIds(ev, subject)
        .filter(id => teacherIds.has(id))
        .map(id => ({ kind: 'teacher' as const, id })),
    ];
    const roomId = effectiveRoomId(ev, subject);
    if (roomId !== null && roomIds.has(roomId)) rows.push({ kind: 'room', id: roomId });
    if (rows.length === 0) continue;

    const lanes = eventGroupIds(state, ev)
      .map(gid => state.groups.find(g => g.id === gid)?.label)
      .filter((l): l is string => Boolean(l))
      .join(' ');

    for (const row of rows) {
      const { here, elsewhere } = rowConflict(ev, row.kind, row.id);
      out.push({
        id: `${ev.id}@${timelineRowId(row.kind, row.id)}`,
        resourceId: timelineRowId(row.kind, row.id),
        start: toISOLocal(state.wkStartDate, ev.dayIndex, ev.startTime),
        end: toISOLocal(state.wkStartDate, ev.dayIndex, ev.endTime),
        title: subject.name,
        // Reaches the bar only as FC's `--fc-event-color`, read as --ev-color.
        color: subject.color,
        extendedProps: {
          eventId: ev.id,
          color: subject.color,
          subjectShort: subjectShort(subject),
          lanes,
          conflictHere: here,
          conflictElsewhere: elsewhere,
        } satisfies TimelineBarProps,
      });
    }
  }
  return out;
}

/**
 * Abwesenheiten and Sperrzeiten, as shading in their own row. "Who is free"
 * is half the question this view answers, and an Ausbildner who is away on
 * Thursday is not free just because nothing is booked there.
 */
export function buildAvailabilityBackground(state: AppState): EventInput[] {
  const windows = (kind: TimelineRowKind, id: ID, list: TimeWindow[]): EventInput[] =>
    list.flatMap(w => w.days.map((day): EventInput => ({
      id: `${w.id}@${timelineRowId(kind, id)}@${day}`,
      resourceId: timelineRowId(kind, id),
      display: 'background',
      start: toISOLocal(state.wkStartDate, day, w.startTime),
      // "24:00" is how an all-day window is stored, and not a time a date
      // string can carry: it is midnight of the next day.
      end: w.endTime === '24:00'
        ? `${dayDate(state.wkStartDate, day + 1)}T00:00:00`
        : toISOLocal(state.wkStartDate, day, w.endTime),
      extendedProps: { availability: kind === 'teacher' ? 'abwesend' : 'gesperrt', note: w.note },
    })));

  return [
    ...state.teachers.flatMap(t => windows('teacher', t.id, t.unavailable)),
    ...state.rooms.flatMap(r => windows('room', r.id, r.unavailable)),
  ];
}

/**
 * The bar's tooltip and accessible name — the same sentence the planning
 * grid's card carries, so a Lektion reads the same in both views.
 */
export function timelineTooltip(state: AppState, ev: CalendarEvent): string {
  const subject = state.subjects.find(s => s.id === ev.subjectId);
  const lanes = eventGroupIds(state, ev)
    .map(gid => state.groups.find(g => g.id === gid)?.label)
    .filter(Boolean)
    .join(', ');
  const teachers = effectiveTeacherIds(ev, subject)
    .map(id => state.teachers.find(t => t.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  const roomId = effectiveRoomId(ev, subject);
  const room = roomId ? state.rooms.find(r => r.id === roomId)?.name : undefined;
  const kinds = [...new Set((ev.conflicts ?? []).map(c => c.kind))];
  return [
    subject?.name ?? '?',
    `${DAY_NAMES[ev.dayIndex] ?? '?'} ${ev.startTime}–${ev.endTime}`,
    lanes,
    teachers,
    room,
    kinds.length > 0 ? `⚠ Konflikt: ${kinds.map(k => CONFLICT_KIND_LABELS[k]).join(' + ')}` : null,
  ].filter(Boolean).join(' · ');
}

/** A bar as the keyboard sees it: which row it is in and where it sits in time. */
export interface TimelineBarBox {
  /** The FullCalendar event id, `<eventId>@<rowId>` — unique per bar. */
  key: string;
  /** Display index of the row, top to bottom. */
  row: number;
  /** Epoch milliseconds, or any other monotonic time scale. */
  start: number;
  end: number;
}

export type TimelineDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Where an arrow key goes from `fromKey`. Left/Right step along time within
 * the row; Up/Down go to the bar in the nearest row above or below that has
 * any, picking the one closest in time to the current bar's middle — a bar
 * that covers that moment wins outright. `null` at an edge: the focus stays.
 */
export function timelineNeighbour(
  bars: TimelineBarBox[],
  fromKey: string,
  dir: TimelineDirection,
): string | null {
  const from = bars.find(b => b.key === fromKey);
  if (!from) return null;
  const byTime = (a: TimelineBarBox, b: TimelineBarBox): number =>
    a.start - b.start || a.end - b.end || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

  if (dir === 'left' || dir === 'right') {
    const row = bars.filter(b => b.row === from.row).sort(byTime);
    const i = row.indexOf(from);
    return row[dir === 'right' ? i + 1 : i - 1]?.key ?? null;
  }

  const candidates = bars.filter(b => (dir === 'down' ? b.row > from.row : b.row < from.row));
  if (candidates.length === 0) return null;
  const target = dir === 'down'
    ? Math.min(...candidates.map(b => b.row))
    : Math.max(...candidates.map(b => b.row));
  const mid = (from.start + from.end) / 2;
  const gap = (b: TimelineBarBox): number => Math.max(0, b.start - mid, mid - b.end);
  const centre = (b: TimelineBarBox): number => Math.abs((b.start + b.end) / 2 - mid);
  const best = candidates
    .filter(b => b.row === target)
    .sort((a, b) => gap(a) - gap(b) || centre(a) - centre(b) || byTime(a, b))[0];
  return best?.key ?? null;
}
