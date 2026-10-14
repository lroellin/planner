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
| 12 | **Kalender** | The calendar grid **on screen**. The printed week is the **Arbeitsprogramm** (#29b) and is never called a Kalender: the Drucken dialog used to title itself "Drucken – Kalender" above a button labelled *Wochenplan*, and saved `kalender-….pdf` | Empty hint, conflict panel ("Im Kalender zeigen"), sidebar hint |
| 13 | **Vorgabe** / Vorgaben | A Thema's defaults (Ausbildner, Raum, Dauer) that a new Lektion inherits and may override | Thema setup section, "aus der Themenvorgabe" |
| 14 | **Dauer** | How long a Thema takes — **and therefore what every Gruppe owes of it**. There is no separate target: a 2 h 30 min Thema needs 2 h 30 min per Gruppe, in one Lektion or split as 1 h 30 min + 1 h. Coverage measures placed minutes against it | Thema setup, event modal, quick-edit, coverage table ("Soll 2 h 30 min") |
| 15 | **Abdeckung** | Coverage — has every Gruppe had every Thema for its full Dauer | Reports tab, config intro |
| 16 | **teilen** | Cutting one Lektion into two | Event modal and quick-edit action |
| 17 | **duplizieren** | Copying a Lektion in place | Quick-edit, selection bar, Ctrl+D |

### Problems

| # | Term | Names | Where it shows |
|---|---|---|---|
| 18 | **Konflikt** / Konflikte | Two Lektionen clashing over a Ausbildner, a Gruppe or a Raum, or one booked into an absence. Names the *kind* of thing, not the panel: the panel is **Probleme** (#20) | Summary chips ("3× Ausbildner"), card tooltips |
| 19 | **harter / weicher Konflikt** | Hard = Ausbildner, Gruppe, absence. Weich = Raum double-booking **and** Sperrzeit, both advisory. The card's warning icon says exactly these two words — naming the double-booking there was wrong for the Sperrzeit half | Card icon tooltip, Legende, conflict panel footnote |
| 20 | **Problem** / Probleme | Konflikte **plus** orphan Lektionen. Deliberately wider than #18, and therefore the name of the **second tab of the side dock** as well as the badge that opens it — the panel holds an *Ausserhalb der Phasen* section that is not a Konflikt | Toolbar badge ("7 Probleme"), dock tab, collapsed rail |
| 21 | **Ausserhalb der Phasen** | Orphan Lektionen — on no phase's day/lane combination, so nothing shows them. *Kalender* is deliberately not used: there is one FullCalendar per Phase, which is an implementation fact the user never sees | Conflict panel card, placement warnings, phase-delete confirm |
| 22 | **abwesend** / Abwesenheiten | `Teacher.unavailable` — when an Ausbildner is not there. The adjective labels one booking (conflict card eyebrow, list tag); the noun heads the editor. As *running* text it goes after the name — *Anna Müller abwesend*, never "Abwesend Anna Müller" (see `conflictNote`) | Config list tag, conflict card kind, "Abwesenheiten" editor title |
| 23 | **gesperrt** / Sperrzeiten | `Room.unavailable` — when a Raum is blocked by something outside the plan. Same split as #22: adjective on a booking, noun on the editor, *Turnhalle gesperrt* in running text. Never **belegt** (#37) — that is the opposite thing | Config list tag, conflict card kind, "Sperrzeiten" editor title |
| 24 | **fehlt n×** / **zu kurz** / **zu lang** / **ungleich** | The four not-done states, as one parallel set. *fehlt n×* = a Gruppe has none of it; *zu kurz* = has it, but under its Dauer; *zu lang* = over its Dauer; *ungleich* = every Gruppe has the full Dauer but not the same amount | Coverage status pill, sidebar chip badge |
| 25 | **vollständig** | Nothing missing, short, long or uneven. Marked by *no* pill — see F2 in `docs/DESIGN-PASS.md` | Sidebar chip check mark |

### Chrome

| # | Term | Names | Where it shows |
|---|---|---|---|
| 26a | **einklappen** / **ausklappen** | Folding a Phase away to a rail, and bringing it back. The same verb pair the two side panels already use for the same gesture — *zuklappen* and *minimieren* would be a second and third name for it | Phase strip tooltip, side panel toggles |
| 27 | **Auswertungen** | The reports overlay (Abdeckung, Abweichungen, Gruppenpläne, Ausbildnerpläne, Raumpläne) | Toolbar button, overlay title |
| 27a | **Abweichung** / Abweichungen | A Lektion carrying its own Ausbildner, Raum or Dauer instead of the Themenvorgabe's — and the Auswertung listing them. The card already says *Weicht von der Themenvorgabe ab* on its pencil, so the tab is that sentence's noun. Never *Änderungen*, which in this app is what Rückgängig undoes | Auswertungen tab, card pencil tooltip |
| 27b | **reine Teilung** | A Lektion whose only Abweichung is its Dauer, on lanes that still add up to the full Soll — the halves of a *teilen* (#16). Filtered out of the Abweichungen report by default | Abweichungen filter, row note «geteilt, Soll erfüllt» |
| 28 | **Konfiguration** | The settings dialog | Toolbar button, dialog title |
| 28a | **Einrichtung** | The first tab of the Konfiguration: what this plan needs before anything can be planned, one row per list, and what is in each once it is. Not a mode, not a wizard and not a place data lives — every row is a link to the tab that owns it. The word was rejected once, for the Thema's sub-tabs (#40), where it read as *installing* a Thema; naming the setup of the whole plan is the sense it does carry | Konfiguration tab, empty-grid card («Einrichtung öffnen»), Konfiguration button tooltip |
| 29 | **Plan** | The whole week's data — one plan per browser. *Planname*, *Plandatei* | Toolbar, Plan & Daten tab |
| 29a | **Darstellung** | How the Arbeitsprogramm is rendered on paper: *Modern* (the app's own sheet) or *Klassisch* (the look of the Excel sheet it replaced). Deliberately not an *Art* — both render the same week, so the choice is a rendering and not a second document. A Handzettel has none | Drucken dialog |
| 29b | **Arbeitsprogramm** | The printed week: one A4 sheet of the whole plan, the *Art* opposite a Handzettel. The name the Zivilschutz already uses for this document, and the one thing it is called everywhere — the Art toggle, the dialog title, the PDF metadata, the file name, the shortcut sheet and the browser-print notice. Never *Wochenplan* (a fourth name for it) and never *Kalender* (#12, which is the screen) | Drucken dialog, `TARGET_LABELS.grid`, `arbeitsprogramm-….pdf` |
| 30 | **Verlauf** | The undo history menu | Undo caret tooltip, menu title ("Rückgängig bis …") |
| 31 | **Rückgängig / Wiederholen** | Undo / redo | Toolbar tooltips, toasts |
| 32 | **Schnellbearbeitung** | The popover beside a clicked Lektion | Popover aria-label, shortcut sheet |
| 33 | **Tastenkürzel** | The `?` shortcut sheet | Toolbar button, dialog title |
| 34 | **Legende** | The colour key for Ausbildner, Räume, Themen | Toolbar «⋯» menu |
| 35 | **Kürzel** | `shortName` on Ausbildner, Raum **and** Thema — what a card shows when the lane is too narrow for the full name. One word for all three; *Kurzname* was a fourth name for the same field | Ausbildner, Raum and Thema detail fields |
| 36 | **Pensum** | A Ausbildner's booked hours for the week | Ausbildner detail panel heading |
| 37 | **Belegung** / Belegungen | A Raum's bookings for the week — the Lektionen **in** it. Never a Sperrzeit (#23), which is the opposite: the Sperrzeiten editor sits directly under a "Belegung diese Woche" counter, and telling the user to add a window when the room is "belegt" said the reverse of what it meant | Raum detail panel heading, room plans, the toolbar's **Belegung** view (Ausbildner and Räume over the week) |
| 38 | **Stellvertretung** | A Ausbildner running a Thema they are not the Vorgabe for; the counterpart is *abgegeben* | Ausbildner plans |
| 39 | **Lernziele / Notizen** | `Subject.content` — what the Thema is about | Thema "Inhalt" tab |
| 40 | **Planung / Inhalt** | The two sub-tabs of a Thema: how it is scheduled vs. what it is about. *Einrichtung* read as installation | Thema detail |
| 41 | **Zurücksetzen** | The reset-everything section. *Gefahrenzone* was a calque of GitHub's "Danger Zone"; in German it is a physical hazard area | Plan & Daten tab |

**Gendered agreement.** Two of these changed grammatical gender in an earlier rename and the surrounding words have to follow: `die Lehrperson` → **der** Ausbildner, `das Raster` → **den** Kalender. A blind find-and-replace leaves "auf das Kalender ziehen" and "Sie wird von allen Lektionen entfernt" behind. `Gruppenführer` → `Ausbildner` was gender-neutral (both masculine) and needed no such follow-up.

**One word per thing.** The grid is **der Kalender** — never *Stundenplan*,
*Wochenraster* or *Raster* — and only on screen; on paper it is **das
Arbeitsprogramm** (#29b). Things are **angezeigt**, never *gezeichnet*: drawing
is what the code does, not what the user sees. On paper the verbs are
*gesetzt* / *gedruckt* / *dargestellt*, for the same reason.

**A label is not a sentence.** A conflict kind has two shapes and they are not
interchangeable. `CONFLICT_KIND_LABELS` is the **eyebrow**: one short word in its
own element, above the resource name (Probleme panel card, calendar tooltip kind
list). `conflictNote(kind, name)` is the **phrase**: one span of running text for
the event editors, which had been concatenating `{kind} {name}` into "Abwesend
Anna Müller". The phrase names the resource first and its state second, which is
grammatical for all five kinds. Do not merge them — spelling the state out in the
eyebrow truncated the name to 48px of the card header's 225px, and the name is
the half worth reading.

**One glyph per idiom.** `›` for a path into the config ("Konfiguration ›
Themen"); `→` is reserved for *becomes* in code comments and migrations. `—` is
the parenthetical dash in prose; `–` only ever joins a range (`08:00–09:30`,
`Mo–Fr`).

---

## Domain Model

### Groups
The columns of the timetable. Each group must attend every non-break subject exactly once (coverage). Groups are labelled K, G1, G2, G3 by default. Groups have:
- `id: ID` — nanoid
- `label: string` — short display name (e.g. "G1")
- `enabled: boolean` — disabled groups are hidden from the calendar and skipped by conflict checks, but keep all their event data
- `order: number` — display order (left to right); can be changed via ▲/▼ buttons in Config
- `excludeFromCoverage: boolean` — the lane is drawn and planned like any other, but is left out of every **reckoning**: coverage never asks whether it has had a Thema, and an all-lanes placement (Mittagessen, Begrüssung) skips it. The case is a group on its own programme — Kulturgüterschutz sitting the week with its own timetable. Switching it *off* is the wrong tool: that hides its lane and its lessons, and this group has both. Conflict checks still apply — the lane's own Lektionen still occupy real Ausbildner and Räume. Config calls the column **Abdeckung** (#15) — a toggle that is *on* by default, so it reads as an inclusion rather than a punishment. It used to read *Rechnet mit*, which named neither what it counts nor what its own tooltip already said ("zählt zur Abdeckung").

`countedGroups(state, phase)` in `timeUtils` is the lane list that takes part in the reckoning; `phaseGroups(state, phase)` is the wider set — every lane the phase *draws*. They are deliberately two functions rather than one with a boolean: reaching for the wrong one is a bug either way round, and a name that says "counted" is easier to get right. Everything that resolves `ALL_GROUPS` (`eventGroupIds`, `eventInPhase`, `buildFCEvent`'s `resourceIds`, `print/calendar.ts`) uses `countedGroups`; everything that draws or lists lanes uses `phaseGroups`.

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

  What takes part in conflict checks is decided by the *placement*, not by the kind: a single-lane event of any kind does, an all-lanes one does not (see **Detection**). This replaced a boolean `isBreak`: every `!isBreak` test in the app meant "lesson", and a third kind had to make the compiler visit each of them (migration v11→v12).
- `isMultiGroup: boolean` — placing this subject schedules it across every *counted* lane of the target phase at once (used for Mittagessen, Pause)
- `optional: boolean` — not every group owes this Thema; a specialist lesson only some of them sit. Coverage then has nothing to measure it against, so the subject is left out of the report, out of the sidebar badge (**including the green check** — a tick would claim every group has had it) and out of `missingLanesForSubject`. It is a Thema in every other way: listed under Themen, placed per group, with its own defaults. Distinct from `kind: 'oneoff'`, which is outside coverage because it happens *once for the whole course* rather than once per group. Lives under **Erweitert** in the Subjects tab beside "Gehört zu Phase" — the other coverage-shaping setting — and is shown only for `kind === 'lesson'`. It is a **segmented pair** headed *Wer besucht es*: **Alle Gruppen** / **Nur einzelne Gruppen**, each naming its consequence. It had been the one raw checkbox in a form whose two settings above it (*Zählt als*, *Platziert für*) are segmented pairs, and it is the same shape of question as they are — who owes this Thema, not a feature being switched on. Naming both sides also puts the consequence on screen without flipping anything, which is the whole argument behind `.choice` in `config-ui.css`.

`isCounted(subject)` in `reports.ts` is the one predicate for "owed by every lane" (`kind === 'lesson' && !optional`). The report, the sidebar badge and the lane markers all ask it, because a disagreement between them is the kind of bug nobody reports — they just stop trusting the badge. It is deliberately *not* a type predicate: `!isCounted(s)` would then narrow a known `Subject` to `never`.
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
- **FullCalendar v7.1** — `fullcalendar` (core, `fullcalendar/interaction` for drag/resize/dateClick, the classic theme) and `fullcalendar-scheduler` (Premium: `resource-timegrid`, AGPL key for open-source use), with `temporal-polyfill` as a required peer. v7 ships no CSS of its own: `app.css` imports `fullcalendar/skeleton.css` and the classic theme's `theme.css` + `palette.css`, and `calendar.css` points the theme's `--fc-classic-*` variables at the app's tokens. The adaptive plugin stays out: its print mode flattens the time grid into a list of cards, which is the opposite of what a timetable on paper is for.
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

**Icons** (`src/utils/icons.ts`, `Icon.svelte`): a small inline-SVG set with Lucide geometry. `icon(name, size)` in `eventCard.ts` wraps the same paths as a Preact element for FullCalendar's content hooks; `<Icon name=… />` is the component form. The previous typographic glyphs (⚙ ▤ ⎙ ↩ ⠿ ⊞) sat on different baselines per platform and some rendered as tofu.

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
| `collapsedPhases` | Phase ids folded to a rail, persisted under `wk-planner-ui`. Purely visual — see [Folding a phase](#folding-a-phase) |
| `mainView` | `plan` / `timeline` — the planning grid or the [Belegung](#belegung-timelinesvelte) view, persisted under `wk-planner-ui`. Switching to the timeline drops a pending `reveal` |
| `timelineZoom` | `compact` / `normal` / `wide` — the Belegung's hour width (20 / 48 / 140 px, `timelineHourWidth()`), persisted under `wk-planner-ui` |
| `toasts` | One-at-a-time transient messages, with an optional inline action |

`applyDensity()` runs in `main.ts` **before** the app mounts, so the grid's first layout is already at the saved density (v7 would otherwise re-measure a frame later).

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

localStorage key: `'wk-planner-state'`. Current schema version: **14**.

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

**Sample data must move with every migration.** `src/state/sampleData.ts` (`createSampleState()`) is authored directly against `CURRENT_VERSION` — like `createDefaultState()`, not run through `migrateState` — so adding a migration step and bumping `CURRENT_VERSION` without also updating `sampleData.ts` leaves it silently one version behind (it would still pass `isValidState`, since that is a shape check, but would carry stale or missing fields). Whenever a migration adds a field, give the sample data a real value for it, not the zero-value the migration defaults old data to.

- **v1 → v2**: `teacher.shortName`, derived from the name (`initialsFrom`, inlined in the migration so a step never depends on app code that is free to change under it).
- **v2 → v3**: nothing. No build ever wrote a v3 store — the version went straight from 2 to 4 in one commit — so the hop exists only to keep the chain unbroken.
- **v3 → v4**: phases, `subject.isMultiGroup`, and the `'inherit'` sentinel. The pre-v4 model had no phases: the week was one grid over every group, rebuilt here as a single Mon–Fri phase containing every group. Events carried `teacherIds: null` / `roomId: null` for "use the subject's default", a meaning `'inherit'` now carries — `null` on a room has since come to mean the *opposite* ("explicitly no room"), so leaving it would silently strip rooms.
- **v4 → v5**: `subject.phaseId`, seeded `null` ("read the phase from the placements"), which is what every subject did before the field existed.
- **v5 → v6**: plan `name`, `subject.content` (goals + notes), `teacher.unavailable` and `room.unavailable`.
- **v6 → v7**: `subject.targetMinutesPerGroup`, defaulted to `0`. Removed again in v8 — kept only so a store written by a v7 build still steps forward cleanly.
- **v7 → v8**: drops `subject.targetMinutesPerGroup`. The target and the duration were always the same number, so coverage measures against `defaultDurationMinutes` instead.
- **v8 → v9**: `subject.shortName`, what a card falls back to once its lane is too narrow for the full name. Seeded empty so the derived form stays live through a rename.
- **v9 → v10**: `lastExportedAt`, seeded `null` rather than "now" — an existing plan genuinely has never been exported, and stamping it would suppress the first reminder for exactly the plans that have lived longest in one browser.
- **v10 → v11**: `room.shortName`, the card's room code. Seeded empty like `subject.shortName`, so the derived form stays live.
- **v11 → v12**: `subject.kind` (`'lesson' | 'break' | 'oneoff'`) replaces the boolean `subject.isBreak`, making room for the Programmpunkt. Nothing in an old store could be one, so every subject maps to `'break'` or `'lesson'`.

- **v12 → v13**: `group.excludeFromCoverage` and `subject.optional`, both defaulted to `false` — the behaviour every existing plan already has.

- **v13 → v14**: `gridStartTime` / `gridEndTime`, the hours the grid draws. Both seeded `null` — "derive it from the plan" — rather than the 07:00–19:00 the hardcoded grid used to draw: stamping the old constants would freeze every existing plan into exactly the empty fringe the field exists to remove.

**The shape check runs in two strengths.** `isMigratableState` requires only what has existed since v1 (`version`, `wkStartDate`, and the five arrays); `isValidState` additionally requires `phases`. Old state is admitted by the first and only checked against the second *after* migrating. Requiring `phases` up front is what made every pre-v4 store fail before a single step ran, be silently replaced by a fresh default, and take the user's week with it — the v3→v4 migration existed to build those phases and was never reached.

`saveState` strips `conflicts` from events and **debounces** the write by 200 ms, so a colour drag produces one localStorage write rather than one per mouse move. `flushSave()` forces a write; it is also wired to `beforeunload` and `pagehide` so nothing pending is lost.

`createDefaultState()` seeds: K group (Kader), G1/G2/G3, two phases (KVK Mon–Tue with K; WK Wed–Fri with G1/G2/G3), no teachers, no rooms, and two `kind: 'break'` subjects: Mittagessen (multi-group) and Pause. See **First run** for how the app leads out of that empty state.

### Undo/Redo (`src/state/undo.ts`)

Past/future stacks capped at 50 entries. Uses JSON deep-clone (no reactive proxies, no Dates in model). `pushUndo` on every `setState`. `undoState` / `redoState` swap current ↔ stack.

---

## UI Layout

```
┌─ Toolbar (42px) ───────────────────────────────────────────────────────────┐
│ WK 2026 Zug 3  ⚲ │            │ [S M L] ↩▾ ↪ ⚠ Auswertungen Drucken ⋯ Konfiguration │
├─ main-area ────────────────────────────────────────────────────────────────┤
│ THEMEN|PROBLEME‹│ ‹ KVK        │ ‹ WK                                       │
│  chip list  or  │  Mo   Di     │  Mi        Do        Fr                    │
│  problem cards  │  K    K      │  G1 G2 G3  G1 G2 G3  G1 G2 G3              │
│  (WorkDock)     │              │                                            │
└─────────────────┴──────────────┴────────────────────────────────────────────┘
```

- **Toolbar** (`Toolbar.svelte`), 42px: plan name (click to open Config → Plan & data), **event filter** — an icon while nothing is filtered, a chip naming the filter with its own × once something is, opening a grouped popover of Ausbildner / Räume / Gruppen — then, on the right, the **density** segmented control (S/M/L), icon-only undo/redo carrying the action name in their tooltips plus a caret opening the **undo history menu** (the last 12 labelled actions, newest first; picking the *n*-th undoes *n* steps), a **clickable issue badge** that opens the **Probleme** tab, Reports, a **Drucken** button opening the print dialog, an **«⋯» overflow** (Legende popover, keyboard shortcuts, and the density control below 1000px) and Config. No wordmark and no week control: see [What left the toolbar](#what-left-the-toolbar).
- **Side dock** (`WorkDock.svelte`, 248px, collapsible to a 34px rail): **one** panel with two tabs, *Themen* and *Probleme*. Both panes stay mounted and are hidden with CSS — the Themen pane owns a FullCalendar `Draggable` and a search box, and re-mounting it on every tab switch would rebuild the one and clear the other. The tab strip is also where the dock folds away, and it sits on the phase strip's baseline so the two read as one band. Folded, the rail carries both labels and the problem count.
  - *Themen*: draggable subject chips split into Themen / Programmpunkte / Pausen; each chip previews the card it will become (same spine, same tint recipe) and is **one row tall**, with a compact coverage flag (⚠2×, `kurz`, `lang`, `≠`) whose sentence is in the tooltip. Hovering the flag **spotlights** the subject on the grid — everything else dims. A filter box appears once there are more than eight subjects. Chips are buttons; activating one opens `PlaceDialog`.
- **Calendar area**: a flex row of phase segments. Each segment's `flex-grow` is proportional to `days × maxLanes`, so columns stay the same width across the week regardless of how many lanes a phase has. A `phase-label` strip shows phase names above the segments, and each label is the **button that folds its phase away** (see [Folding a phase](#folding-a-phase)). Both segments share a single outer scroll container — `height: auto` + `stickyHeaderDates: true` on each FC instance means headers pin and bodies scroll together.
  - *Probleme* (`ConflictPanel.svelte`): conflicts **grouped by resource** (one card per teacher/room/group, with a clash count) plus orphan events. Hovering a card flashes every involved card on the grid; clicking a row reveals and flashes that one instead of opening a modal over the grid you need to look at. It carries no header of its own — the tab already says *Probleme* and holds the same count.
- **Selection** (`App.svelte`): a plain click selects one card. **Ctrl/Cmd-click** toggles a card in or out of the selection, **Shift-click** adds, **dragging across empty grid** draws a marquee that selects what it covers, and **Ctrl/Cmd+A** takes everything the grid is currently drawing (so the toolbar filter narrows it too). **Clicking a header selects what stands under it** (see [Selecting from the header](#selecting-from-the-header)). With more than one selected, a **selection bar** appears above the toasts naming the count and offering duplicate, delete and clear — a set has no popover and no modal, so without it nothing on screen says how many are selected. Dragging one card of a selection moves the whole set by the same day/time delta; lanes are deliberately left alone, because dropping five blocks into the one lane under the pointer would stack them.
- **Quick-edit popover** (`EventPopover.svelte`): a single click on a card selects it and opens a popover beside it with the three fields that actually change day to day — teachers, room, duration — plus copy-to-lanes, duplicate, delete and "Edit…". A double click goes straight to the full modal.

  **It names the card's conflicts**, in a strip between the header and the body — where the full modal has always carried the same one. The grid draws a red edge and the conflict rail lists every clash in the week, but the panel you open *by clicking the card the edge is on* used to say nothing, so the one question it was opened to answer had to be taken to a different panel and matched up by eye. Each chip carries the events it collides with: hovering pulses them (`highlightEvents`), clicking scrolls to the first (`revealEvent`). Hard clashes are filled, soft ones outlined — the same two weights the cards are drawn in. An availability clash has no counterpart, so those chips are plain `<span>`s rather than buttons.

  **The "zurück" reset links are decided from the event, not from `eventOverrides`.** That helper returns the *German labels* the card tooltip prints (`'Ausbildner'`, `'Raum'`, `'Dauer'`); the popover matched them against `'teachers'` / `'room'` / `'duration'`, so no reset link had ever appeared. It now tests `ev.teacherIds !== 'inherit'`, `ev.roomId !== 'inherit'` and the duration directly.
- **Toasts** (`Toasts.svelte`): bottom-centre, one at a time, used by undo/redo.

### What left the toolbar

Three things were removed in design pass 3 (`docs/DESIGN-PASS-3.md`), together about
370px of the left-hand group:

- **The wordmark.** "WK PLANER" sat beside a plan called "WK 2026 Tuggen/
  Reichenburg" and named the app to the one person who already knew which app
  they had opened. The browser tab carries it.
- **The week nav** (‹ 14.9.–18.9. ›). The WK week is set once per WK, and the
  grid's own column headers print `Mo. 14.9.` across the top, so the bar was
  spending ~185px restating something permanently visible ten pixels below it.
  It now lives in **Konfiguration › Plan & Daten**, next to the plan name, with
  the same ‹ › week step and a date field.
- **The Legende button.** ~100px for a colour key that is consulted on the first
  day and then about once a week, and whose three dictionaries are all also
  readable in Konfiguration. It moved into the «⋯» overflow at every width; the
  fourth column — *Markierungen*, the marks the grid draws and never spells out
  — is the part that exists nowhere else, and it went with it.

The `dense`/`tight` collapse thresholds dropped with the freed width: labels
come off Auswertungen and Drucken below 1130px (was 1500), and the density
control joins the «⋯» below 1000px (was 1360).

### Phase Layout Detail

Each phase is a `<div class="phase-seg">` containing one FullCalendar instance. The first phase reserves `--wk-axis-w` (56px) for the time gutter; every later phase gets `.phase-seg--noaxis`, which collapses its axis cell to zero width and drops its `flex-basis` to 0. The cell itself must stay — removing it from FC's column table collapses a lane to 0px and shortens the header, and the two grids stop lining up.

The `.phase-label` strip above the segments uses the same `flex-grow` values and `flex-basis: var(--wk-axis-w)` so labels align exactly with their calendars.

### Folding a phase

Clicking a phase label folds that phase to a **34px rail** (`--wk-phase-rail-w`)
carrying its name, the number of Lektionen it is hiding and — in red — how many
of them are in a Konflikt. Clicking the rail brings it back. The KVK is two days
that are done with by Wednesday and it was taking a third of the screen from the
rotation still being planned; folding it hands that width to the WK.

It is **only a view state**, which is why `collapsedPhases` lives in
`ui.svelte.ts` (persisted under `wk-planner-ui`) and not in `AppState`: the
store, the conflict detector, every Auswertung and every printed sheet cannot
tell that a phase is folded, and nothing is excluded from them. Three things
follow from it, and only these three:

- The folded phase's FullCalendar is **unmounted**, so nothing in it can be
  clicked, dragged onto or revealed while it is folded.
- **Which grid owns the time gutter** is recomputed: it is the leftmost *open*
  phase, not `i > 0`. With the KVK folded, the old rule hid the axis on the only
  grid still drawn and left the week without hour labels. The segments are keyed
  on that phase's id as well as the density, because FullCalendar measures the
  axis at render and handing it to another phase means building it again.
- A **reveal or a flash aimed at a card inside it unfolds it first**
  (`expandPhaseOf` in `App.svelte`). "Im Kalender zeigen" on a Konflikt in the
  folded phase is the case: the card does not exist while the phase is a rail,
  so the phase is opened and the calendar that mounts for it picks the pending
  request up through its own effects.

Everything can be folded at once — recoverable, since the rails stay — and the
segment carries `min-height: 100%` for exactly that state, where there is no
grid left for the flex line to take its height from.

---

## FullCalendar Configuration (`Calendar.svelte`)

Each `Calendar` component receives a `phase: Phase` prop.

Key settings:
- `view`: `resourceTimeGrid` (generic, not `Week`)
- `initialDate`: `wkStartDate + phase.startDay` (always a specific Monday-relative date)
- `duration: { days: phaseDayCount(phase) }` — how many day columns (clamped to ≥1)
- `resources`: `groupsToResources(groups, phase.groupIds)` — only the enabled groups in this phase, sorted by `order`
- `datesAboveResources: true` — date headers above group (resource) headers
- `slotMinTime` / `slotMaxTime` come from **`gridWindow(state)`** (`timeUtils`), not from constants — see [The hours the grid draws](#the-hours-the-grid-draws). `slotDuration: '00:15:00'`, `snapDuration: '00:15:00'`. The window's start is always **on the hour** so `slotHeaderInterval` produces 08:00, 09:00 … instead of 07:45, 08:45 …; the outer scroller opens at 08:00 the first time the grid is shown — on load, or on the first switch to Kalender when the page opened on the Belegung (a `scrollTop` does not stick while the grid is `display: none`) — at an offset measured from the window rather than a hardcoded four slots
- `businessHours: { startTime: '08:00', endTime: '17:00' }`
- `locale: deLocale` — German date formatting; `dayHeaderFormat` adds the month back ("Mi. 21.10."), which v7's German default drops
- `editable: true`, `droppable: true` (accepts chips from sidebar)
- `height: 'auto'`, `tableHeaderSticky: true`
- `schedulerLicenseKey: 'AGPL-My-Frontend-And-Backend-Are-Open-Source'`
- the card's time range ("08:00–09:00" in its tooltip and `aria-label`) is built from the event's own `startTime`/`endTime`, since v7 dropped `defaultRangeSeparator`

**Class hooks, never FC's class names.** v7 renders flexbox `div`s with hashed class names (`fc-Sd`, `fc-classic-vQz`) that change between releases, so neither CSS nor code may select on them. The `*Class` options put stable names on every part the app touches — `wk-fc` (view), `wk-fc-dayhead` / `wk-fc-lanehead` (+ `wk-fc-head-inner`), `wk-fc-lane`, `wk-fc-slothead` (+ `-inner`), `wk-fc-slot`, `wk-fc-minor`, `wk-fc-thead`, `wk-fc-axis-divider`, `wk-fc-event` (+ `wk-fc-mirror`, `wk-fc-event-inner`, and `wk-fc-resizer` on the bottom grip via `columnEventAfterClass`). FC's `data-date`, `data-resource-id` and `data-time` attributes are still dependable; `data-time` sits on every slot row but only on the *labelled* axis cells, so `slotHeadTime` borrows a minor cell's time from its row.

**State classes come from the hooks too.** Selection (`wk-selected`), spotlight (`wk-dimmed`), conflict-panel highlight (`wk-flash`), owed lanes (`wk-lane-owes`) and the day boundaries (`wk-day-start` / `-first` / `-alt`, from FC's `isMajor` flag) are computed inside `eventClass` / `resourceDayHeaderClass` / `dayLaneClass`. A change to them snapshots the UI state and calls `calendar.render()`, which re-runs every hook without remounting a card. Painting them with `classList` does not survive: v7 (Preact) rewrites an element's whole `className` whenever its own classes change. Two things are still set on the DOM: the roving `tabindex` (below) and the transient `wk-flash` restart and `wk-clash-target` during a drag. Note that `setOption` on a `*Class` hook *adds* to the initial one instead of replacing it — use `render()`.

**Only the first phase draws the time axis.** The others keep their axis column but collapse it to zero width via `.phase-seg--noaxis` (on `.wk-fc-slothead-inner`, which FC measures to size the whole gutter, plus the 1px `.wk-fc-axis-divider`), and their `flex-basis` drops to 0. That is what removed the duplicated 07:00 gutter.

**Live clash preview.** `eventAllow` runs on every drag move: it never refuses a drop (conflicts stay advisory) but sets `data-clash="hard|soft"` on the calendar root, which tints the drag mirror. The cost of a drop is visible before the mouse is released.

The rules come from `previewClash(state, candidate)` in the **detector**, not from the component. The calendar used to carry its own copy of them, and the copy had drifted into three wrong answers: it compared `groupId` literally (so the all-lanes Mittagessen never matched and dropping a lesson onto lunch previewed nothing), it had no subject to resolve defaults from when the drag came from the sidebar (so a fresh chip never previewed a teacher or room clash its defaults guaranteed), and it never looked at availability windows at all. `previewClash` builds a probe `CalendarEvent` and runs it through the same `eventGroupIds` / `effectiveTeacherIds` / `effectiveRoomId` resolution every real event goes through.

**Marquee.** Implemented in `App.svelte` over `.phase-scroll`, so one rectangle spans every phase without either calendar knowing about it. It starts only on a `pointerdown` outside `.wk-fc-event` and only once the pointer has travelled 6 px — below that it is still a click on an empty slot, which is how a subject gets placed without dragging. FullCalendar fires `dateClick` on the *mouseup* that ends the marquee, so the marquee claims that click via `suppressNextDateClick()` / `consumeDateClickGuard()` in `ui.svelte`.

**Row height.** v7 sizes every time row from the tallest axis label (its inner box plus the row's 1px rule) and ignores the lane's own height, so the pitch is set on the label: `.wk-fc-slothead-inner { height: calc(var(--wk-slot-h) - 1px) }`. The density control reaches the whole grid through that one rule. A density change needs no re-mount: v7 re-measures when `--wk-slot-h` changes and re-lays out rows, lanes and cards (verified at S/M/L). v6 cached the height it measured at render, so the calendars used to be keyed on the density.

### The hours the grid draws

One window for the **whole WK**, in `AppState.gridStartTime` / `gridEndTime`, and
one function that resolves it: `gridWindow(state)` in `timeUtils`. Not one window
per Phase — the same hour has to sit at the same height in every segment drawn
beside it, or two halves of the same week stop lining up.

`null` on either end means *derive that end from the plan*:

- the window always contains the training day (08:00–17:00) **and** every
  Lektion, Pause and Programmpunkt in the plan;
- plus **one hour above** and **half an hour below** that, as room to drag into
  and to click in. Without the margin the day is walled in at both ends: a block
  cannot be dragged past the last slot and an empty cell before the first one
  cannot be clicked, so an 07:30 Antreten could never be created at all;
- the start is snapped **down to the hour** (`slotHeaderInterval` counts from
  `slotMinTime`); the end has no such constraint and keeps its half hour.

The grid used to draw a hardcoded 07:00–19:00 — 48 slots, ~1207px at normal
density in a viewport of ~834px — for a week that runs 08:00–17:00. Twelve of
those slots were empty on every lane of every day and made up most of the
distance the user had to scroll. The sample week now draws 07:00–17:30: 42
slots. Trimming the last six is what the **Tagesraster** setting in Konfiguration
› Plan & Daten is for — a plan whose hours are known does not need the margin the
derivation has to leave.

Changes reach FullCalendar through `setOption`, not a re-mount: the window moves
on ordinary edits, and rebuilding both calendars mid-edit would be far more
disruptive than the row-height case that keys them on density.

### Drag from sidebar
`Sidebar.svelte` initialises a FullCalendar `Draggable` on the chip container. When a chip is dropped onto any phase calendar, `handleEventReceive` fires.

`handleEventReceive` distinguishes two cases:
1. **Sidebar chip** (`extendedProps.subjectId` present, no `eventId`): calls `placeSubject`. Multi-group subjects are stored as `ALL_GROUPS`.
2. **Cross-phase drag** (`extendedProps.eventId` present): calls `updateEvent` with the new day/time/lane; a multi-group event keeps its `ALL_GROUPS` sentinel and simply follows the new phase's lanes. Also triggers `eventLeave` on the source calendar to refetch from store.

### Resize & drag within a phase
`handleEventDrop` and `handleEventResize` call `updateEvent` with the new day, startTime, endTime, and group (resource).

### Click on empty cell
`handleDateClick` opens a subject-picker popup (`.place-popup`) so users can schedule without dragging. It lists Themen (drawn even when empty, with a link into Konfiguration — on a fresh plan this picker was otherwise a dead end offering only the two Pausen), then Programmpunkte and Pausen where those exist, and ends with **«+ Neuer Programmpunkt …»** — the one thing the picker *creates* rather than places. See **Programmpunkte** below.

### Selecting from the header

A click on a **day header** selects every Lektion of that day, on a **lane
header** every Lektion of that Gruppe on that day, and on an **hour in the time
gutter** everything running at that time. Modifiers match the cards: a plain
click replaces the selection, Ctrl/Cmd or Shift adds to it. All three respect the
toolbar's view filter, exactly as Ctrl+A does — what is selected is what is
drawn — and none of them filters by kind: a Pause and a Programmpunkt in the
column are in the column.

The handler is **delegated on `calendarEl`** (`handleHeaderClick`), because FC
rebuilds its header on every refetch and per-cell listeners would have to be
re-attached each time. Day and lane are read off the cell's own `data-date` /
`data-resource-id`; the hour off the slot's `data-time`.

The gutter is the one of the three that is **not** scoped to its own phase: it
is drawn once for the whole week — only the leftmost open calendar shows it (see
[Folding a phase](#folding-a-phase)) — so scoping it to that phase would mean a
WK hour could never be selected at all. It therefore selects across every phase
on screen, and folding a phase away takes it out of the selection too.

### Event click
`handleEventClick` sets `selectedEventId` → opens `EventModal`.

### Event rendering (`eventContent`)
`eventContent` returns **Preact elements** built by `eventCard` (`src/utils/eventCard.ts`), using the Preact FullCalendar bundles (`fullcalendar/preact`; elements from any other copy cannot be rendered by FC). Subject, room and teacher names are user-entered config and travel as text, so nothing is escaped by hand; only the icon set's own SVG paths are injected as markup. FC can diff a card across `calendar.render()` instead of re-parsing it.

**The card is a neutral surface, not a fill.** `buildFCEvent` passes the subject colour as the event's `color`, which v7 writes onto the element as the `--fc-event-color` variable *only*; `calendar.css` reads it as `--ev-color` on `.wk-fc-event.wk-ev` and overrides every fill the classic theme would paint from it. `src/styles/calendar.css` mixes the tint (13% in light, 24% in dark), the border and the 3px left spine from that one value. Twelve lanes of full-strength colour had no hierarchy and left nothing louder for a conflict to be drawn in; this also lets dark mode use a different recipe instead of glowing.

The event's `className` carries everything the CSS needs to key off:

| Class | Meaning |
|---|---|
| `wk-dur-xs/sm/md/lg` | ≤20 / ≤45 / ≤75 / >75 min — how much the card shows (see `durationBand`) |
| `wk-ev-break` / `wk-ev-lesson` | Breaks recede into a hatched, spineless band |
| `wk-ev-multi` | Drawn once per lane, so it stays quiet |
| `wk-ev-hard` / `wk-ev-soft` | Solid red outline + corner notch / dashed amber outline |

Applied from the DOM rather than rebuilt through the store: `wk-selected` (selection ring), `wk-flash` (revealed from the conflict panel), `wk-dimmed` (spotlighted from a sidebar chip).

**The ring and the hover lift are separate shadow layers** (`--wk-ring` and `--wk-lift`, composed in one `box-shadow`). Written as plain `box-shadow` declarations, `:hover` outranks `.wk-selected` on specificity, so pointing at a selected card replaced its ring with the plain hover shadow — the card you were about to act on was the one that looked unselected. `:hover:not(.wk-selected)` keeps the z-index bump off selected cards for the same reason.

Card content by band: title (clamped 1–3 lines, `hyphens: auto` with `lang="de-CH"` on the document — German compounds hyphenate or they clamp, they never break mid-word), the time range, teacher initials on their colour, the room pill. Flags: multi-group, overridden-from-default, conflict. `eventDidMount` also writes a full `title` tooltip, since a clamped title still has to be readable somewhere.

### The name on a narrow lane

Below ~92px of lane the card drops the full name for `Subject.shortName`, and an
empty `shortName` is **derived** — `subjectShort()` in `utils/format.ts`.

It used to cut at the first separator and stop, on the argument that anything
shorter was a judgement call and so the user's. But «Kartenlesen, Signaturen»
and «Karteneröffnung/-führung» both survive that cut at fifteen characters, and
the band exists because ~68px of lane holds about six — so both were ellipsised
and both read «Karten…». Three such pairs collide in a twenty-Thema plan
(Kartenlesen/Karteneröffnung, Schulung Kader/Schulung Anlage, Lagebericht/
Lagezentrum), and the judgement was never offered to the user either: no screen
showed the label a Thema would actually get.

So it derives like `roomShort` — keep something from **every** token, because the
tail is what tells two Themen apart:

    one token      → first ten characters      Leitungsbau → "Leitungsba"
    two tokens     → 4 + 3, capitalised        Schulung Kader → "SchuKad"
    three or more  → 3 + initials              Funk Grundlagen Praxis → "FunGP"

Two Themen can still start alike, and nothing can derive them apart —
`collidingSubjectShorts()` finds those pairs (comparing the first six characters,
which is what the narrowest lane shows) and **Konfiguration › Themen flags both
sides** with a *Kürzel* tag and a warning in the detail pane. It is a fact the
app can see and the user cannot.

The Kürzel field previews the result in the card's own type («Auf schmalen
Karten: KartFüh»), and every sidebar chip tooltip ends with `· Karte: KartFüh`
where the two differ. The chip itself does not print it: pass 3 (`S3`) spent a
finding recovering that row for the name.

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

## Belegung (`Timeline.svelte`)

The week turned ninety degrees: **one row per Ausbildner and one per Raum**, the
days running left to right. The grid answers "what does G2 do on Wednesday";
this answers "is Anna booked twice" and "when is the Turnhalle free". It is
**read-only** — `editable: false`, nothing drops, nothing resizes.

- **Entry point.** A *Kalender | Belegung* segmented pair in the toolbar's left
  group, beside the filter (icon-only below 1130px, like Auswertungen). Plain
  buttons with `aria-pressed`; the choice is persisted as `mainView`. The grid is
  **hidden, not unmounted**, while the timeline is up, so it keeps its scroll,
  its folded phases and its two FullCalendar instances. Grid keys (arrows,
  Delete, Ctrl+D, Ctrl+A) do nothing in the timeline; undo/redo and Ctrl+P work.
  While the Belegung is up, the toolbar's S/M/L density control is replaced in
  the same slot and shape by the **Stundenbreite** zoom (clock icon, S/M/L):
  row height does nothing here, and swapping rather than hiding keeps the
  buttons beside it from shifting. Below 1000px both live in the "⋯" menu.
- **FullCalendar.** `resourceTimeline` from `fullcalendar-scheduler/resource-timeline`,
  AGPL key, classic theme. Days from the first Phase's `startDay` to the last
  Phase's `endDay` (`timelineDays`); each day is drawn over `gridWindow`, so the
  night is not drawn at all, and 08:00–17:00 is the shaded business band. Hourly
  slots at `slotMinWidth: timelineHourWidth()`: Kompakt (20px) fits a five-day
  week beside the dock without a horizontal scrollbar; Normal (48) and Weit
  (140) scroll sideways inside FC's time area while the row labels stay put.
  Weit is sized so a 45-minute bar shows lanes, ⚠ flag and a ten-letter Kürzel.
  A zoom change carries the scroll offset over as a fraction, so the time at
  the left edge stays. `eventMinWidth: 1`: FC's default minimum widened short
  bars into their neighbours and stacked them as if they clashed.
- **Rows** (`timelineResources`). Row ids are `t:<id>` / `r:<id>`; grouped by
  `resourceGroupField: 'section'` under *Ausbildner* and *Räume*, each in
  Konfiguration order. A row label carries the card's own mark — the initials
  avatar or the room-code pill. A Raum outside the conflict check gets the
  Legende's *geteilt* pill and a lightly hatched lane.
- **Bars** (`buildTimelineEvents`). One bar per (Lektion × row): a bar in each
  of its Ausbildner's rows and one in its Raum's. A multi-group Lektion is still
  one bar per row, labelled with all its lanes (`G1 G2 G3`). Lektionen with
  neither Ausbildner nor Raum (a bare Pause) and those on disabled lanes are left
  out; the toolbar filter applies. Label: lanes first (they always fit), then the
  Thema's Kürzel. The tint is the card's `--ev-color` recipe, fed by the event's
  `color` (`--fc-event-color`). Row labels and bars are Preact elements
  (`timelineContent.ts`), like the grid's cards: names travel as text.
- **Conflicts** come from the store's attached `ConflictRef`s, never a second
  detector. `rowConflict` decides per row: the double-edged ring (solid red hard,
  dashed amber soft) is drawn only in the row the clash is *about* — Anna's row
  for an Anna clash, not the Raum row of the same Lektion. A clash elsewhere on
  the same Lektion still shows its ⚠ flag, so a bar never reads cleaner than its card.
- **Abwesenheiten / Sperrzeiten** are hatched background events in their own
  row (`buildAvailabilityBackground`) — booked and free are not the whole story.
- **Interaction.** Hover: the card's tooltip sentence (`timelineTooltip`), plus
  "im Kalender zeigen". Click or Enter: `setMainView('plan')` + `revealEvent`,
  which selects, scrolls to and flashes the card. Any `reveal` — a Probleme row
  clicked while the timeline is up, too — switches back to the grid (App.svelte).
  Selection and the Probleme hover pulse are mirrored onto the bars, as classes
  from `eventClass` (a snapshot plus `calendar.render()`, never `classList`).
- **Keyboard.** One tab stop, the grid's K2: every bar gets `tabindex="-1"`
  except the roving one — the last bar focused, else the selected Lektion's
  first bar, else the top row's first. ←/→ step along time in the row, ↑/↓ go
  to the nearest bar in time in the next row that has any (`timelineNeighbour`,
  pure). Every refetch remounts the bars with FC's `tabindex="0"`, so
  `eventDidMount` and a post-refetch pass re-apply the stop, and a bar that had
  the focus gets it back (after an undo, say) once v7 shows it — it mounts
  bars `visibility: hidden` until measured, and a hidden element refuses focus.
- **Styling** lives in `src/styles/timeline.css`, imported by the component, on
  `wk-tl-*` class hooks only (v7's own class names are hashed).

## One editor, and the one case it cannot serve

There used to be two editors for a card: the quick-edit popover on a single
click and a full-screen modal on a double click. They held the same three
fields, both autosaved, and which one you got was decided by how many times you
clicked. The modal's only additions were the placement (Tag, Gruppe, Start) and
two actions the popover's footer already had.

**The popover is the editor.** It carries the placement now, both click counts
open it, and Enter on a focused card opens it too — the same card and the same
intent no longer answered differently by mouse and keyboard.

**The modal is what opens when there is no card to anchor a popover to**, which
is the one job a card-anchored panel cannot do:

- an **orphan** — a Lektion on a day/lane combination no Phase draws, so nothing
  renders it. It is opened from the Probleme panel's *Ausserhalb der Phasen*
  section, which is the only place it appears at all;
- a Lektion reached by **Enter** while its card is not rendered: inside a folded
  Phase that has not been expanded yet, or filtered off the grid by the toolbar.

That is also why the modal's placement fields can move a Lektion in *time* as
well as day and lane: an orphan is on no calendar to be dragged.

## Event Modal (`EventModal.svelte`)

Opens as a `<dialog>` when `selectedEventId` is set — see above for when that is.

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

The dialog asks only what the click could not answer. Day, time and lane come from the cell and are shown read-only in the header (`Do 10.9. · 11:15–11:45 · G1`, or the whole lane list once «Alle Gruppen» is chosen). Six fields:

| Field | Notes |
|---|---|
| **Name** | Required, autofocused, Enter submits |
| **Dauer** | `DurationField`, default 30 min — Begrüssung, Antreten and Rapport are all shorter than a lesson |
| **Ausbildner** | Two-per-row named chips, like the quick edit's picker (initials alone do not tell Céline from Christoph). Hidden when no Ausbildner exists yet |
| **Raum** | Plain select, "Kein Raum" first. Hidden when no Raum exists yet |
| **Für** | «Nur G2» / «Alle Gruppen», writing `subject.isMultiGroup` → the existing `ALL_GROUPS` machinery, so all-lanes needed no new model |
| **Farbe** | `ColorPicker`, seeded from `generateDistinctColor()` |

**Ausbildner and Raum belong here, not in the quick edit that follows**, because they are the Programmpunkt's *defaults* (`subject.defaultTeacherIds` / `defaultRoomId`), not this one card's override. Set here, placing Antreten again on Thursday already carries them; set afterwards in the quick edit, they write an override onto a single card and leave the definition empty, so the second placement arrives bare. The event itself is still created with `teacherIds: 'inherit'` / `roomId: 'inherit'`. On a name that reuses an existing Programmpunkt, both fields are filled from that definition and disabled — the placement will get those values whatever the pickers say, so they show the truth rather than silently doing nothing.

The quick edit still opens on the new card the moment the dialog closes: it is the route on to the full editor. `quickEditNewCard` measures the anchor a `requestAnimationFrame` later, since the card only exists once FullCalendar has repainted.

**One commit.** `createProgrammpunkt(draft, dayIndex, startTime, groupId)` adds the subject *and* its event in a single `setState`. As two actions, one Ctrl+Z would take back the card and leave an orphan Thema in Konfiguration that nothing on the grid explained. It returns the new event id.

**Name reuse.** A name that already belongs to a Programmpunkt (trimmed, case-insensitive) reuses that definition instead of making a second one — the «Antreten again on Thursday» path, and equally the retype after a delete. The dialog says so before the click, so the colour picker cannot look like it did nothing. The first definition wins: a reuse is a placement, not an edit, and the reused subject also decides the lane rule so the same Antreten cannot be all-lanes on one day and single-lane the next.

**No garbage collection.** Deleting the last card leaves the definition standing, listed in the sidebar's Programmpunkte block ready to be placed again. Removing it for good is the same delete as any other Thema, in Konfiguration.

**Known limitation.** Setting a Ausbildner or Raum on an *already placed* Programmpunkt from either editor still stores an *event override*, so its Konfiguration entry keeps whatever default the creation dialog gave it. Nothing reads the wrong value — every report resolves effective values through `effectiveTeacherIds` / `effectiveRoomId` — so the two editors are left un-special-cased rather than growing a write-through branch each. The creation dialog asking for both up front is what removes the common case.

---

## Conflict System

### Detection (`src/conflicts/detector.ts`)

`detectConflicts(state)` → `ConflictReport[]`

Iterates all events with at least one enabled lane (`eventGroupIds(state, ev).length > 0`; an event hidden by a disabled group raises nothing, which is the point of disabling it). For each event, records intervals in three maps (by teacher ID, room ID, group ID). After all events are processed, pairwise overlap checks produce `ConflictReport` entries. Overlap is strict (`aStart < bEnd && bStart < aEnd`), so back-to-back events do not clash.

- **Hard** (`kind: 'teacher'`, `'group'` or `'teacher-absent'`): same teacher or group in two overlapping time slots, or a teacher booked while away
- **Soft** (`kind: 'room'` or `'room-blocked'`): same room double-booked (skipped when `excludeFromConflictCheck`), or a room booked while blocked

Hard vs soft is decided by `isHardConflict(kind)` in `types.ts`, which both the detector's consumers and `buildFCEvent` read — the two used to encode the same list separately.

**Availability reports involve one event, not a pair.** They are collected in their own pass over the events and carry an optional `detail` string ("away Wed, Thu · afternoon (Kurs in Bern)") that the conflict panel prints under the resource name. `attachConflicts` gives such an event a `ConflictRef` with an empty `collidingEventIds`.

**All-lanes placements stand outside the conflict system entirely** (`partakesInConflicts(ev)` — literally `!isMultiGroupEvent(ev)`). They neither raise a conflict nor take part in someone else's, in `detectConflicts` and in `previewClashDetail` alike, and that includes the availability pass.

Mittagessen, Antreten and the Schlussrapport are the frame the rest of the day is planned *around*, and they are on every lane by construction. Left in, they collide with each other, with every lane they cover, and with any block that so much as touches them — the panel fills with rows describing the shape of the day rather than a mistake in it. A lesson dropped across the lunch break is visible on the grid; it does not need a warning list of its own. This is a change from the earlier rule, under which a lesson running through a group's lunch was a hard group clash.

What *is* still checked, for a single-lane event, is every kind: a Pause placed on one lane clashes like anything else, and a Programmpunkt placed «Nur G2» is an ordinary card. A multi-group event contributes one interval per resolved lane and therefore never collides with itself either — the exclusion above simply means it contributes none.

### Annotation
`attachConflicts(state, reports)` attaches a `conflicts: ConflictRef[]` array to each event, which the calendar's `eventContent` renderer reads to add red borders. It is separate from `detectConflicts` so that `commit` in the store detects once and shares the one result between the annotated events, the conflict panel and the badges.

### Probleme Panel (`ConflictPanel.svelte`)

**Headed "Probleme", not "Konflikte"** (#20). It holds an *Ausserhalb der
Phasen* section that is no conflict at all, its own subline counts Probleme,
and the badge that opens it says Probleme. The file keeps its name; the
*Konflikt* cards inside it keep theirs.

**It is the second tab of the one side dock, not a second panel.** It used to
float over the grid from a 40px right-hand rail, because docking it in flow cost
the calendar another ~268px at exactly the moment the cards had to be readable.
Floating traded that for something worse: the panel that names a conflict was
drawn *on top of* the lanes the conflict is in, so "show me" pointed underneath
it. Themen and Probleme are both read against the grid, never against each
other, and only one of them is ever the job at hand — so they share `WorkDock`'s
248px and the grid is never covered.

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

A full-screen overlay (not a `<dialog>`) at a **fixed 86vh**, with five tabs: Abdeckung, Abweichungen, Gruppenpläne, Ausbildnerpläne, Raumpläne. Three of them are the documents a WK hands out; Abdeckung and Abweichungen are read here and acted on here. Its **Drucken** button hands the current tab to the PDF dialog and is shown only for the tabs in `PRINTABLE_REPORT_TABS` — see [Printing](#printing). The panel owns its tab after mount, so it reports the live one back through `ontab`; Ctrl+P has to print what is on screen.

### Coverage tab
`buildCoverage(state)` → one section per phase. Each section lists the **Themen** that belong to that phase (`isCounted`), and for each *counted* lane (`countedGroups` — a group with `excludeFromCoverage` has no column here) shows how many times that subject has been placed. Missing combinations are highlighted. Pausen, Programmpunkte and `optional` Themen are excluded: none carries a per-group Soll — a Pause is placed ad hoc rather than attended, and a Programmpunkt happens once for the whole course. They still appear in the group, teacher and room plans, and a Programmpunkt still counts towards a group's `lessonMinutes` (a Begrüssung is time the group is occupied; only breaks are left out of that total).

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

### Deviations tab (Abweichungen)

`buildDeviations(state)` → one block per Thema, listing every Lektion that no
longer matches its Themenvorgabe, with **Vorgabe → Ist** for each changed field.
The sheet answers a question the other four cannot: *did Sanität really go to
Anna, and did the Funk lesson really move into the Turnhalle.*

What counts as changed is **`eventOverrides` — the same predicate that puts the
pencil on a card**. If the two disagreed, the report would quietly be about
something other than what the calendar marks. That also fixes the three fields:
Ausbildner, Raum, Dauer.

**Themen only.** A Pause or a Programmpunkt has no rotation to deviate from — a
Mittagessen that runs 45 minutes today *is* the plan, not a change to it. A
Lektion whose every lane is switched off is skipped as everywhere else
(`isEventActive`).

**Reine Teilungen are hidden by default.** Cutting a 3 h Thema into 2 h + 1 h
marks both halves as "Dauer weicht ab", correctly, and produces two rows that say
nothing: the Gruppe got its 3 h either way. `splitOnly` is set when Dauer is the
*only* changed field **and** every lane the Lektion sits on still totals exactly
the subject's duration — so a shortened block that leaves the Gruppe 30 minutes
short stays, and so does a split half that also changed its Ausbildner. The
filter is a toggle in the tab strip naming its own count, because "why is my
split Lektion missing" has to be answerable.

Screen-only: it has no printed counterpart, and each row carries an eye button
that closes the overlay and reveals the Lektion on the grid.

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

**The spotlight hangs off the coverage badge, not off the chip.** Hovering the small «fehlt 2×» / «zu kurz» flag calls `spotlightSubject`, which dims every non-matching card on the grid and marks the lane headers that still owe the Thema. It used to fire on the chip's own `mouseenter`/`focus`, which put the calendar behind a scrim while the pointer merely crossed the list on its way somewhere — and left it there after a *click*, since clicking a chip focuses it, exactly when the user was trying to read the grid the placement dialog had opened over. Dimming the week is an answer to "where is it still missing?", so it is attached to the thing that raises the question. The `chipTitle` tooltip names the missing lanes (`missingLanesForSubject`), including the lanes that have the subject but still owe minutes, and how many ("G2 (noch 45 min)"). A filter box appears above the list once there are more than eight subjects.

Chips are made draggable via FullCalendar's `Draggable` class, attached to the chip container element. Activating a chip opens `PlaceDialog` — see the drag-vs-click guard described there.

---

## Config Panel (`ConfigPanel.svelte` + `components/config/`)

A `<dialog>` with seven tabs (Einrichtung, Gruppen, Phasen, Ausbildner, Räume, Themen, Plan & Daten) and a **fixed height (82vh)** — a short tab used to shrink the dialog and move the tab strip out from under the pointer mid-click. Each tab opens with a one-line summary and an ⓘ that expands the full explanation, rather than re-reading a paragraph on every visit. Groups and Phases are single-column tables held in `ConfigPanel.svelte`. Teachers, Rooms and Subjects are composed from:

- `config/MasterDetail.svelte` — the generic list + add-row + detail-pane scaffold, parameterised by a `row` snippet and a `detail` snippet.
- `config/ColorPicker.svelte` — a visible swatch that opens a curated 18-colour ramp plus a custom well. Colour used to be hidden behind clicking an avatar, with no affordance at all, and the raw OS picker let people choose colours no card could survive.
- `config/TeacherDetail.svelte`, `config/RoomDetail.svelte` — edit-only panes for an existing entity; creation is the list's **quick add** (a name and Enter, colour and short name derived, everything else on a default and editable right after). Asking for a colour and a short name up front made adding six teachers a chore.
- `config/SubjectDetail.svelte` — still serves **both** create and edit from one set of markup, because a subject has real choices to make at creation: `view` is either the stored entity or a local draft, and `set()` either autosaves through the store or accumulates into the draft. ConfigPanel keys it on the entity id, so changing selection remounts with a fresh draft.
- `config/AddRow.svelte` — the one way to add something: an eyebrow label, a name field and a primary button naming the action. It is a `<form>`, so Enter in the field and the button do the same thing everywhere. `stacked` wraps the three parts for the 232px master-detail column rather than shrinking the button to a bare icon. `nextValue` seeds and re-seeds the field (group labels run G1, G2, G3…, so adding a lane is just Enter).
- `config/AvailabilityEditor.svelte`, `config/GoalsEditor.svelte` — see Availability and Subjects.
- The **detail footer is sticky** (`position: sticky; bottom: 0` inside the scrolling `.detail-form`), so Create/Delete stays reachable without scrolling past the optional half of the form.
- `src/styles/config-ui.css` — the shared visual language (`.list-panel`, `.detail-form`, `.section`, `.option-row`, `.picker-chip`, …), imported from `app.css` because these classes are used across several components.

### Einrichtung tab
The landing tab, and the answer to *what do I do first*. Five rows, one per step
of `setupSteps()` (`src/state/setup.ts`), in the order the steps are done:
Gruppen, Phasen, Ausbildner, Räume, Themen. A row is the whole link — its mark,
its label, its count and its way in are one target, and it switches `activeTab`
locally rather than posting a `requestConfig` the already-mounted panel would
ignore. An **open** row says why the thing matters ("Ohne sie prüft nichts auf
Konflikte"); a **done** row says what is in the list (the first three names, the
phase day ranges, the Themen/Programmpunkte/Pausen breakdown), which is what
keeps the tab worth opening once the setup is over: it is then the one screen
that answers *what is in this plan*. The Phasen row shows `phaseWarning` instead
of either when the week is not covered.

Below the steps, two things that are deliberately **not** steps: the **WK-Woche**
(`createDefaultState` picks the coming Monday, which is often already right, and
nothing records whether anyone looked at it — so it is stated and changeable,
never ticked) and, while `isPristineState`, **Beispielwoche laden**.

`setupSteps()` is pure and derived — no flag in `AppState`, so no migration and
nothing to go stale after an import. It is also read by the tab strip's counts
and by the toolbar's dot; a disagreement between the three is the kind of bug
nobody reports.

### Groups tab
Table with a drag handle (rows *are* the columns of the timetable, so dragging them is the matching gesture — `moveGroupToIndex`, one undo entry), **Aktiv** toggle, label input, ▲/▼ for the keyboard, **Abdeckung** toggle, delete.

The two toggles are deliberately different switches and sit apart from each other. **Aktiv** off hides the lane and its Lektionen. **Abdeckung** off (`excludeFromCoverage`) keeps both and only leaves the lane out of the reckoning — the group on its own programme. It is disabled while the row is inactive, since a hidden lane counts for nothing either way. Two hint lines under the table say which is which. Add group form at the bottom. Changing `enabled` doesn't delete events; they remain but are hidden. Deleting confirms first and names how many events go with the lane (`eventCountForGroup`).

### Phases tab
A **week strip** across the top shows Mon–Fri with the phase that owns each day (uncovered days are hatched in red) — phases are the one concept a new user won't guess, and this explains the model at a glance. Below it, a table with label, From/To day selects (dragging one end past the other moves the other to maintain valid range), lane checkboxes (one per group), delete. Rows are sorted by `startDay`, matching the calendar. Warning banner appears when phases overlap, leave gaps, or have no lanes. Deleting confirms first and warns how many events would stop being drawn (`eventCountForPhase`). Add phase form at bottom.

### Teachers tab
Quick-add row at the foot of the list (name + Enter). List on left (coloured avatar, `away` tag when they have windows), detail on right: colour swatch, full name, short name, an **Away** editor, and a **Load this week** panel — lessons, hours in front of a group, days on duty, and the subjects they are the default teacher for. The pane was two text fields in a 1000px dialog; the load is what you open a teacher to find out. Autosaved on change.

### Rooms tab
Quick-add row at the foot of the list. List on left (coloured swatch, `blocked` / `shared` tags), detail on right: colour, name, "Ignore conflicts" toggle, a **Blocked** editor, and an **Occupancy this week** panel (bookings, hours in use, subjects defaulting here). Autosaved.

### Subjects tab
List on left (colour dot + a `Pause` / `Programmpunkt` row tag), alphabetical, Themen → Programmpunkte → Pausen. The detail pane has two sub-tabs, because how a subject is *scheduled* and what it is *about* are consulted at different moments and stacking them pushed the create button below the fold:
- **Planung** — Bezeichnung (name + colour swatch), Vorgaben (Ausbildner picker grid, Raum select, Dauer presets + numeric input — the Dauer hint says it is also the per-group target), Art (Lektion/Programmpunkt/Pause, Einzelne Gruppe/Alle Gruppen), Erweitert (Wer besucht es, and the belongs-to-phase select — both shown for Lektion only, since both are coverage settings), and a Platzierung panel. The Art control is also the escape hatch both ways: a Thema made by mistake can become a Programmpunkt, and a Programmpunkt that turns out to be part of the rotation can become a Thema.
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
FullCalendar re-lays the grid out on a density change and a tween would
fight its own measurement); card position on drop (the drop *is* the
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

Three surfaces carry the way forward. The first two route through
`requestConfig('subjects', { createSubject: true })`; the third points at the
whole setup rather than at one step of it:

- the sidebar's THEMEN section, which is always rendered, with "Noch keine Themen · **Erstes Thema anlegen**";
- the empty-cell placement picker, which always lists a Themen group;
- the grid's empty state, which while no non-break subject exists reads «Dieser Plan ist noch leer» and points at **Einrichtung öffnen** rather than at Themen alone.

`ConfigPanel` takes `initialTab` and `createSubject` so it opens on Themen with a
blank draft. The grid hint is anchored beside the sidebar (and outside
`.phase-scroll`, or it scrolls under the sticky day headers) rather than centred
three phases away behind a lone ← .

**The order, not just the destination.** Naming Themen was one step of three
presented as the whole job: a Thema picks its Vorgaben from Ausbildner and Räume
that do not exist yet, and nothing said so. Four surfaces now carry that:

- the **Einrichtung** tab (#28a), which lists all five steps and their state;
- the panel's **landing tab** — Einrichtung while `setupComplete()` is false,
  Gruppen once it is true. It used to always open on Gruppen, the one tab a
  fresh plan has already filled in;
- **counts on the tab strip** (`Ausbildner 8`, `Räume 0`), a zero in the warning
  colour;
- a **dot on the toolbar's Konfiguration button** while any step is open, with
  the open steps named in its tooltip and an `aria-live` line beside it. It
  resolves itself, so unlike the export-staleness chip next to it, it has no ×.

**No empty list is a dead end.** `SubjectDetail` used to *hide* its Ausbildner
and Raum fields while those lists were empty, and the two event editors printed
"Keine Ausbildner erfasst." with no verb. Each now carries a link to the tab
that fills the list — all of them: `onnavigate` inside the Konfiguration (a callback, because
the panel is mounted once and reads `initialTab` under `untrack`), and
`requestConfig` from the popover and the modal, which close themselves on the
way.

**Or load the sample plan.** The empty-grid hint, the Einrichtung tab and the
Plan & Daten tab all offer "Beispieldaten laden" (`loadSampleData()` in the store, backed by
`createSampleState()` in `src/state/sampleData.ts`) — a full demonstration week
(Kader days, a group rotation, breaks, a Programmpunkt, an override, a
Stellvertretung and one deliberate conflict) so a new visitor can see the app
doing something before entering any data of their own. All three are gated
by `isPristineState()` (`src/state/persistence.ts`: no teachers, no rooms, no
events, no subject beyond the two default Pausen) — loading the sample
`replacePlan`s the whole state and clears undo, so it only offers itself while
there is nothing of the user's to overwrite. `isPristineState` and
`setupComplete` are close but not the same question: the first asks *is there
anything of yours to lose*, the second *can this be planned yet*.

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

The toolbar's **Drucken** is a single button, not a menu. Every entry of the menu it replaced opened this same dialog and then asked the same question again with the answer already filled in. **Ctrl/Cmd+P** opens the same dialog — on the report you are looking at if the Auswertungen overlay is open, otherwise on the Arbeitsprogramm. It is handled before the text-field guard in `handleGridKeys`, because printing is not an editing action.

### Two categories, not four siblings

The dialog asks for the **Art** first — *Arbeitsprogramm* or *Handzettel* — and only then, for a Handzettel, which one. Flattened into one row of four buttons, the controls below changed shape depending on the pick with nothing on screen saying why.

What is **shared**: Art, **Ausrichtung**, Stand, the preview, and the three footer actions. Both documents are sheets of A4 and both can be turned, so Quer/Hoch is one control with one pair of labels.

What stays **separate**: *Phasen* (Arbeitsprogramm only — a slip has no phase axis to filter), and *Ein Blatt pro* + *Blätter pro Seite* (Handzettel only — a week grid is always one page).

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

### The abbreviation key (`legend.ts`, `legendFit.ts`)

A card falls back to a Kürzel the moment its lane is too narrow for the full
name, and paper has no tooltip to recover it from. So both week grids can print
an **Abkürzungen** band, with the full name behind each short form.

`buildCalendarDoc` collects the **candidate** set while it builds the entries —
only Themen, Räume and Ausbildner actually placed on the printed columns, keyed
by kind + short so a Raum on twelve cards is listed once, and skipping anything
whose Kürzel equals its name. It is ordered Thema → Raum → Ausbildner, the same
sequence the card drops them in, so the key reads in the order of the block it
explains.

**Only the abbreviations the sheet really prints are listed.** The candidate set
is what a block *could* fall back to; on A4 most blocks turn out to have room for
the full name, and printing all ten candidates made the band as tall as a band of
the grid — nine of its lines explaining a Kürzel that appears nowhere on the
page, three centimetres under the full name spelled out. The sample plan's modern
sheet now prints **no key at all**, and the classic portrait one line.

Which entries are needed is not knowable before layout, and the key's own height
feeds back into it: a taller key leaves the grid shorter, shorter blocks
abbreviate more, and more abbreviations make the key taller again. `resolveLegend`
walks that loop to its fixed point. It renders the whole sheet into a **throwaway
document**, starting from *no* key — the largest grid, therefore the fewest
fallbacks — and grows the set until a pass asks for nothing new. Growth is
monotone, so it terminates; it settles in two passes in practice, and a cap of six
falls back to the full candidate list rather than printing one that
under-explains. The starting direction matters: shrinking down from the full list
would settle on a key missing an abbreviation the final layout goes on to print.

The plumbing is three small pieces:

- `PrintCell.keys?: string[]` — the `kind:short` legend keys a cell's *short*
  form depends on. The renderer only learns a fallback happened at the moment it
  gives up on `full`, and all it holds then is the cell, so the cell carries the
  answer. The cut-out plans have no key and set nothing. The classic sheet's
  `metaCell` joins Raum and Ausbildner into one line and therefore concatenates
  both cells' keys.
- `cardLines(…, onShort?)` and `fitLabel(…, onShort?)` in `pdfDraw.ts` report the
  cell whenever they drop to the short form. `fitLabel` exists so the one-line
  layout for a block under 4.6 mm — exactly the block that ends up abbreviated —
  reports like the stacked one; both renderers had that fallback inline and
  neither could have told anyone about it.
- Each renderer's body is a `paint(doc, legendEntries, onShort)` closure, so the
  probe passes and the pass that reaches the reader are literally the same code.
  A separate measuring path would be free to disagree with the drawing one.

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
have read that sheet for years — which is why the printed week carries that name
in the app too (#29b). **Darstellung** — *Modern* (default) or *Klassisch* —
renders the same `CalendarDoc` the other way, so the plan can be handed upwards
in the shape its readers already know. It is a rendering, not a document: the
Art, the Phasen, the Ausrichtung and the Stand all still apply, and only the
Arbeitsprogramm has it (the Excel had no handout).

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

The adaptive plugin (`fullcalendar-scheduler/adaptive`) stays out, for the original reason and now a stronger one: its print mode replaces the time grid with a flat list of cards, and the grid is drawn by `calendarPdf.ts` anyway.

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

**The grid is one tab stop.** FullCalendar gives every clickable event `tabindex="0"` (and re-applies it whenever a card remounts), so a
56-Lektion week put 56 stops between the phase labels and everything after them.
A **roving tabindex** (`paintTabStop` in `Calendar.svelte`) leaves exactly one card
tabbable: the selected one, or the first card in the document when nothing is
selected — decided from the store rather than from painted classes, so it does
not depend on which Phase repaints first, and so the two calendars cannot each
claim a stop. Focusing a card **selects** it, which is what makes the shortcuts
below apply to whatever Tab just landed on.

Arrow keys are deliberately **not** rebound to step between cards. In this app
they move the selected block by a slot or a day, which is the fastest thing on
the keyboard; the alternatives are worse than the gap (Alt+Arrow is Back/Forward
in the browser, and re-binding the arrows would break the interaction the app is
fastest at). Reaching a *different* card is done from the Themen chips, the
Probleme rows or a coverage cell, all of which select and reveal.

**Screen readers.** Each card carries `role="button"` and an `aria-label` naming
the Thema, the day and time, the lane, the Ausbildner, the Raum and the Konflikt
— the same sentence its `title` tooltip has always carried, which used to be
built and thrown away. Without it a card was announced as bare text and a card in
a hard conflict produced the same node as a clean one. The three tab strips
(`WorkDock`, `ReportPanel`, `ConfigPanel`) are real tab widgets: `aria-controls` /
`role="tabpanel"` pairs, one tab stop each, ← → / Home / End between tabs, and
the dock's fold button moved *out* of its tablist. The toolbar's issue badge has
a visually hidden `aria-live="polite"` line, so the number everyone watches is
announced when it drops.

**Focus is visible everywhere.** One `:focus-visible` rule in `app.css` covers
every button, link and custom control; it used to be styled in six places and
everything else fell back to whatever daisyUI's reset left behind, which on a
`<button>` with a custom class is nothing.

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
- `src/utils/timeUtils.test.ts` — `ALL_GROUPS` resolution, phase membership, orphans, FC event building, filters, contrast
- `src/utils/eventCard.test.ts` — the grid card carries user-entered names as text, and the title-only drag-mirror preview
- `src/utils/timeline.test.ts` — Belegung rows and order, one bar per (Lektion × row), multi-group lanes, per-row conflict rings, availability shading, the tooltip, arrow-key neighbours (`timelineNeighbour`)
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
- **`eventContent` returns Preact elements from `fullcalendar/preact`** (`eventCard.ts`): user text travels as text; never build card markup as an HTML string.
- **No `<input type="time">`**: it renders in the *browser's* locale, so an en-US Chrome shows an AM/PM spinner however Swiss the app is. `components/TimeField.svelte` is a select over the 15-minute grid — always 24h, and it enforces the slot size the app snaps to anyway. A stored value outside the offered range is added to the list so opening an odd event cannot silently retime it.
- **localStorage only**: No backend. A backend is a future consideration.
- **Desktop only**: No mobile layout designed.
- **Conflicts are advisory**: They highlight problems but never block a save.
- **Phase order in state ≠ display order**: `phases` array may be in insertion order; the UI always sorts by `startDay` before rendering (`orderedPhases` in App.svelte).
- **`data-theme` is always set** by App.svelte on mount; the `prefers-color-scheme` media query drives it. DaisyUI's theme toggle can override.
- **FullCalendar AGPL license**: `schedulerLicenseKey: 'AGPL-My-Frontend-And-Backend-Are-Open-Source'` — valid only while the frontend *and* any backend are open source under AGPLv3.
- **`height: 'auto'`** on FC instances lets a single outer div control scrolling; avoids two independent scrollbars.
- **`tableHeaderSticky: true`**: Column headers stick at the top of the scroll container.
- **`--wk-axis-w`**: A CSS variable shared between App.svelte layout CSS and FC's gutter. Must stay consistent if the time gutter width changes.
- **Event cards carry no inline colour**: the subject colour reaches the card as `--ev-color` (set in `eventDidMount`) and CSS mixes tint, border and spine from it. Saturation is reserved for *state* — conflict, selection, spotlight — which is what makes those readable on a full week.
- **Never select on FullCalendar's own classes** — they are hashed in v7. Use the `wk-fc-*` hook classes and FC's `data-*` attributes.
- **The row pitch is set on `.wk-fc-slothead-inner`**: v7 sizes every time row from the axis label, not from the lane.
- **The calendars are not keyed on the density**: v7 re-measures rows live. They are still keyed on the axis owner.
- **`applyDensity()` runs in `main.ts`**, before mount, so the first layout is already at the saved density.
- **No adaptive plugin** (`fullcalendar-scheduler/adaptive`) — see Printing.
