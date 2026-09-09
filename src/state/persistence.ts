import { nanoid } from "nanoid";
import type { AppState, CalendarEvent } from "../types";
import { formatDate } from "../utils/timeUtils";
import { migrateState } from "./migrations";

const STATE_KEY = "wk-planner-state";
export const CURRENT_VERSION = 14;

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

  const monday = nextMonday();

  return {
    version: CURRENT_VERSION,
    name: `WK ${monday.slice(0, 4)}`,
    lastExportedAt: null,
    wkStartDate: monday,
    // null = derive the drawn hours from the plan; see AppState.gridStartTime.
    gridStartTime: null,
    gridEndTime: null,
    groups: [
      { id: kaderId, label: "K", enabled: true, order: 0, excludeFromCoverage: false },
      { id: groupIds[0]!, label: "G1", enabled: true, order: 1, excludeFromCoverage: false },
      { id: groupIds[1]!, label: "G2", enabled: true, order: 2, excludeFromCoverage: false },
      { id: groupIds[2]!, label: "G3", enabled: true, order: 3, excludeFromCoverage: false },
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
        shortName: "",
        color: "#a0aec0",
        defaultTeacherIds: [],
        defaultRoomId: null,
        defaultDurationMinutes: 60,
        kind: "break",
        isMultiGroup: true,
        optional: false,
        phaseId: null,
        content: { goals: [], notes: "" },
      },
      {
        id: nanoid(),
        name: "Pause",
        shortName: "",
        color: "#cbd5e0",
        defaultTeacherIds: [],
        defaultRoomId: null,
        defaultDurationMinutes: 15,
        kind: "break",
        isMultiGroup: false,
        optional: false,
        phaseId: null,
        content: { goals: [], notes: "" },
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
 * Shape check, not a migration — see ./migrations.ts for those. A truncated or
 * hand-edited entry used to be cast straight to AppState and crash on first
 * render, with no way back except devtools.
 */
export function isValidState(value: unknown): value is AppState {
  return isMigratableState(value) && Array.isArray((value as Partial<AppState>).phases);
}

/**
 * The check that runs *before* the migration chain, where `phases` cannot be
 * required: the field only exists from v4 on, and demanding it here is what made
 * every pre-phase store fail the shape check and get silently replaced by a
 * fresh default — the migration steps for it were never reached. Everything
 * listed below has been in the model since v1.
 */
export function isMigratableState(value: unknown): value is AppState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<AppState>;
  return (
    typeof s.version === "number" &&
    typeof s.wkStartDate === "string" &&
    Array.isArray(s.teachers) &&
    Array.isArray(s.rooms) &&
    Array.isArray(s.subjects) &&
    Array.isArray(s.groups) &&
    Array.isArray(s.events)
  );
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return seedDefaultState();

    const parsed: unknown = JSON.parse(raw);

    if (!isMigratableState(parsed)) return createDefaultState();

    if (parsed.version === CURRENT_VERSION && isValidState(parsed)) return parsed;

    // Step it forward. Only a hop with no migration (or state from a newer
    // build) reaches the prompt.
    const migrated = migrateState(parsed, CURRENT_VERSION);
    if (migrated && isValidState(migrated)) {
      saveState(migrated);
      return migrated;
    }

    const reset = window.confirm(
      `Das gespeicherte Datenformat passt nicht (gespeichert: v${parsed.version ?? "?"}, aktuell: v${CURRENT_VERSION}).\n\n` +
        `OK setzt alles zurück, Abbrechen versucht die alten Daten trotzdem zu laden (die App verhält sich dann möglicherweise falsch).`,
    );
    if (reset) return createDefaultState();
    // User chose to keep old data — it passed the shape check, but individual
    // fields may still mean something different in this version.
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

// ─── Plan file: export & import ───────────────────────────────────────────────
// There is exactly one plan, living in localStorage. A file is how it leaves the
// browser — for a backup, for a second machine, for handing to a co-planner —
// and how it comes back. Nothing here knows about a plan *library*; loading a
// file replaces what is in the browser.

/** Pretty-printed so a plan file survives being read, diffed and hand-fixed. */
export function serializePlan(state: AppState): string {
  return JSON.stringify(stripConflicts(state), null, 2);
}

export function planFileName(state: AppState): string {
  const slug =
    state.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "wk-plan";
  return `${slug}-${state.wkStartDate}.json`;
}

/**
 * True once the plan still is what `createDefaultState` shipped: no teacher,
 * no room and no lesson/Programmpunkt has been added, and nothing has been
 * placed. This — not a separate "have they touched anything" flag — is what
 * gates the sample-data button: loading the sample overwrites everything, so
 * it only offers itself while there is nothing of the user's to lose.
 */
export function isPristineState(state: AppState): boolean {
  return (
    state.teachers.length === 0 &&
    state.rooms.length === 0 &&
    state.events.length === 0 &&
    state.subjects.every((s) => s.kind === "break")
  );
}

export type ParseResult =
  | { ok: true; state: AppState }
  | { ok: false; error: string };

/**
 * Parse a plan file. Older files are migrated on the way in, exactly like
 * localStorage, so an export taken before a schema change still opens.
 */
export function parsePlan(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Diese Datei ist kein gültiges JSON." };
  }

  if (!isMigratableState(parsed)) {
    return { ok: false, error: "Diese Datei ist kein WK-Planer-Plan." };
  }

  if (parsed.version === CURRENT_VERSION && isValidState(parsed)) {
    return { ok: true, state: parsed };
  }

  const migrated = migrateState(parsed, CURRENT_VERSION);
  if (migrated && isValidState(migrated)) return { ok: true, state: migrated };

  return {
    ok: false,
    error:
      `Dieser Plan ist v${parsed.version}, diese App liest v${CURRENT_VERSION}. ` +
      "Es gibt keinen Aktualisierungspfad dafür.",
  };
}
