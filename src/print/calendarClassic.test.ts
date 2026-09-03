import { describe, expect, it } from 'vitest';
import { makeState } from '../test/fixtures';
import { buildCalendarDoc } from './calendar';
import { axisPositions } from './calendarClassicPdf';

const ALL_PHASES = ['kader', 'gruppen'];

describe('axisPositions', () => {
  it('puts a Zeit column on each edge and at every phase boundary', () => {
    const doc = buildCalendarDoc(makeState({ events: [] }), ALL_PHASES);
    // KVK: 2 days × 1 lane, then WK: 3 days × 3 lanes.
    expect(axisPositions(doc)).toEqual([0, 2, 11]);
  });

  it('collapses to the two edges when a single phase is printed', () => {
    const doc = buildCalendarDoc(makeState({ events: [] }), ['gruppen']);
    expect(axisPositions(doc)).toEqual([0, 9]);
  });

  it('never emits the leading position twice', () => {
    const doc = buildCalendarDoc(makeState({ events: [] }), ALL_PHASES);
    const axes = axisPositions(doc);
    expect(new Set(axes).size).toBe(axes.length);
    expect(axes[0]).toBe(0);
    expect(axes.at(-1)).toBe(doc.columns.length);
  });

  it('is sorted, so the running axis count is monotonic', () => {
    const doc = buildCalendarDoc(makeState({ events: [] }), ALL_PHASES);
    const axes = axisPositions(doc);
    expect([...axes].sort((a, b) => a - b)).toEqual(axes);
  });
});
