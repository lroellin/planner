# Text Pass — Sprache und Benennung

A pass over *what the app says*, not how it looks or how it works: every string a
user can read, checked against three questions.

1. Is it German at all?
2. Is it German a Swiss ZS-Kader would write, or German translated out of English?
3. Is the word the right name for the thing?

Reviewed against a populated week (17 Lektionen, 5 Themen, 2 Programmpunkte,
4 Gruppenführer, 3 Räume, 1 Abwesenheit, 1 Sperrzeit, 10 Probleme incl. one
orphan) and against a fresh empty plan. Every finding below is text that renders
on screen — nothing here is about code, comments or `SPECS.md`.

**68 findings.** **P1** = wrong, fix first. **P2** = reads badly. **P3** = polish.

> **Status: 67 of 68 implemented** (2026-09-03). **N1 adopted** — *Gruppenführer*
> is now **Ausbildner** everywhere (51 strings across 17 files plus the glossary;
> both nouns are masculine, so no agreement follow-up was needed). **N2 declined
> by the user** — the Thema-Art option keeps the label *Lektion*. One new export,
> `fullDateLabel()` in `timeUtils.ts`, backs G5. 98 tests, `npm run check` clean,
> build clean. The glossary in `SPECS.md` is updated to match: rows 2, 11, 21–25,
> 35, 40, 41, plus a new **One word per thing** note.

## The read

Three things stand out.

**The German is good where it was written and bad where it was left.** Whole
surfaces — Plan & Daten, the Konfiguration intros, the shortcut sheet, the
placement dialogs — read like a person wrote them. Then there is a button that
says `Split`, two list tags that say `blocked` and `shared`, and an undo entry
that says `reassigning Sanität`. Those aren't style problems, they're unfinished
work, and they're the first thing a user will see as sloppy.

**The register slips into English rhetoric under load.** Short strings are
excellent. The longer an explanation gets, the more it borrows English moves that
don't exist in German prose: the triple anaphora ("*der Weg* … *der Weg* … *der
Weg*"), the aphoristic colon ("Es gibt keine Planbibliothek: die Datei ist das
Archiv"), the em-dash simile ("— genau wie an zwei Orten gleichzeitig zu sein"),
the abstract-noun coinage ("nichts Ungezeichnetes"). That is the "reads AI" tell,
and it's concentrated in exactly six or seven paragraphs.

**Two words are carrying more than they can.** *Gruppenführer* names a rank that
leads a Gruppe, and the app uses it for anyone who teaches — so the config panel
has to say out loud that it isn't tied to a Gruppe. *Vorgabe* means a Thema's
defaults, the app's factory defaults, and (as *Soll*) the target, all at once.
Everything else in the glossary holds up; these two don't.

## Top six

| Ref | |
|---|---|
| **E2 E3 E4** | `Split`, `blocked`, `shared`, `reassigning …`, `re-rooming …` — English strings in shipped UI. |
| **N1** | *Gruppenführer* is a rank, not a teaching role. The panel has to disclaim it. |
| **G1** | "Einen öffnen, um **ihn** zurückzuholen" — die Lektion. The gender leftover `SPECS.md` warned about. |
| **K1 K2** | The conflict panel calls 10 things *Konflikte* when one is an orphan, and its chips count conflicts using resource nouns ("4 Räume" in a plan with 3). |
| **S1–S5** | Six paragraphs written in English rhetorical shapes. |
| **W1 W3** | The grid is *Kalender*, *Stundenplan* and *Wochenraster*; things are *gezeichnet* rather than *angezeigt*. |

---

## E · Nicht auf Deutsch

