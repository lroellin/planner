# Design Pass — graphical review

A full pass over every surface: grid, toolbar, sidebar, overlays, configuration,
reports. Reviewed at 1680px and 1280px, light and dark, against a populated week
(36 Lektionen, 11 Themen, 5 Gruppenführer, 11 Konflikte).

45 findings. **P1** = fix first, **P2** = real friction, **P3** = polish.
Readable version: <https://claude.ai/code/artifact/f750bcd3-5674-446a-8dbc-7db564ffae00>

## The read

The token layer in `app.css` is sound and does not need rework. What fails is
second-order behaviour: the rules were written against a comfortable case — wide
viewport, moderate week, few conflicts — and the app is now used outside it.
Every P1 below is a rule that was right once and is not right at the density the
app has grown into.

Keep as is: the tint-and-spine card recipe; the accent-hues-are-not-data rule;
the conflict panel's information design; the phase strip measuring real segment
widths; the three-level time-axis rules; the dark theme's line treatment.

## Top five

| Ref | |
|---|---|
| A4 A5 | The card has no idea how wide it is. Duration bands exist, width bands don't. |
| A1 A2 | The conflict ring erases the subject spine — and a red Thema already looks conflicted. |
| A8 | Twelve lunch cards. The widest object in the week carries one bit. |
| D1 | Three different backdrop behaviours across five overlays. |
| F1 F2 | Coverage report shouts the good news; the two phase tables don't share a column ruler. |

## A · Grid and cards

| # | P | Finding | Fix |
|---|---|---|---|
| A1 | 1 | `.wk-ev-hard/-soft` draw `outline-offset: -2px` on all four edges, over the 3px spine. The Thema's identity vanishes exactly when it matters. | Inset ring starting after the spine — `::before` with `left: 3px`, or an inset box-shadow composed alongside `--wk-ring`. |
| A2 | 1 | A red Thema (`Sanität #ef4444`) is indistinguishable from a hard conflict; amber Thema vs. dashed soft ring, same. The notch meant to solve this never renders (A3), so hue is the only channel. | Give the ring geometry: 2px ring separated from the body by a 1–2px surface-coloured gap, so a conflicted card is visibly *double-edged*. Survives any hue and a mono printer. |
| A3 | 2 | `.wk-ev-hard::after` corner notch never appears — `overflow: hidden` + rounded corner + `.wk-ev-flags` occupies that spot. | Keep ring + icon, delete the notch. |
| A4 | 1 | Card adapts to duration, not width. At 1280px a lane is ~68px: titles fragment, time wraps to two lines, room truncates. | `container-type: inline-size` on the event harness; width bands beside duration bands. Below ~90px switch to a new `Subject.shortName` + initials + room dot. |
| A5 | 2 | `hyphens: auto` + 2-line clamp yields "Kar- / te- / ner…". | `hyphenate-limit-chars: 8 4 3`; let the narrow band (A4) take over below that. |
| A6 | 2 | A 2 h 30 min card holds 3 lines at the top and ~200px of flat tint. | `.wk-dur-lg { justify-content: space-between }` — title top, meta pinned to the bottom edge. |
| A7 | 3 | Resize grip paints at 22% alpha at rest on every card; reads as a smudge. | `opacity: 0` at rest, reveal on `:hover` / `:focus-within`. |
| A8 | 1 | A multi-group Pause draws once per lane — 12 hatched cards, each with title, time and a layers icon. | Only the first lane of each day renders text; drop the per-card layers icon; hatch 5% → ~3.5% with a wider period. |
| A9 | 3 | `--wk-day-band` (2.5% / 4%) is invisible in both themes. | Commit (~4.5% / 6%, checked on a card-covered column) or delete. Same for `--wk-grid-fringe`. |
| A10 | 3 | `.wk-dur-sm` hides the time — on short cards, where height tells you least. | Keep the start time, drop the end: "08:00", not "08:00–09:30". |
| A11 | 3 | 16px avatars with 8.5px white type; fails for light teacher colours. | 17–18px at 9.5px; derive label colour from the teacher colour's lightness in `utils/colorUtils.ts`. |

## B · Toolbar

