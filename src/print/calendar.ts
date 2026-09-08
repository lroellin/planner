import { isHardConflict, type AppState, type ID } from '../types';
import type { PrintCell } from './boxes';
import {
  effectiveRoomId, effectiveTeacherIds, eventGroupIds, orderedPhases, phaseForDay, phaseGroups,
} from '../utils/timeUtils';
import { roomShort, subjectShort, teacherShort } from '../utils/format';
import { DAY_NAMES, dayDateLabel } from '../utils/timeUtils';

/**
 * The week grid as data: columns, a time range, and blocks placed against both.
 *
 * The screen calendar is FullCalendar's, one instance per phase, sized in JS.
 * Printing it from the DOM meant printing whatever widths that JS had settled
 * on. This model instead states what the grid *is* — lane columns under day
 * headers, minutes down the side — and lets the renderer size it to the sheet.
 */

export interface GridColumn {
  dayIndex: number;
  phaseId: ID;
  groupId: ID;
  label: string;
}

/** A header cell spanning `span` columns from column `from`. */
export interface GridSpan {
  label: string;
  sub: string;
  from: number;
  span: number;
}

export interface GridEntry {
  from: number;
  span: number;
  startMinutes: number;
  endMinutes: number;
  time: string;
  color: string;
  subject: PrintCell;
  teachers: PrintCell;
  room: PrintCell;
  isBreak: boolean;
  /** Hard conflicts are drawn solid, soft ones dashed; see the renderer. */
  conflict: 'none' | 'soft' | 'hard';
}

/**
 * One abbreviation the sheet may print, and what it stands for.
 *
 * A card falls back to a Kürzel whenever the lane is too narrow for the full
 * name, and on paper there is no tooltip to recover it from — so the sheet needs
 * a key. `CalendarDoc.legend` is the *candidate* set: every short form the
 * placed blocks could possibly show. Which of them a given sheet actually prints
 * depends on how much room its blocks turn out to have, so the renderer narrows
 * this list to what it really drew — see `resolveLegend` in `legendFit.ts`.
 */
export interface LegendEntry {
  short: string;
  full: string;
  kind: 'subject' | 'room' | 'teacher';
}

/** How a `LegendEntry` is addressed from a `PrintCell.keys`. */
export function legendKey(kind: LegendEntry['kind'], short: string): string {
  return `${kind}:${short}`;
}

export interface CalendarDoc {
  columns: GridColumn[];
  phases: GridSpan[];
  days: GridSpan[];
  entries: GridEntry[];
  legend: LegendEntry[];
  startMinutes: number;
  endMinutes: number;
}

const GRID_START = 7 * 60;   // the screen grid's own bounds; nothing sits outside
const GRID_END = 19 * 60;
const FALLBACK: [number, number] = [8 * 60, 17 * 60];

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * The hours worth drawing: the day's actual extent, opened out to whole hours.
 * Printing the full 07:00–19:00 when nothing starts before 08:00 spends a
 * seventh of the sheet on an empty band, and on paper that band cannot be
 * scrolled past.
 */
function timeRange(state: AppState, dayIndexes: Set<number>): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const ev of state.events) {
    if (!dayIndexes.has(ev.dayIndex)) continue;
    min = Math.min(min, toMinutes(ev.startTime));
    max = Math.max(max, toMinutes(ev.endTime));
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return FALLBACK;
  const start = Math.max(GRID_START, Math.floor(min / 60) * 60);
  const end = Math.min(GRID_END, Math.ceil(max / 60) * 60);
  // Never less than four hours, or a single short morning stretches its two
  // blocks over a whole sheet.
  return end - start >= 240 ? [start, end] : [start, Math.min(GRID_END, start + 240)];
}

/**
 * Split column indices into the contiguous stretches they actually form.
 *
 * A block used to be drawn as one bar from the lowest column it touches to the
 * highest, which is right for every event whose lanes sit next to each other —
 * and wrong for the one case where they do not. A group left out of the
 * reckoning keeps its column but is skipped by the shared Mittagessen, so with
 * lanes G1 · G2(excluded) · G3 the break resolves to columns 0 and 2 and a
 * single bar printed straight across G2, giving it a lunch the screen does not.
 */
function contiguousRuns(cols: number[]): { from: number; span: number }[] {
  const runs: { from: number; span: number }[] = [];
  for (const col of [...cols].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && col === last.from + last.span) last.span++;
    else runs.push({ from: col, span: 1 });
  }
  return runs;
}

