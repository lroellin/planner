import { jsPDF } from 'jspdf';
import type { CalendarDoc, GridEntry, LegendEntry } from './calendar';
import type { PrintCell } from './boxes';
import type { CalendarOptions } from './calendarPdf';
import { getContrastColor } from '../utils/colorUtils';
import { PT, blend, cardLines, fitLabel, hhmm, rgb, truncate, type ShortSink } from './pdfDraw';
import { drawLegend, measureLegend } from './legend';
import { resolveLegend } from './legendFit';

/**
 * The week grid in the shape of the Excel Arbeitsprogramm this app replaced.
 *
 * The same `CalendarDoc` the modern sheet is drawn from — same week, same
 * blocks, same conflict verdicts — laid out the way the supervisors who sign the
 * programme off have read it for years: a hard black table, saturated colour
 * blocks with centred text, and the Zeit axis repeated between the days.
 *
 * Not a replica. The vertical "Aktualisieren Unterlagen" text and the Excel
 * footer stay out; this is close enough to be read without explanation.
 */

const MARGIN = 8;
/**
 * Narrower than the modern sheet's 13 mm: this one pays for the axis once per
 * day, so it is cut to what "07:00" at 6.5 pt actually needs plus a hair of pad.
 */
const AXIS_W = 8;
/** Below this a lane column is not worth the axis that squeezed it. */
const MIN_COL_W = 4;

const BLACK: [number, number, number] = [0, 0, 0];
const LEGEND_SIZE = 4.9;

/**
 * Where the Zeit columns go, densest first.
 *
 * The Excel sheet repeats the axis across the page so no block is ever more than
 * a day away from the hour it sits on — and a wide plan is exactly where that
 * matters, which is also where the axes cost the most width. So the tiers degrade
 * one step at a time rather than collapsing to the edges: every day, then every
 * phase boundary, then the two edges. Each list is the column indexes a Zeit
 * column is inserted *before*, deduplicated (day 0 and phase 0 are both `0`) and
 * sorted, so the running axis count is monotonic.
 */
export function axisTiers(model: CalendarDoc): number[][] {
  const edges = [0, model.columns.length];
  const tier = (extra: number[]): number[] =>
    [...new Set([...edges, ...extra])].sort((a, b) => a - b);
  return [
    tier(model.days.map(d => d.from)),
    tier(model.phases.map(p => p.from)),
    tier([]),
  ];
}

/** The densest tier that still leaves a lane column worth printing. */
export function chooseAxes(model: CalendarDoc, usableW: number): number[] {
  const tiers = axisTiers(model);
  const fits = tiers.find(
    axes => (usableW - axes.length * AXIS_W) / model.columns.length >= MIN_COL_W,
  );
  return fits ?? tiers[tiers.length - 1]!;
}

/** The `Raum, Ausbildner` line under the title — one field, not two rows. */
function metaCell(e: GridEntry): PrintCell | null {
  const join = (a: string, b: string): string => [a, b].filter(v => v !== '').join(', ');
  const full = join(e.room.full, e.teachers.full);
  if (full === '') return null;
  // Both halves are abbreviated together here, so the key owes both.
  return {
    full,
    short: join(e.room.short, e.teachers.short),
    keys: [...(e.room.keys ?? []), ...(e.teachers.keys ?? [])],
  };
}