| # | P | Finding | Fix |
|---|---|---|---|
| B1 | 1 | At 1280px the week-nav chevron overlaps the date range and the density control is pushed under its neighbours. `.bar-left/-right` are `flex: 1; min-width: 0` but nothing inside shrinks; `.bar-center` is `flex-shrink: 0`. | Explicit collapse order: <1500px drop labels from Auswertungen/Drucken; <1360px move Legende, Tastenkürzel and density into a "⋯" menu. `overflow: hidden` per group so a miscalc clips, never overlaps. |
| B2 | 2 | Konfiguration is the only solid primary and is rarely used; "11 Probleme" — the thing worked against all day — is a quiet outline pill. | Swap the emphasis. Konfiguration → ghost; problem badge → filled error tint, count first, quiet at zero. |
| B3 | 3 | Wordmark (750) and plan name (600) compete at nearly the same size. | Wordmark down to a mark/small caps; let the plan name carry the weight — it is also the only editable thing there. |
| B4 | 3 | Week nav is centred on the viewport, leaving a ~300px hole. | Move it left next to the filter cluster, or fill the centre with phase context. |
| B5 | 3 | One icon-only button (Tastenkürzel) stranded among labelled ones. | Label it or move it into B1's overflow menu. |

## C · Sidebar

| # | P | Finding | Fix |
|---|---|---|---|
| C1 | 2 | At 208px, "Persönliche Ausr…", "Schutzanlage Be…". These names are the affordance. | 240px default; move the coverage badge off the name's line. |
| C2 | 2 | Badge state is hue-only: green `3/3` (complete) vs amber `3/3` (ungleich) vs grey `3/4` — and grey means "disabled" elsewhere in this app. | Give each state a form as well as a colour; incomplete leads with what is missing, not a ratio. |
| C3 | 3 | Chip mixes at 8%, card at 13% / 24% — the comment claims one recipe. | Promote `--wk-tint` / `--wk-edge` to `:root`; both read them. |
| C4 | 3 | 11 permanent drag grips beside 11 spines. | Reveal on hover/focus; the chip is already `cursor: grab`. |

## D · Overlays

| # | P | Finding | Fix |
|---|---|---|---|
| D1 | 1 | Konfiguration and Auswertungen dim the page; EventModal, Legende and Tastenkürzel do not, floating over a fully-lit 30-card grid. | One `--wk-scrim`: modal things dim, card-anchored things don't but gain a stronger border + larger shadow. Two categories, not three behaviours. |
| D2 | 2 | The legend clips "Mittagessen" mid-row with no scrollbar or fade. | Lay it out in columns so the whole key fits; else `max-height: min(70vh, …)` + scroll container + bottom fade. |
| D3 | 2 | The right-aligned "Gruppenführer" label touches the first chip — fixed label width the longest label doesn't fit. | `grid-template-columns: max-content 1fr` with a `column-gap`. |
| D4 | 2 | Dauer is preset chips in the popover, a bare number input in the modal, and both in Konfiguration. | One `DurationField` (presets + numeric escape hatch) used in all three. |
| D5 | 3 | "aus der Themenvorgabe" appears three times as body text. | One per-row tag: "Vorgabe" while inherited, "zurücksetzen" once overridden. |
| D6 | 3 | Modal footer: trash / teilen / duplizieren / multi-group, four identical grey icons. | Label them; separate delete with a gap and an error-coloured hover. |
| D7 | 3 | Shortcut sheet has a ~200px gutter between key cap and meaning. | Two-column grid, keys right-aligned in their track, ~2rem gap. |

## E · Configuration

