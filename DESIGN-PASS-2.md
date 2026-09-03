# Design Pass 2 — UX review

A second pass, this time over *use* rather than appearance: what the app asks a
person to do, in what order, and what it tells them afterwards. Reviewed at
1680px and 1280px, light and dark, against a populated week (54 Lektionen, 12
Themen, 5 Gruppenführer, 18 Probleme) **and against a brand-new empty plan**,
which turns out to matter more than anything else here.

31 findings. **P1** = fix first, **P2** = real friction, **P3** = polish.
Pass 1 (`DESIGN-PASS.md`) is verified below: **45 of 45 addressed.**

> **Status: all 31 implemented** (2026-09-03), plus a card redesign that came out
> of reviewing Z1 with the user — the room now carries its own 4–5 character code
> in a pill and survives every lane width, and the start time is dropped by
> information (does the block start on an hour rule?) rather than by pixels. See
> **What the card drops first** in `SPECS.md`. Schema is at v11: `lastExportedAt`
> (v10) and `room.shortName` (v11). 82 tests, `npm run check` clean.

## The read

The surfaces are now good. What is missing is the *return path*: nearly every
screen in this app can tell you something is wrong, and almost none of them can
do anything about it. The coverage report names the exact Gruppe/Thema pair that
is missing and the cell is inert. The conflict panel names the two Lektionen and
offers only "show me". The Gruppenführer pane counts 10 Lektionen and won't say
which. The one exception — the conflict panel's reveal, which scrolls and
flashes — is also the only place in the app where a change is *pointed at*.

The second theme is that the app has three answers to "did that save?" — the
popover writes immediately, the modal buffers behind Speichern and discards on
Escape, Konfiguration autosaves and says so — and the destructive one is the one
reached by the gesture users learn second.

Keep as is: the card recipe under load; the conflict panel's per-resource
grouping; the tint/hatch/ring vocabulary; the Plan & Daten copy; focus return on
dialog close; the `previewClash` drag tint; the German throughout.

## Top five

| Ref | |
|---|---|
| U1 | A new plan has no Themen, and both ways of placing one dead-end. |
| V1 X3 | The report finds the gap and the panel finds the clash; neither can fix one. |
| W1 | Popover autosaves, modal discards on Escape. Same three fields, same card. |
| Y1 | "Der Plan liegt nur in diesem Browser" is said once, on the sixth tab. |
| M1 | Undo names the action in a toast and never says *where*. `wk-flash` already exists. |

---

## U · First run

| # | P | Finding | Fix |
|---|---|---|---|
| U1 | 1 | `createDefaultState()` ships zero Themen, Gruppenführer and Räume. The grid's empty state says "Ein Thema aus der Seitenleiste auf den Kalender ziehen" — the sidebar shows only PAUSEN, and hides the THEMEN heading when the list is empty, so the word never appears. Clicking an empty cell opens the picker, which offers Mittagessen and Pause. Both entry points dead-end and nothing links to Konfiguration → Themen. | Keep the THEMEN section always, with an empty row — "Noch keine Themen · **Erstes Thema anlegen**" — opening Konfiguration → Themen on a fresh draft. Same row at the foot of the placement picker. Switch the grid hint's copy while `subjects.filter(s => !s.isBreak).length === 0`. |
| U2 | 2 | The hint is printed twice at once: centred on the grid with an arrow, and permanently in the sidebar footer. The sidebar copy never leaves, even on a full week, and at 800px viewport height it clips the PAUSEN list. | One hint. Grid one while `events.length === 0`; delete the sidebar footer text or fold it into U1's empty row. |
| U3 | 3 | The grid hint's ← points across ~1200px at the sidebar, and the block is centred in the WK phase, so it reads as a caption for the Mi/Do columns. | Anchor it at the sidebar edge, or drop the arrow and let U1's row carry the call to action. |

## V · Getting a Lektion onto the grid

