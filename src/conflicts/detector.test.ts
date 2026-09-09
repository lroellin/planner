import { describe, it, expect } from 'vitest';
import {
  detectConflicts, attachConflicts, previewClash, previewClashDetail, firstFreeSlot,
} from './detector';
import { ALL, makeEvent, makeState, makeSubject, makeWindow } from '../test/fixtures';
import { CONFLICT_KIND_LABELS, conflictNote } from '../types';
import type { ConflictKind } from '../types';
import { eventGroupIds } from '../utils/timeUtils';

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

  // An all-lanes placement is the frame the day is planned around, not a
  // booking that competes with one for a lane — see occupiesLanesExclusively.
  it('leaves a lesson running through a multi-group lunch alone', () => {
    const state = makeState({
      events: [
        makeEvent({ id: 'lunch-ev', subjectId: 'lunch', groupId: ALL, startTime: '12:00', endTime: '13:00' }),
        makeEvent({ groupId: 'g2', teacherIds: [], roomId: null, startTime: '12:30', endTime: '14:00' }),
      ],
    });
    expect(detectConflicts(state)).toEqual([]);
  });

  // Standing outside the *lane* reckoning does not put an all-lanes event
  // outside the rest of it: one Ausbildner cannot run Antreten and a Lektion at
  // the same moment, whoever else is in the room.
  it('raises a teacher conflict for an all-lanes event', () => {
    const state = makeState({
      events: [
        makeEvent({ id: 'antreten', subjectId: 'lunch', groupId: ALL, teacherIds: ['t1'], startTime: '08:00', endTime: '09:00' }),
        makeEvent({ id: 'lektion', groupId: 'g2', teacherIds: ['t1'], roomId: null, startTime: '08:30', endTime: '10:00' }),
      ],
    });
    const reports = detectConflicts(state);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.kind).toBe('teacher');
    expect([...reports[0]!.involvedEventIds].sort()).toEqual(['antreten', 'lektion']);
  });

  it('raises a room conflict for an all-lanes event', () => {
    const state = makeState({
      events: [
        makeEvent({ id: 'antreten', subjectId: 'lunch', groupId: ALL, teacherIds: [], roomId: 'r1', startTime: '08:00', endTime: '09:00' }),
        makeEvent({ id: 'lektion', groupId: 'g2', teacherIds: [], roomId: 'r1', startTime: '08:30', endTime: '10:00' }),
      ],
    });
    const reports = detectConflicts(state);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.kind).toBe('room');
  });

  it('raises an absence conflict for an all-lanes event', () => {
    const base = makeState();
    const state = {
      ...base,
      teachers: base.teachers.map(t =>
        t.id === 't1' ? { ...t, unavailable: [makeWindow([2])] } : t,
      ),
      events: [
        makeEvent({ subjectId: 'lunch', groupId: ALL, teacherIds: ['t1'], roomId: null, dayIndex: 2 }),
      ],
    };
    expect(detectConflicts(state).map(r => r.kind)).toEqual(['teacher-absent']);
  });

  // Left out of the reckoning is not left out of the day: the group on its own
  // programme still eats at 12:00.
  it('keeps the lane of a group left out of the reckoning for an all-lanes event', () => {
    const base = makeState();
    const state = {
      ...base,
      groups: base.groups.map(g => (g.id === 'g3' ? { ...g, excludeFromCoverage: true } : g)),
      events: [makeEvent({ subjectId: 'lunch', groupId: ALL, dayIndex: 2 })],
    };
    expect(eventGroupIds(state, state.events[0]!)).toEqual(['g1', 'g2', 'g3']);
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
        { id: 'outside', name: 'Outside', shortName: '', color: '#a0aec0', excludeFromConflictCheck: true,
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
        { id: 'k', label: 'K', enabled: true, order: 0, excludeFromCoverage: false },
        { id: 'g1', label: 'G1', enabled: false, order: 1, excludeFromCoverage: false },
        { id: 'g2', label: 'G2', enabled: true, order: 2, excludeFromCoverage: false },
        { id: 'g3', label: 'G3', enabled: true, order: 3, excludeFromCoverage: false },
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

  it('does not flag a drop onto an all-lanes break that shares nothing else', () => {
    const state = makeState({
      events: [makeEvent({ subjectId: 'lunch', groupId: ALL, teacherIds: [], roomId: null, dayIndex: 2, startTime: '12:00', endTime: '13:00' })],
    });
    expect(previewClash(state, candidate())).toBeNull();
  });

  it('does not flag an all-lanes placement over a lane it would cover', () => {
    const state = makeState({
      events: [makeEvent({ groupId: 'g1', teacherIds: [], roomId: null, dayIndex: 2, startTime: '12:00', endTime: '13:00' })],
    });
    expect(previewClash(state, candidate({
      subjectId: 'lunch', groupId: ALL, teacherIds: [], roomId: null,
    }))).toBeNull();
  });

  // The lane is not the only thing a drop can cost — the mirror has to agree
  // with the panel, which now names the Ausbildner clash.
  it('flags an all-lanes placement that double-books an Ausbildner', () => {
    const state = makeState({
      events: [makeEvent({ groupId: 'g1', teacherIds: ['t1'], roomId: null, dayIndex: 2, startTime: '12:00', endTime: '13:00' })],
    });
    expect(previewClash(state, candidate({
      subjectId: 'lunch', groupId: ALL, teacherIds: ['t1'], roomId: null,
    }))).toBe('hard');
  });

  it('flags a drop that shares an Ausbildner with an all-lanes break', () => {
    const state = makeState({
      events: [makeEvent({ subjectId: 'lunch', groupId: ALL, teacherIds: ['t1'], roomId: null, dayIndex: 2, startTime: '12:00', endTime: '13:00' })],
    });
    expect(previewClash(state, candidate({ teacherIds: ['t1'], roomId: null }))).toBe('hard');
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

describe('conflict wording', () => {
  const KINDS: ConflictKind[] = ['teacher', 'room', 'group', 'teacher-absent', 'room-blocked'];

  // The editors concatenate this into one span, so every kind has to come out
  // as a German phrase — `{label} {name}` used to yield "Abwesend Anna Müller".
  it('names the resource before its state', () => {
    expect(conflictNote('teacher', 'Anna Müller')).toBe('Anna Müller doppelt eingeteilt');
    expect(conflictNote('group', 'G1')).toBe('G1 doppelt eingeteilt');
    expect(conflictNote('room', 'Kompanie')).toBe('Kompanie doppelt belegt');
    expect(conflictNote('teacher-absent', 'Anna Müller')).toBe('Anna Müller abwesend');
    expect(conflictNote('room-blocked', 'Turnhalle')).toBe('Turnhalle gesperrt');
  });

  it('starts every note with the name it was given', () => {
    for (const kind of KINDS) expect(conflictNote(kind, 'X')).toMatch(/^X /);
  });

  // The panel's card header has ~225px for the eyebrow *and* the resource name.
  // A label that spells the state out truncated the name to a third of itself.
  it('keeps the panel eyebrow to a single short word', () => {
    for (const kind of KINDS) {
      expect(CONFLICT_KIND_LABELS[kind]).not.toContain(' ');
      expect(CONFLICT_KIND_LABELS[kind].length).toBeLessThanOrEqual(11);
    }
  });
});

describe('firstFreeSlot', () => {
  const WINDOW = { start: '08:00', end: '17:00' };
  const probe = (groupId: string) => ({
    eventId: null,
    subjectId: 'lesson',
    groupId,
    dayIndex: 2,
    teacherIds: 'inherit' as const,
    roomId: 'inherit' as const,
  });

  it('returns the top of the window when the lane is empty', () => {
    const state = makeState({ events: [] });
    expect(firstFreeSlot(state, probe('g1'), 60, WINDOW)).toBe('08:00');
  });

  it('steps past what is already there', () => {
    // The dialog used to seed a hardcoded 08:00 and drop the new Lektion on top
    // of this one.
    const state = makeState({
      events: [makeEvent({
        id: 'e1', subjectId: 'lesson', groupId: 'g1', dayIndex: 2,
        startTime: '08:00', endTime: '09:00',
      })],
    });
    expect(firstFreeSlot(state, probe('g1'), 60, WINDOW)).toBe('09:00');
  });

  it('treats a soft clash as taken — proposing one unasked is proposing a mistake', () => {
    // Same room, different lane: advisory once made, never a suggestion.
    const state = makeState({
      events: [makeEvent({
        id: 'e1', subjectId: 'lesson', groupId: 'g2', dayIndex: 2,
        startTime: '08:00', endTime: '09:00', teacherIds: [],
      })],
    });
    expect(firstFreeSlot(state, probe('g1'), 60, WINDOW)).not.toBe('08:00');
  });

  it('gives up rather than lying when the day is full', () => {
    const events = [];
    for (let h = 8; h < 17; h++) {
      events.push(makeEvent({
        id: `e${h}`, subjectId: 'lesson', groupId: 'g1', dayIndex: 2,
        startTime: `${String(h).padStart(2, '0')}:00`,
        endTime: `${String(h + 1).padStart(2, '0')}:00`,
      }));
    }
    expect(firstFreeSlot(makeState({ events }), probe('g1'), 60, WINDOW)).toBeNull();
  });

  it('needs a run long enough for the whole Lektion', () => {
    // A 30-minute hole cannot hold a 60-minute Thema.
    const state = makeState({
      events: [
        makeEvent({ id: 'a', subjectId: 'lesson', groupId: 'g1', dayIndex: 2, startTime: '08:00', endTime: '09:00' }),
        makeEvent({ id: 'b', subjectId: 'lesson', groupId: 'g1', dayIndex: 2, startTime: '09:30', endTime: '11:00' }),
      ],
    });
    expect(firstFreeSlot(state, probe('g1'), 60, WINDOW)).toBe('11:00');
  });
});

/**
 * The drag mirror and the Probleme panel are two readings of one rule set. Every
 * case where they could answer differently belongs here, because the symptom —
 * a red mirror over a slot that turns out to be fine — is invisible in the code
 * and only shows up as the user learning to distrust the tint.
 */
describe('previewClashDetail agrees with detectConflicts', () => {
  /** G2 switched off, so anything on its lane is drawn nowhere. */
  const hiddenLane = () => makeState({
    groups: [
      { id: 'k', label: 'K', enabled: true, order: 0, excludeFromCoverage: false },
      { id: 'g1', label: 'G1', enabled: true, order: 1, excludeFromCoverage: false },
      { id: 'g2', label: 'G2', enabled: false, order: 2, excludeFromCoverage: false },
      { id: 'g3', label: 'G3', enabled: true, order: 3, excludeFromCoverage: false },
    ],
    events: [
      makeEvent({
        id: 'hidden', groupId: 'g2', dayIndex: 2,
        startTime: '09:00', endTime: '10:00', teacherIds: ['t1'], roomId: 'r1',
      }),
    ],
  });

  /** A probe on the same Ausbildner, the same Raum and the same hour. */
  const at = (groupId: string) => ({
    eventId: null,
    subjectId: 'lesson',
    groupId,
    dayIndex: 2,
    teacherIds: ['t1'] as string[],
    roomId: 'r1' as string,
  });
  const onto = (groupId: string) => ({
    ...at(groupId),
    startTime: '09:00',
    endTime: '10:00',
  });

  it('the detector ignores a Lektion whose every lane is switched off', () => {
    expect(detectConflicts(hiddenLane())).toEqual([]);
  });

  it('so the mirror must not go red over it either', () => {
    // It used to: the probe walked every event in the week, and this one shares
    // both the Ausbildner and the Raum. The tint promised a clash that no panel
    // would ever list once the block was dropped.
    expect(previewClashDetail(hiddenLane(), onto('g1'))).toEqual({ level: null, eventIds: [] });
  });

  it('and firstFreeSlot must not step past the slot it occupies', () => {
    // The dialog seeds itself from this, so a hidden event used to push the
    // proposed start an hour later than it needed to be.
    expect(firstFreeSlot(hiddenLane(), at('g1'), 60, { start: '09:00', end: '17:00' }))
      .toBe('09:00');
  });

  it('both see it again once its lane is switched back on', () => {
    const state = hiddenLane();
    const shown = {
      ...state,
      groups: state.groups.map(g => (g.id === 'g2' ? { ...g, enabled: true } : g)),
    };
    // The probe is not a stored event, so the detector needs a real second one
    // to have a pair to report at all.
    const withPair = {
      ...shown,
      events: [
        ...shown.events,
        makeEvent({
          id: 'shown', groupId: 'g1', dayIndex: 2,
          startTime: '09:00', endTime: '10:00', teacherIds: ['t1'], roomId: 'r1',
        }),
      ],
    };
    expect(detectConflicts(withPair).map(c => c.kind).sort()).toEqual(['room', 'teacher']);
    expect(previewClashDetail(shown, onto('g1'))).toEqual({ level: 'hard', eventIds: ['hidden'] });
  });
});
