import { jsPDF } from 'jspdf';
import type { PrintCell, PrintDoc } from './boxes';
import { TARGET_LABELS } from './boxes';
import {
  GUTTER, MARGIN, autoFit, cellSize, fitAt, gridFor, pageSize, styleFor,
  type BoxPart, type Fit, type Orientation, type Style,
} from './layout';

/**
 * Draws the fitted boxes onto A4.
 *
 * Everything here is absolute geometry — no flow, no page breaks to negotiate —
 * because layout.ts already decided which slip goes in which cell. The only job
 * left is putting glyphs at coordinates and drawing the marks you cut along.
 *
 * jsPDF's built-in Helvetica is WinAnsi-encoded, which covers the umlauts and ß
 * this app is full of, so no font is embedded and the bundle stays small.
 */

const PT = 0.352778; // pt → mm
const GREY = 118;
const FAINT = 224;

export interface RenderOptions {
  /** Course name, printed in every box's footer. */
  wkName: string;
  /** "Stand: 3.9.2026, 14:20" — or null when the checkbox is off. */
  stand: string | null;
  /** Boxes per page, or 'auto' to let the fitter decide. */
  perPage: number | 'auto';
  /** Quer or Hoch. Changes the cell shape, so the fitter has to know too. */
  orientation: Orientation;
}

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [30, 41, 59];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Toward white — used so a muted row's colour dot stays a hint, not a shout. */
function fade([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount),
  ];
}

