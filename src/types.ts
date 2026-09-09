export type ID = string;

// A stretch of the week a resource is *not* there: the instructor who arrives
// Tuesday noon, the Schutzraum booked on Thursday morning. An empty list means
// "always available", so nothing has to be entered for the normal case.
// All-day windows are stored as 00:00–24:00 (see utils/availability.ts).
export interface TimeWindow {
  id: ID;
  days: number[];      // 0=Mon … 4=Fri
  startTime: string;   // "HH:MM"
  endTime: string;     // "HH:MM", may be "24:00"
  note: string;
}

export interface Teacher {
  id: ID;
  name: string;
  shortName: string;  // initials, e.g. "JD" for "John Doe"
  color: string;
  unavailable: TimeWindow[];
}

export interface Room {
  id: ID;
  name: string;
  /**
   * A 4–5 character code for the card, where the full name never fits: a lane is
   * ~70–130px wide and "Schutzanlage Bern-West" is not going to be in it.
   * Empty means "derive it" — `roomShort()` builds one from the name — so a
   * rename keeps the code in step until someone enters a real one.
   */
  shortName: string;
  color: string;
  excludeFromConflictCheck: boolean;
  unavailable: TimeWindow[];
}

// What the subject is *about*, as opposed to how it is scheduled. Nested so it
// can grow (material, handouts, references) without widening Subject itself.
export interface SubjectContent {
  goals: string[];   // learning objectives, one per line
  notes: string;     // free text
}

/**
 * What a subject *is*, which decides whether coverage applies to it.
 *
 * - `lesson`   — a Thema of the rotation: every group owes its full duration.
 * - `break`    — Mittagessen, Pause. Placed ad hoc, attended by nobody in particular.
 * - `oneoff`   — a *Programmpunkt*: a fixed point of the programme (Begrüssung,
 *                Antreten, Schlussrapport) that happens once rather than once per
 *                group. It has everything a lesson has — teachers, room, colour,
 *                duration, all-lanes placement — and is simply outside coverage,
 *                so it never shows up as "fehlt noch bei G2".
 *
 * This replaced a boolean `isBreak`: every `!isBreak` test in the app meant
 * "lesson", and a third kind had to make the compiler visit each of them.
 */
export type SubjectKind = 'lesson' | 'break' | 'oneoff';

export interface Subject {
  id: ID;
  name: string;
  /**
   * What the card falls back to once its lane is too narrow for the full name
   * (see the width bands in calendar.css). Empty means "derive it" —
   * `subjectShort()` keeps something from every token of the name — so renaming
   * a subject keeps the short form in step until someone enters a real one.
   * `collidingSubjectShorts()` finds the Themen the derivation still cannot tell
   * apart, and Konfiguration asks for a Kürzel there.
   */
  shortName: string;
  color: string;
  defaultTeacherIds: ID[];
  defaultRoomId: ID | null;
  /**
   * How long the subject takes — and therefore how much of it every group owes.
   * There is no separate target: if Leitungsbau is 2.5 h then each group needs
   * 2.5 h of it, whether that is one block or 1.5 h + 1 h. Coverage measures
   * placed minutes against this.
   */
  defaultDurationMinutes: number;
  kind: SubjectKind;
  /**
   * If true, placing schedules it for the whole phase at once rather than one
   * lane. Which lanes that is depends on `kind` — a Pause or Programmpunkt
   * reaches every lane the phase draws, a Thema only the counted ones. See
   * `lanesForMultiGroup`.
   */
  isMultiGroup: boolean;
  /**
   * True when not every group owes this Thema — a specialist lesson only some
   * of them sit. Coverage then has nothing to measure it against, so it is left
   * out of the report and its sidebar chip carries no "fehlt noch" badge. It is
   * still a Thema in every other way: placed per group, with its own defaults.
   *
   * Distinct from `kind: 'oneoff'`, which is outside coverage because it happens
   * *once for the whole course* rather than once per group.
   */
  optional: boolean;
  // Which phase this subject is rotated through. null = infer from where it is
  // placed. Setting it makes coverage exact for subjects that belong to one
  // phase only (a Kader lesson must not be judged against the group lanes).
  phaseId: ID | null;
  content: SubjectContent;
}

