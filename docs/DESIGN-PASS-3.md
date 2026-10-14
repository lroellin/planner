# Design Pass 3 — screen usage

A third pass, over one question only: **where do the pixels go?** This app draws
a 12-hour day across up to eleven lanes on a laptop screen, and both dimensions
are full. Reviewed at 1440×900, 1366×768, 1280×800 and 980×720, light and dark,
against the populated sample week (56 Lektionen, 20 Themen, 8 Ausbildner,
6 Räume).

> **Status: all 12 implemented** (2026-09-09). 201 tests, `npm run check` clean.
> Pass 1 (`DESIGN-PASS.md`, 45) and pass 2 (`DESIGN-PASS-2.md`, 31) are
> unaffected — nothing here undoes an earlier finding except **S3**, which
> revisits pass 2's two-line chip on new evidence.

## The measurement

At 1440×900, before this pass, the app spent its screen like this:

| | before | after | |
|---|---|---|---|
| chrome left of the grid | 240 (Themen) + 40 (Probleme rail) | **248** (one dock) | −32px, and the Probleme panel no longer *covers* 268px on top of that |
| time gutter | 56 | **46** | −10px per phase |
| toolbar | 46 | **42** | −4px |
| phase strip | 36 | **23** | −13px |
| column headers | 59 | **53** | −6px |
| sidebar's own bottom toggle bar | 34 | **0** | folded into the tab strip |
| **grid body height** | 758px (31.6 slots) | **781px (32.5 slots)** | |
| **left-hand toolbar group** | 715px | **~245px** | |
| **one subject chip** | 50px | **31px** | the whole Themen list fits without scrolling |

## The read

Three separate mechanisms were each solving "there is not enough room" by taking
room from something else.

The **Probleme panel** floats over the grid because docking it cost 268px. That
is the right diagnosis and the wrong cure: the panel that names a conflict was
being drawn on top of the lanes the conflict is in, so its "show me" pointed
underneath itself. It was also a *second* panel, paying a second rail, for a job
that is never done at the same time as the first one.

The **toolbar** carried its own name, a date range the grid prints ten pixels
below it, a colour key consulted once a week, and a 158px dropdown whose resting
state said "no filter is on" — a fact you can also establish by looking at the
grid. Half the bar, permanently, for things that are read rarely or not at all.

And the **phase strip** was 36px tall because `font: inherit` — a *shorthand* —
sat after the other font declarations in the same rule and quietly reset the
`.wk-eyebrow` on that element back to 16px/1.5 body text. Nobody chose that
size. It had just never been measured.

## Top five

| Ref | |
|---|---|
| D1 | Probleme is drawn on top of the lanes it is talking about. |
| T2 | The week nav restates the column headers ten pixels below it. |
| P1 | `font: inherit` silently killed the phase strip's own type scale. |
| T3 | 158px of permanent toolbar spent saying that no filter is set. |
| S3 | The chip's badge got its own row to protect the name; a shorter badge protects it better. |

---

## D · The dock

| # | P | Finding | Fix |
|---|---|---|---|
| D1 | 1 | The Probleme panel floats over the calendar (`SidePanel overlay` + a 40px `.right-dock`). It covers the last ~268px of the week — Friday's lanes in the sample plan. Clicking a conflict row calls `revealEvent`, which scrolls the card into view *behind the panel that was just clicked*. The one panel whose whole purpose is to point at cards is the one that hides them. | **One dock, two tabs** (`WorkDock.svelte`). Themen and Probleme are both read against the grid and never against each other, and only one of them is ever the job at hand. They share 248px on the left; nothing is ever covered. |
| D2 | 2 | Two collapsible panels means two rails, two collapse states and two toggle bars: 240 + 40 = 280px of chrome before either is open, on a screen where a lane is ~43px. | The 40px right rail is gone. Folded, the single dock is 34px and its rail carries **both** labels plus the problem count. |
| D3 | 2 | `SidePanel`'s collapse toggle was a 34px bar pinned to the panel's bottom edge — a full row of chrome for one chevron, in the app's scarcest dimension, and it was drawn twice. | The toggle is a 20px button at the end of the tab strip. The Themen list got the 34px. |
| D4 | 3 | The Probleme pane opened with `PROBLEME · 1` in its own header, immediately under a tab reading `PROBLEME 1`. | `ConflictPanel` has no header of its own any more. The tab is the header. |
| D5 | 3 | Swapping panes with `{#if}` would rebuild the Themen pane's FullCalendar `Draggable` and clear its search box on every tab switch. | Both panes stay mounted; the inactive one is `display: none`. |

**Trade accepted.** You can no longer see Themen and Probleme at once. Clearing
conflicts is done by moving cards that already exist, not by dragging new ones,
and the other tab is one click away — against a grid that is 268px wider and
never occluded.

## T · The toolbar

