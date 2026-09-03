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

/**
 * The cards the keyboard acts on. A list rather than one id: a rotation is moved
 * a lane at a time otherwise, and the same nudge has to be repeated on every
 * block of an afternoon. The last entry is the *primary* one — the quick-edit
 * popover only makes sense for a single card, so it follows that.
 */
let _selectedEventIds: ID[] = $state([]);
/** Cards to pulse — driven by hovering a conflict in the right-hand panel. */
let _highlightedEventIds: ID[] = $state([]);
/** Hovering a sidebar chip dims everything that is not that subject. */
let _spotlightSubjectId: ID | null = $state(null);

export function getSelectedEventIds(): ID[] { return _selectedEventIds; }

/** The card a single-card action applies to: the most recently added one. */
export function getSelectedEventId(): ID | null { return _selectedEventIds.at(-1) ?? null; }

export function isEventSelected(id: ID): boolean { return _selectedEventIds.includes(id); }

/** Replace the selection. `null` clears it. */
export function selectEvent(id: ID | null): void {
  _selectedEventIds = id === null ? [] : [id];
}

/** Ctrl/Cmd-click: add a card to the selection, or take it out again. */
export function toggleEventSelection(id: ID): void {
  _selectedEventIds = _selectedEventIds.includes(id)
    ? _selectedEventIds.filter(x => x !== id)
    : [..._selectedEventIds, id];
}

/** Shift-click and the marquee: add without removing what is already selected. */
export function addToSelection(ids: ID[]): void {
  const next = [..._selectedEventIds];
  for (const id of ids) if (!next.includes(id)) next.push(id);
  _selectedEventIds = next;
}

export function setSelection(ids: ID[]): void { _selectedEventIds = [...ids]; }

export function clearSelection(): void { _selectedEventIds = []; }

// ─── Marquee guard ────────────────────────────────────────────────────────────
// FullCalendar fires dateClick on mouse*up*, so a marquee that ends over an
// empty slot would open the placement picker on top of the selection it just
// made. The marquee sets this flag; the calendar consumes it once.

let dateClickGuard = false;

export function suppressNextDateClick(): void { dateClickGuard = true; }

export function consumeDateClickGuard(): boolean {
  const guarded = dateClickGuard;
  dateClickGuard = false;
  return guarded;
}

export function getHighlightedEventIds(): ID[] { return _highlightedEventIds; }
export function highlightEvents(ids: ID[]): void { _highlightedEventIds = ids; }
export function clearHighlight(): void { _highlightedEventIds = []; }

export function getSpotlightSubjectId(): ID | null { return _spotlightSubjectId; }

/**
 * Hover intent. Sweeping the pointer down a twelve-chip list used to dim and
 * undim the whole grid twelve times, because the spotlight engaged on the raw
 * `mouseenter` of every chip it crossed. Entering waits; leaving is immediate,
 * so the grid never stays dark after the pointer has gone.
 */
const SPOTLIGHT_DELAY_MS = 120;
let spotlightTimer: ReturnType<typeof setTimeout> | null = null;

export function spotlightSubject(id: ID | null): void {
  if (spotlightTimer !== null) {
    clearTimeout(spotlightTimer);
    spotlightTimer = null;
  }
  if (id === null) {
    _spotlightSubjectId = null;
    return;
  }
  // Already lit: switching between chips should not re-wait.
  if (_spotlightSubjectId !== null) {
    _spotlightSubjectId = id;
    return;
  }
  spotlightTimer = setTimeout(() => {
    spotlightTimer = null;
    _spotlightSubjectId = id;
  }, SPOTLIGHT_DELAY_MS);
}

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
  _selectedEventIds = [id];
}

// ─── Flash ────────────────────────────────────────────────────────────────────

/**
 * "It landed here." Every mutation that changes the grid somewhere the user is
 * not looking — undo, redo, a placement from a dialog, duplicate, split, copy to
 * lanes — marks its cards so the calendar can pulse them. Undo used to name the
 * action in a toast and leave the answer to "where?" to a hunt across fifty
 * cards; copy-to-lanes created four cards at once and said nothing at all.
 *
 * Separate from `reveal`: a reveal is a request to *go* to one card and always
 * scrolls, a flash marks a set that mostly already is on screen.
 */
let _flash: { ids: ID[]; token: number } | null = $state(null);
let flashToken = 0;

export function getFlash(): { ids: ID[]; token: number } | null { return _flash; }

export function flashEvents(ids: ID[]): void {
  if (ids.length === 0) return;
  _flash = { ids: [...ids], token: ++flashToken };
}

// ─── Cross-panel requests ─────────────────────────────────────────────────────

/**
 * "Place this subject, on this lane." A gap in the coverage report or on a
 * sidebar chip is the most actionable fact the app produces, and both used to be
 * inert text: the user had to memorise the pair, close the overlay, find the
 * chip and drag. App.svelte watches this and opens the placement dialog
 * prefilled.
 */
export interface PlaceRequest {
  subjectId: ID;
  /** Prefill the lane select; omitted when the caller has no particular lane. */
  groupId?: ID;
  dayIndex?: number;
  token: number;
}

let _placeRequest: PlaceRequest | null = $state(null);
let placeToken = 0;

export function getPlaceRequest(): PlaceRequest | null { return _placeRequest; }

export function requestPlacement(subjectId: ID, opts: { groupId?: ID; dayIndex?: number } = {}): void {
  _placeRequest = { subjectId, ...opts, token: ++placeToken };
}

export function clearPlaceRequest(): void { _placeRequest = null; }

/**
 * "Open Konfiguration on this tab." The empty state has to be able to send a new
 * user to the one screen where a Thema can be created; nothing else in the app
 * links there, which is how a fresh plan came to have no way forward at all.
 */
export type ConfigTab = 'groups' | 'phases' | 'teachers' | 'rooms' | 'subjects' | 'plan';

let _configRequest: { tab: ConfigTab; createSubject?: boolean; token: number } | null = $state(null);
let configToken = 0;

export function getConfigRequest(): { tab: ConfigTab; createSubject?: boolean; token: number } | null {
  return _configRequest;
}

export function requestConfig(tab: ConfigTab, opts: { createSubject?: boolean } = {}): void {
  _configRequest = { tab, ...opts, token: ++configToken };
}

export function clearConfigRequest(): void { _configRequest = null; }

/**
 * "Show me those Lektionen." The Ausbildner and Raum panes report a Pensum
 * and a Belegung you could not then look at — a count with no way through to
 * what it counts, while the conflict panel next door has had "im Kalender
 * zeigen" all along. `filter` preselects the report's own dropdown.
 */
export interface ReportRequest {
  tab: 'coverage' | 'groups' | 'teachers' | 'rooms';
  filterId?: ID;
  token: number;
}

let _reportRequest: ReportRequest | null = $state(null);
let reportToken = 0;

export function getReportRequest(): ReportRequest | null { return _reportRequest; }

export function requestReport(tab: ReportRequest['tab'], filterId?: ID): void {
  _reportRequest = { tab, ...(filterId !== undefined ? { filterId } : {}), token: ++reportToken };
}

export function clearReportRequest(): void { _reportRequest = null; }

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
