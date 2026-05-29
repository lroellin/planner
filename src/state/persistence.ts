import { nanoid } from "nanoid";
import type { AppState, CalendarEvent } from "../types";
import {
  getActiveProjectId,
  getProjectStateKey,
  initProjects,
} from "./projects";
import { generateInitials } from "../utils/colorUtils";

const CURRENT_VERSION = 2;

export function getStorageKey(): string {
  const id = initProjects();
  return getProjectStateKey(id);
}

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d.toISOString().slice(0, 10);
}

export function createDefaultState(): AppState {
  const teacherId = nanoid();
  const roomId = nanoid();

  return {
    version: CURRENT_VERSION,
    wkStartDate: nextMonday(),
    groups: [
      { id: nanoid(), label: "G1", enabled: true, order: 0 },
      { id: nanoid(), label: "G2", enabled: true, order: 1 },
      { id: nanoid(), label: "G3", enabled: true, order: 2 },
    ],
    teachers: [
      { id: teacherId, name: "Teacher 1", shortName: "T1", color: "#4299e1" },
    ],
    rooms: [
      {
        id: roomId,
        name: "Room 1",
        color: "#48bb78",
        excludeFromConflictCheck: false,
      },
    ],
    subjects: [
      {
        id: nanoid(),
        name: "Mittagessen",
        color: "#a0aec0",
        defaultTeacherIds: [],
        defaultRoomId: null,
        defaultDurationMinutes: 60,
        isBreak: true,
      },
      {
        id: nanoid(),
        name: "Pause",
        color: "#cbd5e0",
        defaultTeacherIds: [],
        defaultRoomId: null,
        defaultDurationMinutes: 15,
        isBreak: true,
      },
      {
        id: nanoid(),
        name: "Karteneröffnung/-führung",
        color: "#9f7aea",
        defaultTeacherIds: [],
        defaultRoomId: roomId,
        defaultDurationMinutes: 90,
        isBreak: false,
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

export function saveState(state: AppState): void {
  try {
    const id = getActiveProjectId();
    if (!id) return;
    localStorage.setItem(
      getProjectStateKey(id),
      JSON.stringify(stripConflicts(state)),
    );
  } catch {
    // localStorage full or unavailable
  }
}

export function loadState(): AppState {
  try {
    const key = getStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) return createDefaultState();
    return migrateState(JSON.parse(raw) as AppState);
  } catch {
    return createDefaultState();
  }
}

export function loadStateForProject(id: string): AppState {
  try {
    const raw = localStorage.getItem(getProjectStateKey(id));
    if (!raw) return createDefaultState();
    return migrateState(JSON.parse(raw) as AppState);
  } catch {
    return createDefaultState();
  }
}

function migrateState(raw: AppState): AppState {
  if (!raw.version || raw.version < CURRENT_VERSION) {
    return createDefaultState();
  }
  // Backfill shortName for teachers loaded from storage without it
  return {
    ...raw,
    teachers: raw.teachers.map((t) => ({
      ...t,
      shortName: t.shortName ?? generateInitials(t.name),
    })),
  };
}
