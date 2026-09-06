import { nanoid } from "nanoid";
import { ALL_GROUPS } from "../types";
import type { AppState, CalendarEvent, ID, Subject } from "../types";
import { formatDate } from "../utils/timeUtils";
import { CURRENT_VERSION } from "./persistence";

// A ready-to-look-at week, so a new visitor sees the app doing something
// before entering a single Ausbildner of their own. Modelled loosely on a real
// Zivilschutz WK Arbeitsprogramm (Kartenlesen, Polycom, Leitungsbau …), with
// fictional Swiss names standing in for the real instructors. Not a pixel copy
// of that sheet — the goal is a plausible, conflict-annotated week that
// exercises every feature (phases, breaks, a Programmpunkt, an override, a
// Stellvertretung, one deliberate soft conflict), not a historical record.
//
// This is authored directly against the current schema (like
// `createDefaultState`), not migrated up from an old shape. Whenever a
// migration step in `migrations.ts` adds or renames a field, this file needs
// the same update — see SPECS.md § Migrations.

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return formatDate(d);
}

function content(): Subject["content"] {
  return { goals: [], notes: "" };
}

export function createSampleState(): AppState {
  const monday = nextMonday();

  // ─── Groups & phases ────────────────────────────────────────────────────
  const kaderId = nanoid();
  const g1 = nanoid();
  const g2 = nanoid();
  const g3 = nanoid();
  const kaderPhaseId = nanoid();
  const gruppenPhaseId = nanoid();

  // ─── Teachers ───────────────────────────────────────────────────────────
  const tRoger = nanoid();
  const tAlain = nanoid();
  const tPirmin = nanoid();
  const tLukas = nanoid();
  const tSimon = nanoid();
  const tBruno = nanoid();
  const tMichael = nanoid();
  const tJonas = nanoid();

  const teachers = [
    { id: tRoger, name: "Roger Ott", shortName: "Ro", color: "#d64545", unavailable: [] },
    { id: tAlain, name: "Alain Meier", shortName: "Al", color: "#a349a4", unavailable: [] },
    { id: tPirmin, name: "Pirmin Good", shortName: "Pi", color: "#e08e2b", unavailable: [] },
    { id: tLukas, name: "Lukas Zurbuchen", shortName: "Lu", color: "#2f6fb3", unavailable: [] },
    { id: tSimon, name: "Simon Wyss", shortName: "Si", color: "#2f9e6b", unavailable: [] },
    { id: tBruno, name: "Beat Burri", shortName: "Bu", color: "#1f8a8c", unavailable: [] },
    { id: tMichael, name: "Michael Iten", shortName: "Mi", color: "#8a5a2b", unavailable: [] },
    { id: tJonas, name: "Jonas Stichler", shortName: "JS", color: "#55627a", unavailable: [] },
  ];

  // ─── Rooms ──────────────────────────────────────────────────────────────
  const rKompanie = nanoid();
  const rDraussen = nanoid();
  const rGfs = nanoid();
  const rSsr = nanoid();
  const rNrLb = nanoid();

  const rooms = [
    { id: rKompanie, name: "Kompanie", shortName: "Komp", color: "#b98b56", excludeFromConflictCheck: false, unavailable: [] },
    { id: rDraussen, name: "Draussen", shortName: "Draus", color: "#7fae52", excludeFromConflictCheck: true, unavailable: [] },
    { id: rGfs, name: "GFS", shortName: "GFS", color: "#4472a8", excludeFromConflictCheck: false, unavailable: [] },
    { id: rSsr, name: "SSR", shortName: "SSR", color: "#8f6fae", excludeFromConflictCheck: false, unavailable: [] },
    { id: rNrLb, name: "NR/LB", shortName: "NR/LB", color: "#4a4a4a", excludeFromConflictCheck: false, unavailable: [] },
  ];

  // ─── Subjects (Themen, Programmpunkte, Pausen) ─────────────────────────
  const sKarteneroeffnung = nanoid();
  const sKartenlesen = nanoid();
  const sPolycom = nanoid();
  const sSchulungAnlage = nanoid();
  const sLagezentrum = nanoid();
  const sAntenne = nanoid();
  const sLeitungsbau = nanoid();
  const sNachrichtenkarte = nanoid();
  const sAbcTheorie = nanoid();
  const sLagebericht = nanoid();
  const sWissenskontrolle = nanoid();
  const sSchulungKader = nanoid();
  const sKurzlektionKader = nanoid();

  const sBegruessung = nanoid();
  const sSzenario = nanoid();
  const sUebungsauswertung = nanoid();
  const sRetablieren = nanoid();
  const sWkAbschluss = nanoid();

  const sMittagessen = nanoid();
  const sPause = nanoid();

  const subjects: Subject[] = [
    {
      id: sKarteneroeffnung, name: "Karteneröffnung/-führung", shortName: "",
      color: "#9b3fa8", defaultTeacherIds: [tAlain], defaultRoomId: rKompanie,
      defaultDurationMinutes: 45, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sKartenlesen, name: "Kartenlesen, Signaturen", shortName: "",
      color: "#e8748a", defaultTeacherIds: [tRoger], defaultRoomId: rGfs,
      defaultDurationMinutes: 90, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sPolycom, name: "Polycom, Funkpraxis", shortName: "",
      color: "#e07b39", defaultTeacherIds: [tPirmin], defaultRoomId: rDraussen,
      defaultDurationMinutes: 90, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sSchulungAnlage, name: "Schulung Anlage", shortName: "",
      color: "#8fce8f", defaultTeacherIds: [tPirmin], defaultRoomId: rSsr,
      defaultDurationMinutes: 90, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sLagezentrum, name: "Lagezentrum, Meldefluss", shortName: "",
      color: "#2b3a55", defaultTeacherIds: [tLukas], defaultRoomId: rNrLb,
      defaultDurationMinutes: 90, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sAntenne, name: "Antenne", shortName: "",
      color: "#d9a441", defaultTeacherIds: [tAlain], defaultRoomId: rDraussen,
      defaultDurationMinutes: 60, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sLeitungsbau, name: "Leitungsbau", shortName: "",
      color: "#2f6fb3", defaultTeacherIds: [tSimon], defaultRoomId: rDraussen,
      defaultDurationMinutes: 90, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sNachrichtenkarte, name: "Nachrichtenkarte, Dispo", shortName: "",
      color: "#7a4b28", defaultTeacherIds: [tMichael], defaultRoomId: rGfs,
      defaultDurationMinutes: 90, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sAbcTheorie, name: "ABC-Theorie", shortName: "",
      color: "#e8d64b", defaultTeacherIds: [tAlain], defaultRoomId: rKompanie,
      defaultDurationMinutes: 45, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sLagebericht, name: "Lagebericht", shortName: "",
      color: "#2f7d4f", defaultTeacherIds: [tBruno], defaultRoomId: rKompanie,
      defaultDurationMinutes: 45, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sWissenskontrolle, name: "Wissenskontrolle", shortName: "",
      color: "#63b3d6", defaultTeacherIds: [tRoger], defaultRoomId: rGfs,
      defaultDurationMinutes: 30, kind: "lesson", isMultiGroup: false,
      phaseId: gruppenPhaseId, content: content(),
    },
    {
      id: sSchulungKader, name: "Schulung Kader", shortName: "",
      color: "#6d5b97", defaultTeacherIds: [tJonas], defaultRoomId: null,
      defaultDurationMinutes: 60, kind: "lesson", isMultiGroup: false,
      phaseId: kaderPhaseId, content: content(),
    },
    {
      id: sKurzlektionKader, name: "Kurzlektion Kader", shortName: "",
      color: "#8d7bb5", defaultTeacherIds: [tJonas], defaultRoomId: null,
      defaultDurationMinutes: 45, kind: "lesson", isMultiGroup: false,
      phaseId: kaderPhaseId, content: content(),
    },

    // Programmpunkte — fixed points of the day, not part of the rotation.
    {
      id: sBegruessung, name: "Begrüssung, Eintrittsbefragung", shortName: "",
      color: "#7c93c4", defaultTeacherIds: [tJonas], defaultRoomId: rKompanie,
      defaultDurationMinutes: 30, kind: "oneoff", isMultiGroup: true,
      phaseId: null, content: content(),
    },
    {
      id: sSzenario, name: "Szenario (Übung)", shortName: "",
      color: "#2f8fd6", defaultTeacherIds: [tAlain, tPirmin, tRoger], defaultRoomId: rDraussen,
      defaultDurationMinutes: 240, kind: "oneoff", isMultiGroup: true,
      phaseId: null, content: content(),
    },
    {
      id: sUebungsauswertung, name: "Übungsauswertung", shortName: "",
      color: "#6b7280", defaultTeacherIds: [tJonas], defaultRoomId: rKompanie,
      defaultDurationMinutes: 60, kind: "oneoff", isMultiGroup: true,
      phaseId: null, content: content(),
    },
    {
      id: sRetablieren, name: "Retablieren", shortName: "",
      color: "#9ca3af", defaultTeacherIds: [], defaultRoomId: null,
      defaultDurationMinutes: 30, kind: "oneoff", isMultiGroup: true,
      phaseId: null, content: content(),
    },
    {
      id: sWkAbschluss, name: "WK-Abschluss", shortName: "",
      color: "#4b5563", defaultTeacherIds: [tJonas], defaultRoomId: rKompanie,
      defaultDurationMinutes: 60, kind: "oneoff", isMultiGroup: true,
      phaseId: null, content: content(),
    },

    // Pausen — same shape as `createDefaultState`'s two defaults.
    {
      id: sMittagessen, name: "Mittagessen", shortName: "",
      color: "#a0aec0", defaultTeacherIds: [], defaultRoomId: null,
      defaultDurationMinutes: 60, kind: "break", isMultiGroup: true,
      phaseId: null, content: content(),
    },
    {
      id: sPause, name: "Pause", shortName: "",
      color: "#cbd5e0", defaultTeacherIds: [], defaultRoomId: null,
      defaultDurationMinutes: 15, kind: "break", isMultiGroup: false,
      phaseId: null, content: content(),
    },
  ];

  // ─── Events ─────────────────────────────────────────────────────────────
  let events: CalendarEvent[] = [];

  function place(
    subjectId: ID,
    dayIndex: number,
    groupId: string,
    startTime: string,
    endTime: string,
    overrides: Partial<Pick<CalendarEvent, "teacherIds" | "roomId">> = {},
  ): void {
    events.push({
      id: nanoid(),
      subjectId,
      groupId,
      dayIndex,
      startTime,
      endTime,
      teacherIds: overrides.teacherIds ?? "inherit",
      roomId: overrides.roomId ?? "inherit",
    });
  }

  // Monday (Kader) — a light day: the Kader arrives, the groups have not.
  place(sMittagessen, 0, kaderId, "12:00", "13:00");
  place(sSchulungKader, 0, kaderId, "13:00", "14:00");
  place(sKurzlektionKader, 0, kaderId, "14:00", "14:45");

  // Tuesday (Kader) — final preparation before the groups arrive Wednesday.
  place(sMittagessen, 1, kaderId, "12:00", "13:00");

  // Wednesday (Gruppen) — Begrüssung, then a rotation with one deliberate
  // soft conflict at 14:45 (both G1 and G2 booked into "Kompanie").
  place(sBegruessung, 2, ALL_GROUPS, "08:00", "08:30");

  place(sKartenlesen, 2, g1, "08:30", "10:00");
  place(sPolycom, 2, g2, "08:30", "10:00");
  place(sLeitungsbau, 2, g3, "08:30", "10:00");
  place(sPause, 2, g1, "10:00", "10:15");
  place(sPause, 2, g2, "10:00", "10:15");
  place(sPause, 2, g3, "10:00", "10:15");

  place(sPolycom, 2, g1, "10:15", "11:45");
  place(sLeitungsbau, 2, g2, "10:15", "11:45");
  place(sKartenlesen, 2, g3, "10:15", "11:45");

  place(sMittagessen, 2, ALL_GROUPS, "12:00", "13:00");

  place(sLeitungsbau, 2, g1, "13:00", "14:30");
  place(sKartenlesen, 2, g2, "13:00", "14:30");
  place(sPolycom, 2, g3, "13:00", "14:30");
  place(sPause, 2, g1, "14:30", "14:45");
  place(sPause, 2, g2, "14:30", "14:45");
  place(sPause, 2, g3, "14:30", "14:45");

  place(sKarteneroeffnung, 2, g1, "14:45", "15:30"); // ← soft conflict with G2 below
  place(sLagebericht, 2, g2, "14:45", "15:30");      // ← same room, same time
  place(sSchulungAnlage, 2, g3, "14:45", "16:15");
  place(sKarteneroeffnung, 2, g2, "15:30", "16:15");
  place(sKarteneroeffnung, 2, g3, "16:15", "17:00");

  // Thursday (Gruppen) — no deliberate conflicts; one Stellvertretung (Roger
  // covers Lagebericht for Beat) and one duration override (G3's Lagezentrum
  // runs 60 min instead of the usual 90).
  place(sPolycom, 3, g1, "08:00", "09:30");
  place(sAbcTheorie, 3, g2, "08:00", "08:45");
  place(sKartenlesen, 3, g3, "08:00", "09:30");
  place(sPause, 3, g1, "09:30", "09:45");
  place(sPause, 3, g2, "08:45", "09:00");
  place(sPause, 3, g3, "09:30", "09:45");

  place(sLeitungsbau, 3, g1, "09:45", "11:15");
  place(sLagezentrum, 3, g2, "09:00", "10:30");
  place(sAntenne, 3, g3, "09:45", "10:45");

  place(sMittagessen, 3, ALL_GROUPS, "12:00", "13:00");

  place(sLagebericht, 3, g1, "13:00", "13:45");
  place(sLeitungsbau, 3, g2, "13:00", "14:30");
  place(sNachrichtenkarte, 3, g3, "13:00", "14:30");
  place(sPause, 3, g1, "13:45", "14:00");
  place(sPause, 3, g2, "14:30", "14:45");
  place(sPause, 3, g3, "14:30", "14:45");

  place(sLagezentrum, 3, g1, "14:00", "15:30");
  place(sLagebericht, 3, g2, "14:45", "15:30", { teacherIds: [tRoger] }); // Stellvertretung
  place(sLagezentrum, 3, g3, "15:30", "16:30"); // override: 60 min, not the usual 90

  place(sWissenskontrolle, 3, g1, "15:30", "16:00");
  place(sWissenskontrolle, 3, g2, "16:00", "16:30");

  place(sRetablieren, 3, ALL_GROUPS, "16:30", "17:00");

  // Friday (Gruppen) — one joint exercise, then wrap-up.
  place(sSzenario, 4, ALL_GROUPS, "08:00", "12:00");
  place(sMittagessen, 4, ALL_GROUPS, "12:00", "13:00");
  place(sUebungsauswertung, 4, ALL_GROUPS, "13:00", "14:00");
  place(sRetablieren, 4, ALL_GROUPS, "14:00", "15:00");
  place(sWkAbschluss, 4, ALL_GROUPS, "16:00", "17:00");

  return {
    version: CURRENT_VERSION,
    name: `WK ${monday.slice(0, 4)} Tuggen/Reichenburg (Beispiel)`,
    lastExportedAt: null,
    wkStartDate: monday,
    groups: [
      { id: kaderId, label: "K", enabled: true, order: 0 },
      { id: g1, label: "G1", enabled: true, order: 1 },
      { id: g2, label: "G2", enabled: true, order: 2 },
      { id: g3, label: "G3", enabled: true, order: 3 },
    ],
    phases: [
      { id: kaderPhaseId, label: "KVK", startDay: 0, endDay: 1, groupIds: [kaderId] },
      { id: gruppenPhaseId, label: "WK", startDay: 2, endDay: 4, groupIds: [g1, g2, g3] },
    ],
    teachers,
    rooms,
    subjects,
    events,
  };
}
