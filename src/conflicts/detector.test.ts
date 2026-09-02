import { describe, it, expect } from 'vitest';
import { detectConflicts, attachConflicts, previewClash } from './detector';
import { ALL, makeEvent, makeState, makeSubject, makeWindow } from '../test/fixtures';

const kinds = (state: Parameters<typeof detectConflicts>[0]) =>
  detectConflicts(state).map(c => c.kind).sort();

describe('detectConflicts', () => {
  it('flags a teacher booked for two overlapping lessons', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', roomId: null, startTime: '08:00', endTime: '09:30' }),
        makeEvent({ groupId: 'g2', roomId: null, startTime: '09:00', endTime: '10:00' }),
      ],
    });
    // Both inherit t1 from the subject, and both sit in different lanes.
    expect(kinds(state)).toEqual(['teacher']);
  });

  it('reports the room and the teacher separately when both clash', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', startTime: '08:00', endTime: '09:30' }),
        makeEvent({ groupId: 'g2', startTime: '09:00', endTime: '10:00' }),
      ],
    });
    expect(kinds(state)).toEqual(['room', 'teacher']);
  });

  it('does not flag events that merely touch', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', startTime: '08:00', endTime: '09:00' }),
        makeEvent({ groupId: 'g2', startTime: '09:00', endTime: '10:00' }),
      ],
    });
    expect(detectConflicts(state)).toEqual([]);
  });

  it('flags a double-booked room as a soft conflict', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', teacherIds: ['t1'] }),
        makeEvent({ groupId: 'g2', teacherIds: ['t2'], startTime: '09:00', endTime: '10:00' }),
      ],
    });
    expect(kinds(state)).toEqual(['room']);
  });

  it('never flags a room marked as excluded', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', teacherIds: ['t1'], roomId: 'outside' }),
        makeEvent({ groupId: 'g2', teacherIds: ['t2'], roomId: 'outside', startTime: '09:00', endTime: '10:00' }),
      ],
    });
    expect(detectConflicts(state)).toEqual([]);
  });

  it('flags a group booked twice at once as a hard conflict', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', teacherIds: [], roomId: null }),
        makeEvent({ groupId: 'g1', teacherIds: [], roomId: null, startTime: '09:00', endTime: '10:00' }),
      ],
    });
    expect(kinds(state)).toEqual(['group']);
  });

  it('ignores events whose only lane is disabled', () => {
    const base = makeState();
    const state = {
      ...base,
      groups: base.groups.map(g => (g.id === 'g1' ? { ...g, enabled: false } : g)),
      events: [
        makeEvent({ groupId: 'g1' }),
        makeEvent({ groupId: 'g2', startTime: '09:00', endTime: '10:00' }),
      ],
    };
    expect(detectConflicts(state)).toEqual([]);
  });

  it('treats a lesson running through a multi-group lunch as a group clash', () => {
    const state = makeState({
      events: [
        makeEvent({ id: 'lunch-ev', subjectId: 'lunch', groupId: ALL, startTime: '12:00', endTime: '13:00' }),
        makeEvent({ groupId: 'g2', teacherIds: [], roomId: null, startTime: '12:30', endTime: '14:00' }),
      ],
    });
    const reports = detectConflicts(state);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.kind).toBe('group');
    expect(reports[0]!.resourceId).toBe('g2');
  });

  it('does not let a multi-group event collide with itself', () => {
    const state = makeState({
      events: [makeEvent({ subjectId: 'lunch', groupId: ALL, startTime: '12:00', endTime: '13:00' })],
    });
    expect(detectConflicts(state)).toEqual([]);
  });

  it('skips events whose subject no longer exists', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', subjectId: 'deleted' }),
        makeEvent({ groupId: 'g2', subjectId: 'deleted', startTime: '09:00', endTime: '10:00' }),
      ],
    });
    expect(detectConflicts(state)).toEqual([]);
  });

  it('reports a teacher explicitly assigned over the subject default', () => {
    const base = makeState();
    const state = {
      ...base,
      subjects: base.subjects.map(s => (s.id === 'other' ? makeSubject({ id: 'other', defaultTeacherIds: [] }) : s)),
      events: [
        makeEvent({ groupId: 'g1', roomId: null }),
        makeEvent({ groupId: 'g2', subjectId: 'other', roomId: null, teacherIds: ['t1'], startTime: '09:00', endTime: '10:00' }),
      ],
    };
    expect(kinds(state)).toEqual(['teacher']);
  });
});

