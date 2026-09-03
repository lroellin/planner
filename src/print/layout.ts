import type { PrintBox, PrintDay } from './boxes';

/**
 * Where the box size actually gets decided.
 *
 * Because rows never wrap (see boxes.ts), a box's height is pure arithmetic on
 * its row count. That is the whole trick: the fitter can try every candidate
 * grid against every box without rendering a single glyph, and then pick the
 * densest A4 division on which *all* boxes still fit whole. No trial and error,
 * and the boxes of one report are all the same size by construction.
 */

export const PAGE = { width: 210, height: 297 } as const; // A4 portrait, mm
export const MARGIN = 10;
/** Cut gutter: the scissors go down its middle, leaving 3 mm of white per slip. */
export const GUTTER = 6;

export interface Grid {
  cols: number;
  rows: number;
}

/** Guillotine-friendly divisions of A4, sparsest first. */
export const GRIDS: Grid[] = [
  { cols: 1, rows: 1 },
  { cols: 1, rows: 2 },
  { cols: 2, rows: 2 },
  { cols: 2, rows: 3 },
  { cols: 2, rows: 4 },
];

export const PER_PAGE_CHOICES = GRIDS.map(g => g.cols * g.rows);

export function gridFor(perPage: number): Grid {
  return GRIDS.find(g => g.cols * g.rows === perPage) ?? GRIDS[0]!;
}

export function cellSize(grid: Grid): { width: number; height: number } {
  return {
    width: (PAGE.width - 2 * MARGIN - (grid.cols - 1) * GUTTER) / grid.cols,
    height: (PAGE.height - 2 * MARGIN - (grid.rows - 1) * GUTTER) / grid.rows,
  };
}

// ─── Type scale ───────────────────────────────────────────────────────────────

/**
 * Three tiers rather than a continuous scale: a slip is either a full sheet, a
 * half, or a quarter-ish, and each wants its own type size. Sizes are pt, all
 * distances mm (jsPDF is set up in mm).
 */
export interface Style {
  tier: 'lg' | 'md' | 'sm';
  pad: number;
  accentH: number;
  fontKicker: number;
  fontTitle: number;
  fontSummary: number;
  fontColHead: number;
  fontDay: number;
  fontRow: number;
  fontNote: number;
  fontFooter: number;
  rowH: number;
  noteH: number;
  dayHeadH: number;
  dayGap: number;
  headerH: number;
  footerH: number;
}

const STYLES: Record<Style['tier'], Style> = {
  lg: {
    tier: 'lg', pad: 6, accentH: 1.4,
    fontKicker: 7, fontTitle: 15, fontSummary: 8.5, fontColHead: 7,
    fontDay: 9, fontRow: 8.5, fontNote: 7, fontFooter: 6.5,
    rowH: 4.6, noteH: 3.4, dayHeadH: 6.0, dayGap: 2.0, headerH: 22.5, footerH: 6.4,
  },
  md: {
    tier: 'md', pad: 5, accentH: 1.2,
    fontKicker: 6.5, fontTitle: 12.5, fontSummary: 7.5, fontColHead: 6.5,
    fontDay: 8, fontRow: 7.5, fontNote: 6.5, fontFooter: 6,
    rowH: 4.4, noteH: 3.2, dayHeadH: 5.6, dayGap: 1.8, headerH: 19.2, footerH: 5.6,
  },
  sm: {
    tier: 'sm', pad: 4, accentH: 1.0,
    fontKicker: 6, fontTitle: 10.5, fontSummary: 6.8, fontColHead: 6,
    fontDay: 7, fontRow: 6.8, fontNote: 6, fontFooter: 5.5,
    rowH: 3.9, noteH: 2.9, dayHeadH: 4.9, dayGap: 1.4, headerH: 16.4, footerH: 5.0,
  },
};

export function styleFor(cell: { width: number; height: number }): Style {
  if (cell.width >= 140 && cell.height >= 200) return STYLES.lg;
  if (cell.height >= 120) return STYLES.md;
  return STYLES.sm;
}

/** Everything a box spends before its first row: chrome, padding, footer. */
export function chromeHeight(style: Style): number {
  return style.accentH + 2 * style.pad + style.headerH + style.footerH;
}

