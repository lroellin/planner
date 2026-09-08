import type { AppState, ID } from '../types';
import { buildGroupPlans, buildRoomPlans, buildTeacherPlans } from './../reports/reports';
import { DAY_NAMES, dayDateLabel, formatDuration } from '../utils/timeUtils';
import { teacherShort } from '../utils/format';

/**
 * The print model: a report reduced to *boxes*, where one box is one thing that
 * gets cut out and handed over — a Gruppe's week, an Ausbildner's week, a Raum's
 * bookings. Everything downstream (measuring, grid choice, drawing) works on
 * this shape and never touches AppState again, which is what makes the layout
 * arithmetic testable.
 *
 * Rows carry no wrapping: a cell that does not fit falls back to its short form
 * and only then to an ellipsis. That is a deliberate constraint, because it
 * makes a box's height a pure function of its row count — so the fitting
 * algorithm can try a dozen grids without ever rendering anything.
 *
 * The short forms are the ones the calendar cards already use: on a quarter-page
 * slip the Thema column is about as wide as a lane, and "Karteneröffnung" beats
 * "Karteneröffnung u…" for exactly the same reason there.
 */

/** The three reports that print as cut-out slips. */
export type PlanTarget = 'groups' | 'teachers' | 'rooms';

/** Everything the print dialog can produce. The grid is not a set of boxes. */
export type PrintTarget = PlanTarget | 'grid';

/**
 * A cell's full text and the short form to fall back on when it will not fit.
 *
 * Only *explicit* short names are used here, not the derived ones the calendar
 * cards fall back to: "Aussenplatz" cut to "Ausse" is worth it in a 70 px lane
 * and not worth it on paper, where an ellipsis at least admits it is cutting.
 * Teachers are the exception — initials are a real short name, not a truncation.
 */
export interface PrintCell {
  full: string;
  short: string;
  /**
   * The abbreviation-key entries this cell's *short* form depends on, as
   * `kind:short` keys into the document's candidate legend.
   *
   * The week grid prints its key from what was actually drawn, not from what
   * could have been drawn, and the renderer only learns that at the moment it
   * gives up on `full` — at which point all it holds is this cell. So the cell
   * carries the answer with it. Empty (or absent) when the short form needs no
   * explaining: the cut-out plans have no key at all and set nothing.
   */
  keys?: string[];
}

export interface PrintRow {
  time: string;
  /** The colour dot in front of the Thema. */
  color: string;
  subject: PrintCell;
  who: PrintCell;
  where: PrintCell;
  /** Second line, only used by the Ausbildnerplan (Stellvertretung / abgegeben). */
  note: string;
  /** Pausen and abgegebene Lektionen print grey: present, but not the reader's job. */
  muted: boolean;
}

export interface PrintDay {
  label: string;
  rows: PrintRow[];
}

export interface PrintBox {
  key: ID;
  /** What kind of sheet this is, printed small above the name. */
  kicker: string;
  title: string;
  summary: string;
  /** Left-hand rule colour. Groups have no colour of their own, so they get slate. */
  accent: string;
  days: PrintDay[];
  /** Shown instead of the day list when there is nothing to show. */
  emptyNote: string;
}

export interface PrintDoc {
  target: PlanTarget;
  /** Column headings, in row order: Zeit, Thema, and the two variable ones. */
  columns: [string, string, string, string];
  boxes: PrintBox[];
}

const NEUTRAL = '#475569';
const DASH = '–';

function cell(full: string, short = ''): PrintCell {
  const trimmed = short.trim();
  return { full, short: trimmed && trimmed !== full ? trimmed : full };
}

/** The code a room was given in Konfiguration, if any. */
function roomCode(state: AppState, name: string | null): string {
  if (name === null) return '';
  return state.rooms.find(r => r.name === name)?.shortName ?? '';
}

function dayLabel(state: AppState, dayIndex: number): string {
  return `${DAY_NAMES[dayIndex] ?? ''} ${dayDateLabel(state.wkStartDate, dayIndex)}`;
}

/**
 * Entries arrive sorted by day already, but the Ausbildnerplan's come grouped by
 * Thema — flattening those without re-sorting would list 15:45 before 08:00.
 * Same shape and same reason as the panel's own `byDay`.
 */
function byDay<T extends { dayIndex: number; startTime: string }>(entries: T[]): Map<number, T[]> {
  const days = new Map<number, T[]>();
  for (const e of entries) {
    if (!days.has(e.dayIndex)) days.set(e.dayIndex, []);
    days.get(e.dayIndex)!.push(e);
  }
  return new Map(
    [...days.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([d, list]) => [d, [...list].sort((x, y) => x.startTime.localeCompare(y.startTime))]),
  );
}

function toDays<T extends { dayIndex: number; startTime: string }>(
  state: AppState,
  entries: T[],
  toRow: (entry: T) => PrintRow,
): PrintDay[] {
  return [...byDay(entries)].map(([dayIndex, list]) => ({
    label: dayLabel(state, dayIndex),
    rows: list.map(toRow),
  }));
}

