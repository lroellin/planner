import type { AppState, Group, ID, Phase, Room, Subject, Teacher } from '../types';
import {
  effectiveTeacherIds, effectiveRoomId, eventInPhase, phaseGroups, eventGroupIds, timeDiffMinutes,
  sortSubjects,
} from '../utils/timeUtils';

// ─── Coverage: has every group had every subject? ─────────────────────────────

export interface CoverageRow {
  subject: Subject;
  counts: Map<ID, number>; // groupId → number of placed instances
  missing: number;         // enabled groups with zero instances
  /**
   * Every group has it, but not the same number of times. "Complete" hid this:
   * one group getting the lesson twice while another got it once is a planning
   * mistake, not a finished row.
   */
  uneven: boolean;
}

export interface CoverageSection {
  phase: Phase;
  rows: CoverageRow[];
  groupIds: ID[];
  totalMissing: number;
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

export function buildCoverage(state: AppState): CoverageSection[] {
  return state.phases.map(phase => {
    const groupIds = phaseGroups(state, phase).map(g => g.id);

    // Breaks are placed ad hoc rather than "attended", so they are not part of coverage.
    const rows: CoverageRow[] = sortSubjects(state.subjects)
      .filter(s => !s.isBreak)
      .filter(s => subjectPhases(state, s.id).some(p => p.id === phase.id))
      .map(subject => {
        const counts = new Map<ID, number>(groupIds.map(id => [id, 0]));
        for (const ev of state.events) {
          if (ev.subjectId !== subject.id || !eventInPhase(state, ev, phase)) continue;
          for (const gid of eventGroupIds(state, ev)) {
            if (counts.has(gid)) counts.set(gid, counts.get(gid)! + 1);
          }
        }
        const missing = groupIds.filter(id => counts.get(id) === 0).length;
        const values = groupIds.map(id => counts.get(id) ?? 0);
        const uneven =
          missing === 0 && values.length > 1 && Math.max(...values) !== Math.min(...values);
        return { subject, counts, missing, uneven };
      });

    return { phase, rows, groupIds, totalMissing: rows.reduce((n, r) => n + r.missing, 0) };
  });
}

/** Lanes covered across the phases this subject is taught in. Drives the sidebar counter. */
export function coverageForSubject(state: AppState, subjectId: ID): { placed: number; total: number } {
  const events = state.events.filter(ev => ev.subjectId === subjectId);
  let placed = 0;
  let total = 0;
  for (const phase of subjectPhases(state, subjectId)) {
    const groups = phaseGroups(state, phase);
    total += groups.length;
    placed += groups.filter(g =>
      events.some(ev => eventInPhase(state, ev, phase) && eventGroupIds(state, ev).includes(g.id)),
    ).length;
  }
  return { placed, total };
}

/**
 * Which lanes still lack this subject. The sidebar counter says *that* something
 * is missing; hovering says *where*, which is the question the planner actually
 * has.
 */
export function missingLanesForSubject(state: AppState, subjectId: ID): string[] {
  const events = state.events.filter(ev => ev.subjectId === subjectId);
  const labels: string[] = [];
  for (const phase of subjectPhases(state, subjectId)) {
    for (const group of phaseGroups(state, phase)) {
      const covered = events.some(
        ev => eventInPhase(state, ev, phase) && eventGroupIds(state, ev).includes(group.id),
      );
      if (!covered) labels.push(group.label);
    }
  }
  return labels;
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

      const lessons = entries.filter(e => !e.subject.isBreak);
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
        return subject !== undefined && effectiveRoomId(ev, subject) === room.id;
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
