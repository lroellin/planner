import type { AppState, CalendarEvent, Group, ID, Phase, Room, Subject, Teacher } from '../types';
import {
  effectiveTeacherIds, effectiveRoomId, eventInPhase, phaseGroups, eventGroupIds, timeDiffMinutes,
  sortSubjects, isEventActive,
} from '../utils/timeUtils';

// ─── Coverage: has every group had every subject? ─────────────────────────────

export interface CoverageRow {
  subject: Subject;
  counts: Map<ID, number>;  // groupId → number of placed instances
  minutes: Map<ID, number>; // groupId → placed minutes
/** Minutes each lane owes: the subject's own duration. */
  target: number;
  missing: number;          // enabled groups with zero instances
  /**
   * Every group has the full time, but not the same amount of it — someone got
   * more than the subject calls for. How the time was *cut up* is not a mistake
   * (1.5 h + 1 h is a fine way to deliver 2.5 h); having a different total is.
   */
  uneven: boolean;
  /** Every group has some of it, but at least one lane is under the duration. */
  short: boolean;
  /**
   * At least one lane has *more* than the subject's duration. Distinct from
   * `uneven`, which can only ever see a difference *between* lanes: a phase with
   * one lane has nothing to differ from, so a Kader subject planned for 6 h
   * against a Soll of 3 h read as complete, and so did a subject placed at
   * double its duration in every lane. Over-planning is a mistake whether or not
   * it was made evenly.
   */
  over: boolean;
}

export interface CoverageSection {
  phase: Phase;
  rows: CoverageRow[];
  groupIds: ID[];
  totalMissing: number;
}

/** How a row reads at a glance. One definition, used by the report and the sidebar. */
export type CoverageStatus = 'missing' | 'short' | 'over' | 'uneven' | 'complete';

export function coverageStatus(
  row: Pick<CoverageRow, 'missing' | 'short' | 'uneven' | 'over'>,
): CoverageStatus {
  if (row.missing > 0) return 'missing';
  if (row.short) return 'short';
  // Before `uneven`: when both hold, "zu viel" names the amount that is wrong,
  // where "ungleich" only names the spread.
  if (row.over) return 'over';
  if (row.uneven) return 'uneven';
  return 'complete';
}

/** The widest phase — where an as-yet unplaced subject is assumed to belong. */
function fallbackPhase(state: AppState): Phase | null {
  return state.phases.reduce<Phase | null>(
    (widest, p) =>
      widest === null || phaseGroups(state, p).length > phaseGroups(state, widest).length ? p : widest,
    null,
  );
}

/**
 * The phases a subject is rotated through. A Kader subject must not be judged
 * against the group lanes and vice versa, so coverage is always measured within
 * a phase. An explicit `phaseId` settles it; otherwise the phases the subject is
 * actually placed in are used, falling back to the widest phase (the group
 * rotation) while it has no placements at all.
 */
export function subjectPhases(state: AppState, subjectId: ID): Phase[] {
  const subject = state.subjects.find(s => s.id === subjectId);
  if (subject?.phaseId) {
    const pinned = state.phases.find(p => p.id === subject.phaseId);
    if (pinned) return [pinned];
  }
  const placed = state.events.filter(ev => ev.subjectId === subjectId);
  if (placed.length === 0) {
    const fallback = fallbackPhase(state);
    return fallback ? [fallback] : [];
  }
  return state.phases.filter(p => placed.some(ev => eventInPhase(state, ev, p)));
}

interface LaneTally {
  count: number;
  minutes: number;
}

/**
 * What each lane of one phase has of one subject. Minutes are what count: a
 * subject is delivered when the time is there, so 2×45 and 1×90 are the same
 * lesson. The instance count is kept only as the small print under it.
 */
function tallyLanes(state: AppState, subjectId: ID, phase: Phase): Map<ID, LaneTally> {
  const tally = new Map<ID, LaneTally>(
    phaseGroups(state, phase).map(g => [g.id, { count: 0, minutes: 0 }]),
  );
  for (const ev of state.events) {
    if (ev.subjectId !== subjectId || !eventInPhase(state, ev, phase)) continue;
    const minutes = timeDiffMinutes(ev.startTime, ev.endTime);
    for (const gid of eventGroupIds(state, ev)) {
      const lane = tally.get(gid);
      if (!lane) continue;
      lane.count++;
      lane.minutes += minutes;
    }
  }
  return tally;
}

