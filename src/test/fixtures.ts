import { ALL_GROUPS } from '../types';
import type { AppState, CalendarEvent, GroupSelector, Subject, TimeWindow } from '../types';

/**
 * A two-phase week shaped like a real WK: a Kader phase Mon–Tue with one lane,
 * and a group rotation Wed–Fri with three. Ids are readable strings so failing
 * assertions say something useful.
 */
export function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    version: 14,
    name: 'Test WK',
    lastExportedAt: null,
    wkStartDate: '2026-09-07',
    gridStartTime: null,
    gridEndTime: null,
    groups: [
      { id: 'k', label: 'K', enabled: true, order: 0, excludeFromCoverage: false },
      { id: 'g1', label: 'G1', enabled: true, order: 1, excludeFromCoverage: false },
      { id: 'g2', label: 'G2', enabled: true, order: 2, excludeFromCoverage: false },
      { id: 'g3', label: 'G3', enabled: true, order: 3, excludeFromCoverage: false },
    ],
    phases: [
      { id: 'kader', label: 'KVK', startDay: 0, endDay: 1, groupIds: ['k'] },
      { id: 'gruppen', label: 'WK', startDay: 2, endDay: 4, groupIds: ['g1', 'g2', 'g3'] },
    ],
    teachers: [
      { id: 't1', name: 'Anna Müller', shortName: 'AM', color: '#4299e1', unavailable: [] },
      { id: 't2', name: 'Beat Zwahlen', shortName: 'BZ', color: '#48bb78', unavailable: [] },
    ],
    rooms: [
      { id: 'r1', name: 'Seminarraum 1', shortName: '', color: '#48bb78', excludeFromConflictCheck: false, unavailable: [] },
      { id: 'outside', name: 'Outside', shortName: '', color: '#a0aec0', excludeFromConflictCheck: true, unavailable: [] },
    ],
    subjects: [
      makeSubject({ id: 'lesson', name: 'Karteneröffnung' }),
      makeSubject({ id: 'other', name: 'Materialdienst' }),
      makeSubject({ id: 'lunch', name: 'Mittagessen', kind: 'break', isMultiGroup: true, defaultRoomId: null }),
    ],
    events: [],
    ...overrides,
  };
}

export function makeSubject(overrides: Partial<Subject> & { id: string }): Subject {
  return {
    name: overrides.id,
    shortName: '',
    color: '#9f7aea',
    defaultTeacherIds: ['t1'],
    defaultRoomId: 'r1',
    defaultDurationMinutes: 90,
    kind: 'lesson',
    isMultiGroup: false,
    optional: false,
    phaseId: null,
    content: { goals: [], notes: '' },
    ...overrides,
  };
}

let seq = 0;

export function makeEvent(
  overrides: Partial<CalendarEvent> & { groupId: GroupSelector },
): CalendarEvent {
  return {
    id: `e${++seq}`,
    subjectId: 'lesson',
    dayIndex: 2,
    startTime: '08:00',
    endTime: '09:30',
    teacherIds: 'inherit',
    roomId: 'inherit',
    ...overrides,
  };
}

export function makeWindow(
  days: number[],
  startTime = '00:00',
  endTime = '24:00',
  note = '',
): TimeWindow {
  return { id: `w${++seq}`, days, startTime, endTime, note };
}

export const ALL = ALL_GROUPS;
