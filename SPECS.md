# WK Planner — Application Specifications

## Purpose

A desktop web app for planning a Swiss **Zivilschutz Wiederholungskurs (WK)** — a repeat civil-protection training course. The layout is a timetable: groups rotate through subjects taught by teachers in rooms, like a school schedule. A WK week is typically split into a Kader (leadership) planning segment and a multi-group rotation segment.

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
- `id, name, color, excludeFromConflictCheck`
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
The draggable blocks. Subjects are displayed **alphabetically everywhere** (`sortSubjects`, `localeCompare` with `de` collation); breaks are kept in their own list, after the lessons. The stored array is insertion order and is never used for display. Each subject has:
- `id, name, color`
- `defaultTeacherIds: ID[]` — pre-assigned teachers (can be overridden per event)
- `defaultRoomId: ID | null` — pre-assigned room (can be overridden per event)
- `defaultDurationMinutes: number`
- `isBreak: boolean` — breaks are shown separately in the sidebar and never counted in coverage. They *do* take part in teacher/room/group conflict checks: a lesson running through a group's lunch is a real clash.
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
| `selectedEventId` | What the keyboard and the quick-edit popover act on |
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

**Undo labels.** Every mutation passes a `label` ("moving Funk Grundlagen", "copying Sanität to 2 lanes"). `undo()`/`redo()` restore the state *and* raise a toast naming what changed, with the inverse action inline. `undoLabel()`/`redoLabel()` feed the toolbar tooltips. Undo used to change the schedule with no acknowledgement at all, which is unnerving when the affected card is off-screen.

**Undo coalescing.** `setState(next, { coalesceKey })` merges consecutive mutations sharing a key into one undo entry. A `<input type="color">` fires an input event per mouse move; without this, one colour drag pushed ~50 entries and evicted the real history. The colour pickers pass `teacher-color:<id>` / `room-color:<id>` / `subject-color:<id>`. Any other mutation, undo, redo or reset clears the key.

Available mutations: `addEvent`, `updateEvent`, `removeEvent`, `placeSubject`, `splitEvent`, `copyEventToLanes`, `addTeacher`, `updateTeacher`, `removeTeacher`, `addRoom`, `updateRoom`, `removeRoom`, `addSubject`, `updateSubject`, `removeSubject`, `addGroup`, `updateGroup`, `removeGroup`, `moveGroupUp`, `moveGroupDown`, `moveGroupToIndex`, `addPhase`, `updatePhase`, `removePhase`, `setWkStartDate`, `resetToDefaults`, `undo`, `redo`. Query helpers: `eventCountForGroup`, `eventCountForPhase`, `lanesWithoutEvent`.