export function buildCoverage(state: AppState): CoverageSection[] {
  return state.phases.map(phase => {
    const groupIds = phaseGroups(state, phase).map(g => g.id);

    // Only Themen are "owed" by every lane. Pausen are placed ad hoc rather than
    // attended, and a Programmpunkt happens once for the whole course — neither
    // has a per-group Soll to measure against.
    const rows: CoverageRow[] = sortSubjects(state.subjects)
      .filter(s => s.kind === 'lesson')
      .filter(s => subjectPhases(state, s.id).some(p => p.id === phase.id))
      .map(subject => {
        const tally = tallyLanes(state, subject.id, phase);
        const counts = new Map<ID, number>(groupIds.map(id => [id, tally.get(id)?.count ?? 0]));
        const minutes = new Map<ID, number>(groupIds.map(id => [id, tally.get(id)?.minutes ?? 0]));
        const target = subject.defaultDurationMinutes;

        const missing = groupIds.filter(id => counts.get(id) === 0).length;
        const totals = groupIds.map(id => minutes.get(id) ?? 0);
        const short = missing === 0 && totals.some(m => m < target);
        const over = missing === 0 && !short && totals.some(m => m > target);
        const uneven =
          missing === 0 && !short && totals.length > 1 &&
          Math.max(...totals) !== Math.min(...totals);

        return { subject, counts, minutes, target, missing, uneven, short, over };
      });

    return { phase, rows, groupIds, totalMissing: rows.reduce((n, r) => n + r.missing, 0) };
  });
}

/**
 * Lane coverage across the phases this subject is taught in — the sidebar
 * counter. It carries the same `uneven`/`short` verdicts the coverage report
 * reaches, because a chip that reads a green 3/3 while the report calls the same
 * row short is the badge people look at all day being the one that is wrong.
 */
export function coverageForSubject(
  state: AppState,
  subjectId: ID,
): { placed: number; total: number; uneven: boolean; short: boolean; over: boolean } {
  const subject = state.subjects.find(s => s.id === subjectId);
  // Only a Thema is owed by every lane; a Pause or a Programmpunkt has nothing
  // to be short of, so the badge has nothing to say about it.
  if (!subject || subject.kind !== 'lesson') {
    return { placed: 0, total: 0, uneven: false, short: false, over: false };
  }
  const target = subject.defaultDurationMinutes;
  let placed = 0;
  let total = 0;
  let uneven = false;
  let short = false;
  let over = false;

  for (const phase of subjectPhases(state, subjectId)) {
    const groups = phaseGroups(state, phase);
    if (groups.length === 0) continue;
    const tally = tallyLanes(state, subjectId, phase);
    const totals = groups.map(g => tally.get(g.id)?.minutes ?? 0);

    total += groups.length;
    placed += groups.filter(g => (tally.get(g.id)?.count ?? 0) > 0).length;

    if (totals.some(m => m === 0)) continue;
    if (totals.some(m => m < target)) short = true;
    else if (totals.some(m => m > target)) over = true;
    else if (totals.length > 1 && Math.max(...totals) !== Math.min(...totals)) uneven = true;
  }

  return { placed, total, uneven, short, over };
}

/**
 * Which lanes still lack this subject. The sidebar counter says *that* something
 * is missing; hovering says *where*, which is the question the planner actually
 * has. Lanes that have it but fall short of the target are named too, with how
 * much time is still owed.
 */
export function missingLanesForSubject(state: AppState, subjectId: ID): string[] {
  const subject = state.subjects.find(s => s.id === subjectId);
  if (!subject || subject.kind !== 'lesson') return [];
  const target = subject.defaultDurationMinutes;
  const labels: string[] = [];
  for (const phase of subjectPhases(state, subjectId)) {
    const tally = tallyLanes(state, subjectId, phase);
    for (const group of phaseGroups(state, phase)) {
      const lane = tally.get(group.id) ?? { count: 0, minutes: 0 };
      if (lane.count === 0) labels.push(group.label);
      else if (lane.minutes < target) {
        labels.push(`${group.label} (noch ${target - lane.minutes} min)`);
      }
    }
  }
  return labels;
}

/**
 * The same answer as `missingLanesForSubject`, as lane ids within one phase —
 * what the grid needs to mark the headers of the lanes that still owe a subject
 * while its sidebar chip is spotlighted. Labels are for reading; a calendar
 * column is addressed by id, and the two phases have different lanes.
 */
export function missingLaneIdsForSubject(state: AppState, subjectId: ID, phase: Phase): ID[] {
  const subject = state.subjects.find(s => s.id === subjectId);
  if (!subject || subject.kind !== 'lesson') return [];
  // A Kader subject is not owed by the group lanes, and vice versa.
  if (!subjectPhases(state, subjectId).some(p => p.id === phase.id)) return [];

  const target = subject.defaultDurationMinutes;
  const tally = tallyLanes(state, subjectId, phase);
  return phaseGroups(state, phase)
    .filter(group => {
      const lane = tally.get(group.id) ?? { count: 0, minutes: 0 };
      return lane.count === 0 || lane.minutes < target;
    })
    .map(group => group.id);
}

