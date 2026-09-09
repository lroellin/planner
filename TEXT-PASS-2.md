# Text Pass 2 — Sprache und Benennung

A second pass over *what the app says*, after the 67 fixes in `TEXT-PASS.md`.
Same three questions, plus a fourth that only becomes askable once the obvious
English is gone:

1. Is it German at all?
2. Is it German a Swiss ZS-Kader would write?
3. Is the word the right name for the thing?
4. **Does the app still call it that two panels later?**

Every string was pulled out of the templates mechanically (text nodes, `title`,
`aria-label`, `placeholder`, plus the label maps in `types.ts`, `boxes.ts`,
`store.svelte.ts`, `availability.ts`) and read against the glossary in
`SPECS.md`. Nothing below is about code or comments.

**24 findings.** **P1** = wrong or self-contradicting. **P2** = two words for
one thing. **P3** = reads badly.

> **Status: all 24 implemented** (2026-09-08). **N1 resolved as
> *Arbeitsprogramm*** — the user's call, and the better one: it is the name the
> Zivilschutz already uses for this document, so the app now agrees with the
> paperwork instead of inventing a fourth term. *Wochenplan* is gone from `src/`
> entirely. **C1 shipped in a different shape than proposed** — see the finding.
> One new export, `conflictNote()` in `types.ts`, and three new tests (194 total).
> `npm run check` clean, build clean, verified against the populated sample week
> in the browser. The `SPECS.md` glossary is updated to match: rows 12, 18, 19,
> 20, 22, 23, 29a, a new 29b (**Arbeitsprogramm**), 37, the `excludeFromCoverage`
> and `optional` notes, the Probleme-panel section, and three new rules —
> *A label is not a sentence*, *One glyph per idiom*, and the paper half of
> *One word per thing*.

## The read

The register problem from the first pass is gone. What is left is almost
entirely **drift between surfaces**: the same thing named one way in the panel
that shows it and another way in the tab that opens it. Nine of the twenty-four
are one string disagreeing with a second string about a noun both of them own.

Three things stand out.

**Two label maps produce ungrammatical sentences at the call site.**
`CONFLICT_KIND_LABELS` mixes resource nouns (`'Ausbildner'`, `'Raum'`) with
capitalised adjectives (`'Abwesend'`, `'Gesperrt'`), and every consumer renders
`{label} {name}` — so a teacher booked into their own absence produces
**"Abwesend Anna Müller"**. That is the last remaining string in the app that
isn't a German sentence.

**The print path calls the same document three different things.** The toggle
says *Wochenplan*, the dialog title above it says *Kalender*, the PDF metadata
says *Arbeitsprogramm*, and the saved file is called `kalender-2026-01-05.pdf`.
The user picks "Wochenplan" and gets a file named after something else.

**The glossary's own rules are broken in the newest code.** `SPECS.md` says
things are *angezeigt*, never *gezeichnet* — the Drucken dialog, which is the
most recently written surface, says *zeichnet* twice. That is the shape this
kind of drift always takes: the rule holds everywhere it was applied and stops
at the code written after it.

## Top six

| Ref | |
|---|---|
| **C1** | `'Abwesend'` + a name renders "Abwesend Anna Müller". Not a sentence. |
| **C2** | The soft-conflict icon says "Raum doppelt belegt" for *every* soft conflict — including a Sperrzeit, where nothing is double-booked. |
| **N1** | *Wochenplan* / *Kalender* / *Arbeitsprogramm* / `kalender-….pdf` — one document, four names, two of them in the same dialog. |
| **N2** | The Auswertungen tab says **Raumpläne**, its own heading one line below says **Raumbelegung**. |
| **N3** | The right panel is headed *Konflikte* but counts *Probleme*, contains an *Ausserhalb der Phasen* section, and is opened by a badge that says *Probleme*. |
| **N4** | The Sperrzeiten hint says a room is "belegt" — the app's word for a *lesson booked into it*, counted three lines above under "Belegung diese Woche". |

---

# P1 — wrong or self-contradicting

## C1 · "Abwesend Anna Müller"

**Ort** [src/types.ts:176](src/types.ts:176) — consumed by
[ConflictPanel.svelte:217](src/components/ConflictPanel.svelte:217),
[EventModal.svelte:262](src/components/EventModal.svelte:262),
[EventPopover.svelte:283](src/components/EventPopover.svelte:283),
[Calendar.svelte:465](src/components/Calendar.svelte:465).

