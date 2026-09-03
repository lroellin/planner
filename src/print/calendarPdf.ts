import { jsPDF } from 'jspdf';
import type { CalendarDoc, GridSpan } from './calendar';
import type { PrintCell } from './boxes';
import type { Orientation } from './layout';
import { PT, cardLines, hhmm, mix, rgb, truncate } from './pdfDraw';

/**
 * The week grid, drawn rather than screenshotted.
 *
 * Everything is derived from the sheet: the minute scale is whatever makes the
 * day fill the page, the column width is whatever divides the width by the lane
 * count. That is the point of leaving the DOM behind — the old path sized the
 * page to the grid and let the printer shrink it, which meant the type size
 * depended on how wide the browser window happened to be.
 */

// One definition, shared with the slip fitter: both documents offer the same
// Quer/Hoch choice and the dialog drives them through the same control.
export type { Orientation } from './layout';

export interface CalendarOptions {
  wkName: string;
  stand: string | null;
  orientation: Orientation;
}

const MARGIN = 8;
const AXIS_W = 13;

function drawSpanRow(
  doc: jsPDF,
  spans: GridSpan[],
  x0: number,
  y: number,
  h: number,
  colW: number,
  font: number,
  fill: [number, number, number],
  bold: boolean,
): void {
  doc.setFontSize(font);
  for (const span of spans) {
    const x = x0 + span.from * colW;
    const w = span.span * colW;
    doc.setFillColor(...fill);
    doc.rect(x, y, w, h, 'F');
    doc.setDrawColor(255);
    doc.setLineWidth(0.4);
    doc.rect(x, y, w, h, 'S');
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(51, 65, 85);
    const label = span.sub ? `${span.label} ${span.sub}` : span.label;
    const text = truncate(doc, label, w - 2);
    doc.text(text, x + w / 2 - doc.getTextWidth(text) / 2, y + h * 0.68);
  }
}