function truncate(doc: jsPDF, text: string, maxWidth: number): string {
  if (text === '' || doc.getTextWidth(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * Full name, else the short form the app already derives for narrow calendar
 * lanes, else an ellipsis. "Theoriesaal 1" losing its number to become
 * "Theoriesa…" is the failure this exists to prevent — on a room sheet the
 * number is the half that matters.
 */
function fitCell(doc: jsPDF, value: PrintCell, maxWidth: number): string {
  if (doc.getTextWidth(value.full) <= maxWidth) return value.full;
  if (value.short && doc.getTextWidth(value.short) <= maxWidth) return value.short;
  return truncate(doc, value.short || value.full, maxWidth);
}

interface Columns {
  timeW: number;
  dotX: number;
  subjectX: number;
  subjectW: number;
  whoX: number;
  whoW: number;
  whereX: number;
  whereW: number;
}

/**
 * Share `total` between columns: everyone gets at least what their fallback
 * needs, and the rest is handed out in proportion to how much each column is
 * still short of its full text. Only when even the fallbacks do not fit is
 * anything scaled below its floor.
 */
function allocate(natural: number[], floor: number[], total: number): number[] {
  const naturalSum = natural.reduce((a, b) => a + b, 0);
  if (naturalSum <= total) {
    // Slack goes to the Thema: the one column that ever wants to be wider.
    const out = [...natural];
    out[0] = out[0]! + (total - naturalSum);
    return out;
  }

  const floorSum = floor.reduce((a, b) => a + b, 0);
  if (floorSum > total) return floor.map(f => (f / floorSum) * total);

  const want = natural.map((n, i) => Math.max(0, n - floor[i]!));
  const wantSum = want.reduce((a, b) => a + b, 0);
  if (wantSum === 0) return floor;
  const extra = total - floorSum;
  return floor.map((f, i) => f + (want[i]! / wantSum) * extra);
}

/**
 * Column widths are measured from the content, once for the whole document, so
 * every slip of one report divides its width the same way — and so a report of
 * short Themen does not reserve half its width for names that are not there.
 * Slack goes to the Thema, which is the column that runs long.
 */
function columnsFor(doc: jsPDF, docModel: PrintDoc, style: Style, x0: number, contentW: number): Columns {
  doc.setFontSize(style.fontRow);
  const timeW = doc.getTextWidth('00:00–00:00') + 1.5;
  const dotGutter = style.tier === 'sm' ? 3.0 : 3.8;
  const rest = contentW - timeW - dotGutter;

  const rows = docModel.boxes.flatMap(b => b.days.flatMap(d => d.rows));
  const width = (pick: (r: (typeof rows)[number]) => string, bold: boolean): number => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    return rows.reduce((w, r) => Math.max(w, doc.getTextWidth(pick(r))), 0) + 2;
  };

  // Two numbers per column: what it needs for the full text, and what it needs
  // for the short form it may fall back to. The short widths are floors — a
  // column is only ever ellipsised once even "G1 G2 G3" will not fit, which is
  // the difference between a readable slip and "G1 …".
  const natural = [
    width(r => r.subject.full, true),
    width(r => r.who.full, false),
    width(r => r.where.full, false),
  ];
  // Capped: a floor is a claim on the row, and a column whose fallback is as
  // long as its full text (a Thema with no short name) would otherwise take the
  // width out of the other two rather than accept an ellipsis of its own.
  const caps = [0.45, 0.24, 0.30];
  const floor = [
    width(r => r.subject.short, true),
    width(r => r.who.short, false),
    width(r => r.where.short, false),
  ].map((f, i) => Math.min(f, rest * caps[i]!));

  const widths = allocate(natural, floor, rest);
  const [subjectW, whoW, whereW] = widths as [number, number, number];

  doc.setFont('helvetica', 'normal');
  const subjectX = x0 + timeW + dotGutter;
  return {
    timeW,
    dotX: x0 + timeW + dotGutter / 2,
    subjectX,
    // Allocations are column pitch; the 2 mm each measurement added is the
    // gutter, so the drawable width is the pitch less that gutter.
    subjectW: subjectW - 2,
    whoX: subjectX + subjectW,
    whoW: whoW - 2,
    whereX: subjectX + subjectW + whoW,
    whereW,
  };
}

function drawBox(
  doc: jsPDF,
  part: BoxPart,
  rect: { x: number; y: number; w: number; h: number },
  style: Style,
  docModel: PrintDoc,
  opts: RenderOptions,
): void {
  const { x, y, w, h } = rect;
  const { box } = part;
  const x0 = x + style.pad;
  const contentW = w - 2 * style.pad;

  // Accent rule along the top: the one piece of the sheet you can identify from
  // across the room once it is on a wall.
  doc.setFillColor(...rgb(box.accent));
  doc.rect(x, y, w, style.accentH, 'F');

  let cursor = y + style.accentH + style.pad;

  const kickerH = style.fontKicker * PT * 1.25;
  const titleH = style.fontTitle * PT * 1.15;
  const summaryH = style.fontSummary * PT * 1.35;
  const colHeadH = style.fontColHead * PT * 1.6;
  const gap = Math.max(1, style.headerH - kickerH - titleH - summaryH - colHeadH);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(style.fontKicker);
  doc.setTextColor(GREY);
  const kicker = part.total > 1
    ? `${box.kicker} · Blatt ${part.index}/${part.total}`
    : box.kicker;
  doc.text(kicker, x0, cursor + kickerH * 0.78);
  cursor += kickerH;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(style.fontTitle);
  doc.setTextColor(17, 24, 39);
  doc.text(truncate(doc, box.title, contentW), x0, cursor + titleH * 0.78);
  cursor += titleH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(style.fontSummary);
  doc.setTextColor(GREY);
  doc.text(truncate(doc, box.summary, contentW), x0, cursor + summaryH * 0.75);
  cursor += summaryH + gap;

  const cols = columnsFor(doc, docModel, style, x0, contentW);

  doc.setFontSize(style.fontColHead);
  doc.setTextColor(150);
  const [cTime, cSubject, cWho, cWhere] = docModel.columns;
  // Heads are truncated against their own column: they lose to the data, which
  // is what the column is for.
  const headY = cursor + colHeadH * 0.6;
  doc.text(cTime!, x0, headY);
  doc.text(truncate(doc, cSubject!, cols.subjectW), cols.subjectX, headY);
  doc.text(truncate(doc, cWho!, cols.whoW), cols.whoX, headY);
  doc.text(truncate(doc, cWhere!, cols.whereW), cols.whereX, headY);
  cursor += colHeadH;

  doc.setDrawColor(205);
  doc.setLineWidth(0.2);
  doc.line(x0, cursor - 0.6, x0 + contentW, cursor - 0.6);

  // ── Days ──────────────────────────────────────────────────────────────────
  if (part.days.length === 0) {
    doc.setFontSize(style.fontRow);
    doc.setTextColor(GREY);
    doc.text(box.emptyNote, x0, cursor + style.rowH * 0.72);
  }

  for (const [i, day] of part.days.entries()) {
    if (i > 0) cursor += style.dayGap;

    doc.setFillColor(241, 245, 249);
    doc.rect(x0, cursor, contentW, style.dayHeadH - 0.9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(style.fontDay);
    doc.setTextColor(51, 65, 85);
    doc.text(day.label, x0 + 1.4, cursor + (style.dayHeadH - 0.9) * 0.72);
    cursor += style.dayHeadH;

    for (const row of day.rows) {
      if (row.muted) {
        doc.setFillColor(249, 250, 251);
        doc.rect(x0, cursor - 0.3, contentW, style.rowH, 'F');
      }
      const baseline = cursor + style.rowH * 0.72;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(style.fontRow);
      doc.setTextColor(row.muted ? 140 : 55);
      doc.text(row.time, x0, baseline);

      const dot = rgb(row.color);
      doc.setFillColor(...(row.muted ? fade(dot, 0.55) : dot));
      doc.circle(cols.dotX, baseline - style.fontRow * PT * 0.28, style.tier === 'sm' ? 0.75 : 0.95, 'F');

      doc.setFont('helvetica', row.muted ? 'normal' : 'bold');
      doc.setTextColor(row.muted ? 140 : 17);
      doc.text(fitCell(doc, row.subject, cols.subjectW), cols.subjectX, baseline);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(row.muted ? 150 : 71);
      doc.text(fitCell(doc, row.who, cols.whoW), cols.whoX, baseline);
      doc.text(fitCell(doc, row.where, cols.whereW), cols.whereX, baseline);
      cursor += style.rowH;

      if (row.note) {
        doc.setFontSize(style.fontNote);
        doc.setTextColor(150);
        doc.text(
          truncate(doc, row.note, contentW - (cols.subjectX - x0)),
          cols.subjectX,
          cursor + style.noteH * 0.72,
        );
        cursor += style.noteH;
      }
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  // A cut slip has no page around it, so whose plan this is and how old it is
  // have to travel with the slip itself.
  const footY = y + h - style.pad - style.footerH;
  doc.setDrawColor(FAINT);
  doc.setLineWidth(0.2);
  doc.line(x0, footY + 1.2, x0 + contentW, footY + 1.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(style.fontFooter);
  doc.setTextColor(150);
  doc.text(truncate(doc, opts.wkName, contentW * 0.6), x0, footY + style.footerH - 0.4);
  if (opts.stand) {
    const stand = truncate(doc, opts.stand, contentW * 0.4);
    doc.text(stand, x0 + contentW - doc.getTextWidth(stand), footY + style.footerH - 0.4);
  }
}

/**
 * Where to cut. Ticks live in the page margin rather than as borders around the
 * boxes: a printed border that lands 1 mm off the cut reads as a crooked slip,
 * where a tick is gone the moment you have used it. The dotted guides down the
 * gutters are for scissors; they sit on the trim edge.
 */
function drawCutMarks(
  doc: jsPDF,
  grid: { cols: number; rows: number },
  cell: { width: number; height: number },
  page: { width: number; height: number },
): void {
  const xs = [MARGIN];
  for (let c = 1; c < grid.cols; c++) xs.push(MARGIN + c * (cell.width + GUTTER) - GUTTER / 2);
  xs.push(page.width - MARGIN);

  const ys = [MARGIN];
  for (let r = 1; r < grid.rows; r++) ys.push(MARGIN + r * (cell.height + GUTTER) - GUTTER / 2);
  ys.push(page.height - MARGIN);

  doc.setLineWidth(0.25);
  doc.setDrawColor(90);
  for (const x of xs) {
    doc.line(x, 3.5, x, MARGIN - 2);
    doc.line(x, page.height - MARGIN + 2, x, page.height - 3.5);
  }
  for (const y of ys) {
    doc.line(3.5, y, MARGIN - 2, y);
    doc.line(page.width - MARGIN + 2, y, page.width - 3.5, y);
  }

  doc.setDrawColor(212);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([0.8, 1.2], 0);
  for (const x of xs.slice(1, -1)) doc.line(x, MARGIN, x, page.height - MARGIN);
  for (const y of ys.slice(1, -1)) doc.line(MARGIN, y, page.width - MARGIN, y);
  doc.setLineDashPattern([], 0);
}

export function resolveFit(
  docModel: PrintDoc,
  perPage: number | 'auto',
  orientation: Orientation,
): Fit {
  return perPage === 'auto'
    ? autoFit(docModel.boxes, orientation)
    : fitAt(docModel.boxes, perPage, orientation);
}

export function renderPdf(docModel: PrintDoc, opts: RenderOptions): jsPDF {
  const fit = resolveFit(docModel, opts.perPage, opts.orientation);
  const grid = fit.grid;
  const cell = fit.cell;
  const style = fit.style;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: opts.orientation });
  doc.setProperties({
    title: `${TARGET_LABELS[docModel.target]} – ${opts.wkName}`,
    creator: 'WK-Planer',
  });

  if (fit.parts.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(GREY);
    doc.text('Nichts zu drucken.', MARGIN, MARGIN + 8);
    return doc;
  }

  fit.parts.forEach((part, i) => {
    const slot = i % fit.perPage;
    if (i > 0 && slot === 0) doc.addPage();
    if (slot === 0) drawCutMarks(doc, grid, cell, pageSize(opts.orientation));

    const col = slot % grid.cols;
    const row = Math.floor(slot / grid.cols);
    drawBox(
      doc,
      part,
      {
        x: MARGIN + col * (cell.width + GUTTER),
        y: MARGIN + row * (cell.height + GUTTER),
        w: cell.width,
        h: cell.height,
      },
      style,
      docModel,
      opts,
    );
  });

  return doc;
}

/** "Stand: 3.9.2026, 14:20" */
export function standLabel(now = new Date()): string {
  const d = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `Stand: ${d}, ${t}`;
}

export { cellSize, gridFor, styleFor };
