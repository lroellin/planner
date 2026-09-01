import { nanoid } from 'nanoid';
import type { AppState, CalendarEvent } from '../types';
import { formatDate } from '../utils/timeUtils';

const STATE_KEY = 'wk-planner-state';
const CURRENT_VERSION = 4;

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

  return {
    version: CURRENT_VERSION,
    wkStartDate: nextMonday(),
    groups: [
      { id: kaderId, label: 'K', enabled: true, order: 0 },
      { id: groupIds[0]!, label: 'G1', enabled: true, order: 1 },
      { id: groupIds[1]!, label: 'G2', enabled: true, order: 2 },
      { id: groupIds[2]!, label: 'G3', enabled: true, order: 3 },
    ],
    phases: [
      { id: nanoid(), label: 'Planungskurs', startDay: 0, endDay: 1, groupIds: [kaderId] },
      { id: nanoid(), label: 'Gruppen', startDay: 2, endDay: 4, groupIds },
    ],
    teachers: [
      { id: teacherId, name: 'Teacher 1', shortName: 'T1', color: '#4299e1' },
    ],
    rooms: [
      { id: roomId, name: 'Room 1', color: '#48bb78', excludeFromConflictCheck: false },
    ],
    subjects: [
      {
        id: nanoid(),
        name: 'Mittagessen',
        color: '#a0aec0',
        defaultTeacherIds: [],
        defaultRoomId: null,
        defaultDurationMinutes: 60,
        isBreak: true,
        isMultiGroup: true,
      },
      {
        id: nanoid(),
        name: 'Pause',
        color: '#cbd5e0',
        defaultTeacherIds: [],
        defaultRoomId: null,
        defaultDurationMinutes: 15,
        isBreak: true,
        isMultiGroup: true,
      },
      {
        id: nanoid(),
        name: 'Karteneröffnung/-führung',
        color: '#9f7aea',
        defaultTeacherIds: [],
        defaultRoomId: roomId,
        defaultDurationMinutes: 90,
        isBreak: false,
        isMultiGroup: false,
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
    localStorage.setItem(STATE_KEY, JSON.stringify(stripConflicts(state)));
  } catch {
    // localStorage full or unavailable
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return seedDefaultState();

    const parsed = JSON.parse(raw) as AppState;

    if (parsed.version !== CURRENT_VERSION) {
      const confirmed = window.confirm(
        `Saved data format is incompatible (stored: v${parsed.version ?? '?'}, current: v${CURRENT_VERSION}).\n\n` +
        `Press OK to reset to defaults, or Cancel to try loading the old data (may be unstable).`
      );
      if (confirmed) {
        return createDefaultState();
      }
      // User chose to keep old data — returned as-is, app may behave unexpectedly
      return parsed;
    }

    return parsed;
  } catch {
    return createDefaultState();
  }
}

function seedDefaultState(): AppState {
  const state = createDefaultState();
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable
  }
  return state;
}
