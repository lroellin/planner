# WK Planner — Application Specifications

## Purpose

A desktop web app for planning a Swiss **Zivilschutz Wiederholungskurs (WK)** — a repeat civil-protection training course. **The interface is German (de-CH)** — the domain, the users and the data all are; only the code, its identifiers and its comments are English. The layout is a timetable: groups rotate through subjects taught by teachers in rooms, like a school schedule. A WK week is typically split into a Kader (leadership) planning segment and a multi-group rotation segment.

---

## Glossary — the German UI vocabulary

Every word the interface shows the user, and the code concept behind it. One term
per concept: the same thing must not be a *Lektion* in one panel and an *Eintrag*
in the next, so this list is the authority and anything user-facing is checked
against it. Reviewed and confirmed with the user; the numbering was compacted
afterwards, so it no longer matches that review round.

### The things being planned

| # | Term | Names | Where it shows |
|---|---|---|---|
| 1 | **Thema** / Themen | `Subject` — the draggable type: Karteneröffnung, Funk Grundlagen. *What* is taught, as opposed to one occurrence of it. Its defaults are the **Themenvorgabe** | Sidebar heading, Config tab, "Neues Thema", coverage table column |
| 2 | **Ausbildner** | `Teacher` — whoever runs a lesson. Same word singular and plural. Deliberately *not* **Gruppenführer**: that names a rank that leads one Gruppe, and this role is not tied to a Gruppe — an Ausbildner teaches Themen across all of them | Config tab, legend, event modal, "Ausbildnerpläne" |
| 3 | **Gruppe** / Gruppen | `Group` — one column of the timetable, labelled K, G1, G2, G3. Both the people and the lane they occupy | Config tab, lane selects, "Alle Gruppen", coverage columns |
| 4 | **Raum** / Räume | `Room` | Config tab, event modal, "Raumpläne" |
| 5 | **Lektion** / Lektionen | `CalendarEvent` — *one placed occurrence* of a Thema, at a time, on a lane. Distinct from #1: "Sanität" is a Thema, the Wednesday 08:00 G1 instance is a Lektion. The same word counts them in the reports ("3 Lektionen · 4 h 30 min Unterricht") | Undo labels ("3 Lektionen verschieben"), selection bar, delete confirms, event filter, group plans |
| 6 | **Pause** / Pausen | A Thema with `kind: 'break'` — Mittagessen, Pause. Never counted towards coverage | Sidebar section, Thema Art option, placement picker |
| 6a | **Programmpunkt** / Programmpunkte | A Thema with `kind: 'oneoff'` — Begrüssung, Antreten, Schlussrapport. A *fixed point of the programme*: it happens once, not once per Gruppe, so it is outside coverage. Everything else a Lektion has — Ausbildner, Raum, Farbe, Dauer, alle Gruppen — it has too. Made inline from the cell it belongs in, never from the sidebar | Sidebar section, placement picker («Neuer Programmpunkt …»), Thema Art option, config list tag |
| 7 | **Phase** / Phasen | `Phase` — a contiguous stretch of the week with its own set of lanes | Config tab, week strip, "Gehört zu Phase" |
| 8 | **KVK** | The default first phase (Mon–Tue, K lane only) — Kadervorkurs | Phase label in a new plan, column-group header |
| 9 | **WK** | The default second phase (Wed–Fri, G1–G3) | Phase label in a new plan, column-group header |
| 10 | **Kader** | The K lane — the leadership group | Group label `K`, phase explanation text |

### Scheduling

| # | Term | Names | Where it shows |
|---|---|---|---|
| 11 | **platzieren** / Platzierung | Putting a Lektion on the calendar, and the result | "Thema platzieren" dialog, Thema setup section "Vorgaben" |
| 12 | **Kalender** | The calendar grid itself | Empty hint, conflict panel ("Im Kalender zeigen"), sidebar hint |
| 13 | **Vorgabe** / Vorgaben | A Thema's defaults (Ausbildner, Raum, Dauer) that a new Lektion inherits and may override | Thema setup section, "aus der Themenvorgabe" |
| 14 | **Dauer** | How long a Thema takes — **and therefore what every Gruppe owes of it**. There is no separate target: a 2 h 30 min Thema needs 2 h 30 min per Gruppe, in one Lektion or split as 1 h 30 min + 1 h. Coverage measures placed minutes against it | Thema setup, event modal, quick-edit, coverage table ("Soll 2 h 30 min") |
| 15 | **Abdeckung** | Coverage — has every Gruppe had every Thema for its full Dauer | Reports tab, config intro |
| 16 | **teilen** | Cutting one Lektion into two | Event modal and quick-edit action |
| 17 | **duplizieren** | Copying a Lektion in place | Quick-edit, selection bar, Ctrl+D |

### Problems

| # | Term | Names | Where it shows |
|---|---|---|---|
| 18 | **Konflikt** / Konflikte | Two Lektionen clashing over a Ausbildner, a Gruppe or a Raum, or one booked into an absence | Right-hand panel heading, card tooltips |
| 19 | **harter / weicher Konflikt** | Hard = Ausbildner, Gruppe, absence. Weich = Raum double-booking (advisory) | Card tooltip, conflict panel footnote |
| 20 | **Problem** / Probleme | The toolbar badge count: Konflikte **plus** orphan Lektionen. Deliberately wider than #18 because the badge counts both | Toolbar badge ("7 Probleme") |
| 21 | **Ausserhalb der Phasen** | Orphan Lektionen — on no phase's day/lane combination, so nothing shows them. *Kalender* is deliberately not used: there is one FullCalendar per Phase, which is an implementation fact the user never sees | Conflict panel card, placement warnings, phase-delete confirm |
| 22 | **abwesend** / Abwesenheiten | `Teacher.unavailable` — when an Ausbildner is not there. The adjective labels one booking (conflict card, list tag); the noun heads the editor | Config list tag, conflict card kind, "Abwesenheiten" editor title |
| 23 | **gesperrt** / Sperrzeiten | `Room.unavailable` — when a Raum is blocked. Same split as #22: adjective on a booking, noun on the editor | Config list tag, conflict card kind, "Sperrzeiten" editor title |
| 24 | **fehlt n×** / **zu kurz** / **zu lang** / **ungleich** | The four not-done states, as one parallel set. *fehlt n×* = a Gruppe has none of it; *zu kurz* = has it, but under its Dauer; *zu lang* = over its Dauer; *ungleich* = every Gruppe has the full Dauer but not the same amount | Coverage status pill, sidebar chip badge |
| 25 | **vollständig** | Nothing missing, short, long or uneven. Marked by *no* pill — see F2 in `DESIGN-PASS.md` | Sidebar chip check mark |

### Chrome

