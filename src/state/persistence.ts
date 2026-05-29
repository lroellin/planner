import { nanoid } from 'nanoid';
import type { AppState, CalendarEvent } from '../types';

const STORAGE_KEY = 'zivilschutz-planner-v1';
const CURRENT_VERSION = 1;

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d.toISOString().slice(0, 10);
}

function createDefaultState(): AppState {
  const teacherId = nanoid();
  const roomId = nanoid();
  const subjectId1 = nanoid();
  const subjectId2 = nanoid();
  const subjectId3 = nanoid();

  return {
    version: CURRENT_VERSION,
    wkStartDate: nextMonday(),
    groups: [
      { id: nanoid(), label: 'G1', enabled: true, order: 0 },
      { id: nanoid(), label: 'G2', enabled: true, order: 1 },
      { id: nanoid(), label: 'G3', enabled: true, order: 2 },
    ],
    teachers: [
      { id: teacherId, name: 'Teacher 1', color: '#4299e1' },
    ],
    rooms: [
      { id: roomId, name: 'Room 1', color: '#48bb78', excludeFromConflictCheck: false },
    ],
    subjects: [
      {
        id: subjectId1,
        name: 'Lunch Break',
        color: '#f6ad55',
        defaultTeacherIds: [],
        defaultRoomId: null,
        defaultDurationMinutes: 60,
        isBreak: true,
      },
      {
        id: subjectId2,
        name: 'Short Break',
        color: '#fc8181',
        defaultTeacherIds: [],
        defaultRoomId: null,
        defaultDurationMinutes: 15,
        isBreak: true,
      },
      {
        id: subjectId3,
        name: 'Sample Lesson',
        color: '#9f7aea',
        defaultTeacherIds: [teacherId],
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
    events: state.events.map(({ conflicts: _omit, ...ev }) => ev as CalendarEvent),
  };
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripConflicts(state)));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw) as AppState;
    return migrateState(parsed);
  } catch {
    return createDefaultState();
  }
}

function migrateState(state: AppState): AppState {
  // Future migrations go here, keyed by state.version
  if (!state.version || state.version < CURRENT_VERSION) {
    // Unknown old format — reset to defaults
    return createDefaultState();
  }
  return state;
}