Three of the five values are resource nouns, two are capitalised adjectives, and
every call site renders `{label} {name}`.

**Jetzt**

```ts
teacher: 'Ausbildner',
room: 'Raum',
group: 'Gruppe',
'teacher-absent': 'Abwesend',      // → "Abwesend Anna Müller"
'room-blocked': 'Gesperrt',        // → "Gesperrt Turnhalle"
```

**Proposed** — one map, resource named in all five: `'Ausbildner abwesend'`,
`'Raum gesperrt'`.

**What shipped, and why it changed.** Measured in the browser, that made things
worse where the label is an *eyebrow* rather than running text. The Probleme
panel's card header is 225px and holds the kind, the resource name and the
count; `Ausbildner abwesend` takes 152px of it and truncated "Lukas Zurbuchen"
from 103px to 48px — the half worth reading. The bug was never the panel, which
puts the two in separate elements ("RAUM" over "Kompanie" is a perfectly good
label/value pair). It was the **three inline sites** that concatenate them into
one span.

So: two shapes, split by how they render.

```ts
// eyebrow — its own element, above the name. Restored to one short word.
export const CONFLICT_KIND_LABELS = {
  teacher: 'Ausbildner', room: 'Raum', group: 'Gruppe',
  'teacher-absent': 'Abwesend', 'room-blocked': 'Gesperrt',
};

// running text — one span, for the event editors' clash chips.
export function conflictNote(kind: ConflictKind, name: string): string { … }
```

`conflictNote` names the resource first and its state second, which is
grammatical for all five and reuses wording the Probleme panel's own empty state
already has:

| kind | before | after |
|---|---|---|
| `teacher` | Ausbildner Anna Müller | **Anna Müller doppelt eingeteilt** |
| `group` | Gruppe G1 | **G1 doppelt eingeteilt** |
| `room` | Raum Kompanie | **Kompanie doppelt belegt** |
| `teacher-absent` | Abwesend Anna Müller | **Anna Müller abwesend** |
| `room-blocked` | Gesperrt Turnhalle | **Turnhalle gesperrt** |

Three tests lock both halves in, including the length cap on the eyebrow that
the first attempt broke.

## C2 · The soft-conflict icon names the wrong conflict

**Ort** [Calendar.svelte:496](src/components/Calendar.svelte:496)

`HARD_CONFLICT_KINDS` is `['teacher', 'group', 'teacher-absent']`, so **both**
`room` *and* `room-blocked` are soft. The tooltip hard-codes the room-clash
wording for both — a Lektion placed inside a room's Sperrzeit gets an icon whose
tooltip says the room is double-booked, which is false.

**Jetzt** `title="${hard ? 'Harter Konflikt' : 'Raum doppelt belegt'}"`

**Neu** `title="${hard ? 'Harter Konflikt' : 'Weicher Konflikt'}"`

Those are the two terms the Legende already lists
([Toolbar.svelte](src/components/Toolbar.svelte)), so the icon and the colour key
finally agree. The specific reason stays available: the element's own `title`
one block up already spells out `⚠ Konflikt: {kinds}`.

## N1 · One printed document, four names

**Ort** [boxes.ts:248](src/print/boxes.ts:248), used for both the dialog title
([PrintDialog.svelte:177](src/components/PrintDialog.svelte:177)) and the file
name ([PrintDialog.svelte:114](src/components/PrintDialog.svelte:114)).

The dialog reads **"Drucken – Kalender"** with a radio button directly beneath it
labelled **"Wochenplan"**, and saves `kalender-2026-01-05.pdf`. Glossary #12
reserves *Kalender* for the grid on screen; the printed sheet is the
*Wochenplan* everywhere else, including the print-fallback page in
[App.svelte:556](src/App.svelte:556).

**Jetzt** `grid: 'Kalender',`

**Neu** `grid: 'Arbeitsprogramm',`

Fixes the title *and* the file name in one edit (`arbeitsprogramm-….pdf`). The
PDF metadata now agrees too: `calendarClassicPdf.ts` already set
`Arbeitsprogramm – …` and `calendarPdf.ts` has been brought in line with it, so
both renderings of the same document carry the same name.

## N2 · Raumpläne vs. Raumbelegung, one line apart

**Ort** [ReportPanel.svelte:60](src/components/ReportPanel.svelte:60)

