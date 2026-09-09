import { describe, it, expect } from 'vitest';
import {
  buildCoverage, coverageForSubject, coverageStatus, subjectPhases, buildTeacherPlans,
  missingLanesForSubject, buildGroupPlans, buildDeviations,
} from './reports';
import { ALL, makeEvent, makeState, makeSubject } from '../test/fixtures';
import { orderedPhases } from '../utils/timeUtils';

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

  // Switching off G1 must not tell G2 and G3 they no longer owe the Thema.
  it('falls back when every placement sits on a switched-off lane', () => {
    const base = makeState();
    const state = {
      ...base,
      groups: base.groups.map(g => (g.id === 'g1' ? { ...g, enabled: false } : g)),
      events: [makeEvent({ groupId: 'g1', dayIndex: 2 })],
    };
    expect(subjectPhases(state, 'lesson').map(p => p.id)).toEqual(['gruppen']);
    expect(
      buildCoverage(state)
        .find(sec => sec.phase.id === 'gruppen')!
        .rows.map(r => r.subject.id),
    ).toContain('lesson');
    expect(coverageForSubject(state, 'lesson')).toMatchObject({ placed: 0, total: 2 });
  });
});

// The KGS case: a group sitting the same days as the rotation on a programme of
// its own. It is at every fixed point of the day and in none of the Themen.
describe('a group left out of the reckoning', () => {
  /**
   * G1 runs its own programme. The week has a shared Mittagessen (Pause), a
   * shared Antreten (Programmpunkt) and a shared Übung (Thema) — the three kinds
   * an «alle Gruppen» placement can be.
   */
  function ownProgramme() {
    const base = makeState();
    return {
      ...base,
      groups: base.groups.map(g => (g.id === 'g1' ? { ...g, excludeFromCoverage: true } : g)),
      subjects: [
        ...base.subjects,
        makeSubject({ id: 'antreten', name: 'Antreten', kind: 'oneoff', isMultiGroup: true, defaultTeacherIds: [], defaultRoomId: null }),
        makeSubject({ id: 'uebung', name: 'Übung', kind: 'lesson', isMultiGroup: true, defaultTeacherIds: [], defaultRoomId: null, defaultDurationMinutes: 120 }),
      ],
      events: [
        makeEvent({ subjectId: 'antreten', groupId: ALL, dayIndex: 2, startTime: '08:00', endTime: '08:15' }),
        makeEvent({ subjectId: 'uebung', groupId: ALL, dayIndex: 2, startTime: '09:00', endTime: '11:00' }),
        makeEvent({ subjectId: 'lunch', groupId: ALL, dayIndex: 2, startTime: '12:00', endTime: '13:00' }),
        makeEvent({ groupId: 'g2', dayIndex: 2, startTime: '13:00', endTime: '14:30' }),
      ],
    };
  }

  const planFor = (label: string) =>
    buildGroupPlans(ownProgramme()).find(p => p.group.label === label)!;

  // Its plan used to have no lunch in it at all; then, briefly, it had the Übung.
  it('gets the Pause and the Programmpunkt, not the Thema', () => {
    expect(planFor('G1').entries.map(e => e.subject.name)).toEqual(['Antreten', 'Mittagessen']);
  });

  it('leaves the counted lanes with all three', () => {
    expect(planFor('G2').entries.map(e => e.subject.name))
      .toEqual(['Antreten', 'Übung', 'Mittagessen', 'Karteneröffnung']);
  });

  it('is still left out of coverage', () => {
    const section = buildCoverage(ownProgramme()).find(s => s.phase.id === 'gruppen')!;
    expect(section.groupIds).toEqual(['g2', 'g3']);
    const row = section.rows.find(r => r.subject.id === 'lesson')!;
    expect([...row.counts.keys()]).toEqual(['g2', 'g3']);
    expect(missingLanesForSubject(ownProgramme(), 'lesson')).toEqual(['G3']);
  });

  // An all-lanes Thema is owed by the counted lanes and delivered to all of
  // them at once, so it is complete — the excluded lane must not read as a gap.
  it('does not make an all-lanes Thema look unplanned', () => {
    expect(coverageForSubject(ownProgramme(), 'uebung')).toMatchObject({ placed: 2, total: 2 });
    expect(missingLanesForSubject(ownProgramme(), 'uebung')).toEqual([]);
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

describe('leaving lanes and Themen out of the reckoning', () => {
  // A group on its own programme (Kulturgüterschutz). It keeps its lane and its
  // Lektionen — switching it off would hide both — it is simply not counted.
  const withIgnoredG3 = () => {
    const base = makeState();
    return {
      ...base,
      groups: base.groups.map(g => (g.id === 'g3' ? { ...g, excludeFromCoverage: true } : g)),
    };
  };

  it('does not ask an ignored lane for a Thema', () => {
    const state = {
      ...withIgnoredG3(),
      events: [makeEvent({ groupId: 'g1', dayIndex: 2 }), makeEvent({ groupId: 'g2', dayIndex: 3 })],
    };
    // Two of two, not two of three: G3 owes nothing.
    expect(coverageForSubject(state, 'lesson'))
      .toEqual({ placed: 2, total: 2, uneven: false, short: false, over: false });
    expect(missingLanesForSubject(state, 'lesson')).toEqual([]);

    const gruppen = buildCoverage(state).find(sec => sec.phase.id === 'gruppen')!;
    expect(gruppen.groupIds).toEqual(['g1', 'g2']);
    expect(gruppen.rows.find(r => r.subject.id === 'lesson')!.missing).toBe(0);
  });

  it('still lets an ignored lane hold its own Lektionen', () => {
    const state = { ...withIgnoredG3(), events: [makeEvent({ groupId: 'g3', dayIndex: 2 })] };
    const plan = buildGroupPlans(state).find(p => p.group.id === 'g3')!;
    expect(plan.entries).toHaveLength(1);
  });

  it('leaves an optional Thema out of coverage entirely', () => {
    const base = makeState();
    const state = {
      ...base,
      subjects: base.subjects.map(s => (s.id === 'lesson' ? { ...s, optional: true } : s)),
    };
    expect(coverageForSubject(state, 'lesson'))
      .toEqual({ placed: 0, total: 0, uneven: false, short: false, over: false });
    expect(missingLanesForSubject(state, 'lesson')).toEqual([]);

    const gruppen = buildCoverage(state).find(sec => sec.phase.id === 'gruppen')!;
    expect(gruppen.rows.map(r => r.subject.id)).not.toContain('lesson');
    // The other Thema is untouched — `optional` is per subject, not a mode.
    expect(gruppen.rows.map(r => r.subject.id)).toContain('other');
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

// The Auswertung read to check "did Sanität really go to Anna, is Funk really
// in the Turnhalle" — every Lektion that no longer matches its Themenvorgabe.
describe('buildDeviations', () => {
  it('says nothing about a Lektion placed exactly as the Thema prescribes', () => {
    const state = makeState({ events: [makeEvent({ groupId: 'g1' })] });
    expect(buildDeviations(state).blocks).toEqual([]);
  });

  it('names the Vorgabe and the actual value for each changed field', () => {
    const state = makeState({
      events: [makeEvent({ groupId: 'g1', teacherIds: ['t2'], roomId: 'outside' })],
    });
    const { blocks, changedCount } = buildDeviations(state);
    expect(changedCount).toBe(1);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.entries[0]!.changes).toEqual([
      { field: 'Ausbildner', from: 'Anna Müller', to: 'Beat Zwahlen' },
      { field: 'Raum', from: 'Seminarraum 1', to: 'Outside' },
    ]);
    expect(blocks[0]!.entries[0]!.groupLabels).toEqual(['G1']);
  });

  it('reads an explicitly empty Raum as a change, not as "inherit"', () => {
    const state = makeState({ events: [makeEvent({ groupId: 'g1', roomId: null })] });
    expect(buildDeviations(state).blocks[0]!.entries[0]!.changes).toEqual([
      { field: 'Raum', from: 'Seminarraum 1', to: '—' },
    ]);
  });

  // 90 minutes cut into 60 + 30: both halves differ from the Vorgabe and neither
  // is a change to the plan — the Gruppe still gets its 90 minutes.
  it('marks the halves of a split that still adds up to the Soll', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', startTime: '08:00', endTime: '09:00' }),
        makeEvent({ groupId: 'g1', startTime: '10:00', endTime: '10:30' }),
      ],
    });
    const { blocks, splitOnlyCount, changedCount } = buildDeviations(state);
    expect(splitOnlyCount).toBe(2);
    expect(changedCount).toBe(0);
    expect(blocks[0]!.entries.every(e => e.splitOnly)).toBe(true);
  });

  it('keeps a split that does not add up, and one that also changed something', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', startTime: '08:00', endTime: '09:00' }),
        makeEvent({ groupId: 'g2', startTime: '08:00', endTime: '09:00', teacherIds: ['t2'] }),
        makeEvent({ groupId: 'g2', startTime: '10:00', endTime: '10:30' }),
      ],
    });
    const entries = buildDeviations(state).blocks[0]!.entries;
    // G1 is 30 minutes short of its 90, so its shortened block is a real change.
    expect(entries.filter(e => e.groupLabels[0] === 'G1').every(e => !e.splitOnly)).toBe(true);
    // G2 adds up, but the Ausbildner change is not a consequence of splitting.
    const g2 = entries.filter(e => e.groupLabels[0] === 'G2');
    expect(g2.map(e => e.splitOnly)).toEqual([false, true]);
  });

  it('leaves Pausen and Programmpunkte out — they have no rotation to deviate from', () => {
    const base = makeState();
    const state = {
      ...base,
      subjects: [
        ...base.subjects,
        makeSubject({ id: 'antreten', name: 'Antreten', kind: 'oneoff' }),
      ],
      events: [
        makeEvent({ groupId: ALL, subjectId: 'lunch', startTime: '12:00', endTime: '12:45' }),
        makeEvent({ groupId: 'g1', subjectId: 'antreten', roomId: 'outside' }),
      ],
    };
    expect(buildDeviations(state).blocks).toEqual([]);
  });

  it('ignores a Lektion whose every lane is switched off', () => {
    const base = makeState();
    const state = {
      ...base,
      groups: base.groups.map(g => (g.id === 'g1' ? { ...g, enabled: false } : g)),
      events: [makeEvent({ groupId: 'g1', teacherIds: ['t2'] })],
    };
    expect(buildDeviations(state).blocks).toEqual([]);
  });
});