| # | P | Finding | Fix |
|---|---|---|---|
| T1 | 2 | The wordmark: `WK PLANER`, 89px with its margin, sitting beside a plan called "WK 2026 Tuggen/Reichenburg". It names the app to the one person who already knows which app they opened, on every frame of every session. | Removed. The browser tab carries the name. |
| T2 | 1 | The week nav — `‹ 14.9.–18.9. ›`, ~185px — restates what the grid's own column headers print in bold across the top (`Mo. 14.9.` … `Fr. 18.9.`). It is *set* once per WK and *read* never, because the answer is always already on screen. | Moved to **Konfiguration › Plan & Daten**, beside the plan name, with the same ‹ › week step, a date field and the resulting Mo–Fr label. The tab's intro line says why it lives there. |
| T3 | 1 | The filter was a permanent 158px `<select>` whose resting label was "Alle Lektionen" — width spent saying that nothing is filtered. It also *wrapped*: at its declared 30px height the 13px icon and the 150px select did not fit side by side, so the select rendered on a second line, outside the box, at every width. | Off: a 28px icon button. On: a chip naming the filter, tinted with the primary accent, with its own × — because hiding Lektionen is a state you must never be in by accident. The list moved into the app's standard `pop` popover, grouped Ausbildner / Räume / Gruppen with each entry's colour dot. |
| T4 | 2 | `Legende`, ~99px, labelled, permanently on the bar above 1360px — for a colour key consulted on the first day and then about once a week, whose Ausbildner/Räume/Themen columns are all also readable in Konfiguration. | Into the «⋯» overflow at **every** width, under an *Ansicht* heading. The popover itself is unchanged, including the *Markierungen* column, which is the part that exists nowhere else. |
| T5 | 2 | The plan name was capped at a fixed `14rem`. On a 1280px screen that is a seventh of the bar for a string read once per session. | `max-width: min(15vw, 13rem)`, ellipsised, with the full name in the tooltip and in Konfiguration. |
| T6 | 3 | With ~370px freed on the left, `dense` (labels off Auswertungen/Drucken) at 1500px and `tight` (density into the «⋯») at 1360px were both firing hundreds of pixels too early — a 1440px screen was showing two unlabelled icon buttons for no reason. | 1130 / 1000. Verified at 1680, 1440, 1366, 1280, 1100 and 980: the two groups never meet and nothing leaves the bar. |
| T7 | 3 | Bar 46px, controls 30px. | 42 / 28. Four pixels alone is nothing; it is the same four the phase strip and the column headers each gave back. |

## P · The bands above the grid

| # | P | Finding | Fix |
|---|---|---|---|
| P1 | 1 | The phase strip was 36px tall for two words. `.phase-label` declared `color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit` — and `font` is a **shorthand**, declared *after* the rule's own `line-height`, on an element that also carries `.wk-eyebrow`. Scoped-Svelte specificity (0,2,0) beat the eyebrow (0,1,0), so the strip had been rendering at inherited 16px/1.5 body text since it was written. | Take the eyebrow, one step up for presence (`--wk-fs-xs`, 700) — these are the only labels the phases get on the main screen. 36px → 23px. |
| P2 | 2 | The dock's tab strip and the phase strip are the same band across the top of the work area and were 30 and 36px. | Both 23px. One line across the whole width. |
| P3 | 3 | The day-header and lane-header cushions carried 0.4/0.35rem and 0.25rem of padding. With the week nav gone, the day header is now the **only** place the date is printed, so the size stays — only the air goes. | 59px → 53px. |
| P4 | 3 | `--wk-axis-w: 56px` for a right-aligned `08:00` at 12px plus an 8px lead-out — about 41px of content. Every phase reserves it separately. | 46px. Verified against `scrollWidth === clientWidth` on the label cushion: no clipping. |

## S · The subject chips

| # | P | Finding | Fix |
|---|---|---|---|
| S3 | 1 | Pass 2 moved the coverage badge onto **its own row** because "fehlt 2×" and a long Thema fought over 208px and the name lost. That made every incomplete chip 50px tall — and on a work-in-progress plan nearly all of them are incomplete, so 20 Themen needed 1000px in an 819px panel and the list was permanently scrolled. The fight was over the *words*, not the row. | Compact flags, back on the name's line: `⚠2×` for missing, `kurz` / `lang` / `≠` for the three duration verdicts — ~26–32px instead of ~62. The name gets **more** room than the two-line chip's own name row had at the widths that matter, the chip is 31px, and the whole list including Programmpunkte and Pausen fits at 900px viewport height without scrolling. The sentence each flag stood for is in the chip tooltip, where it always was and where it can be a sentence. |

**Kept:** the spotlight still hangs off the *flag*, not the chip — sweeping the
pointer down the list, or merely clicking a chip, must not put the calendar
behind a scrim while it is being read.

---

## Two things found on the way

**daisyUI 5 owns `.dock`.** It is a fixed bottom navigation component, and
naming the new panel `dock` silently gave it `position: fixed` — it rendered as
a 248×64 box floating over the middle of the calendar. Every class in
`WorkDock.svelte` is prefixed `wkdock-`. Worth remembering: daisyUI class names
are global and unprefixed, and a collision fails *quietly*, by styling.

**A shorthand after a longhand wins.** P1 is the second time in this codebase a
declaration has been silently defeated (the first was `--b1`-era vars resolving
to nothing and resetting `border-style`). `font: inherit` is never what you want
next to a utility class that sets the type scale.

## Not done

- **Narrowing the dock below 248px.** The Probleme rows (`Thema · G1 · Mi 09:00`)
  need it; 248 is already 32px less than the two panels cost together.
- **A resizable dock.** A drag handle and a persisted width for a panel that is
  usually open at one width, on a single-user local app — the ratio is wrong.
- **Filling the ~500px hole in the middle of the toolbar.** It is what keeps the
  two groups from ever meeting, and a calm bar is not wasted screen: the grid
  below it is 42px tall regardless of what the bar holds.
