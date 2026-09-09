import type {
  AppState, CalendarEvent, ConflictKind, ConflictRef, ConflictReport, GroupSelector, ID,
  TimeWindow,
} from '../types';
import {
  effectiveTeacherIds, effectiveRoomId, eventGroupIds, isEventActive, isMultiGroupEvent,
  minutesToTime, timeToMinutes,
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

/**
 * Does this event occupy its lanes *exclusively*? Only single-lane placements
 * do, and only they take part in group double-booking.
 *
 * Mittagessen, Antreten and the Schlussrapport are the frame the rest of the day
 * is planned *around*, and they are on every lane by construction: counted as
 * lane occupancy they collide with each other, with every lane they cover, and
 * with any block that so much as touches them, and the panel fills with rows
 * describing the shape of the day rather than a mistake in it. A lesson dropped
 * across the lunch break is visible on the grid; it does not need a warning list
 * of its own.
 *
 * This governs the *group* dimension alone. An Ausbildner cannot run Antreten
 * and a Lektion at the same moment, and a Raum cannot hold both, whether or not
 * one of them is on every lane — so the teacher, room and availability checks
 * below take all-lanes events like any other.
 */
function occupiesLanesExclusively(ev: CalendarEvent): boolean {
  return !isMultiGroupEvent(ev);
}

/**
 * One window, named. Overlapping windows on the same resource are joined into a
 * single row rather than raising one apiece: "Mo–Fr ganzer Tag" and "Mi
 * Nachmittag" describe one absence, and two rows for it both double the issue
 * count and invite the reader to look for a second mistake.
 */
function describeAbsence(w: TimeWindow): string {
  return `${describeWindow(w)}${w.note ? ` (${w.note})` : ''}`;
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
    // Breaks count too: a lesson running through a group's lunch is a real clash —
    // as long as that lunch is on one lane. An all-lanes placement covers every
    // lane by construction and claims none of them.
    if (occupiesLanesExclusively(ev)) {
      for (const gid of groupIds) {
        if (!groupIntervals.has(gid)) groupIntervals.set(gid, []);
        groupIntervals.get(gid)!.push(interval);
      }
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
      const hits = (teacher.unavailable ?? [])
        .filter(w => windowOverlaps(w, ev.dayIndex, ev.startTime, ev.endTime));
      if (hits.length === 0) continue;
      reports.push({
        kind: 'teacher-absent',
        resourceId: tid,
        resourceName: teacher.name,
        involvedEventIds: [ev.id],
        detail: `abwesend ${hits.map(describeAbsence).join(', ')}`,
      });
    }

    const evRoomId = effectiveRoomId(ev, subject);
    const evRoom = evRoomId ? roomById.get(evRoomId) : null;
    // "Ignore conflicts" governs double-booking; a room that is explicitly
    // blocked is unavailable to everyone, shared space or not.
    if (evRoom) {
      const hits = (evRoom.unavailable ?? [])
        .filter(w => windowOverlaps(w, ev.dayIndex, ev.startTime, ev.endTime));
      if (hits.length > 0) {
        reports.push({
          kind: 'room-blocked',
          resourceId: evRoom.id,
          resourceName: evRoom.name,
          involvedEventIds: [ev.id],
          detail: `gesperrt ${hits.map(describeAbsence).join(', ')}`,
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
 * What a drop would cost, and *with what*. The level alone tints the drag mirror
 * red — which says a price will be paid without saying to whom, and in a dense
 * column the four candidate victims are all within a few pixels of the pointer.
 * The ids are already walked to decide the level; they were simply thrown away.
 */
export interface ClashPreview {
  level: ClashLevel;
  /**
   * The events the probe actually overlaps. Empty for an availability clash —
   * being booked while away involves no second event, which is exactly why it
   * needs no second card outlined.
   */
  eventIds: ID[];
}

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
/**
 * The earliest slot on `dayIndex` where this Thema would land clean, or null if
 * there is none inside the drawn day.
 *
 * `PlaceDialog` used to seed a hardcoded '08:00' — not "the first free slot",
 * the literal string — so the one dialog that places a Thema without dragging
 * proposed, on a half-planned week, the slot most likely to be occupied. It is
 * also the dialog the coverage report and the sidebar chip open, which are
 * exactly the paths taken when the week is already full.
 *
 * Free means *nothing at all*: not a hard clash, not a soft one. A soft clash
 * is advisory once made, but proposing one unasked is proposing a mistake.
 * Callers keep their own fallback for the plan with no free slot left — the
 * dialog still has to open somewhere, and it says what it will collide with.
 */
export function firstFreeSlot(
  state: AppState,
  candidate: Omit<ClashCandidate, 'startTime' | 'endTime'>,
  durationMinutes: number,
  window: { start: string; end: string },
  slotMinutes = 15,
): string | null {
  const startMin = timeToMinutes(window.start);
  const lastStart = timeToMinutes(window.end) - durationMinutes;
  for (let t = startMin; t <= lastStart; t += slotMinutes) {
    const startTime = minutesToTime(t);
    const endTime = minutesToTime(t + durationMinutes);
    const { level } = previewClashDetail(state, { ...candidate, startTime, endTime });
    if (level === null) return startTime;
  }
  return null;
}

export function previewClash(state: AppState, candidate: ClashCandidate): ClashLevel {
  return previewClashDetail(state, candidate).level;
}

/** The same rules, keeping the identities of what the probe ran into. */
export function previewClashDetail(state: AppState, candidate: ClashCandidate): ClashPreview {
  const subject = state.subjects.find(s => s.id === candidate.subjectId);
  if (!subject) return { level: null, eventIds: [] };

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
  const probeHoldsLanes = occupiesLanesExclusively(probe);
  const teacherIds = new Set(effectiveTeacherIds(probe, subject));
  const roomId = effectiveRoomId(probe, subject);
  const room = roomId ? state.rooms.find(r => r.id === roomId) ?? null : null;

  const startMs = toMs(probe.dayIndex, probe.startTime);
  const endMs = toMs(probe.dayIndex, probe.endTime);

  let level: ClashLevel = null;
  const eventIds: ID[] = [];
  const hard = (): void => { level = 'hard'; };
  const soft = (): void => { if (level === null) level = 'soft'; };

  // Availability first: it needs no second event, so it can answer immediately.
  for (const tid of teacherIds) {
    const teacher = state.teachers.find(t => t.id === tid);
    const away = (teacher?.unavailable ?? []).some(
      w => windowOverlaps(w, probe.dayIndex, probe.startTime, probe.endTime),
    );
    if (away) return { level: 'hard', eventIds: [] };
  }
  const blocked = (room?.unavailable ?? []).some(
    w => windowOverlaps(w, probe.dayIndex, probe.startTime, probe.endTime),
  );
  if (blocked) soft();

  // No early return: the level is decided by the worst hit, but the outline
  // wants every card the probe lands on, not just the first one found.
  for (const other of state.events) {
    if (other.id === probe.id) continue;
    if (other.dayIndex !== probe.dayIndex) continue;
    // The same guard `detectConflicts` opens with: an event whose every lane is
    // switched off is drawn nowhere and raises nothing, so the mirror must not
    // go red over it. Without this the probe reported a clash the panel would
    // never list once the drop was made — and `firstFreeSlot` walked past slots
    // that were in fact free.
    if (!isEventActive(state, other)) continue;
    const oStart = toMs(other.dayIndex, other.startTime);
    const oEnd = toMs(other.dayIndex, other.endTime);
    if (!overlaps(startMs, endMs, oStart, oEnd)) continue;

    const otherSubject = state.subjects.find(s => s.id === other.subjectId);
    if (!otherSubject) continue;

    // Lanes count only where both sides claim theirs exclusively — the same rule
    // the detector applies, so the mirror and the panel cannot disagree about
    // the all-lanes Mittagessen. Teacher and Raum are checked either way.
    const sameLane =
      probeHoldsLanes &&
      occupiesLanesExclusively(other) &&
      eventGroupIds(state, other).some(gid => lanes.has(gid));
    const sameTeacher = effectiveTeacherIds(other, otherSubject).some(tid => teacherIds.has(tid));
    const sameRoom =
      room !== null &&
      !room.excludeFromConflictCheck &&
      effectiveRoomId(other, otherSubject) === room.id;

    if (sameLane || sameTeacher) hard();
    else if (sameRoom) soft();

    if (sameLane || sameTeacher || sameRoom) eventIds.push(other.id);
  }

  return { level, eventIds };
}
