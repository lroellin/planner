# Design Pass 4 — the work itself

A fourth pass, over one question: **what does planning a WK actually cost?**
Not how the app looks (pass 1), not what it asks of a first-time user (pass 2),
not where the pixels go (pass 3) — what a planner does forty times in an evening,
and what the app makes them do to get it done.

Reviewed at 1680×1050, 1440×900, 1280×800 and 1100×800, light and dark, against
the sample week (20 Themen, 8 Ausbildner, 6 Räume, four lanes over two Phasen),
and against the accessibility tree.

> **Status: 25 of 27 implemented** (2026-09-09). **R1** and **R4** were skipped
> by decision — see *Not done* at the foot. 221 tests, `npm run check` clean,
> schema at v14. Nothing here undoes an earlier finding; **H1** and **L1** are
> consequences of pass-3 decisions that were right in themselves (`P4`, `T2`)
> and left something unfinished behind them.
>
> Four things came out differently from the proposal, each noted at its finding:
> **N1** is worse than written (three colliding pairs, not one), **H1** gained an
> explicit WK-wide setting and delivers 144px by derivation rather than 288,
> **E1** was resolved in favour of the popover, and **Q3** turned out to affect
> Gruppenpläne only — Raumpläne already had its filter.

## The read

The app is now good at *one* placement. It is not good at the thirty-six that a
WK is made of.

Every Thema in the rotation has to run past every Gruppe, and the sample data
shows what that looks like when it is done properly: Alain Meier teaches
Karteneröffnung to G1 at 14:45, G2 at 15:30 and G3 at 16:15 — the same Thema,
the same Ausbildner, the same Raum, three lanes, **staggered**. That is the
shape of the work. The app's only bulk gesture, *auf Gruppen kopieren*, produces
the opposite: three copies at the *same* time, which for any Thema with one
Ausbildner is a hard conflict per copy, by construction. So the rotation is
placed one card at a time, and each card needs a free-slot hunt the app will not
help with — `PlaceDialog` opens at 08:00 whatever is already there, and unlike a
drag it never says what it would collide with, although `previewClash` is right
there and pure.

The second theme is that the app has learned to say things about a card that the
card can no longer say about itself. Below ~92px of lane — which is every lane
below a 1280px screen — **three separate pairs of Themen become the same
label**: «Kartenlesen» / «Karteneröffnung», «Schulung Kader» / «Schulung
Anlage», «Lagebericht» / «Lagezentrum». `subjectShort` cuts at the first
separator and stops there, so each survives at eleven to fifteen characters and
each is ellipsised to the five or six that fit. The Kürzel field that fixes it exists, and nothing in the app ever
suggests using it, because nothing ever shows you the label your Thema is
actually getting.

And third: the grid draws 07:00–19:00 for a week that runs 08:00–17:00. At normal
density that is 1207px of grid in an 834px viewport — and **288 of the 373px you
must scroll are empty fringe**.

Keep as is: the one-dock decision and everything pass 3 traded for it; the card's
drop order; the conflict panel's grouping and its `+15′`; the autosave-everywhere
rule; the Ausbildner and Raum detail panes, which are the best screens in the app.

## Top five

| Ref | |
|---|---|
| R1 | The core chore of the domain — one Thema, every Gruppe — has no gesture, and the one that looks like it manufactures a conflict per lane. |
| N1 | Six Themen, three labels: «Karten…», «Schulu…», «Lage…» — on every lane the app draws below 1280px. |
| R2 | The placement dialog opens at 08:00 on top of whatever is there and never says so, while a drag of the same block previews the clash. |
| H1 | Three of the twelve hours the grid draws are never used, and they are 77% of the scroll. |
| E1 | Two editors for one card, 85% the same fields, both autosaving, chosen by how many times you clicked. |

---

## R · Die Rotation

The chore the app exists for. Every finding here is about placing the *n*-th
copy of a Thema, not the first.