| # | Term | Names | Where it shows |
|---|---|---|---|
| 27 | **Auswertungen** | The reports overlay (Abdeckung, Gruppenpläne, Ausbildnerpläne, Raumpläne) | Toolbar button, overlay title |
| 28 | **Konfiguration** | The settings dialog | Toolbar button, dialog title |
| 29 | **Plan** | The whole week's data — one plan per browser. *Planname*, *Plandatei* | Toolbar, Plan & Daten tab |
| 29a | **Darstellung** | How the Wochenplan is drawn on paper: *Modern* (the app's own sheet) or *Klassisch* (the look of the former Excel-Arbeitsprogramm). Deliberately not an *Art* — both draw the same week, so the choice is a rendering and not a second document. A Handzettel has none | Drucken dialog |
| 30 | **Verlauf** | The undo history menu | Undo caret tooltip, menu title ("Rückgängig bis …") |
| 31 | **Rückgängig / Wiederholen** | Undo / redo | Toolbar tooltips, toasts |
| 32 | **Schnellbearbeitung** | The popover beside a clicked Lektion | Popover aria-label, shortcut sheet |
| 33 | **Tastenkürzel** | The `?` shortcut sheet | Toolbar button, dialog title |
| 34 | **Legende** | The colour key for Ausbildner, Räume, Themen | Toolbar button |
| 35 | **Kürzel** | `shortName` on Ausbildner, Raum **and** Thema — what a card shows when the lane is too narrow for the full name. One word for all three; *Kurzname* was a fourth name for the same field | Ausbildner, Raum and Thema detail fields |
| 36 | **Pensum** | A Ausbildner's booked hours for the week | Ausbildner detail panel heading |
| 37 | **Belegung** / Belegungen | A Raum's bookings for the week | Raum detail panel heading, room plans |
| 38 | **Stellvertretung** | A Ausbildner running a Thema they are not the Vorgabe for; the counterpart is *abgegeben* | Ausbildner plans |
| 39 | **Lernziele / Notizen** | `Subject.content` — what the Thema is about | Thema "Inhalt" tab |
| 40 | **Planung / Inhalt** | The two sub-tabs of a Thema: how it is scheduled vs. what it is about. *Einrichtung* read as installation | Thema detail |
| 41 | **Zurücksetzen** | The reset-everything section. *Gefahrenzone* was a calque of GitHub's "Danger Zone"; in German it is a physical hazard area | Plan & Daten tab |

**Gendered agreement.** Two of these changed grammatical gender in an earlier rename and the surrounding words have to follow: `die Lehrperson` → **der** Ausbildner, `das Raster` → **den** Kalender. A blind find-and-replace leaves "auf das Kalender ziehen" and "Sie wird von allen Lektionen entfernt" behind. `Gruppenführer` → `Ausbildner` was gender-neutral (both masculine) and needed no such follow-up.

**One word per thing.** The grid is **der Kalender** — never *Stundenplan*, *Wochenraster* or *Raster*. Things are **angezeigt**, never *gezeichnet*: drawing is what the code does, not what the user sees.

---

## Domain Model

### Groups
The columns of the timetable. Each group must attend every non-break subject exactly once (coverage). Groups are labelled K, G1, G2, G3 by default. Groups have:
- `id: ID` — nanoid
- `label: string` — short display name (e.g. "G1")
- `enabled: boolean` — disabled groups are hidden from the calendar and skipped by conflict checks, but keep all their event data
- `order: number` — display order (left to right); can be changed via ▲/▼ buttons in Config

### Phases
The week is split into contiguous **phases**, each with its own set of lanes (groups). A Kader phase typically covers Mon–Tue with only the K group; a Gruppen phase covers Wed–Fri with G1–G3. Each phase is rendered as its own independent FullCalendar instance.
- `id: ID`
- `label: string` — shown as column-group header above the calendar
- `startDay: number` — inclusive, 0=Mon … 4=Fri
- `endDay: number` — inclusive
- `groupIds: ID[]` — which groups appear as lanes in this phase

Day ranges must be contiguous and non-overlapping across phases, and together must cover the entire week (Mon–Fri). The config panel warns when these invariants are violated.

### Teachers
- `id, name, shortName, color`
- `shortName` — initials shown on calendar event cards (auto-generated from name but editable)
- `color` — used as a visual indicator on event cards
- `unavailable: TimeWindow[]` — when they are *not* there (see Availability)

Teachers cause **hard conflicts** when the same teacher is booked for two overlapping events, or when booked inside one of their unavailable windows.

### Rooms
- `id, name, shortName, color, excludeFromConflictCheck`
- `shortName` — the 4–5 character code shown on cards, where the full name never fits. Empty means "derive it" (`roomShort()`), so it follows a rename.
- Rooms with `excludeFromConflictCheck: true` (e.g. "outside") never trigger conflicts even when double-booked.
- `unavailable: TimeWindow[]` — when the room is blocked

Rooms cause **soft conflicts** when two events share the same room at the same time (and the room isn't excluded), or when an event is booked into a blocked window. **`excludeFromConflictCheck` does not suppress blocked windows**: sharing a space is a property of the space, being booked by someone else is not.

### Availability (`TimeWindow`, `src/utils/availability.ts`)
Unavailability is modelled as *exceptions*, not opening hours — on a WK nearly everyone is there nearly all the time, so an empty list has to mean "available" or every teacher would need a full week entered before the conflict check said anything true.

```ts
interface TimeWindow { id, days: number[], startTime: 'HH:MM', endTime: 'HH:MM', note: string }
```
- All-day windows are stored as `00:00`–`24:00`; morning is `00:00`–`12:00`, afternoon `12:00`–`24:00`. `windowPreset()` maps times back to the preset chip; anything else is "custom".
- `windowOverlaps()` uses the same strict overlap as double-booking, so a lesson ending exactly when someone leaves is fine.
- Entry (`config/AvailabilityEditor.svelte`) is day-first: clicking a day in the *Add for* row creates an all-day window immediately; narrowing to a half day or exact times is the optional second step.

### Subjects
The draggable blocks. Subjects are displayed **alphabetically everywhere** (`sortSubjects`, `localeCompare` with `de` collation); the three kinds are kept in their own lists, in the order Themen → Programmpunkte → Pausen, everywhere they are listed (sidebar, legend, config list, placement picker). The stored array is insertion order and is never used for display. Each subject has:
- `id, name, color`
- `defaultTeacherIds: ID[]` — pre-assigned teachers (can be overridden per event)
- `defaultRoomId: ID | null` — pre-assigned room (can be overridden per event)
- `defaultDurationMinutes: number`
- `defaultDurationMinutes` — **also the target.** How long the subject takes is how much of it every group owes: a 2 h 30 min subject needs 2 h 30 min per group, delivered as one block or as 1 h 30 min + 1 h. There is deliberately no second field for this; a separate target could only ever disagree with the duration.
- `kind: 'lesson' | 'break' | 'oneoff'` — what the subject *is*, and therefore whether coverage applies:
  - `lesson` — a Thema of the rotation. Every enabled lane of its phase owes `defaultDurationMinutes` of it.
  - `break` — Mittagessen, Pause. Own sidebar list, own card style (`wk-ev-break`), never counted.
  - `oneoff` — a **Programmpunkt**. Drawn as a normal lesson card; kept out of coverage, out of the sidebar badge, out of `missingLanesForSubject`, and out of the "Gehört zu Phase" pin (a coverage setting with nothing to settle here).

  All three take part in teacher/room/group conflict checks — a lesson running through a group's lunch, or two Ausbildner double-booked by a Begrüssung, is a real clash either way. This replaced a boolean `isBreak`: every `!isBreak` test in the app meant "lesson", and a third kind had to make the compiler visit each of them (migration v11→v12).
- `isMultiGroup: boolean` — placing this subject schedules it across every enabled lane of the target phase at once (used for Mittagessen, Pause)
- `phaseId: ID | null` — which phase this subject is rotated through. `null` = infer from where it is placed. Set it so coverage judges a Kader lesson against the Kader lane instead of the group lanes.
- `content: { goals: string[]; notes: string }` — what the subject is *about*, as opposed to how it is scheduled. Nested so it can grow (material, handouts, references) without widening `Subject` itself. Edited in the Subjects tab's **Content** pane; goals get a row editor (`config/GoalsEditor.svelte`) where Enter opens the next line, Backspace on an empty line steps back, and pasting a block of lines becomes one goal per line.

### Events (CalendarEvent)
A placed instance of a subject:
- `id, subjectId`
- `groupId: GroupSelector` — a single group ID, or the string sentinel `ALL_GROUPS` (`'all'`) for a multi-group event
- `dayIndex: number` — 0=Mon … 4=Fri
- `startTime, endTime: string` — "HH:MM"
- `teacherIds: ID[] | 'inherit'` — `'inherit'` means use the subject's default
- `roomId: ID | null | 'inherit'` — `'inherit'` means use the subject's default; `null` means explicitly no room
- `conflicts?: ConflictRef[]` — computed at save time, not persisted; re-annotated on every setState call

**Multi-group lanes are resolved, not stored.** `eventGroupIds(state, ev)` expands `ALL_GROUPS` to the enabled lanes of the phase covering the event's day, every time it is read. Nothing snapshots the lane list at placement time, so enabling a group, adding a lane to a phase, or moving the event to another phase all take effect on existing lunch breaks with no repair step. A single-lane `groupId` resolves to `[]` when that group is disabled, which is what hides the event.

---

## Architecture

### Runtime
- **Svelte 5** with runes (`$state`, `$derived`, `$derived.by`, `$props`, `$bindable`, `$effect`). No class components, no stores — reactive state lives in a module-level `$state` variable in `store.svelte.ts`.
- **FullCalendar v6.1.20** with `@fullcalendar/resource-timegrid` (premium, GPL key for open-source use) and `@fullcalendar/interaction` (drag/resize/dateClick). `@fullcalendar/adaptive` was **removed**: its print mode flattens the time grid into a list of cards, which is the opposite of what a timetable on paper is for.
- **DaisyUI 5** + **Tailwind CSS v4** — component classes (btn, input, select, toggle, checkbox, badge, tabs, modal, navbar) plus utility classes. Theme tokens follow DaisyUI naming: `--color-base-100`, `--color-base-content`, `--color-primary`, etc.
- **nanoid** for ID generation.
- **Vite** for dev server and build; **Vitest** for unit tests over the pure logic.
- **Node via nvm** — always run `source ~/.nvm/nvm.sh && nvm use node` before any node/npm/vite commands.

### Design System (`src/app.css`)

**Palette.** daisyUI's stock theme colours are overridden with a steel blue primary and a Zivilschutz orange accent, in OKLCH, for `:root` (light) and `[data-theme='dark']`. The rule behind the choice: *no UI accent may sit in the range that user data uses*. Subject, teacher and room colours are data; the accent has to keep meaning "this is a control".

**Semantic tokens:**
```css
--wk-surface / --wk-surface-alt / --wk-surface-sunken
--wk-line / --wk-line-strong / --wk-line-faint
--wk-text / --wk-text-mute / --wk-text-faint
--wk-grid-fringe      /* non-business hours background */
--wk-day-band         /* alternating day tint in the grid */
--wk-axis-w: 56px     /* time gutter width — identical on every phase */
--wk-slot-h: 24px     /* height of one 15-min slot; the density control rewrites it */
--wk-fs-2xs … --wk-fs-xl   /* five-step type scale, nothing lands off it */
--wk-r-sm: 7px / --wk-r-md: 10px       /* two radii, not five */
--wk-shadow-1 / --wk-shadow-2          /* two elevations */
--wk-font             /* Inter, then the system stack */
```

Dark mode rebuilds the lines rather than re-tinting them: daisyUI's base-300 is darker than base-100 in a dark theme, so a border painted with it reads as nothing. Applied by setting `data-theme` on `<html>` from a `prefers-color-scheme` listener in App.svelte.

**Icons** (`src/utils/icons.ts`, `Icon.svelte`): a small inline-SVG set with Lucide geometry. `iconSvg(name, size)` returns markup for the contexts that build HTML strings (FullCalendar's `eventContent`); `<Icon name=… />` is the component form. The previous typographic glyphs (⚙ ▤ ⎙ ↩ ⠿ ⊞) sat on different baselines per platform and some rendered as tofu.

**Utility classes:** `.wk-eyebrow` (the one section-label style), `.wk-num` (tabular figures — on every time, count and duration).

### View state (`src/state/ui.svelte.ts`)

Deliberately separate from `store.svelte.ts`: none of it belongs in the saved schedule, and routing it through `setState` would push undo entries for merely looking at something.

| State | Purpose |
|---|---|
| `selectedEventIds` | The cards the keyboard acts on. A **list**: a rotation is otherwise nudged one lane at a time. The last entry is the *primary* one, which is what the quick-edit popover and Enter follow |
| `highlightedEventIds` | Cards to pulse while a conflict card is hovered |
| `spotlightSubjectId` | Hovering a sidebar chip dims every other card |
| `quickEdit` | `{ eventId, anchor }` for the popover beside a card |
| `reveal` | `{ id, token }` — "scroll to this card and flash it" |
| `density` | `compact` / `normal` / `comfortable` → `--wk-slot-h` (17/24/32 px), persisted under `wk-planner-ui` |
| `toasts` | One-at-a-time transient messages, with an optional inline action |

`applyDensity()` runs in `main.ts` **before** the app mounts — FullCalendar measures one slot row at first render and sizes the grid from it.

### State Management (`src/state/store.svelte.ts`)

Module-level `$state` variables: `_state: AppState`, `_conflicts: ConflictReport[]`, `_orphans: CalendarEvent[]`. All mutations go through `setState(next, opts?)` → `commit(next)`, which:
1. Pushes the current state to the undo stack (unless `recordUndo: false`, or the mutation coalesces — see below)
2. Runs `detectConflicts(next)` **once** and `attachConflicts(next, reports)`
3. Saves to localStorage (debounced)
4. Updates `_state`, `_conflicts`, `_orphans`

Views never call `detectConflicts` themselves — they read `getConflicts()`, `getOrphans()` and `getIssueCount()` (conflicts + orphans), so every badge in the app shows the same number and the O(n²) detection runs once per change rather than once per consumer.

**Undo labels.** Every mutation passes a `label` ("moving Funk Grundlagen", "copying Sanität to 2 lanes"). `undo()`/`redo()` restore the state *and* raise a toast naming what changed, with the inverse action inline. Labels are German verb phrases naming the action ("Sanität verschieben", "3 Blöcke löschen"); the toast reads "Rückgängig: …".

`undoSteps(n)` takes back several actions at once — what the toolbar's **history menu** does. Each hop still goes through `undoState`, so the redo stack is built exactly as it would be by pressing Ctrl+Z that many times; only the commit and the toast happen once.

`undoLabel()`, `redoLabel()` and `undoHistory()` all read state synced in `syncUndoState()`. The undo module's own peek functions are plain module variables, so a tooltip reading them directly re-rendered only by accident and sat one action behind the history menu beside it. Undo used to change the schedule with no acknowledgement at all, which is unnerving when the affected card is off-screen.

**Undo coalescing.** `setState(next, { coalesceKey })` merges consecutive mutations sharing a key into one undo entry. A `<input type="color">` fires an input event per mouse move; without this, one colour drag pushed ~50 entries and evicted the real history. The colour pickers pass `teacher-color:<id>` / `room-color:<id>` / `subject-color:<id>`. Any other mutation, undo, redo or reset clears the key.

Available mutations: `addEvent`, `updateEvent`, `updateEvents`, `removeEvent`, `removeEvents`, `duplicateEvents`, `placeSubject`, `splitEvent`, `copyEventToLanes`, `addTeacher`, `updateTeacher`, `removeTeacher`, `addRoom`, `updateRoom`, `removeRoom`, `addSubject`, `updateSubject`, `removeSubject`, `addGroup`, `updateGroup`, `removeGroup`, `moveGroupUp`, `moveGroupDown`, `moveGroupToIndex`, `addPhase`, `updatePhase`, `removePhase`, `setWkStartDate`, `resetToDefaults`, `undo`, `redo`. Query helpers: `eventCountForGroup`, `eventCountForPhase`, `lanesWithoutEvent`.

`updateEvents(ids, patch, verb)` applies one edit to a set as a single undo entry — the patch is a *function* because a nudge is relative (each block moves by its own 15 minutes, not to a shared time). `removeEvents` and `duplicateEvents` complete the batch trio; `duplicateEvents` returns the new ids so the caller can select the copies, since a duplicate that leaves the originals selected sends the next arrow key to the wrong blocks.

`copyEventToLanes(id, groupIds)` is the answer to the core chore of the domain: every group has to attend every lesson, so the same block was being dragged three or four times by hand. `lanesWithoutEvent(id)` supplies the candidate lanes (those of the event's phase that do not already hold this subject at this time).

`placeSubject(subjectId, dayIndex, startTime, groupId)` is the single creation path, shared by drag-drop, the cell picker and the keyboard placement dialog; it stores `ALL_GROUPS` for multi-group subjects and derives `endTime` from the subject default.

`removeGroup` cascades to: strip the group from every phase's `groupIds`, delete events pinned to that lane. Multi-group events survive — the phase simply has one lane fewer.
`removeTeacher` cascades to: strip teacher from subjects' `defaultTeacherIds` and events' `teacherIds`.
`removeRoom` cascades to: set `roomId` to `'inherit'` on events, set `defaultRoomId: null` on subjects.
`removeSubject` cascades to: remove all events of that subject.
`removePhase` cascades to: clear `phaseId` on subjects pinned to it.
`updateSubject` (duration change) cascades to: update end times of events whose duration still matched the old default (non-overridden events only).

### Persistence (`src/state/persistence.ts`)

localStorage key: `'wk-planner-state'`. Current schema version: **8**.

Loading runs `isValidState(parsed)` first — a shape check, not a migration. A truncated or hand-edited entry falls back to defaults instead of being cast to `AppState` and crashing on first render. State older than the current version is then stepped forward by `migrateState` (see Migrations). Only a hop with no migration — which includes state written by a *newer* build — reaches the old prompt to reset or load anyway.

**Plan file.** There is exactly one plan; a file is how it leaves the browser and how it comes back.
- `serializePlan(state)` — pretty-printed JSON with `conflicts` stripped, so a plan file survives being read, diffed and hand-fixed.
- `planFileName(state)` — `<slugified plan name>-<wkStartDate>.json`.
- `parsePlan(text)` — shape-checks and migrates on the way in, so an export taken before a schema change still opens. Returns a discriminated `{ ok }` result; the caller shows the error.
- `replacePlan(next)` in the store commits it and **clears undo**: a stack whose entries describe a different week is worse than no stack, because the first Ctrl+Z would silently restore the plan the user just left.

There is deliberately **no plan library / picker** — one plan in localStorage, files for everything else.

### Migrations (`src/state/migrations.ts`)

Stored state is stepped forward one version at a time rather than reset. Each step is a standalone function named for the hop it makes (`migrate_v5_to_v6`) plus one entry in the `MIGRATIONS` map keyed by the version it migrates *from*; deleting both removes the migration cleanly once nothing that old exists. Steps run on plain parsed JSON, not on `AppState` — the shape they receive is by definition the old one, so they cannot be typed against the current model.

`migrateState(raw, target)` chains the steps and returns `null` when some hop has no migration.

- **v5 → v6**: plan `name`, `subject.content` (goals + notes), `teacher.unavailable` and `room.unavailable`.
- **v6 → v7**: `subject.targetMinutesPerGroup`, defaulted to `0`. Removed again in v8 — kept only so a store written by a v7 build still steps forward cleanly.
- **v7 → v8**: drops `subject.targetMinutesPerGroup`. The target and the duration were always the same number, so coverage measures against `defaultDurationMinutes` instead.
- **v8 → v9**: `subject.shortName`, what a card falls back to once its lane is too narrow for the full name. Seeded empty so the derived form stays live through a rename.
- **v9 → v10**: `lastExportedAt`, seeded `null` rather than "now" — an existing plan genuinely has never been exported, and stamping it would suppress the first reminder for exactly the plans that have lived longest in one browser.
- **v10 → v11**: `room.shortName`, the card's room code. Seeded empty like `subject.shortName`, so the derived form stays live.
- **v11 → v12**: `subject.kind` (`'lesson' | 'break' | 'oneoff'`) replaces the boolean `subject.isBreak`, making room for the Programmpunkt. Nothing in an old store could be one, so every subject maps to `'break'` or `'lesson'`.

`saveState` strips `conflicts` from events and **debounces** the write by 200 ms, so a colour drag produces one localStorage write rather than one per mouse move. `flushSave()` forces a write; it is also wired to `beforeunload` and `pagehide` so nothing pending is lost.

`createDefaultState()` seeds: K group (Kader), G1/G2/G3, two phases (KVK Mon–Tue with K; WK Wed–Fri with G1/G2/G3), no teachers, no rooms, and two `kind: 'break'` subjects: Mittagessen (multi-group) and Pause. See **First run** for how the app leads out of that empty state.

### Undo/Redo (`src/state/undo.ts`)

Past/future stacks capped at 50 entries. Uses JSON deep-clone (no reactive proxies, no Dates in model). `pushUndo` on every `setState`. `undoState` / `redoState` swap current ↔ stack.

---

## UI Layout

```
┌─ Toolbar ──────────────────────────────────────────────────────────────────┐
│ WK Planner [Filter] [Legende]│ ‹ 7.9.–11.9. › │[S M L] ↩▾ ↪ ⚠ Auswertungen Drucken▾ ⌨ Konfiguration │
├─ main-area ────────────────────────────────────────────────────────────────┤
│ ◂ FÄCHER ▸   │ KVK              │ WK                   │ KONFLIKTE ▸       │
│  chip list   │  Mo   Di         │  Mi   Do   Fr        │  grouped panel    │
│  (Sidebar)   │  K    K          │  G1 G2 G3 …          │                   │
└──────────────┴──────────────────┴──────────────────────┴───────────────────┘
```

- **Toolbar** (`Toolbar.svelte`): wordmark, plan name (click to open Config → Plan & data), event filter, **Legend** popover (teacher/room/subject colours — nothing else in the app maps a colour to a name), compact week control with a date popover, **density** segmented control (S/M/L), icon-only undo/redo carrying the action name in their tooltips plus a caret opening the **undo history menu** (the last 12 labelled actions, newest first; picking the *n*-th undoes *n* steps), a **clickable issue badge** that opens the conflict panel, Reports, a **Drucken** button opening the print dialog, a **keyboard-shortcuts** button and Config.
- **Left sidebar** (`SidePanel.svelte` wrapping `Sidebar.svelte`): collapsible. Draggable subject chips split into Subjects and Breaks; each chip previews the card it will become (same spine, same tint recipe) and carries a coverage counter. Hovering a chip **spotlights** it on the grid — everything else dims — and its tooltip names the lanes still missing it. A filter box appears once there are more than eight subjects. Chips are buttons; activating one opens `PlaceDialog`.
- **Calendar area**: a flex row of phase segments. Each segment's `flex-grow` is proportional to `days × maxLanes`, so columns stay the same width across the week regardless of how many lanes a phase has. A `phase-label` strip shows phase names above the segments. Both segments share a single outer scroll container — `height: auto` + `stickyHeaderDates: true` on each FC instance means headers pin and bodies scroll together.
- **Right panel** (`SidePanel.svelte` wrapping `ConflictPanel.svelte`): collapsible, and **collapsed on load** — the rail keeps the issue badge in view, and the grid is what the app is opened to look at. Conflicts **grouped by resource** (one card per teacher/room/group, with a clash count) plus orphan events. Hovering a card flashes every involved card on the grid; clicking a row reveals and flashes that one instead of opening a modal over the grid you need to look at.
- **Selection** (`App.svelte`): a plain click selects one card. **Ctrl/Cmd-click** toggles a card in or out of the selection, **Shift-click** adds, **dragging across empty grid** draws a marquee that selects what it covers, and **Ctrl/Cmd+A** takes everything the grid is currently drawing (so the toolbar filter narrows it too). With more than one selected, a **selection bar** appears above the toasts naming the count and offering duplicate, delete and clear — a set has no popover and no modal, so without it nothing on screen says how many are selected. Dragging one card of a selection moves the whole set by the same day/time delta; lanes are deliberately left alone, because dropping five blocks into the one lane under the pointer would stack them.
- **Quick-edit popover** (`EventPopover.svelte`): a single click on a card selects it and opens a popover beside it with the three fields that actually change day to day — teachers, room, duration — plus copy-to-lanes, duplicate, delete and "Edit…". A double click goes straight to the full modal.
- **Toasts** (`Toasts.svelte`): bottom-centre, one at a time, used by undo/redo.

### Phase Layout Detail

Each phase is a `<div class="phase-seg">` containing one FullCalendar instance. The first phase reserves `--wk-axis-w` (56px) for the time gutter; every later phase gets `.phase-seg--noaxis`, which collapses its axis cell to zero width and drops its `flex-basis` to 0. The cell itself must stay — removing it from FC's column table collapses a lane to 0px and shortens the header, and the two grids stop lining up.

The `.phase-label` strip above the segments uses the same `flex-grow` values and `flex-basis: var(--wk-axis-w)` so labels align exactly with their calendars.

---

## FullCalendar Configuration (`Calendar.svelte`)

Each `Calendar` component receives a `phase: Phase` prop.

Key settings:
- `view`: `resourceTimeGrid` (generic, not `Week`)
- `initialDate`: `wkStartDate + phase.startDay` (always a specific Monday-relative date)
- `duration: { days: phaseDayCount(phase) }` — how many day columns (clamped to ≥1)
- `resources`: `groupsToResources(groups, phase.groupIds)` — only the enabled groups in this phase, sorted by `order`
- `datesAboveResources: true` — date headers above group (resource) headers
- `slotMinTime: '07:00'`, `slotMaxTime: '19:00'`, `slotDuration: '00:15:00'`, `snapDuration: '00:15:00'` — the grid starts **on the hour** so `slotLabelInterval` produces 08:00, 09:00 … instead of the old 07:30, 08:30 …; the outer scroller opens at 08:00 on load
- `businessHours: { startTime: '08:00', endTime: '17:00' }`
- `locale: deLocale` — German date formatting
- `editable: true`, `droppable: true` (accepts chips from sidebar)
- `height: 'auto'`, `stickyHeaderDates: true`
- `defaultRangeSeparator: '–'`
- `schedulerLicenseKey: 'GPL-My-Project-Is-Open-Source'`

**Only the first phase draws the time axis.** The others keep their axis *cell* (removing it drops a column from FC's table, which collapsed a lane to 0px and left the header a row shorter) but collapse it to zero width via `.phase-seg--noaxis`, and their `flex-basis` drops to 0. That is what removed the duplicated 07:00 gutter.

**Live clash preview.** `eventAllow` runs on every drag move: it never refuses a drop (conflicts stay advisory) but sets `data-clash="hard|soft"` on the calendar root, which tints the drag mirror. The cost of a drop is visible before the mouse is released.

The rules come from `previewClash(state, candidate)` in the **detector**, not from the component. The calendar used to carry its own copy of them, and the copy had drifted into three wrong answers: it compared `groupId` literally (so the all-lanes Mittagessen never matched and dropping a lesson onto lunch previewed nothing), it had no subject to resolve defaults from when the drag came from the sidebar (so a fresh chip never previewed a teacher or room clash its defaults guaranteed), and it never looked at availability windows at all. `previewClash` builds a probe `CalendarEvent` and runs it through the same `eventGroupIds` / `effectiveTeacherIds` / `effectiveRoomId` resolution every real event goes through.

**Marquee.** Implemented in `App.svelte` over `.phase-scroll`, so one rectangle spans every phase without either calendar knowing about it. It starts only on a `pointerdown` outside `.fc-event` and only once the pointer has travelled 6 px — below that it is still a click on an empty slot, which is how a subject gets placed without dragging. FullCalendar fires `dateClick` on the *mouseup* that ends the marquee, so the marquee claims that click via `suppressNextDateClick()` / `consumeDateClickGuard()` in `ui.svelte`.

**Row height.** `.fc-timegrid-slot { height: var(--wk-slot-h) !important }` — plus `.fc-timegrid-slots table { line-height: 0 }`, because even an empty table cell inherits a line-height strut and that strut put a ~25px floor under every row, silently swallowing the compact density. The calendars are keyed on the density in App.svelte so a change re-mounts them: FullCalendar caches the slot height it measured at render and `updateSize()` will not go back under it.

### Drag from sidebar
`Sidebar.svelte` initialises a FullCalendar `Draggable` on the chip container. When a chip is dropped onto any phase calendar, `handleEventReceive` fires.

`handleEventReceive` distinguishes two cases:
1. **Sidebar chip** (`extendedProps.subjectId` present, no `eventId`): calls `placeSubject`. Multi-group subjects are stored as `ALL_GROUPS`.
2. **Cross-phase drag** (`extendedProps.eventId` present): calls `updateEvent` with the new day/time/lane; a multi-group event keeps its `ALL_GROUPS` sentinel and simply follows the new phase's lanes. Also triggers `eventLeave` on the source calendar to refetch from store.

### Resize & drag within a phase
`handleEventDrop` and `handleEventResize` call `updateEvent` with the new day, startTime, endTime, and group (resource).

### Click on empty cell
`handleDateClick` opens a subject-picker popup (`.place-popup`) so users can schedule without dragging. It lists Themen (drawn even when empty, with a link into Konfiguration — on a fresh plan this picker was otherwise a dead end offering only the two Pausen), then Programmpunkte and Pausen where those exist, and ends with **«+ Neuer Programmpunkt …»** — the one thing the picker *creates* rather than places. See **Programmpunkte** below.

### Event click
`handleEventClick` sets `selectedEventId` → opens `EventModal`.

### Event rendering (`eventContent`)
`eventContent` returns an HTML string, so **every interpolated value is run through `escapeHtml`** (`src/utils/format.ts`) — subject, room and teacher names are user-entered config.

**The card is a neutral surface, not a fill.** `buildFCEvent` sends *no* inline colours; it puts the subject colour in `extendedProps.color`, and `eventDidMount` writes it to the element as `--ev-color`. `src/styles/calendar.css` mixes the tint (13% in light, 24% in dark), the border and the 3px left spine from that one value. Twelve lanes of full-strength colour had no hierarchy and left nothing louder for a conflict to be drawn in; this also lets dark mode use a different recipe instead of glowing.

`classNames` carry everything the CSS needs to key off:

| Class | Meaning |
|---|---|
| `wk-dur-xs/sm/md/lg` | ≤20 / ≤45 / ≤75 / >75 min — how much the card shows (see `durationBand`) |
| `wk-ev-break` / `wk-ev-lesson` | Breaks recede into a hatched, spineless band |
| `wk-ev-multi` | Drawn once per lane, so it stays quiet |
| `wk-ev-hard` / `wk-ev-soft` | Solid red outline + corner notch / dashed amber outline |

Applied from the DOM rather than rebuilt through the store: `wk-selected` (selection ring), `wk-flash` (revealed from the conflict panel), `wk-dimmed` (spotlighted from a sidebar chip).

**The ring and the hover lift are separate shadow layers** (`--wk-ring` and `--wk-lift`, composed in one `box-shadow`). Written as plain `box-shadow` declarations, `:hover` outranks `.wk-selected` on specificity, so pointing at a selected card replaced its ring with the plain hover shadow — the card you were about to act on was the one that looked unselected. `:hover:not(.wk-selected)` keeps the z-index bump off selected cards for the same reason.

Card content by band: title (clamped 1–3 lines, `hyphens: auto` with `lang="de-CH"` on the document — German compounds hyphenate or they clamp, they never break mid-word), the time range, teacher initials on their colour, the room pill. Flags: multi-group, overridden-from-default, conflict. `eventDidMount` also writes a full `title` tooltip, since a clamped title still has to be readable somewhere.

### What the card drops first

Two axes decide how much a card carries — its height (`wk-dur-*`) and its lane
width (container queries on the harness) — and they used to disagree about what
mattered, so two cards of the same width could show different fields because one
was taller. Both now drop from one priority order, tail first:

> **room pill → Ausbildner → end time → room name → start time**

The room leads because it is the *least* redundant thing on the card: a printed
Gruppenplan is read to find out where to walk. It used to be first to go — below
~92px the name vanished and left a colour swatch decodable only against the
Legende — while the time, which the grid states twice over, survived. So the room
now has its own 4–5 character code (`Room.shortName`, derived by `roomShort()`)
drawn as a tinted pill in the room's colour, which fits every lane the app draws.
Only below 48px — an overlap splitting an already narrow lane — does it fall back
to a plain colour tag.

**The start time goes first, on every card.** A block sitting on an hour rule is
next to an axis label that already says so, so the field carries nothing there.
Blocks starting *between* rules (08:30, 15:45) used to be marked `wk-ev-offgrid`
and keep their time down to the 92px floor — genuinely the only place that minute
appeared — but it cost a slot on the one row that also carries the people and the
place, and the minute is one click away in the quick-edit popover. The exception
and the class are gone; the time now drops like any other field.

Nothing in the meta row shrinks. A half-drawn pill or a time clipped to "13:(" is
worse than the field being absent, so when the row cannot hold everything a whole
field is dropped — and a card with height to spare wraps the row rather than
clipping it.

---

## Event Modal (`EventModal.svelte`)

Opens as a `<dialog>` when `selectedEventId` is set.

Editable fields:
- **Day** (select, Mon–Fri)
- **Lane** (select, derived from the day's phase — auto-restricted to lanes that phase actually draws, preventing orphan placements)
- **Start time** (time input, snapped to 15 min). Dragging on the grid stays the fast path, but an orphan event sits on no calendar to drag, so the modal has to be able to move it in time as well as in day/lane.
- **Teachers** (checkboxes, inheritable from subject default)
- **Room** (select, inheritable from subject default)
- **Duration** (number input in minutes, inheritable from subject default)

Each field shows an `overridden` badge and a `↩ reset` button when it departs from the subject default.

For a **Programmpunkt** (`subject.kind === 'oneoff'`) the header title is an input rather than an `<h3>`, writing through to `updateSubject(subjectId, { name })` coalesced under `modal:name:<subjectId>`. A one-off *is* its one card — the definition has no other placement to speak for — so renaming it from Konfiguration and back would be a detour past the point of making it inline. Every other kind keeps the plain heading: a library entry several cards share must not be renamed from one of them. An empty field is never committed.

**The modal autosaves.** It has no Speichern and no Abbrechen: every field writes
straight through `updateEvent`, coalesced under one key so a typed duration is a
single undo entry. It used to buffer into locals and commit only on Speichern,
which meant Escape and a backdrop click discarded the edit silently — in an app
where Escape is safe on every other surface, and where the quick-edit popover
editing the *same three fields* had always written immediately. Ctrl+Z is the way
back, everywhere.

**Cross-phase move logic**: When the user changes the day, `targetPhase` is derived as the phase whose day range covers that day. `laneOptions` is derived as the enabled groups in `targetPhase`. `targetGroupId` falls back to `laneOptions[0]` if the current group isn't in the new phase. A warning is shown if no phase covers the chosen day, or if the target phase has no active lanes. Multi-group events need no re-mapping — they keep `ALL_GROUPS`.

**Split** offers only the slots strictly inside the event (`start + 15` … `end − 15`), so there is no invalid choice left to warn about, and the action is disabled below 30 minutes — an event of one slot has no legal cut.

Other actions: **Delete**, **Split**, **Duplicate**, and **To lanes** — copy this lesson onto the other lanes of its phase at the same time (`copyEventToLanes`). The header lists the event's own clashes by name, since that is usually why the modal was opened. A disabled "Alle Gruppen" says *why* in its tooltip (one-lane phase vs. every lane already booked).

## Place Dialog (`PlaceDialog.svelte`)

The keyboard path for scheduling. Sidebar chips are `<button>`s: activating one (click or Enter/Space) opens this dialog with day, lane and start-time selects, prefilled from the subject's `phaseId` where it has one. Dragging remains the mouse fast path — a click that travelled more than 5 px from its `pointerdown` is treated as the tail of a drag and does not open the dialog.

---

## Programmpunkte (`ProgrammpunktDialog.svelte`)

**The problem.** The rotation is planned from the sidebar: a Thema exists first, then gets placed once per Gruppe, and coverage tracks the debt. The fixed points of a WK day are the other way round — a Begrüssung happens at 08:00 on Wednesday, for everyone, and that is the whole of it. Making one as a Thema meant leaving the grid, inventing a subject nobody owes, coming back, and then living with a sidebar chip reading «3 fehlen» for the rest of the week.

**The flow.** Click an empty cell → placement picker → «+ Neuer Programmpunkt …» → a small dialog → the card is placed and the **quick-edit popover opens on it**.

The dialog asks only what the click could not answer. Day, time and lane come from the cell and are shown read-only in the header (`Do 10.9. · 11:15–11:45 · G1`, or the whole lane list once «Alle Gruppen» is chosen). Four fields:

| Field | Notes |
|---|---|
| **Name** | Required, autofocused, Enter submits |
| **Dauer** | `DurationField`, default 30 min — Begrüssung, Antreten and Rapport are all shorter than a lesson |
| **Für** | «Nur G2» / «Alle Gruppen», writing `subject.isMultiGroup` → the existing `ALL_GROUPS` machinery, so all-lanes needed no new model |
| **Farbe** | `ColorPicker`, seeded from `generateDistinctColor()` |

Ausbildner and Raum are deliberately **not** in the dialog: the quick edit opens on the new card the moment it closes, and that is where those two are set everywhere else in the app — and it carries the route on to the full editor. `quickEditNewCard` measures the anchor a `requestAnimationFrame` later, since the card only exists once FullCalendar has repainted.

**One commit.** `createProgrammpunkt(draft, dayIndex, startTime, groupId)` adds the subject *and* its event in a single `setState`. As two actions, one Ctrl+Z would take back the card and leave an orphan Thema in Konfiguration that nothing on the grid explained. It returns the new event id.

**Name reuse.** A name that already belongs to a Programmpunkt (trimmed, case-insensitive) reuses that definition instead of making a second one — the «Antreten again on Thursday» path, and equally the retype after a delete. The dialog says so before the click, so the colour picker cannot look like it did nothing. The first definition wins: a reuse is a placement, not an edit, and the reused subject also decides the lane rule so the same Antreten cannot be all-lanes on one day and single-lane the next.

**No garbage collection.** Deleting the last card leaves the definition standing, listed in the sidebar's Programmpunkte block ready to be placed again. Removing it for good is the same delete as any other Thema, in Konfiguration.

**Known limitation.** Setting a Ausbildner or Raum on a Programmpunkt from either editor stores an *event override*, so its Konfiguration entry still shows no default. Nothing reads the wrong value — every report resolves effective values through `effectiveTeacherIds` / `effectiveRoomId` — so the two editors are left un-special-cased rather than growing a write-through branch each.

---

## Conflict System

### Detection (`src/conflicts/detector.ts`)

`detectConflicts(state)` → `ConflictReport[]`

Iterates all events with at least one enabled lane (`eventGroupIds(state, ev).length > 0`; an event hidden by a disabled group raises nothing, which is the point of disabling it). For each event, records intervals in three maps (by teacher ID, room ID, group ID). After all events are processed, pairwise overlap checks produce `ConflictReport` entries. Overlap is strict (`aStart < bEnd && bStart < aEnd`), so back-to-back events do not clash.

- **Hard** (`kind: 'teacher'`, `'group'` or `'teacher-absent'`): same teacher or group in two overlapping time slots, or a teacher booked while away
- **Soft** (`kind: 'room'` or `'room-blocked'`): same room double-booked (skipped when `excludeFromConflictCheck`), or a room booked while blocked

Hard vs soft is decided by `isHardConflict(kind)` in `types.ts`, which both the detector's consumers and `buildFCEvent` read — the two used to encode the same list separately.

**Availability reports involve one event, not a pair.** They are collected in their own pass over the events and carry an optional `detail` string ("away Wed, Thu · afternoon (Kurs in Bern)") that the conflict panel prints under the resource name. `attachConflicts` gives such an event a `ConflictRef` with an empty `collidingEventIds`.

Breaks (`subject.isBreak`) participate in **all three** checks. A lesson running through a group's lunch is a real clash, so group conflicts include breaks; they are only excluded from *coverage*. A multi-group event contributes one interval per resolved lane and therefore never collides with itself.

### Annotation
`attachConflicts(state, reports)` attaches a `conflicts: ConflictRef[]` array to each event, which the calendar's `eventContent` renderer reads to add red borders. It is separate from `detectConflicts` so that `commit` in the store detects once and shares the one result between the annotated events, the conflict panel and the badges.

### Conflict Panel (`ConflictPanel.svelte`)

**It floats over the grid rather than taking width from it.** `SidePanel` gets an
`overlay` prop; App wraps it in a 40px `.right-dock` that keeps the collapsed
rail in the flex row while the open panel is absolutely positioned out of it.
Docking it in flow cost the calendar ~268px at exactly the moment the cards had
to be readable — "Persönliche Ausrüstung" became "Persönl iche…" the instant the
panel opened.

**The header names both units.** `getIssueCount()` counts clash *relations*: one
badly placed Lektion overlapping two others on both a Ausbildner and a Raum
raises four reports, and is then listed under a Ausbildner card *and* a Raum
card. That is the right thing to group by and the wrong thing to hand someone as
"how much is left", so `getAffectedEventCount()` prints beside it — "18 Konflikte
· 23 Lektionen betroffen".

**Each row offers the fix.** Hovering a row reveals a `+N′` button on the *later*
event of a pair: the nudge, rounded up to the grid's own 15-minute slot, that
takes it out of that overlap. Availability clashes involve no second event and
get none. The panel was diagnosis-only, with the commonest resolution two clicks
away in a popover it does not open.

Shows:
- A "No conflicts" green card when `conflicts.length === 0 && orphans.length === 0`
- Orphan events (events that fall outside every phase's day/lane combination, despite having enabled lanes) — clicking one opens its modal
- Per-conflict cards (hard = red border, soft = yellow border), listing the involved events with clickable buttons

### Orphan Events
`orphanEvents(state)` returns events no phase would render despite not being deliberately hidden: a single-lane event whose group is enabled but whose day/lane combination no phase draws, or a multi-group event on a day no phase covers. Events whose lanes are all disabled are *not* orphans — hiding them is the point of disabling a group. Orphans are counted alongside conflicts everywhere (`getIssueCount()`), so the toolbar badge, the collapsed rail badge and the panel header always agree.

---

## Reports (`ReportPanel.svelte`, `src/reports/reports.ts`)

A full-screen overlay (not a `<dialog>`) at a **fixed 86vh**, with four tabs: Abdeckung, Gruppenpläne, Ausbildnerpläne, Raumpläne. Three of them are the documents a WK hands out; Abdeckung is read here and acted on here. Its **Drucken** button hands the current tab to the PDF dialog and is hidden on the Abdeckung tab — see [Printing](#printing). The panel owns its tab after mount, so it reports the live one back through `ontab`; Ctrl+P has to print what is on screen.

### Coverage tab
`buildCoverage(state)` → one section per phase. Each section lists the **Themen** (`kind === 'lesson'`) that belong to that phase, and for each group shows how many times that subject has been placed. Missing combinations are highlighted. Pausen and Programmpunkte are excluded: neither carries a per-group Soll — a Pause is placed ad hoc rather than attended, and a Programmpunkt happens once for the whole course. They still appear in the group, teacher and room plans, and a Programmpunkt still counts towards a group's `lessonMinutes` (a Begrüssung is time the group is occupied; only breaks are left out of that total).

Coverage is measured in **minutes against the subject's own duration**, and the instance count is small print under the time. `coverageStatus(row)` is the single definition of how a row reads:

| Status | When |
|---|---|
| `missing` | a lane has none of it |
| `short` | every lane has some, but at least one is under the duration |
| `over` | at least one lane has **more** than the subject's duration |
| `uneven` | every lane has the full duration, but the totals differ |
| `complete` | every lane has exactly the duration |

`over` exists because `uneven` can only ever see a difference *between* lanes: a
one-lane phase has nothing to differ from, so a Kader subject planned for 6 h
against a Soll of 3 h read as `complete` — and so did a subject placed at double
its duration in *every* lane, where `max === min`. Over-planning is a mistake
whether or not it was made evenly. `over` outranks `uneven` in `coverageStatus`,
because "zu viel" names the amount that is wrong where "ungleich" names only the
spread.

**A gap in the table is a button.** A `missing` or `short` cell opens
`PlaceDialog` prefilled with that Thema, that Gruppe and the phase's first day —
the pair the report has just named is everything the dialog needs, and it used to
be inert text the user had to memorise, close the overlay and re-enter by hand.
The sidebar chip does the same on activation, seeded with its first missing lane.

Splitting is free: 2×45 and 1×90 both deliver a 90-minute subject and both read `complete`. What used to be flagged — differing *instance counts* — is no longer a mistake, so `uneven` was redefined onto the minutes, where an unequal total still is one.

**The sidebar chip reads the same verdict.** `coverageForSubject` returns `uneven` and `short` alongside `placed`/`total`, and the chip goes amber rather than green for either. A green 3/3 on the chip while the report called the same row short was the badge people look at all day being the one that was wrong.

`subjectPhases(state, subjectId)` decides where a subject is judged: an explicit `subject.phaseId` wins; otherwise the phases it is actually placed in; otherwise (nothing placed yet) the widest phase. The `phaseId` control exists because the fallback guesses — a Kader-only lesson would show as 0/3 against the group lanes until first placed.

### Teacher plans tab
`buildTeacherPlans(state)` → one section per teacher. Shows all events that teacher is involved in (as assigned teacher or as stand-in), grouped by subject. Entries can be:
- `'teaching'`: the teacher is on this event
- `'covering'`: the teacher replaced the subject's default
- `'handed-over'`: the subject's default includes this teacher but the event was assigned to someone else

A teacher filter dropdown (single-select) is shown when this tab is active.

### Group plans tab
`buildGroupPlans(state)` → one section per enabled group: the whole week in order, **breaks included** (a participant's day is not a list of lessons), grouped by day, with teachers and room per entry. This is the sheet a group gets handed.

### Room plans tab
`buildRoomPlans(state)` → one section per room: every booking by day, with the group and the teachers. Shared spaces are marked.

### Workload (`teacherLoad`, `roomLoad`)
What one teacher or one room is booked for — count, minutes, days on duty, and the subjects that name them as a default. The config detail panes used to work this out for themselves, and it had already drifted: the teacher pane counted events on switched-off groups and the report did not, so the same week showed two different hour counts depending on where you looked. Both now read `isEventActive(state, ev)`, the one predicate for "this event is on the plan at all", which the detector uses too.

The panel has no print layout of its own any more — the `@media print` block that gave each plan its own page is gone. Drucken hands the tab to the PDF dialog instead; see [Printing](#printing). (`.print-title` survives in the markup and is simply never shown.)

---

## Sidebar (`Sidebar.svelte`)

Three sections: **Themen**, **Programmpunkte** and **Pausen**. Themen is drawn even when empty (it is the only thing that names where subjects come from on a fresh plan); the other two appear only once they have something in them. Only Themen chips carry a coverage badge — the other two kinds have no lane debt to report, so `coverageForSubject` and `missingLanesForSubject` both return empty for them and the chip falls back to the plain "drag or click" tooltip. Each chip is a `<button>` (focusable and keyboard-operable) showing a spine and tint in the subject colour (a preview of the card it becomes), a drag handle, the name, a layers icon for multi-group subjects, and a coverage counter `placed/total` — green only when every lane has the subject's full duration and no lane has more, amber otherwise.

Hovering or focusing a chip calls `spotlightSubject`, which dims every non-matching card on the grid — the answer to "where is this one still missing?". The tooltip names the missing lanes (`missingLanesForSubject`), including the lanes that have the subject but still owe minutes, and how many ("G2 (noch 45 min)"). A filter box appears above the list once there are more than eight subjects.

Chips are made draggable via FullCalendar's `Draggable` class, attached to the chip container element. Activating a chip opens `PlaceDialog` — see the drag-vs-click guard described there.

---

## Config Panel (`ConfigPanel.svelte` + `components/config/`)

A `<dialog>` with six tabs (Gruppen, Phasen, Ausbildner, Räume, Themen, Plan & Daten) and a **fixed height (82vh)** — a short tab used to shrink the dialog and move the tab strip out from under the pointer mid-click. Each tab opens with a one-line summary and an ⓘ that expands the full explanation, rather than re-reading a paragraph on every visit. Groups and Phases are single-column tables held in `ConfigPanel.svelte`. Teachers, Rooms and Subjects are composed from:

- `config/MasterDetail.svelte` — the generic list + add-row + detail-pane scaffold, parameterised by a `row` snippet and a `detail` snippet.
- `config/ColorPicker.svelte` — a visible swatch that opens a curated 18-colour ramp plus a custom well. Colour used to be hidden behind clicking an avatar, with no affordance at all, and the raw OS picker let people choose colours no card could survive.
- `config/TeacherDetail.svelte`, `config/RoomDetail.svelte` — edit-only panes for an existing entity; creation is the list's **quick add** (a name and Enter, colour and short name derived, everything else on a default and editable right after). Asking for a colour and a short name up front made adding six teachers a chore.
- `config/SubjectDetail.svelte` — still serves **both** create and edit from one set of markup, because a subject has real choices to make at creation: `view` is either the stored entity or a local draft, and `set()` either autosaves through the store or accumulates into the draft. ConfigPanel keys it on the entity id, so changing selection remounts with a fresh draft.
- `config/AddRow.svelte` — the one way to add something: an eyebrow label, a name field and a primary button naming the action. It is a `<form>`, so Enter in the field and the button do the same thing everywhere. `stacked` wraps the three parts for the 232px master-detail column rather than shrinking the button to a bare icon. `nextValue` seeds and re-seeds the field (group labels run G1, G2, G3…, so adding a lane is just Enter).
- `config/AvailabilityEditor.svelte`, `config/GoalsEditor.svelte` — see Availability and Subjects.
- The **detail footer is sticky** (`position: sticky; bottom: 0` inside the scrolling `.detail-form`), so Create/Delete stays reachable without scrolling past the optional half of the form.
- `src/styles/config-ui.css` — the shared visual language (`.list-panel`, `.detail-form`, `.section`, `.option-row`, `.picker-chip`, …), imported from `app.css` because these classes are used across several components.

### Groups tab
Table with a drag handle (rows *are* the columns of the timetable, so dragging them is the matching gesture — `moveGroupToIndex`, one undo entry), enabled toggle, label input, ▲/▼ for the keyboard, delete. Add group form at the bottom. Changing `enabled` doesn't delete events; they remain but are hidden. Deleting confirms first and names how many events go with the lane (`eventCountForGroup`).

### Phases tab
A **week strip** across the top shows Mon–Fri with the phase that owns each day (uncovered days are hatched in red) — phases are the one concept a new user won't guess, and this explains the model at a glance. Below it, a table with label, From/To day selects (dragging one end past the other moves the other to maintain valid range), lane checkboxes (one per group), delete. Rows are sorted by `startDay`, matching the calendar. Warning banner appears when phases overlap, leave gaps, or have no lanes. Deleting confirms first and warns how many events would stop being drawn (`eventCountForPhase`). Add phase form at bottom.

### Teachers tab
Quick-add row at the foot of the list (name + Enter). List on left (coloured avatar, `away` tag when they have windows), detail on right: colour swatch, full name, short name, an **Away** editor, and a **Load this week** panel — lessons, hours in front of a group, days on duty, and the subjects they are the default teacher for. The pane was two text fields in a 1000px dialog; the load is what you open a teacher to find out. Autosaved on change.

### Rooms tab
Quick-add row at the foot of the list. List on left (coloured swatch, `blocked` / `shared` tags), detail on right: colour, name, "Ignore conflicts" toggle, a **Blocked** editor, and an **Occupancy this week** panel (bookings, hours in use, subjects defaulting here). Autosaved.

### Subjects tab
List on left (colour dot + a `Pause` / `Programmpunkt` row tag), alphabetical, Themen → Programmpunkte → Pausen. The detail pane has two sub-tabs, because how a subject is *scheduled* and what it is *about* are consulted at different moments and stacking them pushed the create button below the fold:
- **Planung** — Bezeichnung (name + colour swatch), Vorgaben (Ausbildner picker grid, Raum select, Dauer presets + numeric input — the Dauer hint says it is also the per-group target), Art (Lektion/Programmpunkt/Pause, Einzelne Gruppe/Alle Gruppen), Erweitert (Belongs-to-phase select — shown for Lektion only, since it is a coverage setting), and a Platzierung panel. The Art control is also the escape hatch both ways: a Thema made by mistake can become a Programmpunkt, and a Programmpunkt that turns out to be part of the rotation can become a Thema.
- **Inhalt** — Lernziele (row editor) and Notizen (textarea). The tab carries a count badge.

Autosaved.

Duration change cascades to all events whose duration still matched the old default.

Subjects also show a **Placement** panel (instances on the grid, and — for Themen only — lanes covered and which lanes are still missing).

### Plan & data tab
The plan's own settings, and the only destructive control in the app:
- **Plan name** — shown in the toolbar, on the printed reports, and used for the export file name.
- **Plan file** — Export (Blob download) and Import (hidden file input; parse → confirm naming the incoming plan and its event count → `replacePlan` → close the dialog). A parse error is shown in place rather than in an alert.
- **Danger zone** — **Reset all data**. It used to be a disclosure in the dialog footer, repeated under every tab; a destructive action does not need to be one mis-click away from five unrelated panes.

---

## Motion

The app's motion is all *feedback*; nothing decorative. There is a single global
`@media (prefers-reduced-motion: reduce)` block in `app.css` zeroing every
duration and iteration count, and `Calendar.svelte` reads the same query in JS to
pick `scrollIntoView`'s `behavior` — the one motion CSS cannot reach.

| What | Where | Why |
|---|---|---|
| `wk-flash`, 0.7s × 1 | Calendar | "It landed here." Fired by `flashEvents()` after undo, redo, `placeSubject`, `duplicateEvents`, `splitEvent` and `copyEventToLanes` — every mutation that changes the grid somewhere the user is not looking. Undo used to name the action in a toast and never answer *where*; copy-to-lanes created four cards at once in silence. It scrolls only when none of the affected cards is already on screen. |
| Reveal | Conflict panel | Same flash, but always scrolls: the whole request is to go somewhere. |
| Spotlight, 120 ms enter delay | `spotlightSubject()` | Hover *intent*. Engaging on the raw `mouseenter` of every chip the pointer crossed made a sweep down the list strobe the grid a dozen times. Leaving is immediate. |
| Badge tick, 150 ms | Toolbar | A drop in the conflict count is the only signal that the last edit helped, and it used to happen between two frames. |
| Selection bar, 120 ms rise | App | Matches the toast it sits above, which already had one. |
| Clash outline | Calendar | Not an animation: while dragging, `previewClashDetail` returns the ids it collided with and they are outlined. The mirror's red tint said a price would be paid without saying to whom. |

**Deliberately not animated:** grid layout (row heights, lane widths, density —
the calendars re-mount on a density change and a tween would fight
FullCalendar's own measurement); card position on drop (the drop *is* the
feedback); dialog open/close beyond the scrim; the sidebar chip list. The
`.side-panel` width transition was removed for the same reason it existed: the
panel eased over 0.15s while the calendars inside re-laid out in a single frame.

## First run

`createDefaultState()` ships four Gruppen, two Phasen, the two Pausen — and zero
Themen, Ausbildner and Räume. Both ways of placing something therefore
dead-ended on a fresh plan: the sidebar hid its THEMEN heading when the list was
empty, and the empty-cell picker offered only Mittagessen and Pause, while the
grid's empty state told the user to drag "ein Thema" out of a panel that showed
none.

Three surfaces now carry the same way forward, all of them routing through
`requestConfig('subjects', { createSubject: true })`:

- the sidebar's THEMEN section, which is always rendered, with "Noch keine Themen · **Erstes Thema anlegen**";
- the empty-cell placement picker, which always lists a Themen group;
- the grid's empty state, which swaps its copy for a titled call to action while no non-break subject exists.

`ConfigPanel` takes `initialTab` and `createSubject` so it opens on Themen with a
blank draft. The grid hint is anchored beside the sidebar (and outside
`.phase-scroll`, or it scrolls under the sticky day headers) rather than centred
three phases away behind a lone ← .

## Losing the plan

The week lives in one origin's `localStorage`. `AppState.lastExportedAt` (v10)
records when it was last written to a file; `markExported()` stamps it on export
and deliberately does **not** push an undo entry — it is a fact about the outside
world. `exportStaleness()` reports the plan as stale once it holds at least 8
Lektionen and has either never been exported or not been exported for 3 days, and
the toolbar shows a quiet dismissible chip ("nie gesichert" / "vor N T.
gesichert") linking to Plan & Daten. The fact was previously stated exactly once,
on the sixth tab of a dialog.

## Printing

Everything printable is generated as a **real PDF** (`src/print/`, jsPDF) and previewed in the dialog before it is printed. **Abdeckung is not printable**: it is an analysis table you act on in the app, not something anyone hands out.

The toolbar's **Drucken** is a single button, not a menu. Every entry of the menu it replaced opened this same dialog and then asked the same question again with the answer already filled in. **Ctrl/Cmd+P** opens the same dialog — on the report you are looking at if the Auswertungen overlay is open, otherwise on the Wochenplan. It is handled before the text-field guard in `handleGridKeys`, because printing is not an editing action.

### Two categories, not four siblings

The dialog asks for the **Art** first — *Wochenplan* or *Handzettel* — and only then, for a Handzettel, which one. Flattened into one row of four buttons, the controls below changed shape depending on the pick with nothing on screen saying why.

What is **shared**: Art, **Ausrichtung**, Stand, the preview, and the three footer actions. Both documents are sheets of A4 and both can be turned, so Quer/Hoch is one control with one pair of labels.

What stays **separate**: *Phasen* (Wochenplan only — a slip has no phase axis to filter), and *Ein Blatt pro* + *Blätter pro Seite* (Handzettel only — a week grid is always one page).

Ausrichtung is the interesting one: **one control, two remembered values**. Quer/Hoch means the same thing for both documents, but the good default is opposite — a week of lane columns is wide, a slip is a tall list — so sharing a single value would hand you the wrong sheet every time you switched Art. The control is shared; the state is per category.

### Cut-out plans (`boxes.ts`, `layout.ts`, `pdf.ts`)

The three plan reports print as *boxes* on A4 portrait — one box per Gruppe, Ausbildner or belegtem Raum — laid out on a grid with cut marks, so a sheet can be cut up into handouts. Every box repeats its own header and footer, because after cutting there is no page left to say whose plan it is.

| Module | Job |
| --- | --- |
| `boxes.ts` | `buildPrintDoc(state, target)` reduces a report to `PrintBox`es. Rows carry a `PrintCell` (`full` + `short`) per column. |
| `layout.ts` | The fitter. Grid candidates, the three type tiers, `boxHeight`, `paginateBox`, `autoFit`. Pure arithmetic, fully tested. |
| `pdf.ts` | jsPDF drawing: absolute geometry, column allocation, cut marks. |

**Rows never wrap.** That is what makes a box's height a pure function of its row count, which is what lets `autoFit` try every grid against every box without rendering anything. A cell that will not fit falls back to its explicit short name (`Subject.shortName`, `Room.shortName`, teacher initials) and only then to an ellipsis — *derived* short names are deliberately not used here: "Aussenplatz" cut to "Ausse" earns its keep in a 70 px lane, not on paper.

`autoFit` picks the **densest A4 division on which every box still fits whole**. The tables are transposed per orientation — Hoch 1×1, 1×2, 2×2, 2×3, 2×4; Quer 1×1, 2×1, 2×2, 3×2, 4×2 — so a slip keeps roughly the same shape either way and both offer the same counts (1, 2, 4, 6, 8). That is what lets the *Blätter pro Seite* buttons keep one set of labels no matter which way the sheet is turned. A box too big even for a full sheet continues into a further slip labelled "Blatt 1/2". The dialog lets the user override the count, and the preview is the real PDF, so an over-dense choice shows its own overflow before any paper is spent.

Column widths are measured **once per document** from the content, so every slip of one report divides its width identically. Each column's floor is its short-form width, capped (45 / 24 / 30 % of the row) so a Thema with no short name cannot starve the Raum column.

No font is embedded: jsPDF's built-in Helvetica is WinAnsi-encoded, which covers the umlauts and ß this app is full of.

`PrintDialog.svelte` owns the UI — category, target, boxes per page, phases, orientation, and a **Stand** checkbox (date *and* time, so a sheet on a wall can be dated; off for a final print).

### The week grid (`calendar.ts`, `calendarPdf.ts`)

`buildCalendarDoc(state, phaseIds)` states what the grid *is* — lane columns under day headers, minutes down the side — and `renderCalendarPdf` sizes that to the sheet. The minute scale is whatever makes the day fill the page, so the type size no longer depends on how wide the browser window happened to be. One page, A4, **Quer or Hoch**.

- **Phase checkboxes.** A KVK and a Gruppenrotation are two documents for two audiences. Unchecking a phase drops its days *entirely* and the rest widen to fill the sheet — `buildCalendarDoc` never emits the columns, so there is no empty band to explain.
- **The time range is the day's own extent**, opened out to whole hours and floored at four. Printing 07:00–19:00 when nothing starts before 08:00 spends a seventh of the sheet on a band that, on paper, cannot be scrolled past.
- **Blocks are a tint of the subject colour with a solid bar on the left**, not the full hue: a saturated block behind 6 pt text is unreadable on paper and expensive to print, and the bar keeps the colour decodable against the Legende.
- **Conflicts are drawn**: red border, solid for hard, dashed for soft. Long blocks are painted first, so a short one placed inside one is not hidden under it — the sheet has no z-index, only paint order.
- **A card is a stack, not a sentence.** The Thema wraps, then the Raum gets its own line or two, then the Ausbildner — each wrapped, each falling back to its short form, each dropped whole rather than half-drawn. The single joined meta row this replaced spent one line on everything and truncated the lot: `CG · Schutzanlage Bern…` cut off the field a printed plan is read for, while nine empty lines sat underneath it. Raum precedes Ausbildner because it is the less recoverable of the two.
- **No time on the card.** The axis states it, and the off-hour exception (a card starting 09:45 printing its own time) cost the line the Raum now uses.
- A block under 4.6 mm (a 15-minute Pause) gets **one centred line** instead of the stacked layout; drawn blank it read as a printing artefact rather than a block.

### The abbreviation key (`legend.ts`)

A card falls back to a Kürzel the moment its lane is too narrow for the full
name, and paper has no tooltip to recover it from. So both week grids print a
**Abkürzungen** band listing every short form a block on *that sheet* could show,
with its full name.

`buildCalendarDoc` collects it while it builds the entries — only Themen, Räume
and Ausbildner actually placed on the printed columns, keyed by kind + short so a
Raum on twelve cards is listed once, and skipping anything whose Kürzel equals
its name. It is ordered Thema → Raum → Ausbildner, the same sequence the card
drops them in, so the key reads in the order of the block it explains.

**It goes below the grid, not into it.** The grid's white space is tempting —
nobody teaches at 07:00, the Kader lanes are empty for three days — and an
earlier version placed the key in the largest block-free rectangle. But an empty
cell is a statement about the week, and a key printed into one makes the plan look
fuller than it is. A band between the grid and the footer is also always in the
same place, which is what makes it findable.

`measureLegend` lays it out against the sheet: the column width is the longest
`KÜR = Name` in it, so the number of columns follows from the page and the
content rather than being fixed. Entries run *down* each column before starting
the next, so a long list reads as a list. `drawLegend` takes an ink and a muted
colour, which is all the two sheets differ by. The grid gives up exactly the
height the key measures; with nothing to explain, no band is reserved at all.

### Klassische Darstellung (`calendarClassicPdf.ts`)

The Arbeitsprogramm used to be made in Excel, and the supervisors who sign it off
have read that sheet for years. **Darstellung** — *Modern* (default) or
*Klassisch* — draws the same `CalendarDoc` the other way, so the plan can be
handed upwards in the shape its readers already know. It is a rendering, not a
document: the Art, the Phasen, the Ausrichtung and the Stand all still apply, and
only the Wochenplan has it (the Excel had no handout).

It is **not a replica**. The vertical "Aktualisieren Unterlagen" text and the
Excel footer stay out; conflicts keep the red border the Excel had no way to draw.

| | Modern | Klassisch |
|---|---|---|
| Block fill | tint + a 1.1 mm colour bar | the subject colour at full strength |
| Block text | left-aligned stack: Thema → Raum → Ausbildner | centred both ways: Thema, then one italic `Raum, Ausbildner` line |
| Text colour | fixed slate | `getContrastColor(subject.color)`, the meta line blended 28 % toward the fill |
| Zeit axis | once, at the left | left, **between every day**, and at the right edge |
| Header | Phase / Tag / Lane | Tag / Lane — the repeated axis already marks the boundary |
| Rules | 30-min, grey | 15-min dotted, whole hours solid black |
| Frame | hairline column rules | black table borders, heavy outer frame |
| Breaks | softened fill, grey text | no special case — a Pause is its own colour |

**The axes are the only real logic**, so they are pure exported functions.
`axisTiers(model)` returns the candidate placements densest first — the column
indexes a Zeit column is inserted *before*, deduplicated (day 0 and phase 0 are
both `0`) and sorted, so the running axis count is monotonic:

1. before **every day** (the Excel's own rhythm — no block is more than a day away from the hour it sits on),
2. before every **phase boundary**,
3. the two **edges** only.

`chooseAxes(model, usableW)` takes the densest tier that still leaves a lane
column of at least 4 mm. Degrading a step at a time matters because a wide plan
is both where the repeated axis helps most and where it costs most; collapsing
straight to the edges threw away a phase axis the sheet could still afford. The
default plan on A4 gets tier 1 in **both** orientations: `[0, 1, 2, 5, 8, 11]`.

Column geometry follows: `colW = (usableW − axes.length·AXIS_W) / columns.length`,
and a column's x adds `AXIS_W` for every axis at or before it. `AXIS_W` is 8 mm
against the modern sheet's 13 — cut to what `07:00` at 6.5 pt needs, because this
sheet pays for it once per day rather than once per page.

A block's width is measured from the *first* and *last* column it covers rather
than from `from + span`, so a Lektion ending on a phase boundary does not swallow
the axis drawn there.

`pdfDraw.ts` holds the six primitives both renderers use (`PT`, `rgb`, `mix`,
`blend`, `hhmm`, `truncate`, `cardLines`); `calendar.ts` is untouched, and that
the two sheets share one model is what makes them the same week.

### There is no DOM print path any more

The app prints **nothing** from the DOM. `fitGridToPage()`, the `beforeprint` listener, the `<style id="wk-print-page">` page box and the `@media print` blocks in `App.svelte`, `ReportPanel.svelte` and `calendar.css` are all gone: they existed to make a screen document survive a printer, and every one of them was a second, worse renderer competing with `src/print/`.

Ctrl/Cmd+P is intercepted, so the only way to reach the browser's own print is File ▸ Print. That now gets a single-page **notice** (`.print-notice` in App.svelte, `display: none` until `@media print`) saying to use the Drucken button, with the app layout, the report overlay, the toasts and any open dialog hidden. A note beats a wasted sheet of app chrome.

`@fullcalendar/adaptive` stays out, for the original reason and now a stronger one: its print mode replaces the time grid with a flat list of cards, and the grid is drawn by `calendarPdf.ts` anyway.

## Key Utility Functions (`src/utils/timeUtils.ts`)

| Function | Purpose |
|---|---|
| `groupsToResources(groups, allowedIds?)` | Convert groups to FC ResourceInput[], filtered to allowedIds, sorted by order |
| `buildFCEvents(state, phase?, filter?)` | Convert stored events to FC EventInput[] for one phase |
| `phaseGroups(state, phase)` | Enabled groups of a phase, sorted by order |
| `phaseForDay(state, dayIndex)` | The phase owning a weekday, or null |
| `phaseDayCount(phase)` | `endDay - startDay + 1`, clamped to ≥1 |
| `eventGroupIds(state, ev)` | The lanes an event occupies; expands `ALL_GROUPS`, drops disabled lanes |
| `isMultiGroupEvent(ev)` | `ev.groupId === ALL_GROUPS` |
| `eventInPhase(state, ev, phase)` | True if event's day is in phase AND at least one of its groups is enabled in the phase |
| `orphanEvents(state)` | Events no phase renders that aren't merely hidden by a disabled lane |
| `resolveTeacherIds(sel, subject)` / `resolveRoomId(sel, subject)` | Resolve an `'inherit'` selector on its own (used by forms mid-edit) |
| `effectiveTeacherIds(ev, subject)` | Resolves `'inherit'` to subject defaults |
| `effectiveRoomId(ev, subject)` | Resolves `'inherit'`; keeps an explicit `null` (no room) as null |
| `snapToSlot(time, slotMinutes?)` | Round time to nearest 15-min slot |
| `clampDayIndex(day)` | Keep a day index inside the planned week |
| `orderedPhases(state)` | Phases in display order — three components each re-derived this |
| `isEventActive(state, ev)` | Is this event on the plan at all? (has at least one enabled lane) |
| `splitRange(start, end)` | `{ from, to, canSplit }` — the only legal cuts, shared by the modal and the popover |
| `extractDayIndex(date)` | Date → 0=Mon … 4=Fri |
| `toISOLocal(wkStart, dayIndex, time)` | Build ISO string for FC without UTC shift |
| `dayDate(wkStart, dayIndex)` | "YYYY-MM-DD" for a day in the WK week |
| `dayDateLabel(wkStart, dayIndex)` | "D.M." label for column headers |
| `eventOverrides(ev, subject)` | Which fields depart from subject defaults |
| `durationBand(minutes)` | `xs`/`sm`/`md`/`lg` — how much the card can show |

---

## Color Utilities (`src/utils/colorUtils.ts`)

- `getContrastColor(hex)` → `'#000000'` or `'#ffffff'` for readable text on a coloured background. Now used only where a *solid* fill of user colour remains — teacher initials on their avatar — because event cards are tinted surfaces carrying theme text. WCAG relative luminance, switching at **0.1791** — the luminance where black and white score the same contrast ratio. (A higher threshold hands white text to mid-tones that need black: `#a0aec0` at L≈0.42 scores 2.3:1 white versus 9.2:1 black.)
- `generateDistinctColor(existingColors)` — picks a hue far from any existing color
- `generateInitials(name)` — "Anna Müller" → "AM"

## Format Utilities (`src/utils/format.ts`)

- `escapeHtml(value)` — mandatory on every value interpolated into the `eventContent` HTML string
- `roomShort(room)` — the card's room code. An explicit `shortName` wins; otherwise one word → first five characters ("Werkhof" → "Werkh"), two tokens → 3 + 1 ("Theoriesaal 1" → "The1"), three or more → initials ("Schutzanlage Bern-West" → "SBW"). A numeric token is kept whole, because it is usually the only thing telling two rooms apart
- `teacherShort(teacher)` — `shortName`, falling back to the first two letters of the name
- `isEditingTarget(target)` — is the user typing? Both window-level key handlers (the toolbar's Ctrl+Z and the grid's arrow keys) must leave a focused field alone, and each used to carry its own copy of this test

---

## Deletions and confirms

Every entity deletion (`removeTeacher`, `removeRoom`, `removeSubject`,
`removeGroup`, `removePhase`) is one `setState` with a label, so all of them are
on the undo stack. They therefore **do not ask first**: they act, then toast
"«Sanität» gelöscht — mit 12 Lektionen · RÜCKGÄNGIG". Seven `window.confirm()`
calls were interrupting for something one keystroke reverses, and could not
render the count as anything but a sentence.

Two confirms remain, and both are genuinely irreversible because they call
`clearUndo()`: **importing a plan** and **Alle Daten zurücksetzen**. The
schema-mismatch prompt in `persistence.ts` also stays — it runs before the app
exists, so there is no undo stack to fall back on.

## Keyboard Shortcuts

**Dialog focus.** Every dialog focuses its own panel (`tabindex="-1"`), not the
first focusable descendant — which was always the ✕, so a keyboard user opened
each dialog already on "leave" and their first Tab went out of the content. Focus
returns to the trigger on close, which was already correct.

Global (blocked while focus is in an input/textarea/select):

- **Ctrl/Cmd+Z** undo · **Ctrl+Shift+Z** / **Ctrl+Y** redo
- **Escape**: close Config/Reports/EventModal, or clear the selection

- **?** open the shortcut sheet (`ShortcutsDialog.svelte`). It never opens on top of another dialog, and closes itself. The modifier it prints is platform-aware: **on macOS Ctrl+click is the context menu and never reaches the page as a click**, so the additive gesture there is ⌘ and the sheet says so.
- **Ctrl/Cmd+A** select every card the grid is drawing

On the **selected cards** — the fastest way to close the gap a break leaves behind. Every one of these applies to the whole selection as a **single undo entry**:

- **↑ / ↓** move by 15 min · **Shift+↑ / ↓** resize by 15 min (each block keeps its own length)
- **← / →** move a day — a no-op at the edge of the week does not push an undo entry
- **Enter** open the full editor on the primary card · **Ctrl/Cmd+D** duplicate, selecting the copies · **Delete/Backspace** remove

---

## Development Setup

```bash
source ~/.nvm/nvm.sh && nvm use node   # always required
npm install
npm run dev          # Vite dev server with HMR
npm test             # vitest run — unit tests over the pure logic
npm run check        # svelte-check --threshold error
```

### Tests

Vitest covers the pure logic where the rules are subtle and have been reworked repeatedly:

- `src/conflicts/detector.test.ts` — teacher/room/group conflicts, excluded rooms, disabled lanes, breaks vs. lessons, multi-group self-collision, annotation, availability (absent teacher, blocked room, half-day windows, touching-but-not-overlapping), and `previewClash` — one case per way the calendar's old private copy of the rules was wrong
- `src/utils/timeUtils.test.ts` — `ALL_GROUPS` resolution, phase membership, orphans, FC event building, filters, contrast and escaping
- `src/reports/reports.test.ts` — phase affinity, coverage counts, uneven rows agreeing between the report and the sidebar chip, minute-measured coverage against a target, teaching/covering/handed-over classification
- `src/state/migrations.test.ts` — each hop adds its fields without touching the schedule; `migrateState` chains, is a no-op on current state, and refuses a version with no path
- `src/test/fixtures.ts` — a two-phase week (Kader Mon–Tue, Gruppen Wed–Fri) with readable string ids, plus `makeWindow`

The component layer has no tests; verify UI work in the browser (Playwright is a devDependency for structural checks and screenshots — the density floor, the print page box and the phase row alignment were all found that way).

Dev server default port: 5173 (or 5179 if `--port 5179 --strictPort` is used in scripts).

Playwright is a devDependency (`@playwright/test` + `playwright`) with Chromium cached. Use it sparingly for structural verification, not as a routine test runner.

---

## Data Flow Summary

```
User action
  → store mutation (setState → commit)
    → detectConflicts  (once)
    → attachConflicts  (annotate events)
    → saveState (localStorage, conflicts stripped, debounced 200ms)
    → _state / _conflicts / _orphans updated (triggers Svelte reactivity)
      → Calendar.svelte $effect → calendar.refetchEvents()
      → ConflictPanel re-renders          (getConflicts / getOrphans)
      → Toolbar + rail badges update      (getIssueCount)
      → Sidebar coverage counters update

View-only state (selection, hover highlight, spotlight, density, toasts) bypasses
the store entirely:

ui.svelte state
  → Calendar.$effect → paintStates() toggles classes on the existing DOM
    (never a refetch: these change far more often than the data and
     never affect layout)
```

Cross-phase drag (FC can't drag between two instances):
- User drags event between phases → `eventReceive` on target calendar detects `extendedProps.eventId` → calls `updateEvent` → source calendar `eventLeave` → refetch from store

Modal move across phases:
- User picks a new day → `targetPhase` derived → `laneOptions` derived → `save()` re-maps `groupId` to a lane of the target phase (multi-group events keep `ALL_GROUPS` and need no re-mapping)

---

## Known Constraints & Design Decisions

- **Migrations, one hop at a time**: `src/state/migrations.ts`. `isValidState` remains a shape guard against a corrupt entry, not a migration; the migration chain runs after it.
- **One plan, no picker**: exactly one plan lives in localStorage. Export/import files are the archive, the backup and the hand-off. A plan library with a picker was tried before and made the code hard to follow.
- **Multi-group lanes are resolved on read**, never stored — see the Events section. This is why `eventGroupIds` needs `state` and why so many helpers take it.
- **Conflicts are detected once per mutation** in the store; components must read `getConflicts()`/`getOrphans()` rather than calling `detectConflicts` again.
- **One rule, one place.** The things that had quietly grown second copies, and where the single definition now lives: the clash rules (`previewClash` in `detector.ts`), the conflict-kind labels (`CONFLICT_KIND_LABELS` in `types.ts` — the panel, the modal and the card tooltip each had their own), "done" for a coverage row (`coverageStatus` in `reports.ts`), a teacher's or room's week (`teacherLoad`/`roomLoad`), "the user is typing" (`isEditingTarget`), phase display order (`orderedPhases`), the legal split points (`splitRange`), and duplicating an event (`duplicateEvents` in the store).
- **`eventContent` is an HTML string**, so anything user-entered that reaches it must go through `escapeHtml`.
- **No `<input type="time">`**: it renders in the *browser's* locale, so an en-US Chrome shows an AM/PM spinner however Swiss the app is. `components/TimeField.svelte` is a select over the 15-minute grid — always 24h, and it enforces the slot size the app snaps to anyway. A stored value outside the offered range is added to the list so opening an odd event cannot silently retime it.
- **localStorage only**: No backend. A backend is a future consideration.
- **Desktop only**: No mobile layout designed.
- **Conflicts are advisory**: They highlight problems but never block a save.
- **Phase order in state ≠ display order**: `phases` array may be in insertion order; the UI always sorts by `startDay` before rendering (`orderedPhases` in App.svelte).
- **`data-theme` is always set** by App.svelte on mount; the `prefers-color-scheme` media query drives it. DaisyUI's theme toggle can override.
- **FullCalendar GPL license**: `schedulerLicenseKey: 'GPL-My-Project-Is-Open-Source'` — valid for open-source projects only.
- **`height: 'auto'`** on FC instances lets a single outer div control scrolling; avoids two independent scrollbars.
- **`stickyHeaderDates: true`**: Column headers stick at the top of the scroll container.
- **`--wk-axis-w`**: A CSS variable shared between App.svelte layout CSS and FC's gutter. Must stay consistent if the time gutter width changes.
- **Event cards carry no inline colour**: the subject colour reaches the card as `--ev-color` (set in `eventDidMount`) and CSS mixes tint, border and spine from it. Saturation is reserved for *state* — conflict, selection, spotlight — which is what makes those readable on a full week.
- **`.fc-timegrid-slots table { line-height: 0 }`** is load-bearing: without it an inherited line-height strut puts a ~25px floor under every row and the compact density does nothing.
- **The calendars are keyed on the density**, because FullCalendar will not shrink below the slot height it measured at render time.
- **`applyDensity()` runs in `main.ts`**, before mount, for the same reason.
- **No `@fullcalendar/adaptive`** — see Printing.
