import type { AppState, CalendarEvent, ConflictKind, ConflictRef, ConflictReport, ID } from '../types';
import { effectiveTeacherIds, effectiveRoomId, eventGroupIds } from '../utils/timeUtils';

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

    // No enabled lane means the event is hidden — hiding it is the whole point
    // of disabling a group, so it must not raise conflicts either.
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