export interface Group {
  id: ID;
  label: string;
  enabled: boolean;
  order: number;
  /**
   * The lane is planned and drawn like any other, but is left out of the
   * *rotation*. Two things follow, and only these two:
   *
   * - Coverage never asks whether it has had a Thema, so it raises no
   *   "fehlt noch" and appears in no coverage column.
   * - An all-lanes *Thema* — the Übung, the Wissenskontrolle — is not placed
   *   for it. It is off doing its own programme at that hour.
   *
   * Everything else still reaches it. An all-lanes Pause or Programmpunkt
   * (Mittagessen, Begrüssung, Kaderrapport, WK-Abschluss) lands on its lane like
   * any other, because a group on its own programme still eats and still falls
   * in. See `lanesForMultiGroup`, which is where that line is drawn.
   *
   * The case is Kulturgüterschutz sitting the same days as the rotation with its
   * own timetable. Switching the group off is the wrong tool: that hides its lane
   * and its lessons, and this group very much has both.
   */
  excludeFromCoverage: boolean;
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

// The three double-booking kinds, plus the two availability kinds: a resource
// booked while it is marked away. Those involve a single event, not a pair.
export type ConflictKind =
  | 'teacher'
  | 'room'
  | 'group'
  | 'teacher-absent'
  | 'room-blocked';

export const HARD_CONFLICT_KINDS: ConflictKind[] = ['teacher', 'group', 'teacher-absent'];

/**
 * The short label for a kind, used where it sits in its own element beside the
 * resource name — the Probleme panel's card eyebrow ("RAUM" over "Kompanie"),
 * and the joined kind list in the calendar card's tooltip. It is a label, not a
 * sentence, and the panel's card header only has ~225px for the label *and* the
 * name: spelling the state out here ("Ausbildner abwesend") pushed the name,
 * which is the half worth reading, down to a truncated 48px.
 */
export const CONFLICT_KIND_LABELS: Record<ConflictKind, string> = {
  teacher: 'Ausbildner',
  room: 'Raum',
  group: 'Gruppe',
  'teacher-absent': 'Abwesend',
  'room-blocked': 'Gesperrt',
};

/**
 * The same conflict as running text, for the chips in the event editors, which
 * put the label and the name in *one* span. There `{label} {name}` produced
 * "Abwesend Anna Müller" — the resource nouns concatenate acceptably, the two
 * state adjectives do not. Naming the resource first and its state second is
 * grammatical for all five, and reuses the wording the Probleme panel's own
 * empty state already has ("doppelt eingeteilt").
 */
export function conflictNote(kind: ConflictKind, name: string): string {
  switch (kind) {
    case 'teacher':
    case 'group':
      return `${name} doppelt eingeteilt`;
    case 'room':
      return `${name} doppelt belegt`;
    case 'teacher-absent':
      return `${name} abwesend`;
    case 'room-blocked':
      return `${name} gesperrt`;
  }
}

export function isHardConflict(kind: ConflictKind): boolean {
  return HARD_CONFLICT_KINDS.includes(kind);
}

// Which sheet the report overlay is showing. Printing a WK means printing one of
// these documents, not one screenshot of the grid — though two of them are read
// on screen and never printed: Abdeckung and Abweichungen are both worked *from*
// rather than handed to anyone.
export type ReportTab = 'coverage' | 'deviations' | 'groups' | 'teachers' | 'rooms';

/** The tabs that have a printed counterpart in `src/print/`. */
export const PRINTABLE_REPORT_TABS: ReportTab[] = ['groups', 'teachers', 'rooms'];

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
  /** Why, when the resource name alone doesn't say it ("away Wed 12:00–24:00"). */
  detail?: string;
}

export interface AppState {
  version: number;
  /** Names the plan in the toolbar, the printed reports and the export file. */
  name: string;
  /**
   * When the plan was last written to a file, as an ISO timestamp; null while it
   * has never been exported. The plan lives in one browser's localStorage, which
   * is one "clear site data" away from gone — so the app has to be able to say
   * how long it has been since there was a copy of it anywhere else.
   */
  lastExportedAt: string | null;
  wkStartDate: string;  // "YYYY-MM-DD", always a Monday
  /**
   * The hours the grid draws, for the **whole WK** — one window, not one per
   * Phase: a day that starts at 07:00 starts at 07:00 in the Kader phase and
   * the Gruppen phase alike, and two ranges side by side would put the same
   * hour at two different heights.
   *
   * `null` means *derive it from the plan* (`gridWindow` in `timeUtils`), which
   * is what every plan wants until it doesn't: the grid used to draw a fixed
   * 07:00–19:00 for a week that runs 08:00–17:00, so 12 of its 48 slots were
   * empty on every lane and made up most of the scroll. Set explicitly for the
   * WK that really does start at 06:00 — and left alone, it follows the plan.
   */
  gridStartTime: string | null;  // "HH:MM"
  gridEndTime: string | null;    // "HH:MM"
  teachers: Teacher[];
  rooms: Room[];
  subjects: Subject[];
  groups: Group[];
  phases: Phase[];
  events: CalendarEvent[];
}
