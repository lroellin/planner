import { describe, it, expect } from 'vitest';
import {
  buildCoverage, coverageForSubject, coverageStatus, subjectPhases, buildTeacherPlans,
  missingLanesForSubject, buildGroupPlans,
} from './reports';
import { ALL, makeEvent, makeState, makeSubject } from '../test/fixtures';

describe('subjectPhases', () => {
  it('honours an explicitly pinned phase even before anything is placed', () => {
    const base = makeState();
    const state = {
      ...base,
      subjects: base.subjects.map(s => (s.id === 'lesson' ? { ...s, phaseId: 'kader' } : s)),
    };
    expect(subjectPhases(state, 'lesson').map(p => p.id)).toEqual(['kader']);
  });

  it('falls back to the widest phase while a subject is unplaced', () => {
    expect(subjectPhases(makeState(), 'lesson').map(p => p.id)).toEqual(['gruppen']);
  });

  it('otherwise reads the phase from where the subject actually sits', () => {
    const state = makeState({ events: [makeEvent({ groupId: 'k', dayIndex: 0 })] });
    expect(subjectPhases(state, 'lesson').map(p => p.id)).toEqual(['kader']);
  });
});

describe('Programmpunkte', () => {
  /** A Begrüssung on Wednesday morning for G1, and nothing else of it. */
  function withOneOff() {
    const base = makeState();
    return makeState({
      subjects: [...base.subjects, makeSubject({ id: 'welcome', name: 'Begrüssung', kind: 'oneoff' })],
      events: [makeEvent({ subjectId: 'welcome', groupId: 'g1', dayIndex: 2 })],
    });
  }

  it('never appears in coverage, however few lanes have it', () => {
    const state = withOneOff();
    for (const section of buildCoverage(state)) {
      expect(section.rows.map(r => r.subject.id)).not.toContain('welcome');
    }
  });

  it('gives the sidebar chip nothing to be missing', () => {
    const state = withOneOff();
    expect(coverageForSubject(state, 'welcome'))
      .toEqual({ placed: 0, total: 0, uneven: false, short: false, over: false });
    expect(missingLanesForSubject(state, 'welcome')).toEqual([]);
  });

  it('leaves the Themen around it measured exactly as before', () => {
    const state = withOneOff();
    expect(coverageForSubject(state, 'lesson'))
      .toEqual({ placed: 0, total: 3, uneven: false, short: false, over: false });
  });

  it('still counts as time the group is occupied in its own plan', () => {
    // Unlike a Pause: a Begrüssung is instruction time, it is just not owed.
    const plan = buildGroupPlans(withOneOff()).find(p => p.group.id === 'g1')!;
    expect(plan.entries.map(e => e.subject.id)).toEqual(['welcome']);
    expect(plan.lessonCount).toBe(1);
    expect(plan.lessonMinutes).toBe(90);
  });
});