| # | P | Finding | Fix |
|---|---|---|---|
| V1 | 1 | **The coverage report is the app's gap-finder and every cell in it is inert.** "ABC-Schutz · G1 —, G3 —" is the most actionable fact the app produces; the user has to memorise the pair, close the overlay, find the chip and drag. | A `missing`/`short` cell becomes a button → `PlaceDialog` prefilled with that Thema, that Gruppe, and the phase's first free slot. Same for the sidebar chip's "2 fehlen" badge. |
| V2 | 2 | The same answer is computed three times and the surface people actually work from has the weakest version: `missingLanesForSubject` reaches the chip as a native `title` (OS delay, no styling, invisible to touch and to keyboard focus), while the fully spelled-out "Fehlt noch bei: G2, G4." lives in Konfiguration → Themen → scroll. | Promote it into the spotlight: while a chip is hovered or focused, mark the lane headers that still owe it. The dimming then answers the question it was built for. |
| V3 | 2 | Spotlight fires on raw `mouseenter`. Sweeping the pointer down a 12-chip list strobes the entire grid twelve times. The 0.15s opacity fade is fine; the missing piece is intent. | ~120 ms enter delay, 0 ms leave. |
| V4 | 3 | The empty-cell picker takes the click's raw time: clicking just above the 08:00 rule gives "PLATZIEREN UM 07:30", outside the day's main band and above the scroll position. | Clamp the default into business hours, or make the time an editable field in the picker. |

## W · Editing a Lektion

| # | P | Finding | Fix |
|---|---|---|---|
| W1 | 1 | **Two opposite commit models for the same three fields.** Single click → `EventPopover` calls `updateEvent` on every change. Double click → `EventModal` buffers into locals and commits only in `save()`; Escape and a backdrop click route to `onclose` and discard silently, with no dirty guard. Konfiguration autosaves and prints "Automatisch gespeichert". Escape is safe everywhere else in this app, which is exactly what makes it dangerous here. | Pick one. With undo already covering every mutation, autosave everywhere is the coherent choice: the modal drops Abbrechen/Speichern and gains the marker Konfiguration already has. If it must stay transactional, it needs a dirty guard on Escape and on the backdrop. |
| W2 | 2 | Same actions, two vocabularies. Modal footer: `Löschen · Teilen · Duplizieren · Alle Gruppen`, labelled (pass 1, D6). Popover footer: the same four as bare glyphs. Modal Gruppenführer: named chips. Popover Gruppenführer: five bare initials discs — you have to have memorised the roster. | Carry D6's labels into the popover; name the Gruppenführer on hover at minimum. |
| W3 | 1 | The popover does not flip. Opened on a card in the lower half of the window it renders downward and the viewport clips its action row — "Bearbeiten …", the escape hatch to the full editor, is the part that gets cut. | Flip above the anchor when there is no room below; clamp to the viewport. |
| W4 | 3 | "Alle Gruppen" is disabled on a single-lane phase and its tooltip states the action, not the reason. | Say why: "KVK hat nur eine Gruppe". |

## X · Finding and fixing problems

| # | P | Finding | Fix |
|---|---|---|---|
| X1 | 1 | **"18 Probleme" counts clash *relations*, not work.** `getIssueCount() = _conflicts.length + _orphans.length`; one badly placed Lektion overlapping two others on both Gruppenführer and Raum raises four. The panel's grouping then lists the same Lektion under a Gruppenführer *and* under a Raum. The number the user drives to zero measures nothing they can act on. | Keep the relation count, name the real unit beside it: "18 Konflikte · 9 Lektionen betroffen", in the badge's tooltip and the panel header. |
| X2 | 1 | Opening the conflict panel takes ~260px from the grid — and the grid is the thing you need legible while resolving. Titles that read "Persönliche Ausrüstung" at 1680px become "Persönl iche…" the moment the panel opens. | Overlay the panel above the grid (it already carries its own surface and shadow) instead of squeezing the flex row. Failing that, auto-collapse the Themen sidebar while it is open. |
| X3 | 2 | The panel is diagnosis-only: every row is a fact plus "show me". The two resolutions that close 90% of these — nudge one of the pair by 15 minutes, or hand it to a free Gruppenführer — are two clicks away in a popover the panel does not open. | Inline actions on the *second* event of each pair: `↓ 15 min`, `Gruppenführer wechseln`. |
| X4 | 2 | The category chips read "4 Gruppe" and "9 Raum". | "4 Gruppen", "9 Räume". (Gruppenführer is invariant and already correct.) |
| X5 | 2 | **`coverageStatus` cannot see over-planning.** `uneven` requires `totals.length > 1 && max !== min`, so in KVK — one lane — "Einsatzführung Kader" shows **6 h against Soll 3 h with no status at all**, and the report reads it as perfect. A Thema placed at double its Soll in *every* lane reads complete for the same reason. | Add `over = totals.some(m => m > target)` to `CoverageRow` and mark it. The sidebar chip reads the same verdict, so both surfaces are fixed at once. |
| X6 | 3 | A clean phase renders a STATUS column header over an entirely empty column — F2 by design, but the header promises a mark that never comes. | Drop the header when a section has no marks. |

## Y · Safety and trust

