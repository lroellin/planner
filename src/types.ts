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
}

export interface Group {
  id: ID;
  label: string;
  enabled: boolean;
  order: number;
}

export interface CalendarEvent {
  id: ID;
  subjectId: ID;
  groupId: ID;
  dayIndex: number;   // 0=Mon … 4=Fri
  startTime: string;  // "HH:MM"
  endTime: string;    // "HH:MM"
  teacherIds: ID[] | null;
  roomId: ID | null;
  conflicts?: ConflictRef[];
}

export type ConflictKind = 'teacher' | 'room';

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
  events: CalendarEvent[];
}
