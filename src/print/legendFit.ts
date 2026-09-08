import type { jsPDF } from 'jspdf';
import { legendKey, type LegendEntry } from './calendar';
import type { ShortSink } from './pdfDraw';

/**
 * Narrow the abbreviation key to what the sheet actually prints.
 *
 * `buildCalendarDoc` can only produce a *candidate* list: every Kürzel any
 * placed block could conceivably fall back to. Printing all of them made the key
 * as tall as a band of the grid — most entries explaining a name that had been
 * printed in full three centimetres above.
 *
 * Which ones a sheet really uses is not knowable before it is laid out, and the
 * key's own height feeds back into that: a taller key leaves the grid shorter,
 * shorter blocks abbreviate more, and more abbreviations make the key taller
 * again. So this walks the loop to its fixed point, starting from *no* key at
 * all — the largest grid, therefore the fewest fallbacks — and letting the set
 * grow until a pass asks for nothing new. Growth is monotone — a bigger key can
 * only ever shrink the grid, and a smaller grid can only ever abbreviate more —
 * so the walk terminates.
 *
 * The direction matters: starting from the full list and shrinking would settle
 * on a key that omits an abbreviation the final layout goes on to print.
 */
export type PaintPass = (doc: jsPDF, legend: LegendEntry[], onShort: ShortSink) => void;

// Each pass costs one throwaway render. In practice it settles in two; the cap
// only exists so a renderer that somehow oscillates cannot spin here.
const MAX_PASSES = 6;

export function resolveLegend(
  candidates: LegendEntry[],
  newDoc: () => jsPDF,
  paint: PaintPass,
): LegendEntry[] {
  if (candidates.length === 0) return candidates;

  let chosen: LegendEntry[] = [];
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const used = new Set<string>();
    paint(newDoc(), chosen, cell => {
      for (const key of cell.keys ?? []) used.add(key);
    });
    const next = candidates.filter(e => used.has(legendKey(e.kind, e.short)));
    // The sets, not their sizes: a same-size *different* set is not a fixed
    // point, and treating it as one would print a key for the wrong sheet.
    if (next.length === chosen.length && next.every((e, i) => e === chosen[i])) return chosen;
    chosen = next;
  }
  // Never settled — print the whole key rather than one that under-explains.
  return candidates;
}