export function buildCalendarDoc(state: AppState, phaseIds: ID[]): CalendarDoc {
  const columns: GridColumn[] = [];
  const phases: GridSpan[] = [];
  const days: GridSpan[] = [];

  for (const phase of orderedPhases(state)) {
    if (!phaseIds.includes(phase.id)) continue;
    const lanes = phaseGroups(state, phase);
    if (lanes.length === 0) continue;

    const phaseFrom = columns.length;
    for (let day = phase.startDay; day <= phase.endDay; day++) {
      const dayFrom = columns.length;
      for (const lane of lanes) {
        columns.push({ dayIndex: day, phaseId: phase.id, groupId: lane.id, label: lane.label });
      }
      days.push({
        label: DAY_NAMES[day] ?? '',
        sub: dayDateLabel(state.wkStartDate, day),
        from: dayFrom,
        span: lanes.length,
      });
    }
    phases.push({
      label: phase.label,
      sub: '',
      from: phaseFrom,
      span: columns.length - phaseFrom,
    });
  }

  const dayIndexes = new Set(columns.map(c => c.dayIndex));
  const [startMinutes, endMinutes] = timeRange(state, dayIndexes);

  // Column index by day+lane, so an event's lanes become a contiguous span.
  const index = new Map<string, number>();
  columns.forEach((c, i) => index.set(`${c.dayIndex}:${c.groupId}`, i));

  const entries: GridEntry[] = [];
  // Keyed by kind+short so the same Raum on twelve cards is listed once.
  const legend = new Map<string, LegendEntry>();
  // Returns the key the cell should carry, or null when the short form needs no
  // explaining (there is none, or it *is* the full name).
  const note = (kind: LegendEntry['kind'], short: string, full: string): string | null => {
    if (short === '' || full === '' || short === full) return null;
    const key = legendKey(kind, short);
    legend.set(key, { kind, short, full });
    return key;
  };
  const keys = (...maybe: (string | null)[]): string[] =>
    maybe.filter((k): k is string => k !== null);

  for (const ev of state.events) {
    const phase = phaseForDay(state, ev.dayIndex);
    if (!phase || !phaseIds.includes(phase.id)) continue;
    const subject = state.subjects.find(s => s.id === ev.subjectId);
    if (!subject) continue;

    // Through eventGroupIds, so the printed sheet resolves the all-lanes
    // sentinel exactly as the screen does — a group left out of the reckoning
    // keeps its own column but is skipped by the shared Mittagessen.
    const laneIds = new Set(eventGroupIds(state, ev));
    const cols = phaseGroups(state, phase)
      .filter(lane => laneIds.has(lane.id))
      .map(lane => index.get(`${ev.dayIndex}:${lane.id}`))
      .filter((i): i is number => i !== undefined);
    if (cols.length === 0) continue;

    const kinds = new Set((ev.conflicts ?? []).map(c => c.kind));
    const teachers = effectiveTeacherIds(ev, subject)
      .map(id => state.teachers.find(t => t.id === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    const roomId = effectiveRoomId(ev, subject);
    const room = roomId ? state.rooms.find(r => r.id === roomId) ?? null : null;

    // The *same* short forms the screen falls back to. An empty `shortName`
    // means "derive it" everywhere else in the app; taking it literally here
    // printed "Schutzanlage Bern-West" into a lane the grid renders as "SBW",
    // and — since `note` skips a short that equals its full name — left it out
    // of the key as well.
    const subjectKeys = keys(note('subject', subjectShort(subject), subject.name));
    const roomKeys = room ? keys(note('room', roomShort(room), room.name)) : [];
    const teacherKeys = keys(...teachers.map(t => note('teacher', teacherShort(t), t.name)));

    for (const run of contiguousRuns(cols)) entries.push({
      from: run.from,
      span: run.span,
      startMinutes: toMinutes(ev.startTime),
      endMinutes: toMinutes(ev.endTime),
      time: `${ev.startTime}–${ev.endTime}`,
      color: subject.color,
      subject: {
        full: subject.name,
        short: subjectShort(subject),
        keys: subjectKeys,
      },
      teachers: {
        full: teachers.map(t => t.name).join(', '),
        short: teachers.map(t => teacherShort(t)).join(' '),
        keys: teacherKeys,
      },
      room: {
        full: room?.name ?? '',
        short: room ? roomShort(room) : '',
        keys: roomKeys,
      },
      isBreak: subject.kind === 'break',
      conflict: kinds.size === 0
        ? 'none'
        : [...kinds].some(isHardConflict) ? 'hard' : 'soft',
    });
  }

  // Draw long blocks first so a short one placed inside one is not hidden under
  // it — the grid has no z-index, only paint order.
  entries.sort((a, b) => (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes));

  // Thema, Raum, Ausbildner — the order the card itself drops them in, so the
  // legend reads in the same sequence as the block it explains.
  const kindOrder: LegendEntry['kind'][] = ['subject', 'room', 'teacher'];
  const legendEntries = [...legend.values()].sort((a, b) =>
    kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)
    || a.short.localeCompare(b.short, 'de'));

  return {
    columns, phases, days, entries, legend: legendEntries, startMinutes, endMinutes,
  };
}
