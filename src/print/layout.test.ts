import { describe, expect, it } from 'vitest';
import type { PrintBox, PrintDay } from './boxes';
import {
  autoFit, boxHeight, cellSize, chromeHeight, fitAt, gridFor, grids, pageSize, paginateBox,
  styleFor,
} from './layout';

function day(label: string, rows: number, withNote = false): PrintDay {
  return {
    label,
    rows: Array.from({ length: rows }, (_, i) => ({
      time: `0${i}:00–0${i}:45`,
      color: '#4299e1',
      subject: { full: `Thema ${i}`, short: `T${i}` },
      who: { full: 'Anna Müller', short: 'AM' },
      where: { full: 'Seminarraum 1', short: 'Sem1' },
      note: withNote ? 'Stellvertretung für Beat Zwahlen' : '',
      muted: false,
    })),
  };
}

function box(key: string, days: PrintDay[]): PrintBox {
  return {
    key,
    kicker: 'Gruppenplan',
    title: `Gruppe ${key}`,
    summary: '4 Lektionen · 6 h Unterricht',
    accent: '#475569',
    days,
    emptyNote: 'Nichts geplant.',
  };
}

const A4_CELL = cellSize({ cols: 1, rows: 1 }, 'portrait');

describe('cellSize', () => {
  it.each(['portrait', 'landscape'] as const)('fills the printable area exactly (%s)', o => {
    const page = pageSize(o);
    for (const grid of grids(o)) {
      const cell = cellSize(grid, o);
      expect(cell.width * grid.cols + (grid.cols - 1) * 6).toBeCloseTo(page.width - 20, 6);
      expect(cell.height * grid.rows + (grid.rows - 1) * 6).toBeCloseTo(page.height - 20, 6);
    }
  });

  it('offers the same counts either way, so the buttons need no relabelling', () => {
    const portrait = grids('portrait').map(g => g.cols * g.rows);
    const landscape = grids('landscape').map(g => g.cols * g.rows);
    expect(portrait).toEqual(landscape);
    expect(new Set(portrait).size).toBe(portrait.length);
  });

  it('transposes the divisions for Quer', () => {
    expect(gridFor(2, 'portrait')).toEqual({ cols: 1, rows: 2 });
    expect(gridFor(2, 'landscape')).toEqual({ cols: 2, rows: 1 });
    expect(gridFor(4, 'portrait')).toEqual({ cols: 2, rows: 2 });
    expect(gridFor(6, 'landscape')).toEqual({ cols: 3, rows: 2 });
  });

  it('treats a full sheet as the large tier in both orientations', () => {
    expect(styleFor(cellSize({ cols: 1, rows: 1 }, 'portrait')).tier).toBe('lg');
    expect(styleFor(cellSize({ cols: 1, rows: 1 }, 'landscape')).tier).toBe('lg');
  });

  it('keeps the portrait tiers exactly where they were', () => {
    const tier = (n: number) => styleFor(cellSize(gridFor(n, 'portrait'), 'portrait')).tier;
    expect([1, 2, 4, 6, 8].map(tier)).toEqual(['lg', 'md', 'md', 'sm', 'sm']);
  });
});

describe('boxHeight', () => {
  it('grows by exactly one row height per row', () => {
    const style = styleFor(A4_CELL);
    const four = boxHeight(box('a', [day('Mi', 4)]), style);
    const five = boxHeight(box('a', [day('Mi', 5)]), style);
    expect(five - four).toBeCloseTo(style.rowH, 6);
  });

  it('charges a note line only for rows that carry one', () => {
    const style = styleFor(A4_CELL);
    const plain = boxHeight(box('a', [day('Mi', 3)]), style);
    const noted = boxHeight(box('a', [day('Mi', 3, true)]), style);
    expect(noted - plain).toBeCloseTo(3 * style.noteH, 6);
  });

  it('never charges a trailing gap after the last day', () => {
    const style = styleFor(A4_CELL);
    const one = boxHeight(box('a', [day('Mi', 2)]), style);
    const two = boxHeight(box('a', [day('Mi', 2), day('Do', 2)]), style);
    expect(two - one).toBeCloseTo(style.dayGap + style.dayHeadH + 2 * style.rowH, 6);
  });

  it('leaves room for the empty note when there is nothing to list', () => {
    const style = styleFor(A4_CELL);
    expect(boxHeight(box('a', []), style)).toBeGreaterThan(chromeHeight(style));
  });
});