| # | P | Ist | Neu |
|---|---|---|---|
| **E1** | 2 | Wordmark: `WK`**`Planner`** (`Toolbar.svelte:266`). `<title>` says *Zivilschutz WK-Planer*, the import error says *kein WK-Planer-Plan*. The app's own name is spelled two ways, one of them English. | `WK`**`Planer`**. |
| **E2** | 1 | `EventPopover.svelte:238` — the split confirm button reads **`Split`**. The modal's identical action reads *Teilen*. | `Teilen` |
| **E3** | 1 | `ConfigPanel.svelte:564,567` — Raum list tags read **`blocked`** and **`shared`**. The legend already renders the same concept as *geteilt*. | `gesperrt`, `geteilt` |
| **E4** | 1 | `EventPopover.svelte:98,103` — undo labels ``reassigning ${name}`` and ``re-rooming ${name}``. These are user-visible in three places: the toast (*"Rückgängig: reassigning Sanität"*), the Rückgängig tooltip, and the *Rückgängig bis …* menu. | `${name}: Gruppenführer ändern`, `${name}: Raum ändern` |

## G · Grammatik

| # | P | Ist | Neu |
|---|---|---|---|
| **G1** | 1 | `ConflictPanel.svelte:180` — "Eine Lektion liegt ausserhalb jeder Phase. **Einen** öffnen, um **ihn** zurückzuholen." *Die* Lektion. Exactly the leftover `SPECS.md` predicts from the `das Raster` → `den Kalender` rename. | "**Eine** öffnen, um **sie** zurückzuholen." |
| **G2** | 1 | "**Zählt an die** Abdeckung jeder Gruppe." (`SubjectDetail.svelte:28`) and "**Zählt nicht an die** Abdeckung" (`ProgrammpunktDialog.svelte:177`). Wrong preposition, twice. | "Zählt **zur** Abdeckung …", "Zählt **nicht zur** Abdeckung …" |
| **G3** | 2 | `RoomDetail.svelte:87` — "Zwei Gruppen dürfen hier gleichzeitig gebucht sein, **ohne gemeldet zu werden**." The implicit subject is the Gruppen; what isn't reported is the clash. | "…, **ohne dass das gemeldet wird**." |
| **G4** | 2 | `GoalsEditor.svelte:125` — "eine Liste einfügen füllt mehrere **aufs Mal**". Bare infinitive as subject, plus a dialect adverbial. | "Eine eingefügte Liste füllt mehrere Zeilen." |
| **G5** | 1 | `ConfigPanel.svelte:254` — the import confirm prints the ISO date: "beginnt am **2026-09-07**". | "beginnt am **7.9.2026**" (`dayDateLabel` / a short date format). |
| **G6** | 3 | `store.svelte.ts:170` — "3 Schritte rückgängig, **zurück vor** «X»". | "3 Schritte rückgängig — **Stand vor** «X»" |
| **G7** | 3 | `SubjectDetail.svelte:79` vs `RoomDetail.svelte:79` — the same hint uses "wird **er** … abgeleitet" (der Kurzname) and "wird **es** … abgeleitet" (das Kürzel). Fixed automatically by **W2**. | one wording, one gender |

## W · Ein Ding, mehrere Wörter