export function renderCalendarClassicPdf(model: CalendarDoc, opts: CalendarOptions): jsPDF {
  const newDoc = (): jsPDF => {
    const d = new jsPDF({ unit: 'mm', format: 'a4', orientation: opts.orientation });
    d.setProperties({ title: `Arbeitsprogramm – ${opts.wkName}`, creator: 'WK-Planer' });
    return d;
  };

  const pageW = opts.orientation === 'landscape' ? 297 : 210;
  const pageH = opts.orientation === 'landscape' ? 210 : 297;

  /** One full pass against a given key — see `renderCalendarPdf` for the why. */
  const paint = (doc: jsPDF, legendEntries: LegendEntry[], onShort: ShortSink): void => {
    if (model.columns.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(118);
      doc.text('Keine Phase ausgewählt.', MARGIN, MARGIN + 8);
      return;
    }

    // ── Axes and the geometry that follows from them ────────────────────────
    const usableW = pageW - 2 * MARGIN;
    const axes = chooseAxes(model, usableW);
    const colW = (usableW - axes.length * AXIS_W) / model.columns.length;

    /** Left edge of column `i`: every axis at or before it has already been paid for. */
    const colX = (i: number): number =>
      MARGIN + axes.filter(a => a <= i).length * AXIS_W + i * colW;
    /** Left edge of the Zeit column inserted at position `p`. */
    const axisX = (p: number): number =>
      MARGIN + axes.filter(a => a < p).length * AXIS_W + p * colW;

    const titleH = 9;
    const dayH = 6;
    const laneH = 4.6;
    const headerH = dayH + laneH;

    const top = MARGIN + titleH;
    const gridTop = top + headerH;
    const gridRight = pageW - MARGIN;
    const span = model.endMinutes - model.startMinutes;

    // ── The abbreviation key sits below the grid ────────────────────────────
    // Outside the calendar, not in its white space: an empty cell says nobody is
    // booked there, and a key printed into one makes the week look fuller.
    const baseFooterH = 6;
    const legend = measureLegend(doc, legendEntries, usableW, LEGEND_SIZE);
    const footerH = baseFooterH + (legend ? legend.height + 1.5 : 0);

    const gridH = pageH - MARGIN - footerH - gridTop;
    const perMinute = gridH / span;
    const y = (minutes: number): number => gridTop + (minutes - model.startMinutes) * perMinute;

    // ── Title ───────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BLACK);
    doc.text(truncate(doc, `Arbeitsprogramm: ${opts.wkName}`, usableW * 0.8), MARGIN, MARGIN + 5.4);

    // ── Header: Tag over Lane, with "Zeit" over each axis ───────────────────
    // No phase band. The Excel sheet has none, and the repeated axis already marks
    // where one phase stops and the next begins.
    doc.setDrawColor(...BLACK);

    for (const p of axes) {
      const x = axisX(p);
      doc.setLineWidth(0.3);
      doc.rect(x, top, AXIS_W, dayH, 'S');
      doc.rect(x, top + dayH, AXIS_W, laneH, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      const label = 'Zeit';
      doc.text(label, x + AXIS_W / 2 - doc.getTextWidth(label) / 2, top + dayH * 0.7);
    }

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    for (const day of model.days) {
      const x = colX(day.from);
      const w = colX(day.from + day.span - 1) + colW - x;
      doc.setLineWidth(0.3);
      doc.rect(x, top, w, dayH, 'S');
      const label = day.sub ? `${day.label} ${day.sub}` : day.label;
      const text = truncate(doc, label, w - 1.5);
      doc.text(text, x + w / 2 - doc.getTextWidth(text) / 2, top + dayH * 0.7);
    }

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    model.columns.forEach((c, i) => {
      const x = colX(i);
      doc.setLineWidth(0.15);
      doc.rect(x, top + dayH, colW, laneH, 'S');
      const text = truncate(doc, c.label, colW - 1);
      doc.text(text, x + colW / 2 - doc.getTextWidth(text) / 2, top + dayH + laneH * 0.72);
    });

    // ── Horizontal rules: quarter hours dotted, whole hours solid black ─────
    doc.setFontSize(6.5);
    for (let m = model.startMinutes; m <= model.endMinutes; m += 15) {
      const yy = y(m);
      const onHour = m % 60 === 0;
      doc.setDrawColor(onHour ? 0 : 130);
      doc.setLineWidth(onHour ? 0.25 : 0.1);
      if (!onHour) doc.setLineDashPattern([0.5, 0.9], 0);
      doc.line(MARGIN, yy, gridRight, yy);
      doc.setLineDashPattern([], 0);
      if (onHour && m < model.endMinutes) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BLACK);
        for (const p of axes) doc.text(hhmm(m), axisX(p) + 0.9, yy + 2.4);
      }
    }

    // ── Vertical rules: day boundaries and axis edges black, lanes hairline ───
    for (let i = 0; i <= model.columns.length; i++) {
      const boundary = i === 0
        || i === model.columns.length
        || model.columns[i]!.dayIndex !== model.columns[i - 1]!.dayIndex;
      // At an axis position the column's left edge is the axis's right edge; the
      // axis's own left edge is drawn as part of the previous run.
      const xs = axes.includes(i) ? [axisX(i), colX(i)] : [colX(i)];
      for (const xx of xs) {
        doc.setDrawColor(boundary ? 0 : 150);
        doc.setLineWidth(boundary ? 0.3 : 0.1);
        doc.line(xx, gridTop, xx, gridTop + gridH);
      }
    }

    // ── Blocks ──────────────────────────────────────────────────────────────
    for (const e of model.entries) {
      const bx = colX(e.from);
      const bw = colX(e.from + e.span - 1) + colW - bx;
      const by = y(e.startMinutes);
      const bh = (e.endMinutes - e.startMinutes) * perMinute;
      if (bh <= 0.6 || bw <= 1) continue;

      // Full strength, not a tint: on the Excel sheet the colour *is* the block,
      // and the meta line rides on it rather than beside a bar.
      const fill = rgb(e.color);
      doc.setFillColor(...fill);
      doc.rect(bx, by, bw, bh, 'F');

      if (e.conflict === 'none') {
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(0.15);
      } else {
        // The one thing on the sheet that is not the plan but a verdict on it —
        // kept from the modern grid, since the Excel had no way to say it.
        doc.setDrawColor(220, 38, 38);
        doc.setLineWidth(e.conflict === 'hard' ? 0.5 : 0.3);
        if (e.conflict === 'soft') doc.setLineDashPattern([0.9, 0.9], 0);
      }
      doc.rect(bx, by, bw, bh, 'S');
      doc.setLineDashPattern([], 0);

      const hex = `#${fill.map(v => v.toString(16).padStart(2, '0')).join('')}`;
      const ink: [number, number, number] = getContrastColor(hex) === '#000000'
        ? [0, 0, 0]
        : [255, 255, 255];
      const metaInk = blend(ink, fill, 0.28);

      const pad = 0.8;
      const tx = bx + pad;
      const tw = bw - 2 * pad;
      const cx = bx + bw / 2;
      if (tw < 3) continue;

      // A 15-minute Pause is ~3 mm tall: one centred line at the smallest legible
      // size is the whole card there.
      if (bh < 4.6) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(4.6);
        doc.setTextColor(...ink);
        const text = fitLabel(doc, e.subject, tw, onShort);
        doc.text(text, cx - doc.getTextWidth(text) / 2, by + bh / 2 + 0.55);
        continue;
      }

      /**
       * Centred both ways, unlike the modern card's top-left stack: the Excel
       * block is a label on a coloured field, so it is measured first and placed
       * in the middle of what is left.
       */
      const titleSize = bh < 6 ? 5.4 : bh < 12 ? 6 : 6.6;
      const lineH = titleSize * PT * 1.25;
      const metaSize = bh < 12 ? 4.8 : 5.4;
      const metaLineH = metaSize * PT * 1.3;
      const inner = bh - 2 * pad;

      const meta = metaCell(e);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(metaSize);
      const metaLines = meta && inner >= lineH + metaLineH
        ? cardLines(doc, meta, tw, Math.min(2, Math.floor((inner - lineH) / metaLineH)), onShort)
        : [];

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(titleSize);
      const titleRoom = Math.floor((inner - metaLines.length * metaLineH) / lineH);
      const titleLines = cardLines(doc, e.subject, tw, Math.max(1, Math.min(titleRoom, 3)), onShort);

      const totalH = titleLines.length * lineH + metaLines.length * metaLineH;
      let cursor = by + Math.max(pad, (bh - totalH) / 2);
      const bottom = by + bh - pad * 0.5;

      doc.setTextColor(...ink);
      for (const line of titleLines) {
        if (cursor + lineH > bottom + 0.4) break;
        doc.text(line, cx - doc.getTextWidth(line) / 2, cursor + lineH * 0.8);
        cursor += lineH;
      }

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(metaSize);
      doc.setTextColor(...metaInk);
      for (const line of metaLines) {
        if (cursor + metaLineH > bottom + 0.4) break;
        doc.text(line, cx - doc.getTextWidth(line) / 2, cursor + metaLineH * 0.8);
        cursor += metaLineH;
      }
    }

    // ── Abbreviation key ────────────────────────────────────────────────────
    if (legend) {
      drawLegend(
        doc, legendEntries, legend,
        MARGIN, pageH - MARGIN - baseFooterH - legend.height, usableW, BLACK, [70, 70, 70],
      );
    }

    // ── Outer frame ─────────────────────────────────────────────────────────
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN, top, usableW, headerH + gridH, 'S');

    // ── Footer ──────────────────────────────────────────────────────────────
    const footY = pageH - MARGIN;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(110);
    doc.text(opts.wkName, MARGIN, footY);
    if (opts.stand) {
      doc.text(opts.stand, gridRight - doc.getTextWidth(opts.stand), footY);
    }
  };

  const doc = newDoc();
  paint(doc, resolveLegend(model.legend, newDoc, paint), () => {});
  return doc;
}