describe('attachConflicts', () => {
  it('annotates both sides of a conflict and leaves clean events bare', () => {
    const state = makeState({
      events: [
        makeEvent({ id: 'a', groupId: 'g1', startTime: '08:00', endTime: '09:30' }),
        makeEvent({ id: 'b', groupId: 'g2', startTime: '09:00', endTime: '10:00' }),
        makeEvent({ id: 'c', groupId: 'g3', teacherIds: [], roomId: null, startTime: '15:00', endTime: '16:00' }),
      ],
    });
    const annotated = attachConflicts(state, detectConflicts(state));
    const byId = new Map(annotated.events.map(e => [e.id, e]));

    expect(byId.get('a')!.conflicts?.[0]!.collidingEventIds).toEqual(['b']);
    expect(byId.get('b')!.conflicts?.[0]!.collidingEventIds).toEqual(['a']);
    expect(byId.get('c')!.conflicts).toBeUndefined();
  });
});

describe('availability', () => {
  it('flags a lesson booked while its teacher is away', () => {
    const state = makeState({
      teachers: [
        { id: 't1', name: 'Anna Müller', shortName: 'AM', color: '#4299e1',
          unavailable: [makeWindow([2])] },
      ],
      events: [makeEvent({ groupId: 'g1', dayIndex: 2, roomId: null })],
    });
    const reports = detectConflicts(state);
    expect(reports.map(r => r.kind)).toEqual(['teacher-absent']);
    expect(reports[0]!.involvedEventIds).toHaveLength(1);
    expect(reports[0]!.detail).toContain('Mi');
  });

  it('leaves a lesson on another day alone', () => {
    const state = makeState({
      teachers: [
        { id: 't1', name: 'Anna Müller', shortName: 'AM', color: '#4299e1',
          unavailable: [makeWindow([3])] },
      ],
      events: [makeEvent({ groupId: 'g1', dayIndex: 2, roomId: null })],
    });
    expect(detectConflicts(state)).toEqual([]);
  });

  it('treats a half-day window as a time range, not the whole day', () => {
    const morningOff = makeWindow([2], '00:00', '12:00');
    const teachers = [
      { id: 't1', name: 'Anna Müller', shortName: 'AM', color: '#4299e1',
        unavailable: [morningOff] },
    ];
    const afternoon = makeState({
      teachers,
      events: [makeEvent({ groupId: 'g1', dayIndex: 2, roomId: null, startTime: '13:00', endTime: '14:30' })],
    });
    expect(detectConflicts(afternoon)).toEqual([]);

    const morning = makeState({
      teachers,
      events: [makeEvent({ groupId: 'g1', dayIndex: 2, roomId: null, startTime: '11:00', endTime: '11:45' })],
    });
    expect(detectConflicts(morning).map(r => r.kind)).toEqual(['teacher-absent']);
  });

  it('does not flag a lesson that ends exactly when the window starts', () => {
    const state = makeState({
      teachers: [
        { id: 't1', name: 'Anna Müller', shortName: 'AM', color: '#4299e1',
          unavailable: [makeWindow([2], '12:00', '24:00')] },
      ],
      events: [makeEvent({ groupId: 'g1', dayIndex: 2, roomId: null, startTime: '10:30', endTime: '12:00' })],
    });
    expect(detectConflicts(state)).toEqual([]);
  });

  it('flags a blocked room even when it is excluded from double-booking checks', () => {
    const state = makeState({
      rooms: [
        { id: 'outside', name: 'Outside', color: '#a0aec0', excludeFromConflictCheck: true,
          unavailable: [makeWindow([2])] },
      ],
      subjects: [makeSubject({ id: 'lesson', defaultTeacherIds: [], defaultRoomId: 'outside' })],
      events: [makeEvent({ groupId: 'g1', dayIndex: 2 })],
    });
    expect(detectConflicts(state).map(r => r.kind)).toEqual(['room-blocked']);
  });

  it('ignores absences for events whose lanes are all disabled', () => {
    const state = makeState({
      groups: [
        { id: 'k', label: 'K', enabled: true, order: 0 },
        { id: 'g1', label: 'G1', enabled: false, order: 1 },
        { id: 'g2', label: 'G2', enabled: true, order: 2 },
        { id: 'g3', label: 'G3', enabled: true, order: 3 },
      ],
      teachers: [
        { id: 't1', name: 'Anna Müller', shortName: 'AM', color: '#4299e1',
          unavailable: [makeWindow([2])] },
      ],
      events: [makeEvent({ groupId: 'g1', dayIndex: 2, roomId: null })],
    });
    expect(detectConflicts(state)).toEqual([]);
  });

  it('marks an absence as a hard conflict on the card', () => {
    const state = makeState({
      teachers: [
        { id: 't1', name: 'Anna Müller', shortName: 'AM', color: '#4299e1',
          unavailable: [makeWindow([2])] },
      ],
      events: [makeEvent({ groupId: 'g1', dayIndex: 2, roomId: null })],
    });
    const annotated = attachConflicts(state, detectConflicts(state));
    expect(annotated.events[0]!.conflicts?.[0]).toMatchObject({
      kind: 'teacher-absent',
      collidingEventIds: [],
    });
  });
});