function groupBoxes(state: AppState): PrintBox[] {
  return buildGroupPlans(state).map(plan => ({
    key: plan.group.id,
    kicker: 'Gruppenplan',
    title: `Gruppe ${plan.group.label}`,
    summary: `${plan.lessonCount} ${plan.lessonCount === 1 ? 'Lektion' : 'Lektionen'} · ${formatDuration(plan.lessonMinutes)} Unterricht`,
    accent: NEUTRAL,
    emptyNote: 'Nichts geplant.',
    days: toDays(state, plan.entries, e => ({
      time: `${e.startTime}${DASH}${e.endTime}`,
      color: e.subject.color,
      subject: cell(e.subject.name, e.subject.shortName),
      who: {
        full: e.teachers.map(t => t.name).join(', '),
        short: e.teachers.map(t => teacherShort(t)).join(' '),
      },
      where: cell(e.roomName ?? DASH, roomCode(state, e.roomName)),
      note: '',
      muted: e.subject.kind === 'break',
    })),
  }));
}

function teacherBoxes(state: AppState): PrintBox[] {
  return buildTeacherPlans(state).map(plan => {
    const lessons = plan.teachingCount + plan.coveringCount;
    const extra = [
      plan.coveringCount > 0 ? `${plan.coveringCount}× als Stellvertretung` : null,
      plan.handedOverCount > 0 ? `${plan.handedOverCount}× abgegeben` : null,
    ].filter(Boolean);

    // The teacher plan is stored per Thema; the sheet is read per day.
    const entries = plan.blocks.flatMap(b => b.entries.map(e => ({ ...e, subject: b.subject })));

    return {
      key: plan.teacher.id,
      kicker: 'Ausbildnerplan',
      title: plan.teacher.name,
      summary: [
        `${lessons} ${lessons === 1 ? 'Lektion' : 'Lektionen'} · ${formatDuration(plan.totalMinutes)}`,
        ...extra,
      ].join(' · '),
      accent: plan.teacher.color,
      emptyNote: 'Nichts geplant.',
      days: toDays(state, entries, e => ({
        time: `${e.startTime}${DASH}${e.endTime}`,
        color: e.subject.color,
        subject: cell(e.subject.name, e.subject.shortName),
        who: cell(e.groupLabels.join(' ') || DASH),
        where: cell(e.roomName ?? DASH, roomCode(state, e.roomName)),
        note:
          e.status === 'handed-over'
            ? `abgegeben an ${e.counterparts.map(t => t.name).join(', ') || 'jemand anderen'}`
            : e.status === 'covering'
              ? `Stellvertretung für ${e.counterparts.map(t => t.name).join(', ') || 'die Vorgabe'}`
              : '',
        muted: e.status === 'handed-over',
      })),
    };
  });
}

function roomBoxes(state: AppState): PrintBox[] {
  // Unlike the on-screen panel, a never-booked room is left out entirely: the
  // point of this sheet is that it goes on the door, and an empty one has no
  // door to go on.
  return buildRoomPlans(state)
    .filter(plan => plan.entries.length > 0)
    .map(plan => ({
      key: plan.room.id,
      kicker: 'Raumbelegung',
      title: plan.room.name,
      summary: [
        `${plan.entries.length} ${plan.entries.length === 1 ? 'Belegung' : 'Belegungen'} · ${formatDuration(plan.bookedMinutes)}`,
        plan.room.excludeFromConflictCheck ? 'geteilter Raum' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      accent: plan.room.color,
      emptyNote: 'Nie belegt.',
      days: toDays(state, plan.entries, e => ({
        time: `${e.startTime}${DASH}${e.endTime}`,
        color: e.subject.color,
        subject: cell(e.subject.name, e.subject.shortName),
        who: cell(e.groupLabels.join(', ') || DASH),
        where: {
          full: e.teachers.map(t => t.name).join(', '),
          short: e.teachers.map(t => teacherShort(t)).join(' '),
        },
        note: '',
        muted: e.subject.kind === 'break',
      })),
    }));
}

const COLUMNS: Record<PlanTarget, [string, string, string, string]> = {
  groups: ['Zeit', 'Thema', 'Ausbildner', 'Raum'],
  teachers: ['Zeit', 'Thema', 'Gruppe', 'Raum'],
  rooms: ['Zeit', 'Thema', 'Gruppe', 'Ausbildner'],
};

export function buildPrintDoc(state: AppState, target: PlanTarget): PrintDoc {
  const boxes =
    target === 'groups' ? groupBoxes(state)
      : target === 'teachers' ? teacherBoxes(state)
        : roomBoxes(state);
  return { target, columns: COLUMNS[target], boxes };
}

export const TARGET_LABELS: Record<PrintTarget, string> = {
  grid: 'Kalender',
  groups: 'Gruppenpläne',
  teachers: 'Ausbildnerpläne',
  rooms: 'Raumpläne',
};

export function isPlanTarget(target: PrintTarget): target is PlanTarget {
  return target !== 'grid';
}
