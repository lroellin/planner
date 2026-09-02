import type {
  AppState, CalendarEvent, ConflictKind, ConflictRef, ConflictReport, GroupSelector, ID,
} from '../types';
import {
  effectiveTeacherIds, effectiveRoomId, eventGroupIds, isEventActive,
} from '../utils/timeUtils';
import { describeWindow, windowOverlaps } from '../utils/availability';

// Arbitrary Monday as reference epoch for time comparisons
const REFERENCE_MONDAY = new Date('2000-01-03T00:00:00').getTime();
const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;

function toMs(dayIndex: number, time: string): number {
  const [h, m] = time.split(':').map(Number);
  return REFERENCE_MONDAY + dayIndex * MS_PER_DAY + ((h ?? 0) * 60 + (m ?? 0)) * MS_PER_MIN;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

interface Interval {
  startMs: number;
  endMs: number;
  eventId: ID;
}

export function detectConflicts(state: AppState): ConflictReport[] {
  const teacherIntervals = new Map<ID, Interval[]>();
  const roomIntervals = new Map<ID, Interval[]>();
  const groupIntervals = new Map<ID, Interval[]>();

  const roomById = new Map(state.rooms.map(r => [r.id, r]));
  const subjectById = new Map(state.subjects.map(s => [s.id, s]));

  for (const ev of state.events) {
    const subject = subjectById.get(ev.subjectId);
    if (!subject) continue;

    // A hidden event must not raise conflicts either — see isEventActive.
    const groupIds = eventGroupIds(state, ev);
    if (groupIds.length === 0) continue;

    const startMs = toMs(ev.dayIndex, ev.startTime);
    const endMs = toMs(ev.dayIndex, ev.endTime);
    const interval: Interval = { startMs, endMs, eventId: ev.id };

    // A group cannot be in two places at once, so overlaps here are hard conflicts.
    // Breaks count too: a lesson running through a group's lunch is a real clash.
    // Multi-group events contribute one interval per group, so they never collide
    // with themselves.
    for (const gid of groupIds) {
      if (!groupIntervals.has(gid)) groupIntervals.set(gid, []);
      groupIntervals.get(gid)!.push(interval);
    }

    for (const tid of effectiveTeacherIds(ev, subject)) {
      if (!teacherIntervals.has(tid)) teacherIntervals.set(tid, []);
      teacherIntervals.get(tid)!.push(interval);
    }

    const roomId = effectiveRoomId(ev, subject);
    if (roomId) {
      const room = roomById.get(roomId);
      if (room && !room.excludeFromConflictCheck) {
        if (!roomIntervals.has(roomId)) roomIntervals.set(roomId, []);
        roomIntervals.get(roomId)!.push(interval);
      }
    }
  }

  const seen = new Set<string>();
  const reports: ConflictReport[] = [];

  // ── Availability ──────────────────────────────────────────────────────────
  // Booked while the resource is marked away. One event, not a pair, so these
  // are collected in the same pass over the events rather than pairwise below.
  for (const ev of state.events) {
    const subject = subjectById.get(ev.subjectId);
    if (!subject) continue;
    if (!isEventActive(state, ev)) continue;

    for (const tid of effectiveTeacherIds(ev, subject)) {
      const teacher = state.teachers.find(t => t.id === tid);
      if (!teacher) continue;
      for (const w of teacher.unavailable ?? []) {
        if (!windowOverlaps(w, ev.dayIndex, ev.startTime, ev.endTime)) continue;
        reports.push({
          kind: 'teacher-absent',
          resourceId: tid,
          resourceName: teacher.name,
          involvedEventIds: [ev.id],
          detail: `abwesend ${describeWindow(w)}${w.note ? ` (${w.note})` : ''}`,
        });
      }
    }

    const evRoomId = effectiveRoomId(ev, subject);
    const evRoom = evRoomId ? roomById.get(evRoomId) : null;
    // "Ignore conflicts" governs double-booking; a room that is explicitly
    // blocked is unavailable to everyone, shared space or not.
    if (evRoom) {
      for (const w of evRoom.unavailable ?? []) {
        if (!windowOverlaps(w, ev.dayIndex, ev.startTime, ev.endTime)) continue;
        reports.push({
          kind: 'room-blocked',
          resourceId: evRoom.id,
          resourceName: evRoom.name,
          involvedEventIds: [ev.id],
          detail: `gesperrt ${describeWindow(w)}${w.note ? ` (${w.note})` : ''}`,
        });
      }
    }
  }

  function checkIntervals(
    resourceId: ID,
    intervals: Interval[],
    kind: ConflictKind,
    getName: (id: ID) => string,
  ): void {
    for (let i = 0; i < intervals.length; i++) {
      for (let j = i + 1; j < intervals.length; j++) {
        const a = intervals[i]!;
        const b = intervals[j]!;
        if (!overlaps(a.startMs, a.endMs, b.startMs, b.endMs)) continue;

        const key = [kind, resourceId, ...[a.eventId, b.eventId].sort()].join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        reports.push({
          kind,
          resourceId,
          resourceName: getName(resourceId),
          involvedEventIds: [a.eventId, b.eventId],
        });
      }
    }
  }

  for (const [tid, intervals] of teacherIntervals) {
    checkIntervals(tid, intervals, 'teacher', id =>
      state.teachers.find(t => t.id === id)?.name ?? id,
    );
  }

  for (const [rid, intervals] of roomIntervals) {
    checkIntervals(rid, intervals, 'room', id => roomById.get(id)?.name ?? id);
  }

  for (const [gid, intervals] of groupIntervals) {
    checkIntervals(gid, intervals, 'group', id =>
      state.groups.find(g => g.id === id)?.label ?? id,
    );
  }

  return reports;
}

/**
 * Attach already-computed reports to their events. Kept separate from
 * detectConflicts so a state change runs the O(n²) detection exactly once and
 * shares the result between the annotated events and the conflict panel.
 */
export function attachConflicts(state: AppState, reports: ConflictReport[]): AppState {
  const conflictMap = new Map<ID, ConflictRef[]>();
  for (const report of reports) {
    for (const eventId of report.involvedEventIds) {
      const others = report.involvedEventIds.filter(id => id !== eventId);
      if (!conflictMap.has(eventId)) conflictMap.set(eventId, []);
      conflictMap.get(eventId)!.push({
        kind: report.kind,
        resourceId: report.resourceId,
        collidingEventIds: others,
      });
    }
  }

  const annotatedEvents: CalendarEvent[] = state.events.map(ev => {
    const conflicts = conflictMap.get(ev.id);
    if (conflicts && conflicts.length > 0) return { ...ev, conflicts };
    const { conflicts: _omit, ...rest } = ev;
    return rest as CalendarEvent;
  });

  return { ...state, events: annotatedEvents };
}


// ─── Live preview ─────────────────────────────────────────────────────────────

/**
 * A placement that has not happened yet: the event under the pointer mid-drag,
 * or a subject chip that has not been dropped. `eventId` is null for the chip —
 * nothing to exclude from the comparison then.
 */
export interface ClashCandidate {
  eventId: ID | null;
  subjectId: ID;
  groupId: GroupSelector;
  dayIndex: number;
  startTime: string;
  endTime: string;
  teacherIds: ID[] | 'inherit';
  roomId: ID | null | 'inherit';
}

export type ClashLevel = 'hard' | 'soft' | null;

/**
 * What a drop would cost, by exactly the rules `detectConflicts` uses.
 *
 * This lives beside the detector rather than in the calendar component because
 * it *is* the detector's rule set, only evaluated against one speculative event
 * instead of the whole week. The calendar used to carry its own copy, which had
 * drifted: it compared `groupId` literally (so the all-lanes lunch break never
 * matched), it had no subject to resolve defaults from when the drag came from
 * the sidebar, and it never looked at availability windows at all.
 */
export function previewClash(state: AppState, candidate: ClashCandidate): ClashLevel {
  const subject = state.subjects.find(s => s.id === candidate.subjectId);
  if (!subject) return null;

  // A probe event, so every lane/teacher/room resolution is the same code the
  // real ones go through — ALL_GROUPS included.
  const probe: CalendarEvent = {
    id: candidate.eventId ?? '\u0000probe',
    subjectId: candidate.subjectId,
    groupId: candidate.groupId,
    dayIndex: candidate.dayIndex,
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    teacherIds: candidate.teacherIds,
    roomId: candidate.roomId,
  };

  const lanes = new Set(eventGroupIds(state, probe));
  const teacherIds = new Set(effectiveTeacherIds(probe, subject));
  const roomId = effectiveRoomId(probe, subject);
  const room = roomId ? state.rooms.find(r => r.id === roomId) ?? null : null;

  const startMs = toMs(probe.dayIndex, probe.startTime);
  const endMs = toMs(probe.dayIndex, probe.endTime);

  let level: ClashLevel = null;
  const soft = (): void => { if (level === null) level = 'soft'; };

  // Availability first: it needs no second event, so it can answer immediately.
  for (const tid of teacherIds) {
    const teacher = state.teachers.find(t => t.id === tid);
    const away = (teacher?.unavailable ?? []).some(
      w => windowOverlaps(w, probe.dayIndex, probe.startTime, probe.endTime),
    );
    if (away) return 'hard';
  }
  const blocked = (room?.unavailable ?? []).some(
    w => windowOverlaps(w, probe.dayIndex, probe.startTime, probe.endTime),
  );
  if (blocked) soft();

  for (const other of state.events) {
    if (other.id === probe.id) continue;
    if (other.dayIndex !== probe.dayIndex) continue;
    const oStart = toMs(other.dayIndex, other.startTime);
    const oEnd = toMs(other.dayIndex, other.endTime);
    if (!overlaps(startMs, endMs, oStart, oEnd)) continue;

    const otherSubject = state.subjects.find(s => s.id === other.subjectId);
    if (!otherSubject) continue;

    // Lanes are resolved on both sides, so a lesson dropped over the all-lanes
    // Mittagessen reads as the group clash it is.
    if (eventGroupIds(state, other).some(gid => lanes.has(gid))) return 'hard';
    if (effectiveTeacherIds(other, otherSubject).some(tid => teacherIds.has(tid))) return 'hard';
    if (
      room &&
      !room.excludeFromConflictCheck &&
      effectiveRoomId(other, otherSubject) === room.id
    ) soft();
  }

  return level;
}