| # | P | Ist | Neu |
|---|---|---|---|
| **W1** | 2 | The grid is called four things. *Kalender* (everywhere), *Stundenplan* (`ConfigPanel.svelte:62`, print hint), *Wochenraster* (`Toolbar.svelte:110`), *Raster* (implied). `SPECS.md` retired *Raster* for *Kalender*; the print menu kept it. | Print target label `Kalender`, hint "Die ganze Woche, wie angezeigt". Intro: "Gruppen sind die Spalten des **Kalenders**." |
| **W2** | 2 | The same field is *Kürzel* on Gruppenführer and Raum, **Kurzname** on Thema (`SubjectDetail.svelte:221`). `SPECS.md` #35 fixes the term as *Kürzel*. | `Kürzel` everywhere, with the Raum hint's wording. |
| **W3** | 2 | Five strings say things are **gezeichnet**: "werden nur nicht mehr gezeichnet", "wird als eigener Kalender gezeichnet", "Lektionen werden dann nicht mehr gezeichnet", "Wird als Pause gezeichnet", "nichts Ungezeichnetes". *Zeichnen* is a rendering term; a German reader hears *drawing*. | **angezeigt** / **dargestellt** throughout. |
| **W4** | 3 | Gruppenführerpläne: the summary says "1× **abgegeben**", the row says "**übernommen von** Corina Frei". One fact, two verbs, one line apart. | Row: "**abgegeben an** Corina Frei". |
| **W5** | 2 | Availability editor headings are adjectives: **Abwesend**, **Gesperrt**. The undo labels for the very same edits already say *Abwesenheiten von X bearbeiten* / *Sperrzeiten von X bearbeiten*, and `SPECS.md` #22/#23 lists both nouns. | Headings **Abwesenheiten** / **Sperrzeiten**. `CONFLICT_KIND_LABELS` keeps *Abwesend*/*Gesperrt* — there they describe one booking, which is right. |
| **W6** | 2 | **Vorgabe** carries three senses: a Thema's defaults (*Themenvorgabe*, tag *Vorgabe*), the app's factory state ("beginnt wieder mit den **Vorgaben**", "setzt auf die **Vorgaben** zurück"), and — as its ordinary German meaning — the target, which the app calls *Soll*. | Keep sense 1. Rename sense 2: "beginnt wieder mit einem **leeren Plan**" / "setzt **alles zurück**". |
| **W7** | 3 | *Gruppenrotation* (`ConfigPanel.svelte:67`) and *Kadervorkurs* (same line) and *Kaderlektion* (`SubjectDetail.svelte:366`) each appear exactly once and nowhere else. The UI otherwise says *Phase*, *KVK*, *Kader*. | Use the established words: "Die KVK-Phase braucht nur eine Gruppe, die WK-Phase alle." |
| **W8** | 3 | "**in Gebrauch**" (Raum, duration stat) next to "Belegungen" (count stat). Two vocabularies for one section. | "**belegt**" |

## K · Konflikt, Problem, Abdeckung

| # | P | Ist | Neu |
|---|---|---|---|
| **K1** | 1 | The panel header prints `issueCount` (Konflikte **+** orphans) with the word *Konflikte*: "**10 Konflikte** · 9 Lektionen betroffen" when 9 are conflicts and 1 is an orphan. The toolbar, for the same number, says *10 Probleme*. `SPECS.md` #20 makes *Problem* the deliberately wider word. | "**10 Probleme** · 9 Lektionen betroffen", or split the sentence: "9 Konflikte, 1 Lektion auf keinem Kalender." |
| **K2** | 1 | The summary chips are counts of *conflicts* labelled with the *resource* noun: "2 Gruppenführer · 2 Gruppen · **4 Räume** · 1 abwesend" in a plan with **three** rooms. And *abwesend* is an adjective in a list of nouns. | `4× Raum`, `2× Gruppenführer`, `2× Gruppe`, `1× Abwesenheit`. |
| **K3** | 3 | Badge reads `10 Probleme` but `keine Probleme` — lowercase in the same slot. | `Keine Probleme` |
| **K4** | 2 | Badge tooltip: "Keine Konflikte, **nichts Ungezeichnetes** — Liste öffnen". A nominalised coinage no one says. | "Keine Konflikte, alles liegt in einer Phase — Liste öffnen" |
| **K5** | 2 | `ConflictPanel.svelte:202` — "Keine Gruppe, kein Gruppenführer und kein Raum ist doppelt **belegt**." Rooms are *belegt*; people and groups are *eingeteilt*. | "Niemand und nichts ist doppelt **eingeteilt**." |
| **K6** | 2 | `ReportPanel.svelte:188` — "5 **Kombinationen aus Gruppe und Thema** noch ungeplant." Set-theory phrasing for "a group is missing a subject". | "**5-mal fehlt einer Gruppe ein Thema noch ganz.**" |
| **K7** | 3 | Status words across coverage pill and sidebar chip mix registers: `1 fehlt` (verb), `Zeit fehlt` (clause), `zu viel` (adverb), `ungleich` (adjective). | A parallel set: `fehlt 1×` · `zu kurz` · `zu lang` · `ungleich`. Shorter, and *zu kurz/zu lang* are opposites the way the states are. |

