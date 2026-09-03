import type { jsPDF } from 'jspdf';
import type { LegendEntry } from './calendar';
import { PT, truncate } from './pdfDraw';

/**
 * The abbreviation key.
 *
 * A printed card falls back to a Kürzel as soon as its lane is too narrow for
 * the full name, and paper has no tooltip to recover it from — so the key has to
 * be on the sheet. It goes in a band between the grid and the footer rather than
 * into the grid's own white space: an empty cell is a statement about the week
 * (nobody is booked here), and printing a key into one makes the plan look
 * fuller than it is. Below the grid it is also always in the same place, which
 * is what makes it findable.
 */

export interface LegendLayout {
  cols: number;
  rows: number;
  colW: number;
  lineH: number;
  /** Total height including the heading. */
  height: number;
  size: number;
}

const TITLE = 'Abkürzungen';
const PAD = 1.4;
const GAP = 2.5;

/**
 * How the key would sit in `width` millimetres, or `null` if even one column of
 * it will not fit. Measured against the document because column width is the
 * longest `KÜR = Vollständiger Name` in it, and that is a font question.
 */
export function measureLegend(
  doc: jsPDF,
  entries: LegendEntry[],
  width: number,
  size: number,
): LegendLayout | null {
  if (entries.length === 0) return null;
  const avail = width - 2 * PAD;
  if (avail <= 0) return null;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(size);
  const widest = Math.max(...entries.map(e => doc.getTextWidth(`${e.short} = ${e.full}`)));
  const cols = Math.max(1, Math.min(entries.length, Math.floor(avail / (widest + GAP))));
  const rows = Math.ceil(entries.length / cols);
  const lineH = size * PT * 1.5;
  return { cols, rows, colW: avail / cols, lineH, height: 2 * PAD + lineH * (rows + 1), size };
}

/**
 * Draw the key into `x, y, w` at a measured layout. Entries run down each column
 * before starting the next, so a long list reads top-to-bottom like a list and
 * not left-to-right like a table.
 */
export function drawLegend(
  doc: jsPDF,
  entries: LegendEntry[],
  layout: LegendLayout,
  x: number,
  y: number,
  w: number,
  ink: [number, number, number],
  muted: [number, number, number],
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(layout.size);
  doc.setTextColor(...ink);
  doc.text(TITLE, x + PAD, y + PAD + layout.lineH * 0.8);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  entries.forEach((e, i) => {
    const col = Math.floor(i / layout.rows);
    const row = i % layout.rows;
    const cx = x + PAD + col * layout.colW;
    const cy = y + PAD + layout.lineH * (row + 1) + layout.lineH * 0.8;
    const text = truncate(doc, `${e.short} = ${e.full}`, Math.min(layout.colW - GAP, w - 2 * PAD));
    doc.text(text, cx, cy);
  });
}