| # | P | Finding | Fix |
|---|---|---|---|
| R1 | — | **Skipped by decision.** **`copyEventToLanes` copies to the same time.** `store.svelte.ts:305` clones the source event onto each target lane with its `startTime`, `teacherIds` and `roomId` untouched. For the ordinary Thema — one Ausbildner, one Raum — every copy is a hard Ausbildner clash *and* a soft Raum clash the moment it lands. The action is offered on every card («Gruppen» in the quick edit, «Alle Gruppen» in the modal) and is the only bulk placement in the app. It is right for a Szenario run in parallel and wrong for everything else, and nothing on either button says which case you are in. | A **Rotation** action: pick the lanes (seeded from `lanesWithoutEvent`) and a pattern — *nacheinander* (each copy into that lane's next free slot after the previous one ends) or *gleichzeitig* (today's behaviour, for parallel Themen). Preview the resulting times and the clash count before committing; one `setState`, one undo entry, one `flashEvents`. `previewClash` already answers "would this land clean"; the pattern is just a loop over it. |
| R2 | 1 | **`PlaceDialog` places blind.** `startTime` is seeded `'08:00'` and never reconsidered (`PlaceDialog.svelte:27`), so the dialog that pass 2 wired to the coverage gap and the sidebar chip — the *keyboard* path to placement — proposes the one slot most likely to be occupied. It shows no clash preview, while dragging the same Thema tints the mirror from `previewClash`. The two paths to the same mutation have different amounts of truth in them. | Seed with the target lane's first free run of `defaultDurationMinutes` on that day, business hours first. Add one live line under the Start field — «kollidiert mit Kartenlesen (Roger Ott)» / «frei» — reading `previewClash` on the current day/lane/time. |
| R3 | 2 | **Half the coverage table's buttons are invisible.** A `missing` cell draws a «+»; a `short` cell — equally clickable, equally a gap — draws its minutes and nothing else, so the affordance appears exactly where the gap is *total* and vanishes where it is partial. | Give `short` the same treatment, labelled with what is owed: «+45 min». The number the cell already prints is the wrong half of the sentence. |
| R4 | — | **Skipped by decision** (depends on R1). **The chip knows the debt and cannot pay it.** A Themen chip carries «⚠2×» and a tooltip naming the lanes; activating it places **one**. The 2× is a promise the click does not keep. | Once R1 exists: activating a chip with more than one missing lane opens the Rotation dialog seeded with those lanes, not `PlaceDialog` with one. |
| R5 | 3 | **No load comparison anywhere.** "Is anyone overloaded, and is anyone doing nothing?" is answered by opening eight Konfiguration panes in turn; `teacherLoad` already computes the answer and prints it one teacher at a time. | A load strip at the head of Ausbildnerpläne: name, hours as a bar against the busiest, Einsatztage — sorted, so the outliers are the first and last rows. Same for Raumpläne with `roomLoad`. |

## N · Names on a narrow lane

| # | P | Finding | Fix |
|---|---|---|---|
| N1 | 1 | **Two Themen, one label — three times over.** `subjectShort` (`format.ts:33`) cuts the name at its first separator and stops: «Kartenlesen, Signaturen» → «Kartenlesen», «Karteneröffnung/-führung» → «Karteneröffnung». Both are fifteen characters, both enter the `max-width: 92px` band, and both are ellipsised on one line. **Three pairs collide in a 20-Thema sample** — «Kartenlesen» / «Karteneröffnung», «Schulung Kader» / «Schulung Anlage», «Lagebericht» / «Lagezentrum» — leaving hue, which is user data and may be set to anything, as the only thing telling each pair apart. At 1100px every lane is 67–68px and *every card on the grid* is in this band, so this is not an edge case — it is the whole grid on a 13″ laptop. `roomShort` solves exactly this problem with a three-branch cascade one function further down the same file; `subjectShort` was given the comment «anything shorter is a judgement call, so it is the user's» and no way for the user to find out a judgement was needed. | Two parts. (a) Extend `subjectShort` with `roomShort`'s cascade below its current cut — one word → first 6 characters, two tokens → 4+2, three or more → initials — capped so the band's one line always holds it. (b) In Konfiguration › Themen, flag any two Themen whose *rendered card label* collides, with a «Kürzel setzen» link. A collision is a fact the app can see and the user cannot. |
| N2 | 2 | **Nothing ever shows the label a Thema will get.** The Kürzel field previews its derived value in its own placeholder and nowhere else; the dock chip previews the card's *colour and spine* — it was built to be a preview of the card — but always prints the full name, which is the one thing the card will not. | Print the Kürzel on the chip beside the name, quiet, in the position the card gives it. The chip is already the rehearsal; let it rehearse the part that goes wrong. |
| N3 | 3 | Two-line cards still break German compounds at the wrong seam: «Lagezen- / trum, Meldefluss», «Übungsaus- / wertung». `hyphenate-limit-chars: 8 4 3` (pass 1, A5) permits a 4-character head, and 4 is where these break. | `8 6 3`. Verify against the sample's five longest Themen at 104px and 68px. |

