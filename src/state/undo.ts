import type { AppState } from '../types';

const MAX_DEPTH = 50;

/**
 * Each entry carries the state to restore *and* a label naming the action that
 * moved away from it, so undo can report what it just took back instead of
 * changing the schedule silently.
 */
export interface UndoEntry {
  state: AppState;
  label: string;
}

let past: UndoEntry[] = [];
let future: UndoEntry[] = [];

// JSON round-trip is safe with plain objects (no reactive proxies, no Dates in our model)
function deepClone(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}

export function pushUndo(state: AppState, label: string): void {
  past.push({ state: deepClone(state), label });
  if (past.length > MAX_DEPTH) past.shift();
  future = [];
}

export function undoState(current: AppState): UndoEntry | null {
  if (past.length === 0) return null;
  const entry = past.pop()!;
  // The label travels with the action, not with the state: redoing this is
  // redoing the same action that was just undone.
  future.push({ state: deepClone(current), label: entry.label });
  return entry;
}

export function redoState(current: AppState): UndoEntry | null {
  if (future.length === 0) return null;
  const entry = future.pop()!;
  past.push({ state: deepClone(current), label: entry.label });
  if (past.length > MAX_DEPTH) past.shift();
  return entry;
}

export function canUndo(): boolean { return past.length > 0; }
export function canRedo(): boolean { return future.length > 0; }

/** The action undo would take back / redo would reapply — for button tooltips. */
export function peekUndoLabel(): string | null { return past.at(-1)?.label ?? null; }
export function peekRedoLabel(): string | null { return future.at(-1)?.label ?? null; }

/**
 * The actions undo would take back, most recent first — the history menu.
 * Pressing Ctrl+Z five times and watching the grid to work out where you have
 * landed is not a way to go back to before lunch was moved.
 */
export function undoLabels(limit = MAX_DEPTH): string[] {
  return past.slice(-limit).reverse().map(entry => entry.label);
}

export function clearUndo(): void {
  past = [];
  future = [];
}
