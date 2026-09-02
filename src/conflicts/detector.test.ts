import { describe, it, expect } from 'vitest';
import { detectConflicts, attachConflicts } from './detector';
import { ALL, makeEvent, makeState, makeSubject } from '../test/fixtures';

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