The tab is labelled `Raumpläne` (line 53); the heading it switches to says
`Raumbelegung`. The two other tabs match their headings exactly.

**Jetzt** `rooms: 'Raumbelegung',`

**Neu** `rooms: 'Raumpläne',`

Same on paper: the printed kickers are `Gruppenplan`, `Ausbildnerplan`,
`Raumbelegung` ([boxes.ts:208](src/print/boxes.ts:208)). Two `-plan`, one
`-belegung`.

**Neu** `kicker: 'Raumplan',`

## N4 · "belegt" means the opposite thing in the Sperrzeiten hint

**Ort** [RoomDetail.svelte:104](src/components/config/RoomDetail.svelte:104)

Glossary #37: *Belegung* is a Raum's bookings — the lessons in it. The same
panel counts them three lines above under **"Belegung diese Woche"** and
**"{n} belegt"**. Then the Sperrzeiten editor tells the user to add a window
"Ist der Raum an einem Tag **belegt**" — meaning the exact opposite: blocked by
something *outside* the plan.

**Jetzt** `"Die ganze Woche verfügbar. Ist der Raum an einem Tag belegt, unten hinzufügen."`

**Neu** `"Die ganze Woche verfügbar. Sperrzeiten unten hinzufügen."`

And its twin, which has the same problem in a milder form — "Fehlt jemand" reads
as *someone*, in a panel that is about exactly one person:

**Ort** [TeacherDetail.svelte:95](src/components/config/TeacherDetail.svelte:95)

**Jetzt** `"Die ganze Woche anwesend. Fehlt jemand an einem Tag, unten hinzufügen."`

**Neu** `"Die ganze Woche anwesend. Abwesenheiten unten hinzufügen."`

