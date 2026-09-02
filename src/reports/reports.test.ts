import { describe, it, expect } from 'vitest';
import { buildCoverage, coverageForSubject, coverageStatus, subjectPhases, buildTeacherPlans } from './reports';
import { ALL, makeEvent, makeState } from '../test/fixtures';

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
    expect(coverageForSubject(state, 'lesson')).toEqual({ placed: 0, total: 1, uneven: false, short: false });
  });

  it('counts one lane per placement and reports what is still missing', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', dayIndex: 2 }),
        makeEvent({ groupId: 'g2', dayIndex: 3 }),
      ],
    });
    expect(coverageForSubject(state, 'lesson')).toEqual({ placed: 2, total: 3, uneven: false, short: false });

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
      placed: 3, total: 3, uneven: false, short: true,
    });
  });

  it('calls a lane that got more time than the subject asks for uneven', () => {
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
    expect(row.uneven).toBe(true); // but G1 has twice it
    expect(coverageStatus(row)).toBe('uneven');
    // The sidebar counter has to reach the same verdict as the report.
    expect(coverageForSubject(state, 'lesson')).toEqual({
      placed: 3, total: 3, uneven: true, short: false,
    });
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
