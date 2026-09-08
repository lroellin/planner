import { describe, expect, it } from 'vitest';
import { ALL, makeEvent, makeState, makeSubject } from '../test/fixtures';
import { buildCalendarDoc, contiguousRuns, toMinutes } from './calendar';

const ALL_PHASES = ['kader', 'gruppen'];

function state(events = [] as ReturnType<typeof makeEvent>[]) {
  return makeState({ events });
}

describe('buildCalendarDoc', () => {
  it('lays out one column per lane per day, phases in week order', () => {
    const doc = buildCalendarDoc(state(), ALL_PHASES);
    // KVK: 2 days × 1 lane. WK: 3 days × 3 lanes.
    expect(doc.columns).toHaveLength(2 * 1 + 3 * 3);
    expect(doc.columns[0]).toMatchObject({ dayIndex: 0, groupId: 'k' });
    expect(doc.columns[2]).toMatchObject({ dayIndex: 2, groupId: 'g1' });
    expect(doc.phases.map(p => p.label)).toEqual(['KVK', 'WK']);
    expect(doc.phases[0]).toMatchObject({ from: 0, span: 2 });
    expect(doc.phases[1]).toMatchObject({ from: 2, span: 9 });
  });

  it('covers a lane left out of the reckoning with the all-lanes block', () => {
    const base = makeState();
    const doc = buildCalendarDoc({
      ...base,
      groups: base.groups.map(g => (g.id === 'g2' ? { ...g, excludeFromCoverage: true } : g)),
      events: [makeEvent({ subjectId: 'lunch', groupId: ALL, dayIndex: 2, startTime: '12:00', endTime: '13:00' })],
    }, ['gruppen']);
    expect(doc.columns.slice(0, 3).map(c => c.label)).toEqual(['G1', 'G2', 'G3']);
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]).toMatchObject({ from: 0, span: 3 });
  });

  it('keeps adjacent lanes of an all-lanes block as one bar', () => {
    const doc = buildCalendarDoc(
      state([makeEvent({ subjectId: 'lunch', groupId: ALL, dayIndex: 2, startTime: '12:00', endTime: '13:00' })]),
      ['gruppen'],
    );
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]).toMatchObject({ from: 0, span: 3 });
  });

  it('gives each day a header spanning exactly its own lanes', () => {
    const doc = buildCalendarDoc(state(), ALL_PHASES);
    expect(doc.days.map(d => d.span)).toEqual([1, 1, 3, 3, 3]);
    expect(doc.days.map(d => d.label)).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr']);
  });

  it('drops an unchecked phase and closes the gap it leaves', () => {
    const doc = buildCalendarDoc(state(), ['gruppen']);
    expect(doc.columns).toHaveLength(9);
    expect(doc.columns.every(c => c.dayIndex >= 2)).toBe(true);
    expect(doc.days.map(d => d.label)).toEqual(['Mi', 'Do', 'Fr']);
    expect(doc.phases).toHaveLength(1);
    expect(doc.phases[0]).toMatchObject({ from: 0, span: 9 });
  });

  it('leaves out events belonging to an unchecked phase', () => {
    const doc = buildCalendarDoc(
      state([
        makeEvent({ id: 'kader', groupId: 'k', dayIndex: 0 }),
        makeEvent({ id: 'wk', groupId: 'g1', dayIndex: 2 }),
      ]),
      ['gruppen'],
    );
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]!.from).toBe(0);
  });

  it('spans an all-lanes event across the whole day', () => {
    const doc = buildCalendarDoc(
      state([makeEvent({ id: 'lunch', subjectId: 'lunch', groupId: 'all', dayIndex: 2 })]),
      ['gruppen'],
    );
    expect(doc.entries[0]).toMatchObject({ from: 0, span: 3 });
  });

  it('keeps a single-lane event in its own column', () => {
    const doc = buildCalendarDoc(
      state([makeEvent({ id: 'a', groupId: 'g2', dayIndex: 3 })]),
      ['gruppen'],
    );
    expect(doc.entries[0]).toMatchObject({ from: 4, span: 1 });
  });

  it('opens the time range out to whole hours around what is planned', () => {
    const doc = buildCalendarDoc(
      state([
        makeEvent({ id: 'a', groupId: 'g1', dayIndex: 2, startTime: '08:15', endTime: '09:30' }),
        makeEvent({ id: 'b', groupId: 'g1', dayIndex: 3, startTime: '13:00', endTime: '16:45' }),
      ]),
      ALL_PHASES,
    );
    expect(doc.startMinutes).toBe(toMinutes('08:00'));
    expect(doc.endMinutes).toBe(toMinutes('17:00'));
  });

  it('never draws a day shorter than four hours', () => {
    const doc = buildCalendarDoc(
      state([makeEvent({ id: 'a', groupId: 'g1', dayIndex: 2, startTime: '09:00', endTime: '10:00' })]),
      ALL_PHASES,
    );
    expect(doc.endMinutes - doc.startMinutes).toBe(240);
  });

  it('falls back to a normal working day when nothing is planned', () => {
    const doc = buildCalendarDoc(state(), ALL_PHASES);
    expect(doc.startMinutes).toBe(toMinutes('08:00'));
    expect(doc.endMinutes).toBe(toMinutes('17:00'));
  });

  it('classifies conflicts so the renderer can draw hard and soft apart', () => {
    const doc = buildCalendarDoc(
      state([
        makeEvent({ id: 'hard', groupId: 'g1', dayIndex: 2, conflicts: [{ kind: 'teacher', resourceId: 't1', collidingEventIds: ['x'] }] }),
        makeEvent({ id: 'soft', groupId: 'g2', dayIndex: 2, conflicts: [{ kind: 'room', resourceId: 'r1', collidingEventIds: ['x'] }] }),
        makeEvent({ id: 'clean', groupId: 'g3', dayIndex: 2 }),
      ]),
      ['gruppen'],
    );
    const byColumn = new Map(doc.entries.map(e => [e.from, e.conflict]));
    expect(byColumn.get(0)).toBe('hard');
    expect(byColumn.get(1)).toBe('soft');
    expect(byColumn.get(2)).toBe('none');
  });

  it('paints long blocks first so a short one inside them survives', () => {
    const doc = buildCalendarDoc(
      state([
        makeEvent({ id: 'short', groupId: 'g1', dayIndex: 2, startTime: '09:00', endTime: '09:15' }),
        makeEvent({ id: 'long', groupId: 'g1', dayIndex: 2, startTime: '08:00', endTime: '12:00' }),
      ]),
      ['gruppen'],
    );
    const spans = doc.entries.map(e => e.endMinutes - e.startMinutes);
    expect(spans).toEqual([240, 15]);
  });

  it('carries the room and subject codes for the narrow-card fallback', () => {
    const s = makeState({
      subjects: [makeSubject({ id: 'lesson', name: 'Karteneröffnung', shortName: 'KE' })],
      rooms: [{
        id: 'r1', name: 'Theoriesaal 1', shortName: 'TS1', color: '#48bb78',
        excludeFromConflictCheck: false, unavailable: [],
      }],
      events: [makeEvent({ id: 'a', groupId: 'g1', dayIndex: 2 })],
    });
    const doc = buildCalendarDoc(s, ['gruppen']);
    expect(doc.entries[0]!.subject)
      .toEqual({ full: 'Karteneröffnung', short: 'KE', keys: ['subject:KE'] });
    expect(doc.entries[0]!.room.short).toBe('TS1');
  });

  it('carries full and short forms for the people, so a narrow card can fall back', () => {
    const doc = buildCalendarDoc(
      state([makeEvent({ id: 'a', groupId: 'g1', dayIndex: 2, teacherIds: ['t1', 't2'] })]),
      ['gruppen'],
    );
    expect(doc.entries[0]!.teachers).toEqual({
      full: 'Anna Müller, Beat Zwahlen',
      short: 'AM BZ',
      // Both initials, since the short form spells both — the key owes both.
      keys: ['teacher:AM', 'teacher:BZ'],
    });
  });

  it('produces nothing to draw when every phase is unchecked', () => {
    const doc = buildCalendarDoc(state([makeEvent({ groupId: 'g1' })]), []);
    expect(doc.columns).toHaveLength(0);
    expect(doc.entries).toHaveLength(0);
  });
});


// The state model has no way to hand `buildCalendarDoc` a gapped column set
// today — every lane an all-lanes block covers is a lane the phase draws. This
// is tested directly rather than through a fixture so the grid keeps drawing the
// right thing if that ever stops being true: `from`/`span` alone cannot say
// "these two columns but not the one between them".
describe('contiguousRuns', () => {
  it('joins a run and splits at a gap', () => {
    expect(contiguousRuns([0, 1, 2])).toEqual([{ from: 0, span: 3 }]);
    expect(contiguousRuns([0, 2])).toEqual([{ from: 0, span: 1 }, { from: 2, span: 1 }]);
    expect(contiguousRuns([3, 0, 1])).toEqual([{ from: 0, span: 2 }, { from: 3, span: 1 }]);
  });

  it('handles the single and empty cases', () => {
    expect(contiguousRuns([4])).toEqual([{ from: 4, span: 1 }]);
    expect(contiguousRuns([])).toEqual([]);
  });
});