| # | P | Finding | Fix |
|---|---|---|---|
| Y1 | 1 | **A week of planning lives in one origin's `localStorage`, and the app says so exactly once — on the sixth tab of a dialog.** Clearing site data, another browser or another machine loses everything, and nothing records when the plan was last exported. | Store `lastExportedAt`. Once the plan has real content and has drifted N changes or N days past it, show a quiet dismissible toolbar hint linking to the export. |
| Y2 | 2 | **Seven `window.confirm()` calls in an app that has undo, a labelled undo history and a toast with an action button.** Every one of those deletions goes through `setState` with a label, so all are already reversible. The OS dialog is the app's least-designed surface and it interrupts for something that costs one keystroke to reverse. | Delete, then toast "«Sanität» gelöscht · **RÜCKGÄNGIG**" — `Toasts.svelte` already renders exactly that. Keep a real confirm only for "Alle Daten zurücksetzen". |
| Y3 | 2 | The confirms disagree about consequence. Gruppen and Phasen name the count; Gruppenführer says "Er wird von allen Lektionen entfernt" and Räume "Lektionen verlieren ihre Raumzuteilung" — no number, though the pane immediately above shows "10 Lektionen · 15 h 45 min". | Name the count everywhere; `teacherLoad` / `roomLoad` already have it. |
| Y4 | 3 | The Gruppenführer and Raum panes report a Pensum/Belegung you cannot act on — no way to see *which* Lektionen. The conflict panel already sets the precedent with "im Kalender zeigen". | Link the count to the matching report tab, or reuse the reveal. |

## Z · Chrome, density, keyboard

| # | P | Finding | Fix |
|---|---|---|---|
| Z1 | 2 | At 1280px the narrow width band (A4) is active but has nothing to fall back to: `subjectShort()` returns the *full name* unless it contains `/ ( , –`, so "Sanität" stays "Sanität" and still breaks as "Sanit / ät", "Verkeh / rsdienst". `Subject.shortName` is the escape hatch A4 introduced; it defaults to empty and nothing ever asks for it. | Under the narrow threshold, truncate with an ellipsis rather than wrap. And seed `shortName` at Thema creation the way `Teacher.shortName` already is. |
| Z2 | 2 | Every dialog moves focus to its close button, so a keyboard user's first Tab leaves the content rather than entering it. (Focus *return* on close is correct and should stay.) | Focus the dialog or its heading; let the first Tab reach the first real control. |
| Z3 | 2 | The shortcut sheet is the only place marquee, Ctrl+A, arrow-nudging and Shift-resize exist, and below 1360px its button is inside the "⋯" menu. Nothing teaches them in context. | The selection bar names them once a selection exists: "↑↓ 15 min · ←→ Tag". |
| Z4 | 3 | The Legende explains the three colour dictionaries you can also read in Konfiguration, and none of the marks only the grid uses: the double-edged hard ring vs. the dashed soft ring, the ✎ override flag, the layers icon, the hatched break band. | A fourth column: "Markierungen". |
| Z5 | 3 | Legend names truncate — "Schutzanlage Bern…", "Karteneröffnung/-f…" — in a popover with room to spare. | Size the columns to content; the popover has the width. |
| Z6 | 3 | The shortcut sheet's "Schliessen" is a solid primary. A reference sheet has no primary action. | Ghost. |

## M · Motion

Current inventory: hover colour transitions (0.12s), `.side-panel` width (0.15s),
the event `box-shadow/transform/opacity` transition (0.12/0.12/0.15s), one
`toast-in` keyframe, and `wk-flash` — **used in exactly one place**, the conflict
panel's reveal. That is a defensible baseline; the app is not sluggish and
nothing currently distracts. The gaps are all *feedback*, not decoration.

