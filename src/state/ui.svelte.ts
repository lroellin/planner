/**
 * View state that several distant components share: which card is selected,
 * which cards are being pointed at from the conflict panel, how tall a time slot
 * is, and the toast queue.
 *
 * It is deliberately separate from `store.svelte.ts` — none of it belongs in the
 * saved schedule, and routing it through `setState` would push undo entries for
 * merely looking at something.
 */

import type { ID } from '../types';

const PREFS_KEY = 'wk-planner-ui';

export type Density = 'compact' | 'normal' | 'comfortable';

/** Pixel height of one 15-minute slot. */
const SLOT_HEIGHT: Record<Density, number> = {
  compact: 17,
  normal: 24,
  comfortable: 32,
};

interface Prefs {
  density: Density;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { density: 'normal' };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const density = parsed.density;
    return { density: density && density in SLOT_HEIGHT ? density : 'normal' };
  } catch {
    return { density: 'normal' };
  }
}

// ─── Selection ────────────────────────────────────────────────────────────────

/** The card the keyboard and the quick-edit popover act on. */
let _selectedEventId: ID | null = $state(null);
/** Cards to pulse — driven by hovering a conflict in the right-hand panel. */
let _highlightedEventIds: ID[] = $state([]);
/** Hovering a sidebar chip dims everything that is not that subject. */
let _spotlightSubjectId: ID | null = $state(null);

export function getSelectedEventId(): ID | null { return _selectedEventId; }
export function selectEvent(id: ID | null): void { _selectedEventId = id; }

export function getHighlightedEventIds(): ID[] { return _highlightedEventIds; }
export function highlightEvents(ids: ID[]): void { _highlightedEventIds = ids; }
export function clearHighlight(): void { _highlightedEventIds = []; }

export function getSpotlightSubjectId(): ID | null { return _spotlightSubjectId; }
export function spotlightSubject(id: ID | null): void { _spotlightSubjectId = id; }

// ─── Quick-edit popover ───────────────────────────────────────────────────────

export interface QuickEdit {
  eventId: ID;
  /** Viewport rect of the card, so the popover can sit beside it. */
  anchor: { x: number; y: number; width: number; height: number };
}

let _quickEdit: QuickEdit | null = $state(null);

export function getQuickEdit(): QuickEdit | null { return _quickEdit; }
export function openQuickEdit(eventId: ID, anchor: QuickEdit['anchor']): void {
  _quickEdit = { eventId, anchor };
}
export function closeQuickEdit(): void { _quickEdit = null; }

// ─── Reveal ───────────────────────────────────────────────────────────────────

/**
 * "Show me this one." Clicking an event in the conflict panel used to open a
 * modal over the grid the user needed to look at; now it scrolls the card into
 * view and flashes it instead.
 */
let _reveal: { id: ID; token: number } | null = $state(null);
let revealToken = 0;

export function getReveal(): { id: ID; token: number } | null { return _reveal; }

export function revealEvent(id: ID): void {
  _reveal = { id, token: ++revealToken };
  _selectedEventId = id;
}

// ─── Density ──────────────────────────────────────────────────────────────────

let _density: Density = $state(loadPrefs().density);

export function getDensity(): Density { return _density; }
export function slotHeight(): number { return SLOT_HEIGHT[_density]; }

export function setDensity(density: Density): void {
  _density = density;
  applyDensity();
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ density } satisfies Prefs));
  } catch {
    // Storage unavailable — the choice simply won't survive a reload.
  }
}

/** Publishes the slot height as a CSS variable the grid rules read. */
export function applyDensity(): void {
  document.documentElement.style.setProperty('--wk-slot-h', `${SLOT_HEIGHT[_density]}px`);
}

// ─── Toasts ───────────────────────────────────────────────────────────────────

export interface Toast {
  id: number;
  message: string;
  /** Optional inline action, used by the undo/redo toasts. */
  action?: { label: string; run: () => void };
}

let _toasts: Toast[] = $state([]);
let nextToastId = 1;

export function getToasts(): Toast[] { return _toasts; }

export function toast(message: string, action?: Toast['action']): void {
  const id = nextToastId++;
  // One at a time: a burst of undos should read as a single changing line, not
  // as a growing stack the user has to wait out.
  _toasts = [{ id, message, ...(action ? { action } : {}) }];
  setTimeout(() => dismissToast(id), 4000);
}

export function dismissToast(id: number): void {
  _toasts = _toasts.filter(t => t.id !== id);
}