## H · The hours the grid draws

| # | P | Finding | Fix |
|---|---|---|---|
| H1 | 1 | ✅ **Done, with an explicit setting.** **A quarter of the grid is never used, and it is most of the scroll.** `slotMinTime: '07:00'` / `slotMaxTime: '19:00'` are hardcoded (`Calendar.svelte:509`) — 48 slots, 1207px at normal density in an 834px viewport. The sample week, and every WK, runs 08:00–17:00. Of the 373px you must scroll, **288px is the 07:00–08:00 and 17:00–19:00 fringe**: 12 empty slots, drawn on every lane, every day, forever. Pass 3 spent a review recovering 23px from the phase strip and 10 from the time gutter; this is nine times both together, in the same dimension. | Derive the drawn range from the plan: earliest start − 1 slot, latest end + 1 slot, clamped to at least the business window (08:00–17:00) so an empty plan is still a working grid. Re-derived on mutation, which the calendars already key on. Escape hatch: an explicit range in Konfiguration › Plan & Daten for the WK that really does start at 06:00 — one hop, seeded from the derived value. |
| H2 | 3 | **A density change keeps the pixel, not the hour.** Scroll to 10:00 at M and switch to L: `scrollTop` is preserved exactly (verified: 300 → 300), so the same offset now points at 09:20. The one thing the user was looking at is the one thing not carried across. | Record the time at the top of the viewport before the re-mount and restore *that*. `applyDensity()` already owns the moment. |

## E · Two editors for one card

| # | P | Finding | Fix |
|---|---|---|---|
| E1 | 1 | **The quick edit and the modal are the same editor twice.** Both hold Ausbildner, Raum and Dauer; both autosave; both are reached from the same card, by one click or two. The modal adds exactly two things the popover lacks — Platzierung (Tag/Gruppe) and the Teilen / Alle Gruppen actions — and costs a full-screen scrim over the grid the edit is being judged against. Pass 2 (W1) made their *save* semantics agree, which removed the danger and left the duplication. | Decide, then delete. The cheap direction: give the popover a compact Platzierung row and the two missing actions, and keep the modal only for the orphan case — an event on no grid has no card to anchor a popover to. The other direction (modal only) is defensible and costs the app its best interaction. Either is better than both. |
| E2 | 2 | **Neither editor knows what kind of card it is on.** The quick edit on a 15-minute Pause offers an eight-Ausbildner picker four rows tall and a Raum select — ~180px of a 430px popover, for two fields a Pause never uses. | Per kind: a Pause gets Dauer, verschieben, löschen. A Programmpunkt and a Lektion keep everything. `subject.kind` is already the app's one predicate for this. |
| E3 | 2 | **Which editor you get depends on your input device.** Click a card → popover. Focus it and press Enter → modal (verified). Same card, same intent, two answers. | Enter opens what a click opens. |
| E4 | 3 | The popover is anchored beside its card and lands on top of the neighbouring lanes — including, when it carries conflict chips, the lanes those chips point at. | Prefer the side with room; fall back to below. The panel that names a clash must not cover the other half of it — the same argument as pass 3's `D1`, one scale down. |

## Q · Auswertungen