Both then use the exact noun that heads the editor they sit in (#22, #23).

## C3 · The two availability hints aren't parallel

**Ort** [TeacherDetail.svelte:96](src/components/config/TeacherDetail.svelte:96),
[RoomDetail.svelte:105](src/components/config/RoomDetail.svelte:105)

Same position, same shape, same panel layout — and one says *ist ein Konflikt*
while the other says *wird als Konflikt gemeldet*, one compares to a
*Doppelbuchung* and the other to a *Doppelbelegung*. Neither compound appears
anywhere else in the app; the ConflictPanel's own empty state says "doppelt
eingeteilt".

**Jetzt**

```
Eine Lektion in einer Abwesenheit ist ein harter Konflikt, wie eine Doppelbuchung.
Eine Lektion in einer Sperrzeit wird als weicher Konflikt gemeldet, wie eine Doppelbelegung.
```

**Neu**

```
Eine Lektion in einer Abwesenheit ist ein harter Konflikt, wie eine doppelte Einteilung.
Eine Lektion in einer Sperrzeit ist ein weicher Konflikt, wie eine doppelte Belegung.
```

---

# P2 — two words for one thing

## N3 · "Konflikte" heads a panel full of Probleme

**Ort** [ConflictPanel.svelte](src/components/ConflictPanel.svelte),
[App.svelte:453](src/App.svelte:453)

Glossary #20 is explicit: *Problem* = Konflikte **plus** orphans, and it is the
badge's word. The panel heading says `Konflikte`, its own subline immediately
says `{n} Probleme`, and it contains an `Ausserhalb der Phasen` section that is
not a conflict at all. The collapsed rail then reads "Konflikte ausklappen" for
a badge that counts something wider.

**Neu**

- Panel heading: `Konflikte` → **`Probleme`**
- `App.svelte:453` `label="Konflikte"` → **`label="Probleme"`**
- Empty state heading `Keine Konflikte` → **`Keine Probleme`**
- Empty state line — the current one only covers half of what the panel watches:

  **Jetzt** `Niemand und nichts ist doppelt eingeteilt.`

  **Neu** `Niemand ist doppelt eingeteilt, und jede Lektion liegt in einer Phase.`

That last one is the toolbar tooltip's sentence already ("Keine Konflikte, alles
liegt in einer Phase"), so the badge and the panel it opens finally say the same
thing. The `{n}× Ausbildner` chips stay as they are — those really do count
Konflikte, and they sit under the heading that says so.

## N5 · "zurück" collides with "Zurück" inside one popover

**Ort** [EventPopover.svelte:367, 404, 426](src/components/EventPopover.svelte:367)

In the split view the popover has a **`Zurück`** button meaning *go back to the
main view*. In the main view it has three **`zurück`** links meaning *reset this
field to the Themenvorgabe*. Two meanings, one word, one component — separated
only by capitalisation. The full editor calls the same action `zurücksetzen`
([EventModal.svelte:337](src/components/EventModal.svelte:337)).

**Neu** — use the noun the modal already shows as the inherited-state badge, so
the link says what it restores rather than which direction it goes:

`zurück` → **`Vorgabe`**

Tooltip stays `Zurück zur Themenvorgabe`. Same width, no collision.

## N6 · "Kopieren auf" vs. "Auf Gruppen kopieren"

**Ort** [EventModal.svelte:416](src/components/EventModal.svelte:416) vs.
EventPopover

The two editors for the same Lektion head the same section differently, while
their trigger buttons share one tooltip ("Auf die anderen Gruppen kopieren").

**Jetzt** `Kopieren auf` (modal) / `Auf Gruppen kopieren` (popover)

**Neu** `Auf Gruppen kopieren` in both.

## N7 · "Konflikte ignorieren" vs. "Konfliktprüfung ausschalten"

**Ort** [RoomDetail.svelte:85](src/components/config/RoomDetail.svelte:85) vs.
[ConfigPanel.svelte:75](src/components/ConfigPanel.svelte:75)

The Räume tab intro tells the user to do a thing the toggle does not call
itself. Quote the control.

**Jetzt** `Bei geteilten Flächen wie «draussen» die Konfliktprüfung ausschalten: Dort stören sich zwei Gruppen nicht.`

**Neu** `Bei geteilten Flächen wie «draussen» «Konflikte ignorieren» einschalten: Dort stören sich zwei Gruppen nicht.`

## N8 · "Rechnet mit" vs. "zählt zur Abdeckung"

**Ort** [ConfigPanel.svelte:353](src/components/ConfigPanel.svelte:353)

The column head says *Rechnet mit* — with what? — while its own row tooltip says
`${g.label} zählt zur Abdeckung` and the glossary term is *Abdeckung* (#15).

**Jetzt** column head `Rechnet mit`, aria-label `Gruppe rechnet mit`

**Neu** column head **`Abdeckung`**, aria-label **`Gruppe zählt zur Abdeckung`**

The explanatory paragraph at line 433 opens with `<strong>Rechnet mit</strong>
ausschalten …` and has to follow: **`<strong>Abdeckung</strong> ausschalten …`**.

## N9 · The list tag "Punkt"

**Ort** [ConfigPanel.svelte:632](src/components/ConfigPanel.svelte:632)

The Themen list tags a `oneoff` as **`Punkt`** — which on its own means *dot*.
The sidebar section, the Art option and the placement picker all say
*Programmpunkt*.

**Jetzt** `Punkt`

**Neu** `Programmpunkt`

If the row is too narrow for it, **`Einmalig`** is the honest short form — it
names the property that makes it one ("findet einmal statt"). `Punkt` names
nothing.

## T1 · Two arrow glyphs for one idiom

**Ort** [Toolbar.svelte:254](src/components/Toolbar.svelte:254) `Konfiguration → Plan & Daten`
vs. [ProgrammpunktDialog.svelte:262](src/components/ProgrammpunktDialog.svelte:262) `Konfiguration › Themen`

Pick one. **`›`** is the better choice — it is already the SidePanel's chevron
([SidePanel.svelte:26](src/components/SidePanel.svelte:26)), and `→` reads as
"becomes" in the app's own migration/mapping comments.

**Neu** `Umbenennen unter Konfiguration › Plan & Daten`

## T2 · En dash where the app uses em dash

**Ort** [PrintDialog.svelte:177, 203](src/components/PrintDialog.svelte:177),
[App.svelte:556](src/App.svelte:556)

Exactly three UI strings use a spaced `–` as a parenthetical dash; everything
else in the app uses `—`. (The `–` in time and date ranges is correct and stays.)

```
Drucken – {TARGET_LABELS[…]}                              →  Drucken — …
Ein Blatt pro Gruppe, Ausbildner oder Raum – zum …        →  … Raum — zum …
Im WK-Planer auf Drucken klicken – oder Ctrl/Cmd + P      →  … klicken — oder …
```

---

# P3 — reads badly

## R1 · The Drucken dialog says "zeichnet"

**Ort** [PrintDialog.svelte:298, 331](src/components/PrintDialog.svelte:298)

`SPECS.md`, *One word per thing*: "Things are **angezeigt**, never *gezeichnet*:
drawing is what the code does, not what the user sees." The most recently
written surface in the app breaks it twice. For paper there is a better verb
anyway.

**Jetzt**

```
Klassisch zeichnet den Wochenplan wie das frühere Excel-Arbeitsprogramm.
Der Wochenplan wird auf eine A4-Seite gezeichnet und passt sich ihr an.
```

**Neu** — and once N1 lands, the first line cannot say *Arbeitsprogramm* twice,
so it names the layout rather than the document:

```
Klassisch übernimmt das Layout des früheren Excel-Arbeitsprogramms.
Das Arbeitsprogramm wird auf eine A4-Seite gesetzt und passt sich ihr an.
```

## R2 · "Nicht für alle Gruppen" fights the control above it

**Ort** [SubjectDetail.svelte:375](src/components/config/SubjectDetail.svelte:375)

Two independent axes sit in the same pane and sound like one:

- **Platziert für**: *Einzelne Gruppe* / *Alle Gruppen auf einmal* — how many
  lanes one placement covers.
- **Nicht für alle Gruppen** — whether the Thema counts toward Abdeckung at all.

The second is a negative checkbox whose label is a near-negation of the first
option of the first control. Name it after what it actually changes, in the
words `ProgrammpunktDialog` already uses for the same idea.

**Jetzt** title `Nicht für alle Gruppen`, hint `Nur einzelne Gruppen besuchen dieses Thema. Es zählt dann nicht zur Abdeckung: keine Auswertungszeile, kein «fehlt noch»-Hinweis am Chip.`

**Neu** title **`Zählt nicht zur Abdeckung`**, hint **`Nur einzelne Gruppen besuchen dieses Thema — es bekommt keine Auswertungszeile und keinen «fehlt noch»-Hinweis am Chip.`**

The sidebar tooltip has to follow
([Sidebar.svelte](src/components/Sidebar.svelte)):
`${subject.name} — nicht für alle Gruppen, zählt nicht zur Abdeckung` →
**`${subject.name} — nur für einzelne Gruppen, zählt nicht zur Abdeckung`**.

## R3 · The ConflictPanel footnote, twice

**Ort** [ConflictPanel.svelte:256](src/components/ConflictPanel.svelte:256)

Two problems in one paragraph. "Mit der Maus über eine Zeile fahren zeigt …" is
an English gerund-as-subject; German wants a `Wer …, der …` or a plain relative.
And "alle anderen nicht" is gapping that leaves the reader to reconstruct *sind
kein Hinweis* → *sind hart*.

**Jetzt**

> Mit der Maus über eine Zeile fahren zeigt die Lektion im Kalender. «+15′»
> verschiebt die spätere Lektion so, dass sie sich nicht mehr überschneidet; ob
> dort etwas anderes liegt, meldet die Liste danach. Raumkonflikte sind nur ein
> Hinweis, alle anderen nicht.

**Neu**

> Wer mit der Maus über eine Zeile fährt, sieht die Lektion im Kalender. «+15′»
> verschiebt die spätere Lektion so, dass sie sich nicht mehr überschneidet; ob
> dort etwas anderes liegt, meldet die Liste danach. Raumkonflikte sind weiche
> Konflikte und nur ein Hinweis, alle anderen sind hart.

## R4 · "3-mal fehlt einer Gruppe ein Thema noch ganz."

**Ort** [ReportPanel.svelte:202](src/components/ReportPanel.svelte:202)

`totalMissing` counts Gruppe×Thema pairs, so the unit is right, but *noch ganz*
reads as *quite* before it resolves to *entirely*, and the sentence is the only
one of the four that doesn't lead with its noun.

**Jetzt** `{totalMissing}-mal fehlt einer Gruppe ein Thema noch ganz.`

**Neu** `{totalMissing}-mal hat eine Gruppe ein Thema noch gar nicht.`

## R5 · The Gruppen paragraph carries three clauses

**Ort** [ConfigPanel.svelte:433](src/components/ConfigPanel.svelte:433)

The last sentence gaps a verb ("gemeinsame Themen wie die Übung nicht") and then
switches predicate mid-flight.

**Jetzt**

> … Gemeinsame Pausen und Programmpunkte (Mittagessen, Begrüssung,
> Schlussrapport) bekommt sie weiterhin — gemeinsame *Themen* wie die Übung
> nicht, und zur Abdeckung zählt sie nicht.

**Neu**

> … Gemeinsame Pausen und Programmpunkte (Mittagessen, Begrüssung,
> Schlussrapport) bekommt sie weiterhin, gemeinsame *Themen* wie die Übung
> nicht. Zur Abdeckung zählt sie nicht mehr.

## R6 · "— die Datei ist das Archiv" is the same aphorism as before

**Ort** [ConfigPanel.svelte:83](src/components/ConfigPanel.svelte:83)

`TEXT-PASS.md` S-series flagged "Es gibt keine Planbibliothek: die Datei ist das
Archiv" as an English aphoristic move. The colon became an em dash; the move
stayed. Say what the user should do instead.

**Jetzt** `… Die App verwaltet keine Plansammlung — die Datei ist das Archiv.`

**Neu** `… Die App verwaltet keine Plansammlung: Wer mehrere Pläne aufbewahren will, legt sie als Dateien ab.`

## R7 · «für wen» quotes a field label that doesn't exist

**Ort** [ProgrammpunktDialog.svelte:261](src/components/ProgrammpunktDialog.svelte:261)

The dialog's own field is labelled **`Für`**. The note quotes «für wen», which
is neither the label nor a term — and "kommen von dort" leaves the subject
floating.

**Jetzt** `Farbe, Ausbildner, Raum und «für wen» kommen von dort; ändern lassen sie sich unter Konfiguration › Themen.`

**Neu** `Farbe, Ausbildner, Raum und die Gruppenwahl übernimmt er von dort; ändern lassen sie sich unter Konfiguration › Themen.`

## R8 · "Aufheben" alone

**Ort** [App.svelte:494](src/App.svelte:494)

In the selection bar next to *Duplizieren* and *Löschen*, a bare **Aufheben**
reads as a third verb applied to the Lektionen (annul them? pick them up?). The
shortcut sheet names the action in full.

**Jetzt** `Aufheben`

**Neu** `Auswahl aufheben`

## R9 · "Ansicht" sits over Tastenkürzel

**Ort** [Toolbar.svelte](src/components/Toolbar.svelte), the `⋯` menu

Below 1360px the group is `Ansicht → Legende, Tastenkürzel`, which works. Above
it, `Legende` has its own toolbar button and the group collapses to
`Ansicht → Tastenkürzel` — a heading over one item that isn't a view setting.

**Neu** — move `Ansicht` inside the `{#if tight}` block with `Legende`, and give
the shortcut item its own heading **`Hilfe`**. Structural, but it is a
one-line-each edit and the current state is a mislabelled group at the most
common window width.

## R10 · "Enter öffnet die nächste Zeile"

**Ort** [GoalsEditor.svelte:125](src/components/config/GoalsEditor.svelte:125)

A row is created, not opened; *öffnen* is what the app does to dialogs and plans
everywhere else.

**Jetzt** `Enter öffnet die nächste Zeile · eine eingefügte Liste füllt mehrere Zeilen`

**Neu** `Enter legt die nächste Zeile an · eine eingefügte Liste füllt mehrere Zeilen`

---

## Glossary changes made in `SPECS.md`

- **#12 Kalender** — the on-screen grid *only*. The printed week is the
  **Arbeitsprogramm**.
- **#18/#20** — the right-hand panel is headed **Probleme**, not Konflikte;
  *Konflikt* survives as the kind of thing the cards and chips count.
- **#19 harter/weicher Konflikt** — weich covers Raum double-booking **and**
  Sperrzeit; the card icon says exactly those two words.
- **#22/#23** — the adjective is the eyebrow and the list tag; running text puts
  it after the name (`conflictNote`).
- **#29a Darstellung** — rewritten around *Arbeitsprogramm*; **#29b
  Arbeitsprogramm** is new, the one entry this pass adds.
- **#37 Belegung** — a Raum's *bookings*, never a Sperrzeit, with the
  counter-example that produced N4.
- **`excludeFromCoverage`** is the **Abdeckung** column; **`optional`** is
  **Zählt nicht zur Abdeckung**.
- Three new rules under the glossary: **A label is not a sentence** (the two
  shapes a conflict kind has, and why they must not be merged), **One glyph per
  idiom** (`›` / `→` / `—` / `–`), and the paper half of **One word per thing**
  (*gesetzt*, *gedruckt*, *dargestellt* — never *gezeichnet*).

One new entry, then. The other twenty-three were the existing vocabulary applied
where it wasn't.
