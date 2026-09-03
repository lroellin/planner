import type { jsPDF } from 'jspdf';
import type { PrintCell } from './boxes';

/**
 * The drawing primitives both week-grid renderers need.
 *
 * `calendarPdf.ts` kept these private until `calendarClassicPdf.ts` turned up
 * needing the same six. They are pure geometry and string fitting — nothing here
 * knows which of the two sheets it is drawing.
 */

/** Points to millimetres: jsPDF works in mm, font sizes are in pt. */
export const PT = 0.352778;

export function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [120, 120, 120];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Toward white by `amount` (1 = white). */
export function mix(
  [r, g, b]: [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount),
  ];
}

/** Blend two colours; `amount` is how far from `a` toward `b`. */
export function blend(
  [r1, g1, b1]: [number, number, number],
  [r2, g2, b2]: [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    Math.round(r1 + (r2 - r1) * amount),
    Math.round(g1 + (g2 - g1) * amount),
    Math.round(b1 + (b2 - b1) * amount),
  ];
}

export function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function truncate(doc: jsPDF, text: string, maxWidth: number): string {
  if (text === '' || doc.getTextWidth(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Wrapped lines for a card, falling back to the short name before truncating. */
export function cardLines(
  doc: jsPDF,
  value: PrintCell,
  width: number,
  maxLines: number,
): string[] {
  if (maxLines <= 0) return [];
  let lines = doc.splitTextToSize(value.full, width) as string[];
  if (lines.length > maxLines && value.short !== value.full) {
    lines = doc.splitTextToSize(value.short, width) as string[];
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = truncate(doc, kept[maxLines - 1]!, width);
  return kept;
}
