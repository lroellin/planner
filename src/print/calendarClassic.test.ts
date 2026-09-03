import { describe, expect, it } from 'vitest';
import { makeState } from '../test/fixtures';
import { buildCalendarDoc } from './calendar';
import { axisTiers, chooseAxes } from './calendarClassicPdf';

const ALL_PHASES = ['kader', 'gruppen'];

describe('axisTiers', () => {
  it('offers a Zeit column before every day, then every phase, then the edges', () => {
    const doc = buildCalendarDoc(makeState({ events: [] }), ALL_PHASES);
    // KVK: 2 days x 1 lane, then WK: 3 days x 3 lanes.
    expect(axisTiers(doc)).toEqual([
      [0, 1, 2, 5, 8, 11],
      [0, 2, 11],
      [0, 11],
    ]);
  });

  it('collapses when a single phase is printed', () => {
    const doc = buildCalendarDoc(makeState({ events: [] }), ['gruppen']);
    expect(axisTiers(doc)).toEqual([
      [0, 3, 6, 9],
      [0, 9],
      [0, 9],
    ]);
  });

  it('never repeats the leading position and stays sorted', () => {
    const doc = buildCalendarDoc(makeState({ events: [] }), ALL_PHASES);
    for (const axes of axisTiers(doc)) {
      expect(new Set(axes).size).toBe(axes.length);
      expect([...axes].sort((a, b) => a - b)).toEqual(axes);
      expect(axes[0]).toBe(0);
      expect(axes.at(-1)).toBe(doc.columns.length);
    }
  });
});

describe('chooseAxes', () => {
  it('takes a Zeit column between every day when the sheet can afford it', () => {
    const doc = buildCalendarDoc(makeState({ events: [] }), ALL_PHASES);
    // A4 landscape and portrait, less the 8 mm margins.
    expect(chooseAxes(doc, 281)).toEqual([0, 1, 2, 5, 8, 11]);
    expect(chooseAxes(doc, 194)).toEqual([0, 1, 2, 5, 8, 11]);
  });

  it('steps back one tier at a time rather than jumping to the edges', () => {
    const doc = buildCalendarDoc(makeState({ events: [] }), ALL_PHASES);
    // Wide enough for the 3 phase axes (11 lanes x 4 mm + 24 mm) but not the 6.
    expect(chooseAxes(doc, 70)).toEqual([0, 2, 11]);
    expect(chooseAxes(doc, 60)).toEqual([0, 11]);
  });

  it('falls back to the edges rather than returning nothing', () => {
    const doc = buildCalendarDoc(makeState({ events: [] }), ALL_PHASES);
    expect(chooseAxes(doc, 1)).toEqual([0, 11]);
  });
});