## N · Naming — die Begriffe selbst

| # | P | Finding | Vorschlag |
|---|---|---|---|
| **N1** | 1 | **Gruppenführer.** In the Zivilschutz a Gruppenführer *is* the Gf of a Gruppe — that's the rank. The app uses the word for whoever teaches a Thema, and has to disclaim it in `SPECS.md` ("Not tied to a particular Gruppe") and, effectively, in the UI. It's also the longest noun in the app: *Gruppenführerpläne* (18), *Name des Gruppenführers*, *Gruppenführer-, Gruppen- und Abwesenheitskonflikte*, *Abwesenheiten von X bearbeiten*. | **Ausbildner** — the standard Swiss word for someone who instructs, no rank attached, 10 characters. *Ausbildnerpläne* (15), *Name des Ausbildners*, filter optgroup fits. This is your domain call, but the disclaimer is the tell that the current word is wrong. |
| **N2** | 1 | **"Lektion" as a Thema-Art.** In the Thema editor, *Art → Zählt als* offers **Lektion** / Programmpunkt / Pause. But you are editing a **Thema**, and *Lektion* is defined as the placed occurrence of one. The one screen where both words appear is the one that conflates them. | Options **Thema** / Programmpunkt / Pause. Field label *Art* alone (drop *Zählt als*, which the sub-lines already explain). |
| **N3** | 2 | **"Auf keinem Kalender."** There are several `Kalender` because each Phase is its own FullCalendar — an implementation fact. A user sees one calendar and reads the card as a bug. Also in *"die Lektion würde auf keinem Kalender erscheinen"* (`EventModal` ×2, `ProgrammpunktDialog`). | Card title **"Ausserhalb der Phasen"**; warnings "…liegt dann **ausserhalb jeder Phase** und wird nicht angezeigt." |
| **N4** | 2 | **Gefahrenzone.** A calque of GitHub's *Danger Zone*. In German a Gefahrenzone is a physical hazard area — a cordon, an avalanche slope. | **Zurücksetzen** as the heading; the red card and the sentence below already carry the warning. |
| **N5** | 3 | **Werkzeuge / Weitere Werkzeuge** for a menu holding Legende, Tastenkürzel and Zeilenhöhe. None of those is a tool. | **Mehr** (button) / **Ansicht** (section title). |
| **N6** | 2 | **Programmpunkt** is the right word and the wrong length for a list tag. At 13 characters it pushes the name out: *Schlussrapp… `Programmpunkt`* in the Themen list. | Keep the word for headings and the picker; tag reads **Punkt**, or use the same icon the card uses. |
| **N7** | 3 | **Einrichtung / Inhalt** as a Thema's two sub-tabs. *Einrichtung* means installation, or a facility — not "how this is scheduled". | **Planung** / **Inhalt**. |
| **N8** | 3 | **Abdeckung** is a calque of *coverage*, and the tell is that the report title has to gloss it: *"Abdeckung — jede Gruppe muss jedes Thema besuchen"*. No German word is clearly better, so my recommendation is to **keep it and stop explaining it**: after `K6` and the `Soll` column, the table says what it means. | Tab title just **Abdeckung**; drop the gloss from `TITLES.coverage`. |
| **N9** | 3 | **"vor einer Gruppe"** as the label under a Gruppenführer's booked minutes. Cryptic on its own. | **Unterricht** (the reports already use "4 h 30 min Unterricht"). |
| **N10** | 3 | **"Vorgaben für neue Platzierungen"** (31 chars) as a section title above three fields. | **Vorgaben**. The three field labels say what they are. |
| **N11** | 2 | `SubjectDetail.svelte:367` quotes an option that doesn't exist: "Bei **«ableiten»** wird die Phase aus den Platzierungen gelesen" — the option reads *Aus Platzierungen ableiten*. | Quote the actual label, or shorten the option to **«ableiten»**. |