describe('buildCoverage phase order', () => {
  it('lists phases in week order, whatever order they were added in', () => {
    // The stored array is insertion order: adding the KVK phase after the WK
    // phase used to list the report back to front against the grid beside it,
    // which reads left to right through `orderedPhases`.
    const base = makeState();
    const reversed = { ...base, phases: [...base.phases].reverse() };

    expect(buildCoverage(reversed).map(s => s.phase.id))
      .toEqual(orderedPhases(reversed).map(p => p.id));
  });
});

describe('plan entries carry the Raum itself', () => {
  it('so a Kürzel is never recovered by searching on the name', () => {
    // Two rooms, one name: looking the code up by name returned whichever came
    // first, which is a coin flip on the printed slip.
    const state = makeState({
      rooms: [
        { id: 'r1', name: 'Theoriesaal', shortName: 'TS1', color: '#000', excludeFromConflictCheck: false, unavailable: [] },
        { id: 'r2', name: 'Theoriesaal', shortName: 'TS2', color: '#000', excludeFromConflictCheck: false, unavailable: [] },
      ],
      events: [makeEvent({ groupId: 'g1', dayIndex: 2, roomId: 'r2' })],
    });
    const entry = buildGroupPlans(state).find(p => p.group.id === 'g1')!.entries[0]!;
    expect(entry.room?.id).toBe('r2');
    expect(entry.room?.shortName).toBe('TS2');
  });
});