| # | P | Finding | Fix |
|---|---|---|---|
| E1 | 1 | Fixed-height dialog: Phasen shows two rows over ~600px of void with the footer pinned to the bottom. Gruppen and Plan & Daten too. | Size to content with a `max-height` ceiling; footer under the content until it needs pinning. |
| E2 | 2 | Sticky footer covers the "Zählt als" choice on Themen with an opaque background and no fade. | Bottom padding on `.detail-form` equal to footer height + a `mask-image` fade. |
| E3 | 2 | `.section-title` (2xs/700/.09em) and `.field-label` (2xs/600/.06em) read as the same level — "BEZEICHNUNG" vs "NAME". | One uppercase level. Section titles become larger sentence-case headings; keep the `.wk-eyebrow` treatment for field labels. |
| E7 | 2 | English string in a de-CH UI, Gruppen tab: "Switching a group off keeps its events; …". | Translate using the glossary's vocabulary (Lektionen, not events). Grep for other survivors. |
| E4 | 3 | Two reorder mechanisms — a drag grip and near-invisible chevrons at the table's outer edge. | Pick one; if buttons, a segmented control adjacent to the label. |
| E5 | 3 | "Gruppe hinzufügen" solid primary, "Gruppenführer hinzufügen" disabled ghost, "Phase hinzufügen" a third variant. | Route every tab through `config/AddRow.svelte`. |
| E6 | 3 | The colour control reads as a primary button (Themen) or an avatar (Gruppenführer). | Swatch in a frame with a caret; drop the palette icon drawn over the colour. |

## F · Reports

| # | P | Finding | Fix |
|---|---|---|---|
| F1 | 1 | KVK's Thema column is ~100px wider than WK's; lane columns land at different x. Two unrelated tables, and the Status column moves between them. | One grid for the report: `minmax(16rem,1fr) repeat(var(--lanes), 6rem) 7rem`, lanes sized from the max across phases. |
| F2 | 1 | Five green "vollständig" pills dominate; the one missing row gets a small amber pill. The report exists to find gaps. | Complete rows get no pill. Only fehlt / Zeit fehlt / ungleich are marked, with the weight the greens have now. |
| F3 | 2 | ~61px rows for one number; 10 of 16 fit. "Soll 2 h" trails the name in grey and reads as part of it. | Halve the padding; give Soll its own column between name and lanes. |
| F4 | 2 | Time / Gruppe / Raum spread over ~1100px, so "K" sits alone in a 400px cell. Rows grouped by Thema, not by day. | Content-width tracks, left-aligned; group by day — `byDay()` already exists in `ReportPanel.svelte` and is unused on this tab. |
| F5 | 3 | Zebra striping across 40 mostly-empty rows. | Hairline rules + a sticky Gruppenführer header. |
| F6 | 3 | Gruppen are bare text in reports, lane headers everywhere else. | Reuse the lane-header type treatment from `calendar.css`. |

## G · System level

| # | P | Finding | Fix |
|---|---|---|---|
| G2 | 2 | Breaks use `--wk-surface-alt` + a 5% white hatch — one of the lightest large areas in dark mode, so the lunch band becomes a bright wall. Intent was "breaks recede". | Own dark-mode ground, darker than the grid, lower hatch alpha. Recession is a different direction per theme. |
| G5 | 2 | Print loses the conflict signal: the ring is a colour, the notch doesn't render (A3), avatars are white-on-colour → white-on-grey. | A2's geometry prints for free; add a print rule flipping avatars to dark-on-light. |
| G1 | 3 | Type scale declared "so a label can't land on a sixth size" — then the card hardcodes 8.5px and 9px. | Add `--wk-fs-3xs` and use it, or move avatars onto `--wk-fs-2xs` with a larger circle (A11). |
| G3 | 3 | `--wk-day-band`, `--wk-grid-fringe`, `--wk-line-faint` were each tuned in isolation; two do nothing visible in context. | Audit together on a populated week in both themes. Raise or remove. |
| G4 | 3 | The Phasen week strip paints KVK blue and WK orange — the primary/accent pair `app.css` reserves for "this is a control". Phases are data. | Neutral tints, or give `Phase` its own colour field. |

## Sequencing

**1 · Make the grid legible under load** — A1 A2 A3 A4 A5 A6 A7 A8 A10.
Almost entirely `calendar.css` plus the `eventContent` builder; no state changes
except the new `Subject.shortName` A4 wants.

**2 · Chrome and a focus rule for dialogs** — B1 B2 B3 D1 D2 D3 D4 E1 E2 E5.

**3 · Reports, sidebar, token audit** — F1 F2 F3 F4 F5 F6 C1 C2 C3 C4 G1 G2 G3 G5.

---

The card is doing four jobs — naming a Thema, showing its colour, showing its
duration, reporting a conflict — and at 68px wide with a red ring around it, it
can only do two. Fix the card and most of this list stops mattering.