| # | P | Finding | Fix |
|---|---|---|---|
| Q1 | 1 | **The overlay is 86vh whatever it holds.** Abweichungen with two rows is a 770px panel that is 90% empty; the fixed height exists so the tab strip does not move under the pointer between tabs. | Pin the *head*, not the box: `height: min(86vh, max-content)` with a floor around 420px, tab strip sticky at the top of the sheet. The strip stops moving for the reason it was supposed to and the panel stops lying about how much there is. |
| Q2 | 2 | **Abdeckung's column ruler is backwards.** ~550px goes to the Thema name (longest: 24 characters), and Soll, G1, G2, G3 and Status are crushed into the right third. Soll — the number every other cell is compared *against* — is set smaller and lighter than the numbers comparing to it. With six Gruppen the table will not fit at all. | Cap the name column (`max-width` + ellipsis + title), let the lane columns divide the rest, and give Soll the same type weight as a lane cell. |
| Q3 | 2 | **One of the three plan tabs has a filter.** Ausbildnerpläne has a select; Gruppenpläne and Raumpläne answer "what does G3 do on Friday" by scrolling past K, G1 and G2. | The same select on all three. It is the same component and the same question. |
| Q4 | 3 | The Abweichungen reveal button sits ~950px to the right of the row it acts on, at the far edge of a 1080px sheet. | Beside the time, or make the row the target and keep the icon as the affordance. |
| Q5 | 3 | «3 Themen sind länger geplant als **seine** Dauer vorgibt» — `ReportPanel.svelte:235`. The subject is plural. | «ihre». |

## K · Keyboard and assistive tech

Never reviewed. The app is unusually keyboard-capable — arrows nudge, Ctrl+D
duplicates, Ctrl+A selects the drawn week — and none of that is announced.

| # | P | Finding | Fix |
|---|---|---|---|
| K1 | 1 | **A card is announced as bare text.** The accessibility tree for a Lektion reads `text: "Kartenlesen, Signaturen Ro GFS"` — no role, no time, no day, no lane, and **no conflict**: the conflicted card's node is indistinguishable from the clean one (verified on both). FullCalendar renders the event as an `<a tabindex="0">` with no `href`, so it is focusable and announces nothing about being interactive; the ⚠ is an inline SVG whose `title` never reaches the tree. Everything a card means is either colour or geometry. | In `eventDidMount`, where the `title` tooltip is already written: `role="button"` and an `aria-label` — «Kartenlesen, Signaturen · Mi 08:30–10:00 · G1 · Roger Ott · GFS · harter Konflikt». The string exists; it is being written to `title` and thrown away. |
| K2 | 2 | **The grid is 56 tab stops.** Every card is in the tab order, in DOM order, between the phase labels and everything after them, and there is no way to step card-to-card in *grid* order or to leave the grid without traversing all of it. | Roving tabindex: one stop for the grid; arrows move focus **and** selection, so the existing nudge/duplicate/delete shortcuts become reachable; Tab leaves. This is also what gives the keyboard a way to *reach* the first card without a mouse, which today only Tab-spam provides. |
| K3 | 2 | **The tab strips are not tab strips.** `WorkDock` has `role="tablist"` and `role="tab"` with no `aria-controls`; the panes have no `role="tabpanel"`; and the fold button is a *child* of the tablist, so it is part of a widget it is not part of. `ReportPanel` and `ConfigPanel` carry the same pattern. | One sweep: `aria-controls` / `id` pairs, `role="tabpanel"` + `aria-labelledby` on the panes, arrow-key navigation between tabs, and the fold button moved out of the tablist element. |
| K4 | 2 | **The number everyone watches changes silently.** The issue badge ticks from 7 to 6 with a 150ms animation (pass 2, M) and no announcement, while toasts have `aria-live` and the selection bar has `role="status"` — the pattern is established and the badge was left out. | A visually hidden `aria-live="polite"` line beside the badge: «6 Probleme». |
| K5 | 3 | `:focus-visible` is styled in six places. Everything the app drew itself — `.tb-btn`, `.wkdock-tab`, `.cov-cell`, `.mini`, `.picker-chip`, the phase labels — relies on whatever daisyUI's reset leaves behind, which on a `<button>` with a custom class is nothing. | One global `:focus-visible` ring off the existing `--wk-ring` token, in `app.css`, and delete the six local ones that agree with it. |

## L · Loose ends