`copyEventToLanes(id, groupIds)` is the answer to the core chore of the domain: every group has to attend every lesson, so the same block was being dragged three or four times by hand. `lanesWithoutEvent(id)` supplies the candidate lanes (those of the event's phase that do not already hold this subject at this time).

`placeSubject(subjectId, dayIndex, startTime, groupId)` is the single creation path, shared by drag-drop, the cell picker and the keyboard placement dialog; it stores `ALL_GROUPS` for multi-group subjects and derives `endTime` from the subject default.

`removeGroup` cascades to: strip the group from every phase's `groupIds`, delete events pinned to that lane. Multi-group events survive — the phase simply has one lane fewer.
`removeTeacher` cascades to: strip teacher from subjects' `defaultTeacherIds` and events' `teacherIds`.
`removeRoom` cascades to: set `roomId` to `'inherit'` on events, set `defaultRoomId: null` on subjects.
`removeSubject` cascades to: remove all events of that subject.
`removePhase` cascades to: clear `phaseId` on subjects pinned to it.
`updateSubject` (duration change) cascades to: update end times of events whose duration still matched the old default (non-overridden events only).

### Persistence (`src/state/persistence.ts`)

localStorage key: `'wk-planner-state'`. Current schema version: **6**.

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

`saveState` strips `conflicts` from events and **debounces** the write by 200 ms, so a colour drag produces one localStorage write rather than one per mouse move. `flushSave()` forces a write; it is also wired to `beforeunload` and `pagehide` so nothing pending is lost.

`createDefaultState()` seeds: K group (Kader), G1/G2/G3, two phases (Planungskurs Mon–Tue with K; Gruppen Wed–Fri with G1/G2/G3), one teacher "Teacher 1", one room "Room 1", subjects: Mittagessen (break/multi-group), Pause (break/multi-group), Karteneröffnung/-führung (lesson, 90min, Room 1, pinned to the Gruppen phase).

### Undo/Redo (`src/state/undo.ts`)

Past/future stacks capped at 50 entries. Uses JSON deep-clone (no reactive proxies, no Dates in model). `pushUndo` on every `setState`. `undoState` / `redoState` swap current ↔ stack.

---

## UI Layout

```
┌─ Toolbar ──────────────────────────────────────────────────────────────────┐
│ WK Planner [filter] [Legend] │ ‹ 7.9.–11.9. › │ [S M L] ↩ ↪ ⚠ Reports Print▾ Config │
├─ main-area ────────────────────────────────────────────────────────────────┤
│ ◂ SUBJECTS ▸ │ PLANUNGSKURS     │ GRUPPEN              │ CONFLICTS ▸       │
│  chip list   │  Mo   Di         │  Mi   Do   Fr        │  grouped panel    │
│  (Sidebar)   │  K    K          │  G1 G2 G3 …          │                   │
└──────────────┴──────────────────┴──────────────────────┴───────────────────┘
```

- **Toolbar** (`Toolbar.svelte`): wordmark, plan name (click to open Config → Plan & data), event filter, **Legend** popover (teacher/room/subject colours — nothing else in the app maps a colour to a name), compact week control with a date popover, **density** segmented control (S/M/L), icon-only undo/redo carrying the action name in their tooltips, issue badge, Reports, a **Print menu** (week grid · group plans · teacher plans · room plans · coverage) and Config.
- **Left sidebar** (`SidePanel.svelte` wrapping `Sidebar.svelte`): collapsible. Draggable subject chips split into Subjects and Breaks; each chip previews the card it will become (same spine, same tint recipe) and carries a coverage counter. Hovering a chip **spotlights** it on the grid — everything else dims — and its tooltip names the lanes still missing it. A filter box appears once there are more than eight subjects. Chips are buttons; activating one opens `PlaceDialog`.
- **Calendar area**: a flex row of phase segments. Each segment's `flex-grow` is proportional to `days × maxLanes`, so columns stay the same width across the week regardless of how many lanes a phase has. A `phase-label` strip shows phase names above the segments. Both segments share a single outer scroll container — `height: auto` + `stickyHeaderDates: true` on each FC instance means headers pin and bodies scroll together.
- **Right panel** (`SidePanel.svelte` wrapping `ConflictPanel.svelte`): collapsible, and **collapsed on load** — the rail keeps the issue badge in view, and the grid is what the app is opened to look at. Conflicts **grouped by resource** (one card per teacher/room/group, with a clash count) plus orphan events. Hovering a card flashes every involved card on the grid; clicking a row reveals and flashes that one instead of opening a modal over the grid you need to look at.
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

**Row height.** `.fc-timegrid-slot { height: var(--wk-slot-h) !important }` — plus `.fc-timegrid-slots table { line-height: 0 }`, because even an empty table cell inherits a line-height strut and that strut put a ~25px floor under every row, silently swallowing the compact density. The calendars are keyed on the density in App.svelte so a change re-mounts them: FullCalendar caches the slot height it measured at render and `updateSize()` will not go back under it.

### Drag from sidebar
`Sidebar.svelte` initialises a FullCalendar `Draggable` on the chip container. When a chip is dropped onto any phase calendar, `handleEventReceive` fires.

`handleEventReceive` distinguishes two cases:
1. **Sidebar chip** (`extendedProps.subjectId` present, no `eventId`): calls `placeSubject`. Multi-group subjects are stored as `ALL_GROUPS`.
2. **Cross-phase drag** (`extendedProps.eventId` present): calls `updateEvent` with the new day/time/lane; a multi-group event keeps its `ALL_GROUPS` sentinel and simply follows the new phase's lanes. Also triggers `eventLeave` on the source calendar to refetch from store.

### Resize & drag within a phase
`handleEventDrop` and `handleEventResize` call `updateEvent` with the new day, startTime, endTime, and group (resource).

### Click on empty cell
`handleDateClick` opens a subject-picker popup (`.place-popup`) so users can schedule without dragging.

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

Card content by band: title (clamped 1–3 lines, `hyphens: auto` with `lang="de-CH"` on the document — German compounds hyphenate or they clamp, they never break mid-word), the time range, teacher initials on their colour, the room. Flags: multi-group, overridden-from-default, conflict. `eventDidMount` also writes a full `title` tooltip, since a clamped title still has to be readable somewhere.

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

**Cross-phase move logic**: When the user changes the day, `targetPhase` is derived as the phase whose day range covers that day. `laneOptions` is derived as the enabled groups in `targetPhase`. `targetGroupId` falls back to `laneOptions[0]` if the current group isn't in the new phase. A warning is shown if no phase covers the chosen day, or if the target phase has no active lanes. Multi-group events need no re-mapping — they keep `ALL_GROUPS`.

Other actions: **Delete**, **Split**, **Duplicate**, and **To lanes** — copy this lesson onto the other lanes of its phase at the same time (`copyEventToLanes`). The header lists the event's own clashes by name, since that is usually why the modal was opened.

## Place Dialog (`PlaceDialog.svelte`)

The keyboard path for scheduling. Sidebar chips are `<button>`s: activating one (click or Enter/Space) opens this dialog with day, lane and start-time selects, prefilled from the subject's `phaseId` where it has one. Dragging remains the mouse fast path — a click that travelled more than 5 px from its `pointerdown` is treated as the tail of a drag and does not open the dialog.

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
Shows:
- A "No conflicts" green card when `conflicts.length === 0 && orphans.length === 0`
- Orphan events (events that fall outside every phase's day/lane combination, despite having enabled lanes) — clicking one opens its modal
- Per-conflict cards (hard = red border, soft = yellow border), listing the involved events with clickable buttons

### Orphan Events
`orphanEvents(state)` returns events no phase would render despite not being deliberately hidden: a single-lane event whose group is enabled but whose day/lane combination no phase draws, or a multi-group event on a day no phase covers. Events whose lanes are all disabled are *not* orphans — hiding them is the point of disabling a group. Orphans are counted alongside conflicts everywhere (`getIssueCount()`), so the toolbar badge, the collapsed rail badge and the panel header always agree.

---

## Reports (`ReportPanel.svelte`, `src/reports/reports.ts`)

A full-screen overlay (not a `<dialog>`) at a **fixed 86vh**, with four tabs: Coverage, Group plans, Teacher plans, Room plans. These are the four documents a WK actually prints.

### Coverage tab
`buildCoverage(state)` → one section per phase. Each section lists subjects (non-break) that belong to that phase, and for each group shows how many times that subject has been placed. Missing combinations are highlighted.

A row is `complete` only when every lane has it **the same number of times**; a row where all lanes have at least one but the counts differ is flagged `uneven`. "Complete" used to hide that G1 got a lesson twice while G2 got it once.

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

Every tab prints one section per page (`break-after: page`).

---

## Sidebar (`Sidebar.svelte`)

Two sections: **Subjects** and **Breaks**. Each chip is a `<button>` (focusable and keyboard-operable) showing a spine and tint in the subject colour (a preview of the card it becomes), a drag handle, the name, a layers icon for multi-group subjects, and a coverage counter `placed/total` (green when complete).

Hovering or focusing a chip calls `spotlightSubject`, which dims every non-matching card on the grid — the answer to "where is this one still missing?". The tooltip names the missing lanes (`missingLanesForSubject`). A filter box appears above the list once there are more than eight subjects.

Chips are made draggable via FullCalendar's `Draggable` class, attached to the chip container element. Activating a chip opens `PlaceDialog` — see the drag-vs-click guard described there.

---

## Config Panel (`ConfigPanel.svelte` + `components/config/`)

A `<dialog>` with six tabs and a **fixed height (82vh)** — a short tab used to shrink the dialog and move the tab strip out from under the pointer mid-click. Each tab opens with a one-line summary and an ⓘ that expands the full explanation, rather than re-reading a paragraph on every visit. Groups and Phases are single-column tables held in `ConfigPanel.svelte`. Teachers, Rooms and Subjects are composed from:

- `config/MasterDetail.svelte` — the generic list + add-row + detail-pane scaffold, parameterised by a `row` snippet and a `detail` snippet.
- `config/ColorPicker.svelte` — a visible swatch that opens a curated 18-colour ramp plus a custom well. Colour used to be hidden behind clicking an avatar, with no affordance at all, and the raw OS picker let people choose colours no card could survive.
- `config/TeacherDetail.svelte`, `config/RoomDetail.svelte` — edit-only panes for an existing entity; creation is the list's **quick add** (a name and Enter, colour and short name derived, everything else on a default and editable right after). Asking for a colour and a short name up front made adding six teachers a chore.
- `config/SubjectDetail.svelte` — still serves **both** create and edit from one set of markup, because a subject has real choices to make at creation: `view` is either the stored entity or a local draft, and `set()` either autosaves through the store or accumulates into the draft. ConfigPanel keys it on the entity id, so changing selection remounts with a fresh draft.
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
List on left (colour dot + break label), alphabetical with breaks last. The detail pane has two sub-tabs, because how a subject is *scheduled* and what it is *about* are consulted at different moments and stacking them pushed the create button below the fold:
- **Setup** — Identity (name + colour swatch), Defaults for new placements (teacher picker grid, room select, duration presets + numeric input), Kind (Lesson/Break, One lane/All lanes), Advanced (Belongs-to-phase select), and a Placement panel.
- **Content** — Goals (row editor) and Notes (textarea). The tab carries a count badge.

Autosaved.

Duration change cascades to all events whose duration still matched the old default.

Subjects also show a **Placement** panel (instances on the grid, lanes covered, which lanes are still missing).

### Plan & data tab
The plan's own settings, and the only destructive control in the app:
- **Plan name** — shown in the toolbar, on the printed reports, and used for the export file name.
- **Plan file** — Export (Blob download) and Import (hidden file input; parse → confirm naming the incoming plan and its event count → `replacePlan` → close the dialog). A parse error is shown in place rather than in an alert.
- **Danger zone** — **Reset all data**. It used to be a disclosure in the dialog footer, repeated under every tab; a destructive action does not need to be one mis-click away from five unrelated panes.

---

## Printing

The Print menu prints one of five documents. The four report tabs are plain HTML and print on A4 portrait, one section per page.

The **week grid** is the awkward one. FullCalendar sizes its columns in JS and writes the result as inline pixel widths, so a print viewport narrower than the screen leaves those widths in place and the phases overlap. `fitGridToPage()` (App.svelte, on `beforeprint`) therefore writes a `@page { size: <grid width>px <grid height>px }` rule into a dedicated `<style id="wk-print-page">`: the sheet is sized to the grid that is already laid out, and the printer's own fit-to-page scales it. The print rules only *unclip* (heights to auto, scrollers to visible) — switching `.main-area` to `display: block`, the obvious move, collapses the calendar's width and the absolutely positioned events stack at the top of the page.

`@fullcalendar/adaptive` had to go for this: its print mode replaces the time grid with a flat list of cards — no axis, no hour lines, no proportional positions.

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
- `teacherShort(teacher)` — `shortName`, falling back to the first two letters of the name

---

## Keyboard Shortcuts

Global (blocked while focus is in an input/textarea/select):

- **Ctrl/Cmd+Z** undo · **Ctrl+Shift+Z** / **Ctrl+Y** redo
- **Escape**: close Config/Reports/EventModal, or clear the selection

On the **selected card** (a single click selects it) — the fastest way to close the gap a break leaves behind:

- **↑ / ↓** move by 15 min · **Shift+↑ / ↓** resize by 15 min
- **← / →** move a day
- **Enter** open the full editor · **Ctrl/Cmd+D** duplicate · **Delete/Backspace** remove

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

- `src/conflicts/detector.test.ts` — teacher/room/group conflicts, excluded rooms, disabled lanes, breaks vs. lessons, multi-group self-collision, annotation, and availability (absent teacher, blocked room, half-day windows, touching-but-not-overlapping)
- `src/utils/timeUtils.test.ts` — `ALL_GROUPS` resolution, phase membership, orphans, FC event building, filters, contrast and escaping
- `src/reports/reports.test.ts` — phase affinity, coverage counts, teaching/covering/handed-over classification
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