describe('coverage', () => {
  it('counts a pinned Kader subject against the Kader lane, not the group lanes', () => {
    const base = makeState();
    const state = {
      ...base,
      subjects: base.subjects.map(s => (s.id === 'lesson' ? { ...s, phaseId: 'kader' } : s)),
    };
    const kader = buildCoverage(state).find(s => s.phase.id === 'kader')!;
    const gruppen = buildCoverage(state).find(s => s.phase.id === 'gruppen')!;

    expect(kader.rows.map(r => r.subject.id)).toContain('lesson');
    expect(gruppen.rows.map(r => r.subject.id)).not.toContain('lesson');
    expect(coverageForSubject(state, 'lesson')).toEqual({ placed: 0, total: 1, uneven: false, short: false, over: false });
  });

  it('counts one lane per placement and reports what is still missing', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', dayIndex: 2 }),
        makeEvent({ groupId: 'g2', dayIndex: 3 }),
      ],
    });
    expect(coverageForSubject(state, 'lesson')).toEqual({ placed: 2, total: 3, uneven: false, short: false, over: false });

    const gruppen = buildCoverage(state).find(s => s.phase.id === 'gruppen')!;
    const row = gruppen.rows.find(r => r.subject.id === 'lesson')!;
    expect(row.counts.get('g1')).toBe(1);
    expect(row.counts.get('g3')).toBe(0);
    expect(row.missing).toBe(1);
  });

  it('measures against the subject duration, so 2×45 delivers a 90-minute subject', () => {
    // The fixture subject runs 90 minutes, which is also what every group owes.
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', dayIndex: 2 }),                                       // 1×90
        makeEvent({ groupId: 'g2', dayIndex: 2, startTime: '08:00', endTime: '08:45' }), // 45 …
        makeEvent({ groupId: 'g2', dayIndex: 3, startTime: '08:00', endTime: '08:45' }), // … + 45
        makeEvent({ groupId: 'g3', dayIndex: 2, startTime: '08:00', endTime: '08:45' }), // 45 only
      ],
    });
    const row = buildCoverage(state)
      .find(s => s.phase.id === 'gruppen')!.rows
      .find(r => r.subject.id === 'lesson')!;

    expect(row.target).toBe(90);
    expect(row.minutes.get('g1')).toBe(90);
    expect(row.minutes.get('g2')).toBe(90); // split in two, and none the worse for it
    expect(row.minutes.get('g3')).toBe(45);
    // G1 and G2 differ in instance count but not in time, which is not a problem.
    expect(row.uneven).toBe(false);
    expect(row.short).toBe(true);
    expect(coverageStatus(row)).toBe('short');
    expect(coverageForSubject(state, 'lesson')).toEqual({
      placed: 3, total: 3, uneven: false, short: true, over: false,
    });
  });

  it('calls a lane that got more time than the subject asks for over-planned', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', dayIndex: 2 }),
        makeEvent({ groupId: 'g1', dayIndex: 3, startTime: '13:00', endTime: '14:30' }), // twice over
        makeEvent({ groupId: 'g2', dayIndex: 2 }),
        makeEvent({ groupId: 'g3', dayIndex: 2 }),
      ],
    });
    const row = buildCoverage(state)
      .find(s => s.phase.id === 'gruppen')!.rows
      .find(r => r.subject.id === 'lesson')!;

    expect(row.short).toBe(false); // everyone has at least the full duration
    expect(row.uneven).toBe(true); // the lanes differ …
    expect(row.over).toBe(true);   // … because G1 has twice the duration
    // "zu viel" names the amount that is wrong; "ungleich" only names the spread.
    expect(coverageStatus(row)).toBe('over');
    // The sidebar counter has to reach the same verdict as the report.
    expect(coverageForSubject(state, 'lesson')).toEqual({
      placed: 3, total: 3, uneven: false, short: false, over: true,
    });
  });

  it('sees over-planning in a single-lane phase, where nothing can be uneven', () => {
    // `uneven` compares lanes against each other, so it is structurally blind in
    // a one-lane phase: a Kader subject planned for twice its Soll used to read
    // as complete, which is the one verdict the report exists to not give.
    const state = makeState({
      events: [
        makeEvent({ groupId: 'k', dayIndex: 0 }),                                       // 90
        makeEvent({ groupId: 'k', dayIndex: 1, startTime: '13:00', endTime: '14:30' }), // + 90
      ],
      subjects: makeState().subjects.map(s =>
        s.id === 'lesson' ? { ...s, phaseId: 'kader' } : s,
      ),
    });
    const row = buildCoverage(state)
      .find(s => s.phase.id === 'kader')!.rows
      .find(r => r.subject.id === 'lesson')!;

    expect(row.minutes.get('k')).toBe(180); // against a target of 90
    expect(row.uneven).toBe(false);         // one lane: nothing to differ from
    expect(row.over).toBe(true);
    expect(coverageStatus(row)).toBe('over');
    expect(coverageForSubject(state, 'lesson')).toEqual({
      placed: 1, total: 1, uneven: false, short: false, over: true,
    });
  });

  it('does not call an evenly over-planned subject complete', () => {
    // Every lane at double the duration: max === min, so `uneven` sees nothing.
    const state = makeState({
      events: ['g1', 'g2', 'g3'].flatMap(groupId => [
        makeEvent({ groupId, dayIndex: 2 }),
        makeEvent({ groupId, dayIndex: 3, startTime: '13:00', endTime: '14:30' }),
      ]),
    });
    const row = buildCoverage(state)
      .find(s => s.phase.id === 'gruppen')!.rows
      .find(r => r.subject.id === 'lesson')!;

    expect(row.uneven).toBe(false);
    expect(row.over).toBe(true);
    expect(coverageStatus(row)).toBe('over');
  });

  it('leaves breaks out of coverage entirely', () => {
    const state = makeState({ events: [makeEvent({ subjectId: 'lunch', groupId: ALL, dayIndex: 2 })] });
    const gruppen = buildCoverage(state).find(s => s.phase.id === 'gruppen')!;
    expect(gruppen.rows.map(r => r.subject.id)).not.toContain('lunch');
  });
});

describe('buildTeacherPlans', () => {
  it('separates teaching, covering and handed-over instances', () => {
    const state = makeState({
      events: [
        makeEvent({ id: 'own', groupId: 'g1' }),                       // t1 by default
        makeEvent({ id: 'swap', groupId: 'g2', teacherIds: ['t2'] }),  // t1 handed over to t2
      ],
    });
    const [anna, beat] = buildTeacherPlans(state);

    expect(anna!.teachingCount).toBe(1);
    expect(anna!.handedOverCount).toBe(1);
    expect(anna!.totalMinutes).toBe(90); // the handed-over instance is not their time
    expect(beat!.coveringCount).toBe(1);
    expect(beat!.blocks[0]!.entries[0]!.counterparts.map(t => t.id)).toEqual(['t1']);
  });

  it('lists the lanes a multi-group event covers', () => {
    const state = makeState({
      events: [makeEvent({ subjectId: 'lunch', groupId: ALL, dayIndex: 2, teacherIds: ['t1'] })],
    });
    const [anna] = buildTeacherPlans(state);
    expect(anna!.blocks[0]!.entries[0]!.groupLabels).toEqual(['G1', 'G2', 'G3']);
  });
});