export function renderCalendarPdf(model: CalendarDoc, opts: CalendarOptions): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: opts.orientation });
  doc.setProperties({ title: `Wochenplan – ${opts.wkName}`, creator: 'WK-Planer' });

  const pageW = opts.orientation === 'landscape' ? 297 : 210;
  const pageH = opts.orientation === 'landscape' ? 210 : 297;

  if (model.columns.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(118);
    doc.text('Keine Phase ausgewählt.', MARGIN, MARGIN + 8);
    return doc;
  }

  // ── Frame ─────────────────────────────────────────────────────────────────
  const titleH = 9;
  const footerH = 6;
  const showPhases = model.phases.length > 1;
  const phaseH = showPhases ? 5 : 0;
  const dayH = 6;
  const laneH = 4.6;
  const headerH = phaseH + dayH + laneH;

  const x0 = MARGIN + AXIS_W;
  const gridW = pageW - 2 * MARGIN - AXIS_W;
  const top = MARGIN + titleH;
  const gridTop = top + headerH;
  const gridH = pageH - MARGIN - footerH - gridTop;
  const colW = gridW / model.columns.length;
  const span = model.endMinutes - model.startMinutes;
  const perMinute = gridH / span;
  const y = (minutes: number): number => gridTop + (minutes - model.startMinutes) * perMinute;

  // ── Title ─────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(truncate(doc, opts.wkName, gridW * 0.7), MARGIN, MARGIN + 5.4);

  // ── Header rows ───────────────────────────────────────────────────────────
  let hy = top;
  if (showPhases) {
    drawSpanRow(doc, model.phases, x0, hy, phaseH, colW, 7, [226, 232, 240], true);
    hy += phaseH;
  }
  drawSpanRow(doc, model.days, x0, hy, dayH, colW, 8, [241, 245, 249], true);
  hy += dayH;
  drawSpanRow(
    doc,
    model.columns.map((c, i) => ({ label: c.label, sub: '', from: i, span: 1 })),
    x0, hy, laneH, colW, 6.5, [248, 250, 252], false,
  );

  // ── Hour rules and the time axis ──────────────────────────────────────────
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  for (let m = model.startMinutes; m <= model.endMinutes; m += 30) {
    const yy = y(m);
    const onHour = m % 60 === 0;
    doc.setDrawColor(onHour ? 196 : 228);
    doc.setLineWidth(onHour ? 0.25 : 0.12);
    if (!onHour) doc.setLineDashPattern([0.7, 1.1], 0);
    doc.line(x0, yy, x0 + gridW, yy);
    doc.setLineDashPattern([], 0);
    if (onHour && m < model.endMinutes) {
      doc.setTextColor(130);
      doc.text(hhmm(m), MARGIN, yy + 2.4);
    }
  }

  // ── Column rules: lanes hairline, days solid ──────────────────────────────
  for (let i = 0; i <= model.columns.length; i++) {
    const xx = x0 + i * colW;
    const boundary = i === 0
      || i === model.columns.length
      || model.columns[i]!.dayIndex !== model.columns[i - 1]!.dayIndex;
    doc.setDrawColor(boundary ? 170 : 226);
    doc.setLineWidth(boundary ? 0.28 : 0.1);
    doc.line(xx, gridTop, xx, gridTop + gridH);
  }
  doc.setDrawColor(170);
  doc.setLineWidth(0.28);
  doc.line(x0, gridTop + gridH, x0 + gridW, gridTop + gridH);

  // ── Blocks ────────────────────────────────────────────────────────────────
  for (const e of model.entries) {
    const bx = x0 + e.from * colW + 0.35;
    const bw = e.span * colW - 0.7;
    const by = y(e.startMinutes) + 0.3;
    const bh = (e.endMinutes - e.startMinutes) * perMinute - 0.6;
    if (bh <= 0.6 || bw <= 1) continue;

    const base = rgb(e.color);
    // A tint rather than the full hue: on screen the card is a surface the
    // theme mixes, and a saturated block behind 6 pt text is unreadable on
    // paper and expensive to print. The solid bar on the left keeps the colour
    // identifiable against the Legende.
    doc.setFillColor(...mix(base, e.isBreak ? 0.9 : 0.8));
    doc.rect(bx, by, bw, bh, 'F');
    doc.setFillColor(...(e.isBreak ? mix(base, 0.45) : base));
    doc.rect(bx, by, 1.1, bh, 'F');

    if (e.conflict === 'none') {
      doc.setDrawColor(...mix(base, 0.45));
      doc.setLineWidth(0.15);
    } else {
      // The one thing on the grid that is not the plan but a verdict on it.
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(e.conflict === 'hard' ? 0.5 : 0.3);
      if (e.conflict === 'soft') doc.setLineDashPattern([0.9, 0.9], 0);
    }
    doc.rect(bx, by, bw, bh, 'S');
    doc.setLineDashPattern([], 0);

    // ── Card text, by how much room the block has ───────────────────────────
    const pad = 0.9;
    const tx = bx + 1.1 + pad;
    const tw = bw - 1.1 - 2 * pad;
    if (tw < 3) continue;

    // A 15-minute Pause is ~3 mm tall: too short for the stacked layout, and
    // drawn blank it reads as a printing artefact rather than as a block. One
    // centred line at the smallest legible size is the whole card there.
    if (bh < 4.6) {
      doc.setFont('helvetica', e.isBreak ? 'normal' : 'bold');
      doc.setFontSize(4.6);
      doc.setTextColor(e.isBreak ? 120 : 40);
      const label = doc.getTextWidth(e.subject.full) <= tw ? e.subject.full : e.subject.short;
      doc.text(truncate(doc, label, tw), tx, by + bh / 2 + 0.55);
      continue;
    }

    /**
     * The block is tall and the text is short, so the card is laid out as a
     * stack rather than a sentence: the Thema wraps, then the Raum gets its own
     * line (or two), then the Ausbildner. The single joined meta row this
     * replaced spent one line on everything and truncated the lot — which cut
     * off exactly the field a printed plan is read for ("CG · Schutzanlage
     * Bern…") while leaving nine empty lines underneath it.
     *
     * Each field is wrapped, falls back to its short form, and is dropped whole
     * rather than half-drawn. Raum comes before Ausbildner because it is the
     * less recoverable of the two.
     */
    const titleSize = bh < 6 ? 5.4 : bh < 12 ? 6 : 6.6;
    const lineH = titleSize * PT * 1.2;
    const metaSize = bh < 12 ? 5 : 5.6;
    const metaLineH = metaSize * PT * 1.25;
    let cursor = by + pad;
    const bottom = by + bh - pad;

    const meta: PrintCell[] = [e.room, e.teachers].filter(v => v.full !== '');

    // Leave the Raum a line to land on before letting the title use every one.
    doc.setFontSize(titleSize);
    const reserve = meta.length > 0 ? metaLineH : 0;
    const titleRoom = Math.floor((bottom - cursor - reserve) / lineH);
    const maxTitleLines = Math.max(1, Math.min(titleRoom, 3));

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(e.isBreak ? 110 : 24, e.isBreak ? 118 : 30, e.isBreak ? 128 : 42);
    for (const line of cardLines(doc, e.subject, tw, maxTitleLines)) {
      if (cursor + lineH > bottom) break;
      doc.text(line, tx, cursor + lineH * 0.78);
      cursor += lineH;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(metaSize);
    doc.setTextColor(90, 100, 116);
    for (const value of meta) {
      const free = Math.floor((bottom - cursor) / metaLineH);
      if (free < 1) break;
      for (const line of cardLines(doc, value, tw, Math.min(free, 2))) {
        doc.text(line, tx, cursor + metaLineH * 0.78);
        cursor += metaLineH;
      }
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footY = pageH - MARGIN;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(150);
  doc.text(opts.wkName, MARGIN, footY);
  if (opts.stand) {
    doc.text(opts.stand, pageW - MARGIN - doc.getTextWidth(opts.stand), footY);
  }

  return doc;
}
