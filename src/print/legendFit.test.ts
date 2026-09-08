import { describe, expect, it } from 'vitest';
import type { jsPDF } from 'jspdf';
import { resolveLegend } from './legendFit';
import type { LegendEntry } from './calendar';

const entry = (short: string): LegendEntry => ({ kind: 'room', short, full: `Raum ${short}` });
const A = entry('A');
const B = entry('B');
const C = entry('C');

// resolveLegend never touches the document — it only hands it to `paint` — so a
// stand-in keeps the test about the fixed point rather than about jsPDF.
const doc = (): jsPDF => ({} as jsPDF);

describe('resolveLegend', () => {
  it('keeps only the abbreviations a pass actually printed', () => {
    const result = resolveLegend([A, B, C], doc, (_d, _legend, onShort) => {
      onShort({ full: 'Raum B', short: 'B', keys: ['room:B'] });
    });
    expect(result).toEqual([B]);
  });

  it('drops the key entirely when nothing fell back to a Kürzel', () => {
    const result = resolveLegend([A, B], doc, () => {});
    expect(result).toEqual([]);
  });

  /**
   * The feedback loop the fixed point exists for: the key costs height, the
   * shorter grid makes a block abbreviate that did not have to before, and that
   * block's Kürzel has to end up in the key it caused.
   */
  it('takes in what a pass only needs once the key is taking up room', () => {
    const result = resolveLegend([A, B], doc, (_d, legend, onShort) => {
      onShort({ full: 'Raum A', short: 'A', keys: ['room:A'] });
      if (legend.length > 0) onShort({ full: 'Raum B', short: 'B', keys: ['room:B'] });
    });
    expect(result).toEqual([A, B]);
  });

  it('falls back to the full key rather than one that under-explains', () => {
    // Pathological: never settles, because each pass asks for the opposite set.
    const result = resolveLegend([A, B], doc, (_d, legend, onShort) => {
      const key = legend.some(e => e.short === 'A') ? 'room:B' : 'room:A';
      onShort({ full: '', short: '', keys: [key] });
    });
    expect(result).toEqual([A, B]);
  });

  it('does no work at all when the document has no abbreviations', () => {
    let passes = 0;
    const result = resolveLegend([], doc, () => { passes++; });
    expect(result).toEqual([]);
    expect(passes).toBe(0);
  });
});
