import { describe, it, expect } from 'vitest';
import { detectConflicts, attachConflicts } from './detector';
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
    expect(reports[0]!.detail).toContain('Wed');
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