// ─── Workload ─────────────────────────────────────────────────────────────────
// What one teacher or one room is booked for. The config detail panes worked
// this out for themselves, which had already drifted: the teacher pane counted
// events on switched-off groups and the report did not, so the same week showed
// two different hour counts depending on where you looked.

export interface ResourceLoad {
  count: number;
  minutes: number;
  /** Weekday indices with at least one booking, in week order. */
  days: number[];
  /** Subjects that name this resource as their default. */
  subjects: Subject[];
}

function loadFrom(state: AppState, events: CalendarEvent[], subjects: Subject[]): ResourceLoad {
  return {
    count: events.length,
    minutes: events.reduce((n, ev) => n + timeDiffMinutes(ev.startTime, ev.endTime), 0),
    days: [...new Set(events.map(ev => ev.dayIndex))].sort((a, b) => a - b),
    subjects: sortSubjects(subjects),
  };
}

export function teacherLoad(state: AppState, teacherId: ID): ResourceLoad {
  const events = state.events.filter(ev =>
    isEventActive(state, ev) &&
    effectiveTeacherIds(ev, state.subjects.find(s => s.id === ev.subjectId)).includes(teacherId),
  );
  return loadFrom(state, events, state.subjects.filter(s => s.defaultTeacherIds.includes(teacherId)));
}

export function roomLoad(state: AppState, roomId: ID): ResourceLoad {
  const events = state.events.filter(ev =>
    isEventActive(state, ev) &&
    effectiveRoomId(ev, state.subjects.find(s => s.id === ev.subjectId)) === roomId,
  );
  return loadFrom(state, events, state.subjects.filter(s => s.defaultRoomId === roomId));
}

// ─── Per-teacher plans ────────────────────────────────────────────────────────

export type EntryStatus =
  | 'teaching'      // they run it, as the subject's default teacher
  | 'covering'      // they run it, but are not a default teacher for the subject
  | 'handed-over';  // they are a default teacher, but this instance went to someone else

export interface PlanEntry {
  eventId: ID;
  dayIndex: number;
  startTime: string;
  endTime: string;
  groupLabels: string[];
  roomName: string | null;
  status: EntryStatus;
  /** Who took it over ('handed-over') or who they are standing in for ('covering'). */
  counterparts: Teacher[];
}

export interface PlanSubjectBlock {
  subject: Subject;
  entries: PlanEntry[];
}

export interface TeacherPlan {
  teacher: Teacher;
  blocks: PlanSubjectBlock[];
  teachingCount: number;
  coveringCount: number;
  handedOverCount: number;
  totalMinutes: number;
}

export function buildTeacherPlans(state: AppState): TeacherPlan[] {
  const groupLabel = (id: ID): string | null =>
    state.groups.find(g => g.id === id)?.label ?? null;

  return state.teachers.map(teacher => {
    const bySubject = new Map<ID, PlanEntry[]>();
    let teachingCount = 0;
    let coveringCount = 0;
    let handedOverCount = 0;
    let totalMinutes = 0;

    for (const ev of state.events) {
      const subject = state.subjects.find(s => s.id === ev.subjectId);
      if (!subject) continue;

      const groupIds = eventGroupIds(state, ev);
      if (groupIds.length === 0) continue;

      const actual = effectiveTeacherIds(ev, subject);
      const isActual = actual.includes(teacher.id);
      const isDefault = subject.defaultTeacherIds.includes(teacher.id);

      // Neither running it nor nominally responsible for it — not their concern.
      if (!isActual && !isDefault) continue;

      let status: EntryStatus;
      let counterpartIds: ID[];
      if (isActual && isDefault) {
        status = 'teaching';
        counterpartIds = [];
      } else if (isActual) {
        // Standing in: credit the default teachers who are not on this instance.
        status = 'covering';
        counterpartIds = subject.defaultTeacherIds.filter(id => !actual.includes(id));
      } else {
        // Nominally theirs, but this instance was reassigned.
        status = 'handed-over';
        const outsiders = actual.filter(id => !subject.defaultTeacherIds.includes(id));
        counterpartIds = outsiders.length > 0 ? outsiders : actual;
      }

      if (status === 'teaching') teachingCount++;
      else if (status === 'covering') coveringCount++;
      else handedOverCount++;

      if (status !== 'handed-over') totalMinutes += timeDiffMinutes(ev.startTime, ev.endTime);

      const roomId = effectiveRoomId(ev, subject);

      const entry: PlanEntry = {
        eventId: ev.id,
        dayIndex: ev.dayIndex,
        startTime: ev.startTime,
        endTime: ev.endTime,
        groupLabels: groupIds.map(groupLabel).filter((l): l is string => l !== null),
        roomName: roomId ? state.rooms.find(r => r.id === roomId)?.name ?? null : null,
        status,
        counterparts: counterpartIds
          .map(id => state.teachers.find(t => t.id === id))
          .filter((t): t is Teacher => Boolean(t)),
      };

      if (!bySubject.has(subject.id)) bySubject.set(subject.id, []);
      bySubject.get(subject.id)!.push(entry);
    }

    const blocks: PlanSubjectBlock[] = [...bySubject.entries()]
      .map(([subjectId, entries]) => ({
        subject: state.subjects.find(s => s.id === subjectId)!,
        entries: entries.sort(
          (a, b) => a.dayIndex - b.dayIndex || a.startTime.localeCompare(b.startTime),
        ),
      }))
      .sort((a, b) => a.subject.name.localeCompare(b.subject.name));

    return { teacher, blocks, teachingCount, coveringCount, handedOverCount, totalMinutes };
  });
}