| # | P | Finding | Fix |
|---|---|---|---|
| M0 | 1 | **There is no `prefers-reduced-motion` rule anywhere in the codebase**, and `Calendar.svelte` calls `scrollIntoView({ behavior: 'smooth' })` unconditionally. This is a prerequisite for everything below. | One global block zeroing durations and animation counts; read the query in JS for the scroll behaviour. |
| M1 | 1 | **Reuse `wk-flash` for every mutation that changes the grid where the user is not looking.** Undo says "Rückgängig: Verkehrsdienst verschieben" in a toast and the grid never answers *where*. The same is true of place-from-dialog, duplizieren, teilen, and "auf alle Gruppen kopieren" — which creates up to four cards at once, silently. The mechanism exists, is already wired to a scroll-into-view, and costs one call site each. | Flash the affected ids after `undo`, `redo`, `placeSubject`, `duplicateEvents`, `splitEvent`, `copyEventToLanes`. |
| M2 | 2 | `wk-flash` runs `1.1s ease-out 2` — 2.2s of pulsing reads as an alarm, and M1 will sometimes fire it on four cards at once. | One iteration at ~700ms with a slightly stronger peak: "here", not "warning". |
| M3 | 2 | The problem badge goes 18 → 17 with no acknowledgement. It is the one number that tells you your last edit helped. | A ~150ms tick on change, and a settle into the quiet "keine Probleme" state at zero. |
| M4 | 2 | `.side-panel` transitions `width 0.15s` but the calendars inside re-lay out in a single frame, so opening the conflict panel snaps eleven lanes to new widths mid-transition. Either both move or neither. | X2's overlay removes this entirely; otherwise drop the width transition. |
| M5 | 2 | The spotlight's problem is intent, not duration — see V3. | Delay, don't lengthen. |
| M6 | 3 | The toast rises (`toast-in`); the selection bar directly above it appears instantly. | 120ms rise/fade on the selection bar, matching the toast. |
| M7 | 3 | The drag mirror tints red but never says *what* it will hit. `previewClash` walks the colliding events to decide `'hard' \| 'soft'` and throws their identities away. | Return the ids; outline them while the drag is live. Turns "this is red" into "red because of that one". |
| M8 | — | **Do not animate:** grid layout (row heights, lane widths, density — the calendars re-mount on density change and a tween would fight FullCalendar's own measurement); card position on drop (the drop is the feedback); dialog open/close beyond the existing scrim; the sidebar chip list. | — |

---

## Verification of Pass 1

All 45 findings addressed. Spot-checked in code and against screenshots at
1680px and 1280px, both themes.

| Group | Status |
|---|---|
| **A1 A2 A3** | Fixed, and correctly. The ring is a `::before` with `inset: 0` — which resolves against the *padding* box, so the 3px spine survives underneath it — plus an inset surface-coloured gap, giving the double edge that reads without resolving red from amber. The notch is gone; the ⚠ in the flags row carries it. |
| **A4 A5 A6 A7 A8 A9 A10 A11** | Fixed. `container-type: inline-size` with bands at 132px and 92px; `hyphenate-limit-chars: 8 4 3`; `.wk-dur-lg` pins meta to the bottom; the grip is `opacity: 0` at rest; multi-group text renders only in `.wk-day-first`; day band raised to 4.5%/6%; `.wk-dur-sm` keeps the start and drops the end; avatars at 18px on `--wk-fs-3xs`. **Caveat: A4's narrow band has no content to fall back to — see Z1.** |
| **B1–B5** | Fixed. Verified at 1280px: no overlap, labels dropped, "⋯" absorbs Legende / Tastenkürzel / density. Wordmark demoted, week nav moved left beside the filter. |
| **C1–C4** | Fixed. 240px sidebar, badges carry words ("2 fehlen", "ungleich") not just hue, `--wk-tint`/`--wk-edge` promoted to `:root`, grips revealed on hover. |
| **D1–D7** | Fixed. One `--wk-scrim` across all four modal surfaces; legend in three columns, nothing clipped; `max-content 1fr` label grids; one `DurationField` in all three places; one "Vorgabe" tag per row; modal footer labelled; shortcut sheet on a two-column grid. **D4/D6 are fixed in the modal but not carried into the popover — see W2.** |
| **E1–E7** | Fixed. The dialog sizes to content with a 84vh ceiling and is top-anchored, so the tab strip no longer moves; the sticky footer has its fade and the form ends cleanly above it at full scroll; one uppercase level; the English string is gone; one `AddRow` everywhere; the colour control is a framed swatch with a caret. E4 keeps both drag and ▲▼ — deliberate, documented, and correct for keyboard access. |
| **F1–F6** | Fixed. One `table-layout: fixed` ruler shared across phases; complete rows carry no pill; Soll has its own column and rows are half the height; group plans are grouped by day via `byDay()`; hairlines replace zebra; lane labels reuse the calendar's treatment. |
| **G1–G5** | Fixed. `--wk-fs-3xs` exists and is used; breaks get their own darker dark-mode ground (verified — the lunch band recedes now); the phase strip is neutral; print flips avatars to ruled dark-on-light and the ring prints as geometry. **G4's neutral strip lost the phase *boundary* along with the colour — five identical cells; consider grouping the cells per phase.** |

---

The app is now good at telling you what is wrong. The next pass is making the
place that tells you also be the place you fix it — and, when the fix lands
somewhere off-screen, pointing at it.