| # | P | Finding | Fix |
|---|---|---|---|
| L1 | 2 | **First run never asks which week the WK is.** Pass 3 moved the week nav into Konfiguration › Plan & Daten (`T2`), correctly: it is set once and read never. But *set once* means *set at the start*, and the empty-plan card — the one screen that knows it is the start — offers «Erstes Thema anlegen» and «Beispieldaten laden» and not the date. The plan sits on whatever Monday `createDefaultState` picked until someone finds the sixth tab. | A third, quieter line on the empty-state card: «WK-Woche: 14.9.–18.9. · ändern», routing to `requestConfig('plan')`. |
| L2 | 2 | **The Probleme pane explains itself in five lines, every time.** A permanent paragraph under the cards describes hover, `+15′` and hard-vs-soft — while every Konfiguration tab has a one-line summary and an ⓘ for exactly this, precisely so a paragraph is not re-read on every visit. | Adopt the ⓘ. The panel already has a subline to hang it on. |
| L3 | 3 | **The Thema form runs off the bottom of a half-empty dialog.** Konfiguration › Themen is a 720px-wide detail pane holding one ~400px column, so Art, Erweitert and Platzierung sit below the fold with 300px of unused width beside them. Ausbildner and Räume have short forms and do not show it; Themen has the longest form in the app. | Two columns above ~900px of dialog width: Bezeichnung + Vorgaben left, Art + Erweitert + Platzierung right. The sticky footer stays. |

---

## Batches

Ordered so that each batch is independently shippable and nothing later
depends on a decision that has not been made yet.

| # | Batch | Findings | Touches | Why here |
|---|---|---|---|---|
| **1** | **Was auf der Karte steht** | N1 N2 N3 K1 | `utils/format.ts`, `styles/calendar.css`, `Calendar.svelte` (`eventDidMount`), `SubjectDetail.svelte` | Cheap, contained, testable in `format.test.ts`, and every later batch shows cards. The one finding that improves every single screen the app draws. |
| **2** | **Höhe und Stunden** | H1 H2 | `Calendar.svelte`, `ui.svelte.ts`, one Konfiguration field | Also cheap, also everywhere, and independent of batch 1. Do it before the rotation work so the rotation is planned against a grid that fits. |
| **3** | **Die Rotation** | R1 R2 R3 R4 | `store.svelte.ts` (one new mutation), a new `RotationDialog`, `PlaceDialog.svelte`, `ReportPanel.svelte`, `Sidebar.svelte` | The flagship, and the largest. New store logic wants unit tests (`detector`'s `previewClash` is already pure — the slot search should be too). R4 depends on R1; R2 and R3 stand alone and can ship first if the batch has to be split. |
| **4** | **Auswertungen** | Q1 Q2 Q3 Q4 Q5 | `ReportPanel.svelte` only | Entirely self-contained, no shared surface, no decision needed. Good filler between the two large batches. R5 (load strip) rides along if batch 3 has landed. |
| **5** | **Tastatur und Screenreader** | K2 K3 K4 K5 + L2 | `App.svelte`, `WorkDock.svelte`, `ReportPanel.svelte`, `ConfigPanel.svelte`, `app.css` | A sweep across every surface — worth doing in one go, after the surfaces have stopped moving. K1 is deliberately in batch 1 instead: it belongs to the card, not to the sweep. |
| **6** | **Ein Editor** | E1 E2 E3 E4 + L1 L3 | `EventPopover.svelte`, `EventModal.svelte`, `App.svelte` | Last, because **E1 needs a decision before it needs code** — which editor survives. Everything else in the batch is small and lands whichever way that goes. |

**If only one batch is done:** batch 1. Two: 1 and 2. Three: 1, 2 and the R2+R3
half of batch 3 — a free slot proposed and a clash named is most of the rotation
win for a tenth of the rotation work.

## Not done

- **R1 — the Rotation action**, and **R4**, the sidebar chip that would have
  opened it. Skipped by decision. `copyEventToLanes` keeps today's behaviour:
  it copies to the same time on the other lanes, which is right for a Szenario
  run in parallel and manufactures a clash per lane for anything with one
  Ausbildner. The rotation is still placed one card at a time — but **R2** now
  proposes a free slot and names what a placement would collide with, which is
  most of the per-card cost without the new mutation.

## Deliberately not proposed

- **Undoing the one dock.** The Probleme pane is mostly empty with one problem;
  that is what a panel looks like when the plan is nearly clean, and it is not
  worth a second rail (pass 3, `D1`/`D2`).
- **An automatic planner.** "Fill the week" is a different product; a rotation
  the user aims and confirms (R1) is the same power without the trust problem.
- **Widening the dock past 248px**, or making it resizable — still the wrong
  ratio (pass 3, *Not done*).
- **A mobile layout.** Out of scope by `CLAUDE.md`.
