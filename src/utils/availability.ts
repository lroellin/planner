/**
 * Unavailability windows: when a teacher or a room is *not* there.
 *
 * Modelled as exceptions rather than opening hours, because on a WK almost
 * everybody is available almost all the time — an empty list has to mean
 * "available", or every teacher would need a full week entered before the first
 * conflict check said anything true.
 */

import { nanoid } from 'nanoid';
import type { TimeWindow } from '../types';
import { DAY_NAMES } from './timeUtils';

/** Midnight to midnight. "24:00" sorts and parses above every real slot. */
export const DAY_START = '00:00';
export const DAY_END = '24:00';
export const NOON = '12:00';

export type WindowPreset = 'all-day' | 'morning' | 'afternoon' | 'custom';

const PRESET_TIMES: Record<Exclude<WindowPreset, 'custom'>, [string, string]> = {
  'all-day': [DAY_START, DAY_END],
  morning: [DAY_START, NOON],
  afternoon: [NOON, DAY_END],
};

export const PRESET_LABELS: { key: Exclude<WindowPreset, 'custom'>; label: string }[] = [
  { key: 'all-day', label: 'All day' },
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
];

/** Which preset a window's times correspond to, or 'custom'. */
export function windowPreset(w: TimeWindow): WindowPreset {
  for (const [key, [start, end]] of Object.entries(PRESET_TIMES)) {
    if (w.startTime === start && w.endTime === end) return key as WindowPreset;
  }
  return 'custom';
}

export function makeWindow(days: number[], preset: Exclude<WindowPreset, 'custom'> = 'all-day'): TimeWindow {
  const [startTime, endTime] = PRESET_TIMES[preset];
  return { id: nanoid(), days: [...days].sort((a, b) => a - b), startTime, endTime, note: '' };
}

export function presetTimes(preset: Exclude<WindowPreset, 'custom'>): [string, string] {
  return PRESET_TIMES[preset];
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Does this window cover any part of an event? Overlap is strict, matching the
 * double-booking check: an event that ends exactly when someone leaves is fine.
 */
export function windowOverlaps(
  w: TimeWindow,
  dayIndex: number,
  startTime: string,
  endTime: string,
): boolean {
  if (!w.days.includes(dayIndex)) return false;
  return minutes(startTime) < minutes(w.endTime) && minutes(w.startTime) < minutes(endTime);
}

/** "Mon, Tue" — the days a window covers, in week order. */
export function windowDayLabel(w: TimeWindow): string {
  if (w.days.length === 0) return 'no day';
  if (w.days.length === DAY_NAMES.length) return 'Mon–Fri';
  return [...w.days].sort((a, b) => a - b).map(d => DAY_NAMES[d] ?? '?').join(', ');
}

export function windowTimeLabel(w: TimeWindow): string {
  const preset = windowPreset(w);
  if (preset === 'all-day') return 'all day';
  if (preset === 'morning') return 'morning';
  if (preset === 'afternoon') return 'afternoon';
  return `${w.startTime}–${w.endTime}`;
}

/** One line for the conflict panel and the config list: "Wed, Thu · afternoon". */
export function describeWindow(w: TimeWindow): string {
  return `${windowDayLabel(w)} · ${windowTimeLabel(w)}`;
}