## S · Klingt übersetzt

The six paragraphs that carry the "AI wrote this" signal, plus the smaller ones.

| # | P | Ist | Neu |
|---|---|---|---|
| **S1** | 2 | "Ein Plan, in diesem Browser gespeichert. Eine Datei ist **der Weg hinaus und zurück**." | "Der Plan liegt in diesem Browser. Wer ihn sichern oder weitergeben will, exportiert ihn als Datei." |
| **S2** | 2 | "Alles liegt im localStorage dieses Browsers — Website-Daten löschen löscht den Plan. Der Export schreibt den ganzen Plan in eine JSON-Datei; ein Import ersetzt, **was hier ist**. **Es gibt keine Planbibliothek: die Datei ist das Archiv.**" Three English moves in a row: the appositive dash, "what's here", the aphoristic colon. | "Alles liegt im localStorage dieses Browsers: Wer die Website-Daten löscht, löscht den Plan. Der Export schreibt den ganzen Plan in eine JSON-Datei, ein Import überschreibt den aktuellen. Die App verwaltet keine Plansammlung — die Datei ist das Archiv." |
| **S3** | 2 | "Eine Datei ist die Sicherung, **der Weg** auf einen anderen Rechner und **der Weg** zu jemand anderem." Anaphora that works in English and reads padded in German. | "Mit einer Datei sichert man den Plan, nimmt ihn auf einen anderen Rechner mit oder gibt ihn weiter." |
| **S4** | 2 | Empty state: "Themen sind, was auf den Kalender gezogen wird — **ein WK braucht zuerst seine eigenen**." A WK doesn't need anything; and "seine eigenen" has no clear referent. | "Themen sind das, was auf den Kalender gezogen wird. Für diesen WK ist noch keines erfasst." |
| **S5** | 2 | Conflict footnote: "Auf eine Zeile **zeigen**, um sie im Kalender zu finden; «+15′» schiebt die spätere Lektion **aus dieser Überschneidung heraus** — **was danach dort liegt, meldet der Kalender neu.**" The last clause is close to unparseable, and *zeigen auf* collides with the *Im Kalender zeigen* tooltip one line above. | "Mit der Maus über eine Zeile fahren zeigt die Lektion im Kalender. «+15′» verschiebt die spätere Lektion so, dass sie sich nicht mehr überschneidet; ob dort etwas anderes liegt, meldet die Liste danach. Raumkonflikte sind nur ein Hinweis, alle anderen nicht." |
| **S6** | 2 | Nudge tooltip: "Auf 09:15 verschieben — **aus dieser Überschneidung heraus**." | "Auf 09:15 verschieben — dann überschneidet sie sich nicht mehr." |
| **S7** | 2 | Coverage footnote: "wie viel **Zeit diese Gruppe von diesem Thema** … hat". *Zeit von einem Thema haben* isn't German. | "Jede Zelle zeigt, wie viel von diesem Thema die Gruppe in ihrer Phase schon hat, darunter die Zahl der Lektionen." |
| **S8** | 2 | Dauer hint: "Jede Gruppe braucht **diese Zeit von diesem Thema**". Same construction. | "Jede Gruppe braucht so lange für dieses Thema — am Stück oder aufgeteilt, z. B. 1 h 30 min + 1 h für 2 h 30 min." |
| **S9** | 2 | "**Es** folgt weiterhin der Phase: eine später hinzugefügte oder eingeschaltete Gruppe ist automatisch dabei." *Es* has no antecedent in the sentence or the label above it. | "**Die Platzierung** folgt der Phase: Eine später hinzugefügte oder eingeschaltete Gruppe ist automatisch dabei." |
| **S10** | 3 | "Die Abdeckung wird pro Phase **gemessen** — eine Kaderlektion darf nicht an den Gruppen **gemessen** werden." Repeated verb, plus a one-off noun (see W7). | "Die Abdeckung wird pro Phase gerechnet: Ein Thema, das nur das Kader hat, darf nicht an den Gruppen gemessen werden." |
| **S11** | 2 | "Eine Lektion während einer Abwesenheit ist ein harter Konflikt — **genau wie an zwei Orten gleichzeitig zu sein**." The em-dash simile is an English essay move. | "Eine Lektion in einer Abwesenheit ist ein harter Konflikt, wie eine Doppelbuchung." |
| **S12** | 3 | "Die ganze Woche da. Unten einen Tag hinzufügen, **wenn das nicht stimmt**." (and the Raum twin, "Die ganze Woche frei.") Chatty; also the fragment has no verb. | "Die ganze Woche anwesend. Fehlt jemand an einem Tag, unten hinzufügen." / "Die ganze Woche verfügbar. Ist der Raum an einem Tag belegt, unten hinzufügen." |
| **S13** | 2 | "Zu kurz zum Teilen — **beide Hälften brauchen ein Feld**." *Feld* as "slot" is never defined; the reader has to reverse-engineer 15 minutes. | "Zu kurz zum Teilen — jede Hälfte braucht mindestens 15 Minuten." |
| **S14** | 3 | "Alle anderen Gruppen haben **das** zu dieser Zeit bereits." Pronoun with no antecedent. | "Alle anderen Gruppen haben diese Lektion zu dieser Zeit schon." |
| **S15** | 2 | Copy confirm reads "**Auf 3 kopieren**" — a bare number where a noun belongs. | "Auf 3 Gruppen kopieren" / "Auf 1 Gruppe kopieren". |
| **S16** | 2 | Export hint: "**nie gesichert**" / "**vor 3 T. gesichert**". Telegraphic, and *T.* is not a German abbreviation for *Tage*. | "noch nie gesichert" / "zuletzt vor 3 Tagen gesichert". |
| **S17** | 2 | Import confirm: "**Zuerst** den aktuellen Plan exportieren, **wenn** er behalten werden soll." The condition arrives after the instruction. | "Der Plan in diesem Browser wird ersetzt und der Verlauf gelöscht. Wer den aktuellen Plan behalten will, exportiert ihn vorher." |
| **S18** | 3 | Version mismatch dialog: "Abbrechen versucht die alten Daten trotzdem zu laden (**kann instabil sein**)." | "(die App verhält sich dann möglicherweise falsch)" |
| **S19** | 3 | Programmpunkt hint: "…: ein Programmpunkt findet statt, er wird nicht von jeder Gruppe **geschuldet**." *Owed* is an English metaphor for a schedule. | "Zählt nicht zur Abdeckung: Ein Programmpunkt findet **einmal** statt, nicht einmal pro Gruppe." |
| **S20** | 3 | Duplicate-name hint: "…wird noch einmal platziert, **statt ein zweites Mal angelegt**." | "…wird noch einmal platziert, **nicht** ein zweites Mal angelegt." |
| **S21** | 3 | Delete toasts: "«Karteneröffnung» gelöscht — **mit 12 Lektionen**" reads as if the Lektionen survived. And "Raum gelöscht — 3 Lektionen ohne Raum". | "— 12 Lektionen mitgelöscht" / "— 3 Lektionen sind jetzt ohne Raum". |
| **S22** | 2 | Undo labels read "Sanität **in der Dauer ändern**" (`App.svelte:199`, `Calendar.svelte:189`, `EventPopover.svelte:111`). | "**Dauer von** Sanität **ändern**" |
| **S23** | 2 | Filter tooltip still contains its own placeholder: "Nur Lektionen zeigen, die **…** betreffen". | "Nur Lektionen eines Gruppenführers, Raums oder einer Gruppe zeigen" |
| **S24** | 3 | Two phrasings of the same instruction one field apart: hint "Eines pro Zeile — was die Gruppe am Ende der Lektion können soll", placeholder "Was die Gruppe danach kann". | Hint "Ein Lernziel pro Zeile." Keep the placeholder. |
| **S25** | 3 | Raum usage: "**Vorgegebener Raum für** Sanität, ABC-Schutz" / "**Vorgegebener Gruppenführer für** …". Participle as a heading. | "**Als Vorgabe hinterlegt bei:**" (same line for both panes). |
| **S26** | 2 | Räume intro: "Bei geteilten Flächen wie «draussen», wo zwei Gruppen problemlos am selben Ort sein können, die Konfliktprüfung ausschalten." A 12-word relative clause between subject and verb — a garden path. | "Bei geteilten Flächen wie «draussen» die Konfliktprüfung ausschalten: Dort stören sich zwei Gruppen nicht." |
| **S27** | 3 | Groups note: "Eine ausgeschaltete Gruppe behält ihre Lektionen; **sie** werden nur nicht mehr gezeichnet…". *Sie* could be the Gruppe or the Lektionen. | "Eine ausgeschaltete Gruppe behält ihre Lektionen. Sie werden nur nicht mehr angezeigt und lösen keine Konflikte mehr aus." (short sentence resolves it, and W3 fixes *gezeichnet*) |
| **S28** | 3 | Toolbar tooltip "Umbenennen unter Konfiguration → Plan & Daten" is the only place the app uses `→` as a path separator. Fine, but the same idea is written out as prose everywhere else. | Keep — flagged only so it stays deliberate. |

