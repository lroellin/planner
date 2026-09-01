export type ID = string;

export interface Teacher {
  id: ID;
  name: string;
  shortName: string;  // initials, e.g. "JD" for "John Doe"
  color: string;
}

export interface Room {
  id: ID;
  name: string;
  color: string;
  excludeFromConflictCheck: boolean;
}

export interface Subject {
  id: ID;
  name: string;
  color: string;
  defaultTeacherIds: ID[];
  defaultRoomId: ID | null;
  defaultDurationMinutes: number;
  isBreak: boolean;
  isMultiGroup?: boolean; // if true, placing creates an event for every enabled group simultaneously
}

export interface Group {
  id: ID;
  label: string;
  enabled: boolean;
  order: number;
}

// A contiguous stretch of the week with its own set of group lanes. The Kader
// planning course runs on days 0-1 with a single lane; the group rotation runs
// on days 2-4 with all groups. Each phase renders as its own calendar.
export interface Phase {
  id: ID;
  label: string;
  startDay: number;  // inclusive, 0=Mon … 4=Fri
  endDay: number;    // inclusive
  groupIds: ID[];
}

export interface CalendarEvent {
  id: ID;
  subjectId: ID;
  groupId: ID | ID[];  // array = multi-group event (renders in all listed group columns)
  dayIndex: number;   // 0=Mon … 4=Fri
  startTime: string;  // "HH:MM"
  endTime: string;    // "HH:MM"
  teacherIds: ID[] | 'inherit'; // 'inherit' = use subject.defaultTeacherIds
  roomId: ID | null | 'inherit'; // 'inherit' = use subject.defaultRoomId; null = explicitly no room
  conflicts?: ConflictRef[];
}

export type ConflictKind = 'teacher' | 'room' | 'group';

// View-only filter: show just the events a given teacher/room/group is involved in.
export interface EventFilter {
  kind: 'teacher' | 'room' | 'group';
  id: ID;
}

export interface ConflictRef {
  kind: ConflictKind;
  resourceId: ID;
  collidingEventIds: ID[];
}

export interface ConflictReport {
  kind: ConflictKind;
  resourceId: ID;
  resourceName: string;
  involvedEventIds: ID[];
}

export interface AppState {
  version: number;
  wkStartDate: string;  // "YYYY-MM-DD", always a Monday
  teachers: Teacher[];
  rooms: Room[];
  subjects: Subject[];
  groups: Group[];
  phases: Phase[];
  events: CalendarEvent[];
}