function dayHeight(day: PrintDay, style: Style): number {
  return (
    style.dayHeadH
    + day.rows.reduce((h, r) => h + style.rowH + (r.note ? style.noteH : 0), 0)
  );
}

export function boxHeight(box: PrintBox, style: Style): number {
  if (box.days.length === 0) return chromeHeight(style) + style.rowH;
  const days = box.days.reduce((h, d) => h + dayHeight(d, style) + style.dayGap, 0);
  return chromeHeight(style) + days - style.dayGap;
}

// ─── Continuation ─────────────────────────────────────────────────────────────

/**
 * A box that outgrows its cell is not shrunk and not clipped: it continues in
 * the next cell, and both slips say so. Every part repeats the full header and
 * footer, because after cutting there is no page left to tell the reader whose
 * plan they are holding.
 */
export interface BoxPart {
  box: PrintBox;
  days: PrintDay[];
  index: number; // 1-based
  total: number;
}

export function paginateBox(box: PrintBox, style: Style, cellHeight: number): BoxPart[] {
  const budget = cellHeight - chromeHeight(style);
  const parts: PrintDay[][] = [];
  let current: PrintDay[] = [];
  let used = 0;

  const flush = (): void => {
    if (current.length > 0) parts.push(current);
    current = [];
    used = 0;
  };

  for (const day of box.days) {
    let rows = day.rows;
    let label = day.label;
    while (rows.length > 0) {
      const gap = current.length > 0 ? style.dayGap : 0;
      const free = budget - used - gap - style.dayHeadH;
      // A day head stranded above one row is worse than moving the whole day on;
      // two rows is the least that reads as a day.
      const fits: number[] = [];
      let h = 0;
      for (const r of rows) {
        h += style.rowH + (r.note ? style.noteH : 0);
        if (h > free) break;
        fits.push(1);
      }
      const take = fits.length;

      if (take < Math.min(2, rows.length)) {
        if (current.length === 0) {
          // Nothing fits even on an empty part — the cell is smaller than one
          // day head plus two rows. Force progress rather than loop forever.
          const forced = rows.slice(0, Math.max(1, take));
          current.push({ label, rows: forced });
          rows = rows.slice(forced.length);
          label = `${day.label} (Forts.)`;
          flush();
          continue;
        }
        flush();
        continue;
      }

      current.push({ label, rows: rows.slice(0, take) });
      used += gap + style.dayHeadH + rows.slice(0, take)
        .reduce((n, r) => n + style.rowH + (r.note ? style.noteH : 0), 0);
      rows = rows.slice(take);
      if (rows.length > 0) {
        label = `${day.label} (Forts.)`;
        flush();
      }
    }
  }
  flush();

  if (parts.length === 0) parts.push([]);
  return parts.map((days, i) => ({ box, days, index: i + 1, total: parts.length }));
}

// ─── Choosing the grid ────────────────────────────────────────────────────────

export interface Fit {
  perPage: number;
  grid: Grid;
  cell: { width: number; height: number };
  style: Style;
  parts: BoxPart[];
  /** How many boxes had to be continued into a second slip. */
  overflowing: number;
  pages: number;
}

export function fitAt(boxes: PrintBox[], perPage: number): Fit {
  const grid = gridFor(perPage);
  const cell = cellSize(grid);
  const style = styleFor(cell);
  const parts = boxes.flatMap(b => paginateBox(b, style, cell.height));
  const overflowing = boxes.filter(b => boxHeight(b, style) > cell.height).length;
  return {
    perPage: grid.cols * grid.rows,
    grid,
    cell,
    style,
    parts,
    overflowing,
    pages: Math.max(1, Math.ceil(parts.length / (grid.cols * grid.rows))),
  };
}

/**
 * The densest division on which every box still fits whole. Denser grids come
 * first so the paper goes furthest; if even a full sheet is too small for some
 * box, that box simply continues, which is the honest answer rather than a
 * smaller font nobody can read across a Turnhalle.
 */
export function autoFit(boxes: PrintBox[]): Fit {
  for (const grid of [...GRIDS].reverse()) {
    const fit = fitAt(boxes, grid.cols * grid.rows);
    if (fit.overflowing === 0) return fit;
  }
  return fitAt(boxes, 1);
}