describe('previewClash', () => {
  // The drag preview used to be a second, separate copy of these rules inside
  // the calendar component; each case below is one way that copy was wrong.
  const candidate = (over: Partial<Parameters<typeof previewClash>[1]> = {}) => ({
    eventId: null,
    subjectId: 'lesson',
    groupId: 'g1',
    dayIndex: 2,
    startTime: '12:00',
    endTime: '13:00',
    teacherIds: 'inherit' as const,
    roomId: 'inherit' as const,
    ...over,
  });

  it('sees the all-lanes break a lesson would be dropped onto', () => {
    const state = makeState({
      events: [makeEvent({ subjectId: 'lunch', groupId: ALL, dayIndex: 2, startTime: '12:00', endTime: '13:00' })],
    });
    expect(previewClash(state, candidate())).toBe('hard');
  });

  it('resolves the subject defaults for a chip that has not been dropped yet', () => {
    // Nothing is placed for the candidate, so only its *defaults* can clash —
    // which is exactly what the old preview could not see.
    const state = makeState({
      events: [makeEvent({ groupId: 'g2', startTime: '12:00', endTime: '13:00' })],
    });
    expect(previewClash(state, candidate())).toBe('hard'); // shared default teacher t1
  });

  it('reports a shared room as soft and an excluded room as no clash at all', () => {
    const base = makeState({
      subjects: [
        ...makeState().subjects,
        makeSubject({ id: 'other-teacher', defaultTeacherIds: ['t2'], defaultRoomId: 'r1' }),
        makeSubject({ id: 'outside-lesson', defaultTeacherIds: ['t2'], defaultRoomId: 'outside' }),
      ],
      events: [makeEvent({ groupId: 'g2', startTime: '12:00', endTime: '13:00' })],
    });
    expect(previewClash(base, candidate({ subjectId: 'other-teacher' }))).toBe('soft');

    const outside = {
      ...base,
      // No teacher on the placed one, so the shared room is the only thing left
      // that could clash — and "outside" is excluded from that check.
      events: [makeEvent({
        subjectId: 'outside-lesson', groupId: 'g2', teacherIds: [],
        startTime: '12:00', endTime: '13:00',
      })],
    };
    expect(previewClash(outside, candidate({ subjectId: 'outside-lesson' }))).toBe(null);
  });

  it('sees an availability window, which the old preview ignored entirely', () => {
    const base = makeState();
    const state = {
      ...base,
      teachers: base.teachers.map(t => (t.id === 't1' ? { ...t, unavailable: [makeWindow([2])] } : t)),
    };
    expect(previewClash(state, candidate())).toBe('hard');
  });

  it('does not clash the moving event with itself', () => {
    const state = makeState({
      events: [makeEvent({ id: 'moving', groupId: 'g1', startTime: '12:00', endTime: '13:00' })],
    });
    expect(previewClash(state, candidate({ eventId: 'moving' }))).toBe(null);
  });
});
