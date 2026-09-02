import { describe, it, expect } from 'vitest';
import { buildCoverage, coverageForSubject, subjectPhases, buildTeacherPlans } from './reports';
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
    expect(coverageForSubject(state, 'lesson')).toEqual({ placed: 0, total: 1 });
  });

  it('counts one lane per placement and reports what is still missing', () => {
    const state = makeState({
      events: [
        makeEvent({ groupId: 'g1', dayIndex: 2 }),
        makeEvent({ groupId: 'g2', dayIndex: 3 }),
      ],
    });
    expect(coverageForSubject(state, 'lesson')).toEqual({ placed: 2, total: 3 });

    const gruppen = buildCoverage(state).find(s => s.phase.id === 'gruppen')!;
    const row = gruppen.rows.find(r => r.subject.id === 'lesson')!;
    expect(row.counts.get('g1')).toBe(1);
    expect(row.counts.get('g3')).toBe(0);
    expect(row.missing).toBe(1);
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
