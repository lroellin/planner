import type { AppState, CalendarEvent, ID, Phase, Subject, Teacher } from '../types';
import { effectiveTeacherIds, effectiveRoomId, eventInPhase, phaseGroups } from '../utils/timeUtils';

export function eventGroupIds(ev: CalendarEvent): ID[] {
  return Array.isArray(ev.groupId) ? ev.groupId : [ev.groupId];
}

// ─── Coverage: has every group had every subject? ─────────────────────────────

export interface CoverageRow {
  subject: Subject;
  counts: Map<ID, number>; // groupId → number of placed instances
  missing: number;         // enabled groups with zero instances
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
 * The phases a subject is rotated through — those it is actually placed in. A
 * Kader subject must not be judged against the group lanes and vice versa, so
 * coverage is always measured within a phase. A subject with no placements yet
 * is assumed to belong to the widest phase, the group rotation.
 */
function subjectPhases(state: AppState, subjectId: ID): Phase[] {
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
    const rows: CoverageRow[] = state.subjects
      .filter(s => !s.isBreak)
      .filter(s => subjectPhases(state, s.id).some(p => p.id === phase.id))
      .map(subject => {
        const counts = new Map<ID, number>(groupIds.map(id => [id, 0]));
        for (const ev of state.events) {
          if (ev.subjectId !== subject.id || !eventInPhase(state, ev, phase)) continue;
          for (const gid of eventGroupIds(ev)) {
            if (counts.has(gid)) counts.set(gid, counts.get(gid)! + 1);
          }
        }
        const missing = groupIds.filter(id => counts.get(id) === 0).length;
        return { subject, counts, missing };
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
      events.some(ev => eventInPhase(state, ev, phase) && eventGroupIds(ev).includes(g.id)),
    ).length;
  }
  return { placed, total };
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

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh ?? 0) * 60 + (em ?? 0)) - ((sh ?? 0) * 60 + (sm ?? 0));
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

      const groupIds = eventGroupIds(ev).filter(gid => state.groups.find(g => g.id === gid)?.enabled);
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

      if (status !== 'handed-over') totalMinutes += minutesBetween(ev.startTime, ev.endTime);

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