// ─── Per-group and per-room plans ─────────────────────────────────────────────

/** One line of a printed plan: what happens, when, with whom, where. */
export interface ScheduleEntry {
  eventId: ID;
  dayIndex: number;
  startTime: string;
  endTime: string;
  minutes: number;
  subject: Subject;
  teachers: Teacher[];
  roomName: string | null;
  groupLabels: string[];
}

export interface GroupPlan {
  group: Group;
  entries: ScheduleEntry[];
  lessonMinutes: number;
  lessonCount: number;
}

export interface RoomPlan {
  room: Room;
  entries: ScheduleEntry[];
  bookedMinutes: number;
}

function toEntry(state: AppState, eventId: ID): ScheduleEntry | null {
  const ev = state.events.find(e => e.id === eventId);
  if (!ev) return null;
  const subject = state.subjects.find(s => s.id === ev.subjectId);
  if (!subject) return null;
  const roomId = effectiveRoomId(ev, subject);
  return {
    eventId: ev.id,
    dayIndex: ev.dayIndex,
    startTime: ev.startTime,
    endTime: ev.endTime,
    minutes: timeDiffMinutes(ev.startTime, ev.endTime),
    subject,
    teachers: effectiveTeacherIds(ev, subject)
      .map(id => state.teachers.find(t => t.id === id))
      .filter((t): t is Teacher => Boolean(t)),
    roomName: roomId ? state.rooms.find(r => r.id === roomId)?.name ?? null : null,
    groupLabels: eventGroupIds(state, ev)
      .map(id => state.groups.find(g => g.id === id)?.label)
      .filter((l): l is string => Boolean(l)),
  };
}

function byTime(a: ScheduleEntry, b: ScheduleEntry): number {
  return a.dayIndex - b.dayIndex || a.startTime.localeCompare(b.startTime);
}

/**
 * The document a group actually gets handed: their whole week in order, breaks
 * included, because a participant's day is not a list of lessons.
 */
export function buildGroupPlans(state: AppState): GroupPlan[] {
  return [...state.groups]
    .filter(g => g.enabled)
    .sort((a, b) => a.order - b.order)
    .map(group => {
      const entries = state.events
        .filter(ev => eventGroupIds(state, ev).includes(group.id))
        .map(ev => toEntry(state, ev.id))
        .filter((e): e is ScheduleEntry => e !== null)
        .sort(byTime);

      // Programmpunkte count: a Begrüssung is time the group is occupied.
      const lessons = entries.filter(e => e.subject.kind !== 'break');
      return {
        group,
        entries,
        lessonCount: lessons.length,
        lessonMinutes: lessons.reduce((n, e) => n + e.minutes, 0),
      };
    });
}

/** Where a room is occupied — the janitor's and the quartermaster's view. */
export function buildRoomPlans(state: AppState): RoomPlan[] {
  return state.rooms.map(room => {
    const entries = state.events
      .filter(ev => {
        const subject = state.subjects.find(s => s.id === ev.subjectId);
        // isEventActive for the same reason the teacher plans skip them: a
        // booking nobody attends is not a booking.
        return subject !== undefined
          && isEventActive(state, ev)
          && effectiveRoomId(ev, subject) === room.id;
      })
      .map(ev => toEntry(state, ev.id))
      .filter((e): e is ScheduleEntry => e !== null)
      .sort(byTime);

    return {
      room,
      entries,
      bookedMinutes: entries.reduce((n, e) => n + e.minutes, 0),
    };
  });
}
