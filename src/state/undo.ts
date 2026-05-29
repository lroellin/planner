import type { AppState } from '../types';

const MAX_DEPTH = 50;
let past: AppState[] = [];
let future: AppState[] = [];

// JSON round-trip is safe with plain objects (no reactive proxies, no Dates in our model)
function deepClone(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}

export function pushUndo(state: AppState): void {
  past.push(deepClone(state));
  if (past.length > MAX_DEPTH) past.shift();
  future = [];
}

export function undoState(current: AppState): AppState | null {
  if (past.length === 0) return null;
  future.push(deepClone(current));
  return past.pop()!;
}

export function redoState(current: AppState): AppState | null {
  if (future.length === 0) return null;
  past.push(deepClone(current));
  return future.pop()!;
}

export function canUndo(): boolean { return past.length > 0; }
export function canRedo(): boolean { return future.length > 0; }