## L · Länge

| # | P | Finding | Fix |
|---|---|---|---|
| **L1** | 2 | *Gruppenführerpläne* (18) is the widest tab in Auswertungen and the widest item in the print menu; *Name des Gruppenführers* is the longest placeholder in the app. | Falls out of **N1**. If N1 is rejected, the tab can read **Gf-Pläne** — but note `SPECS.md` #35 deliberately avoided *Gf-* prefixes. |
| **L2** | 2 | The *Programmpunkt* tag truncates the name it labels (**N6**). | Tag reads *Punkt*. |
| **L3** | 3 | *Vorgaben für neue Platzierungen* (**N10**), *Aus Platzierungen ableiten* (**N11**), *Zurück zur Themenvorgabe* (tooltip, 3×) all sit above or beside short controls. | Shorten the first two; *Zurück zur Themenvorgabe* is fine — it earns its length. |

## Bleibt

Worth naming so it doesn't get "improved":

- The **infinitive-imperative register** ("Unten einen Namen eingeben, um …", "Ein Thema zum Bearbeiten wählen", "Mindestens einen Tag wählen"). Terse, Swiss, consistent, correct. Only `S26` breaks under its own clause length.
- **ss throughout, no ß** — checked, zero occurrences. Correct for de-CH.
- *Thema · Lektion · Platzierung · Phase · Soll · Kürzel · Pensum · Belegung · Stellvertretung* — precise, short, and used consistently once the exceptions above are fixed.
- "Jedes Datum rastet auf seinen Montag ein." — the best sentence in the app.
- Plan & Daten's structure, the shortcut sheet, the placement dialogs, `Erstes Thema anlegen` (identical in all four places it appears).

## Notes on scope

- Every string cited renders on screen. Code comments, `SPECS.md` and the design
  passes were read for context and are not reviewed here.
- **N1** (Gruppenführer → Ausbildner) touches ~40 strings and the glossary. It is
  the one finding here that is a decision rather than a fix; everything else can
  land independently of it.
