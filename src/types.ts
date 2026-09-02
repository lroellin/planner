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
  isMultiGroup: boolean; // if true, placing schedules it for every lane of the phase at once
  // Which phase this subject is rotated through. null = infer from where it is
  // placed. Setting it makes coverage exact for subjects that belong to one
  // phase only (a Kader lesson must not be judged against the group lanes).
  phaseId: ID | null;
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

// Sentinel lane: "every enabled lane of whichever phase covers this event's day".
// Resolved at read time (see eventGroupIds) rather than expanded into a fixed
// list at placement time, so enabling a group or adding a lane to a phase
// immediately includes it in every lunch break instead of silently skipping it.
export const ALL_GROUPS = 'all';
export type GroupSelector = ID | typeof ALL_GROUPS;

export interface CalendarEvent {
  id: ID;
  subjectId: ID;
  groupId: GroupSelector;
  dayIndex: number;   // 0=Mon … 4=Fri
  startTime: string;  // "HH:MM"
  endTime: string;    // "HH:MM"
  teacherIds: ID[] | 'inherit'; // 'inherit' = use subject.defaultTeacherIds
  roomId: ID | null | 'inherit'; // 'inherit' = use subject.defaultRoomId; null = explicitly no room
  conflicts?: ConflictRef[];
}

export type ConflictKind = 'teacher' | 'room' | 'group';

// Which plan the report overlay is showing. Printing a WK means printing one of
// these four documents, not one screenshot of the grid.
export type ReportTab = 'coverage' | 'groups' | 'teachers' | 'rooms';

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
