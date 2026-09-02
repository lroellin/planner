import { nanoid } from "nanoid";
import type { AppState, CalendarEvent } from "../types";
import { formatDate } from "../utils/timeUtils";

const STATE_KEY = "wk-planner-state";
const CURRENT_VERSION = 5;

// A colour picker fires an input event per mouse move, so writes are coalesced
// into one per frame-ish window instead of one per event. Anything still pending
// is flushed before the page goes away.
const SAVE_DEBOUNCE_MS = 200;

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return formatDate(d);
}

export function createDefaultState(): AppState {
  const teacherId = nanoid();
  const roomId = nanoid();
  const kaderId = nanoid();
  const groupIds = [nanoid(), nanoid(), nanoid()];
  const kaderPhaseId = nanoid();
  const gruppenPhaseId = nanoid();

  return {
    version: CURRENT_VERSION,
    wkStartDate: nextMonday(),
    groups: [
      { id: kaderId, label: "K", enabled: true, order: 0 },
      { id: groupIds[0]!, label: "G1", enabled: true, order: 1 },
      { id: groupIds[1]!, label: "G2", enabled: true, order: 2 },
      { id: groupIds[2]!, label: "G3", enabled: true, order: 3 },
    ],
    phases: [
      {
        id: kaderPhaseId,
        label: "KVK",
        startDay: 0,
        endDay: 1,
        groupIds: [kaderId],
      },
      {
        id: gruppenPhaseId,
        label: "WK",
        startDay: 2,
        endDay: 4,
        groupIds,
      },
    ],
    teachers: [],
    rooms: [],
    subjects: [
      {
        id: nanoid(),
        name: "Mittagessen",
        color: "#a0aec0",
        defaultTeacherIds: [],
        defaultRoomId: null,
        defaultDurationMinutes: 60,
        isBreak: true,
        isMultiGroup: true,
        phaseId: null,
      },
      {
        id: nanoid(),
        name: "Pause",
        color: "#cbd5e0",
        defaultTeacherIds: [],
        defaultRoomId: null,
        defaultDurationMinutes: 15,
        isBreak: true,
        isMultiGroup: false,
        phaseId: null,
      },
    ],
    events: [],
  };
}

function stripConflicts(state: AppState): AppState {
  return {
    ...state,
    events: state.events.map(
      ({ conflicts: _omit, ...ev }) => ev as CalendarEvent,
    ),
  };
}

let pending: AppState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function writeNow(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pending === null) return;
  const toWrite = pending;
  pending = null;
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(stripConflicts(toWrite)));
  } catch {
    // localStorage full or unavailable
  }
}

export function saveState(state: AppState): void {
  pending = state;
  if (saveTimer === null) saveTimer = setTimeout(writeNow, SAVE_DEBOUNCE_MS);
}

/** Write any debounced state immediately. */
export function flushSave(): void {
  writeNow();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", writeNow);
  window.addEventListener("pagehide", writeNow);
}

/**
 * Shape check, not a migration. The app is WIP and version bumps intentionally
 * reset — but a truncated or hand-edited entry used to be cast straight to
 * AppState and crash on first render, with no way back except devtools.
 */
export function isValidState(value: unknown): value is AppState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<AppState>;
  return (
    typeof s.wkStartDate === "string" &&
    Array.isArray(s.teachers) &&
    Array.isArray(s.rooms) &&
    Array.isArray(s.subjects) &&
    Array.isArray(s.groups) &&
    Array.isArray(s.phases) &&
    Array.isArray(s.events)
  );
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return seedDefaultState();

    const parsed: unknown = JSON.parse(raw);

    if (!isValidState(parsed)) return createDefaultState();

    if (parsed.version !== CURRENT_VERSION) {
      const keepOld = window.confirm(
        `Saved data format is incompatible (stored: v${parsed.version ?? "?"}, current: v${CURRENT_VERSION}).\n\n` +
          `Press OK to reset to defaults, or Cancel to try loading the old data (may be unstable).`,
      );
      if (keepOld) return createDefaultState();
      // User chose to keep old data — it passed the shape check, but individual
      // fields may still mean something different in this version.
      return parsed;
    }

    return parsed;
  } catch {
    return createDefaultState();
  }
}

function seedDefaultState(): AppState {
  const state = createDefaultState();
  saveState(state);
  return state;
}