describe('paginateBox', () => {
  const style = styleFor(A4_CELL);

  it('keeps a box that fits in a single part', () => {
    const parts = paginateBox(box('a', [day('Mi', 6)]), style, A4_CELL.height);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.total).toBe(1);
    expect(parts[0]!.days[0]!.rows).toHaveLength(6);
  });

  it('continues into further parts and loses no row', () => {
    const big = box('a', [day('Mo', 20), day('Di', 20), day('Mi', 20)]);
    const parts = paginateBox(big, style, 70);
    expect(parts.length).toBeGreaterThan(1);
    const rows = parts.flatMap(p => p.days.flatMap(d => d.rows));
    expect(rows).toHaveLength(60);
    expect(parts.every(p => p.total === parts.length)).toBe(true);
    expect(parts.map(p => p.index)).toEqual(parts.map((_, i) => i + 1));
  });

  it('marks a day that had to be split so the second slip says so', () => {
    const parts = paginateBox(box('a', [day('Mo', 40)]), style, 70);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[1]!.days[0]!.label).toContain('Forts.');
  });

  it('never strands a day head above a single row', () => {
    const parts = paginateBox(box('a', [day('Mo', 9), day('Di', 9)]), style, 80);
    for (const part of parts) {
      for (const d of part.days) expect(d.rows.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('terminates even when a cell is far too small for one row', () => {
    const parts = paginateBox(box('a', [day('Mo', 5)]), style, chromeHeight(style) + 1);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.flatMap(p => p.days.flatMap(d => d.rows))).toHaveLength(5);
  });
});

describe('autoFit', () => {
  it('picks the densest grid on which every box still fits whole', () => {
    const small = Array.from({ length: 6 }, (_, i) => box(`g${i}`, [day('Mi', 2)]));
    const fit = autoFit(small, 'portrait');
    expect(fit.overflowing).toBe(0);
    expect(fit.perPage).toBe(8);
    // Denser is not on offer, and one step sparser would waste paper.
    expect(fit.pages).toBe(1);
  });

  it('falls back to a sparser grid as the boxes grow', () => {
    const week = [day('Mo', 8), day('Di', 8), day('Mi', 8), day('Do', 8), day('Fr', 8)];
    const fit = autoFit([box('a', week), box('b', week)], 'portrait');
    expect(fit.overflowing).toBe(0);
    expect(fit.perPage).toBeLessThan(8);
  });

  it('accepts continuation rather than shrinking past the sparsest grid', () => {
    const huge = [box('a', [day('Mo', 60), day('Di', 60)])];
    const fit = autoFit(huge, 'portrait');
    expect(fit.perPage).toBe(1);
    expect(fit.overflowing).toBe(1);
    expect(fit.parts.length).toBeGreaterThan(1);
    expect(fit.pages).toBe(fit.parts.length);
  });

  it('reports a page count that matches the parts it produced', () => {
    const boxes = Array.from({ length: 7 }, (_, i) => box(`g${i}`, [day('Mi', 3)]));
    const fit = autoFit(boxes, 'portrait');
    expect(fit.pages).toBe(Math.ceil(fit.parts.length / fit.perPage));
  });
});

describe('autoFit in Quer', () => {
  it('solves against the landscape sheet and says so', () => {
    const boxes = Array.from({ length: 4 }, (_, i) => box(`g${i}`, [day('Mi', 3)]));
    const fit = autoFit(boxes, 'landscape');
    expect(fit.orientation).toBe('landscape');
    // Landscape divisions are the transposed ones: wider than they are tall.
    expect(fit.grid.cols).toBeGreaterThanOrEqual(fit.grid.rows);
    expect(fit.cell.width * fit.grid.cols + (fit.grid.cols - 1) * 6).toBeCloseTo(277, 6);
  });

  it('turns a short, wide box into a denser sheet than portrait would', () => {
    // Few rows, so height is not the binding constraint — Quer then fits the
    // same slips on a shallower cell.
    const boxes = Array.from({ length: 8 }, (_, i) => box(`g${i}`, [day('Mi', 2)]));
    expect(autoFit(boxes, 'landscape').overflowing).toBe(0);
    expect(autoFit(boxes, 'portrait').overflowing).toBe(0);
  });

  it('honours an explicit count in Quer too', () => {
    const fit = fitAt([box('a', [day('Mi', 2)])], 6, 'landscape');
    expect(fit.perPage).toBe(6);
    expect(fit.grid).toEqual({ cols: 3, rows: 2 });
    expect(fit.orientation).toBe('landscape');
  });
});

describe('fitAt', () => {
  it('honours an explicit choice even when it overflows', () => {
    const week = [day('Mo', 10), day('Di', 10), day('Mi', 10), day('Do', 10)];
    const fit = fitAt([box('a', week)], 8, 'portrait');
    expect(fit.perPage).toBe(8);
    expect(fit.overflowing).toBe(1);
  });

  it('agrees with boxHeight about what overflows', () => {
    const boxes = [box('a', [day('Mi', 3)]), box('b', [day('Mi', 30)])];
    const fit = fitAt(boxes, 4, 'portrait');
    const tooTall = boxes.filter(b => boxHeight(b, fit.style) > fit.cell.height);
    expect(fit.overflowing).toBe(tooTall.length);
  });
});
