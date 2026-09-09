<script lang="ts">
  import { untrack } from 'svelte';
  import {
    getState, markExported,
    addGroup, updateGroup, removeGroup, moveGroupUp, moveGroupDown, moveGroupToIndex,
    eventCountForGroup,
    addPhase, updatePhase, removePhase, eventCountForPhase,
    addTeacher, addRoom,
    setPlanName, setWkStartDate, setGridWindow, replacePlan, resetToDefaults, loadSampleData,
  } from '../state/store.svelte';
  import { serializePlan, planFileName, parsePlan, isPristineState } from '../state/persistence';
  import { setupSteps, setupComplete, type SetupStepKey } from '../state/setup';
  import { generateDistinctColor, generateInitials, getContrastColor } from '../utils/colorUtils';
  import { collidingSubjectShorts, teacherShort } from '../utils/format';
  import {
    DAY_NAMES, dayDateLabel, formatDate, fullDateLabel, gridWindow, orderedPhases, phaseForDay,
    sortSubjects,
  } from '../utils/timeUtils';
  import { describeWindow } from '../utils/availability';
  import AddRow from './config/AddRow.svelte';
  import TimeField from './TimeField.svelte';
  import MasterDetail from './config/MasterDetail.svelte';
  import TeacherDetail from './config/TeacherDetail.svelte';
  import RoomDetail from './config/RoomDetail.svelte';
  import SubjectDetail from './config/SubjectDetail.svelte';
  import Icon from './Icon.svelte';
  import type { ConfigTab } from '../state/ui.svelte';
  import type { ID } from '../types';

  interface Props {
    onclose: () => void;
    /** Which tab to open on — the empty state sends a new user straight to Themen. */
    initialTab?: ConfigTab | null;
    /** Open with a blank Thema draft, so the first one is one field away. */
    createSubject?: boolean;
  }
  let { onclose, initialTab = null, createSubject = false }: Props = $props();

  type Tab = 'setup' | 'groups' | 'phases' | 'teachers' | 'rooms' | 'subjects' | 'data';
  const TABS: { key: Tab; label: string }[] = [
    { key: 'setup', label: 'Einrichtung' },
    { key: 'groups', label: 'Gruppen' },
    { key: 'phases', label: 'Phasen' },
    { key: 'teachers', label: 'Ausbildner' },
    { key: 'rooms', label: 'Räume' },
    { key: 'subjects', label: 'Themen' },
    { key: 'data', label: 'Plan & Daten' },
  ];
  // `ConfigTab` is the cross-component name; 'plan' is this component's 'data'.
  const TAB_FOR_REQUEST: Record<ConfigTab, Tab> = {
    setup: 'setup', groups: 'groups', phases: 'phases', teachers: 'teachers',
    rooms: 'rooms', subjects: 'subjects', plan: 'data',
  };
  // `untrack`: these props seed the panel and are never read again — the dialog
  // is mounted fresh per open, so a later change would have nothing to update.
  //
  // With nothing pre-selected the panel used to open on Gruppen — the one tab a
  // fresh plan has already filled in, so the first screen of the setup showed
  // work that was done and said nothing about the three lists that were empty.
  // Einrichtung while anything is still open; Gruppen once it is not.
  let activeTab: Tab = $state(
    untrack(() => (
      initialTab ? TAB_FOR_REQUEST[initialTab] : setupComplete(getState()) ? 'groups' : 'setup'
    )),
  );

  const appState = $derived(getState());
  const sortedGroups = $derived([...appState.groups].sort((a, b) => a.order - b.order));
  const phases = $derived(orderedPhases(appState));

  /**
   * The WK week. It used to be a permanent three-button nav in the toolbar —
   * ‹ 14.9.–18.9. › — about 185px, next to a grid whose own column headers
   * already print "Mo. 14.9." across the top. It is set once per WK, so it
   * belongs with the other once-per-WK settings, and the grid keeps saying
   * which week you are in.
   */
  const weekLabel = $derived(
    `${dayDateLabel(appState.wkStartDate, 0)} – ${dayDateLabel(appState.wkStartDate, 4)}`,
  );

  function shiftWeek(delta: number): void {
    // Parsed as a local date: a UTC parse shifts the day west of Greenwich.
    const [y, m, day] = appState.wkStartDate.split('-').map(Number);
    const d = new Date(y!, m! - 1, day!);
    d.setDate(d.getDate() + delta * 7);
    setWkStartDate(formatDate(d));
  }

  // One line, not a paragraph: the full explanation lives behind the ⓘ so it
  // isn't re-read on every visit to the tab.
  const TAB_INTRO: Record<Tab, { short: string; long: string }> = {
    setup: {
      short: 'Was dieser Plan braucht, bevor geplant werden kann.',
      long: 'Gruppen und Phasen sind bei einem neuen Plan schon gesetzt und passen meistens. Ausbildner und Räume kommen vor den Themen: Ein Thema hält seine Vorgaben — Ausbildner, Raum, Dauer — und wählt sie aus diesen beiden Listen. Danach werden die Themen aus der Seitenleiste auf den Kalender gezogen. Alles hier bleibt die ganze Woche änderbar.',
    },
    groups: {
      short: 'Gruppen sind die Spalten des Kalenders.',
      long: 'Jede Gruppe muss jedes Thema besuchen. Inaktive Gruppen behalten ihre Daten, werden aber im Kalender ausgeblendet und von der Konfliktprüfung übersprungen.',
    },
    phases: {
      short: 'Phasen teilen die Woche in Abschnitte mit eigenen Gruppen.',
      long: 'Die KVK-Phase braucht nur eine Gruppe, die WK-Phase alle. Jede Phase wird als eigener Kalender angezeigt, damit schmale Phasen keinen Platz verschwenden.',
    },
    teachers: {
      short: 'Derselbe Ausbildner kann nicht zweimal gleichzeitig eingeteilt sein.',
      long: 'Konflikte bei Ausbildnern sind harte Konflikte. Kürzel und Farbe sind das, was auf den Karten im Kalender erscheint.',
    },
    rooms: {
      short: 'Räume werden auf weiche Konflikte geprüft.',
      long: 'Bei geteilten Flächen wie «draussen» «Konflikte ignorieren» einschalten: Dort stören sich zwei Gruppen nicht.',
    },
    subjects: {
      short: 'Themen werden auf den Kalender gezogen und dort zu Lektionen.',
      long: 'Ihre Vorgaben — Ausbildner, Raum, Dauer — werden auf jede platzierte Lektion kopiert, wo sie einzeln überschrieben werden können. Auch Inhalt (Lernziele, Notizen) liegt am Thema. Die Dauer ist zugleich das Soll pro Gruppe.',
    },
    data: {
      short: 'Name und Woche des WK — und die Datei, mit der man den Plan sichert.',
      long: 'Planname und WK-Woche werden einmal pro WK gesetzt und stehen darum hier statt in der Werkzeugleiste. Alles liegt im localStorage dieses Browsers: Wer die Website-Daten löscht, löscht den Plan. Der Export schreibt den ganzen Plan in eine JSON-Datei, ein Import überschreibt den aktuellen. Die App verwaltet keine Plansammlung: Wer mehrere Pläne aufbewahren will, legt sie als Dateien ab.',
    },
  };

  let introOpen = $state(false);

  // ─── Einrichtung ──────────────────────────────────────────────────────────
  // The tab is one row per step of `setupSteps`, in the order the steps are
  // done. An open row says why the thing matters; a done row says what is
  // there, so the tab keeps earning its place once the setup is over — it is
  // then the one screen that answers "what is in this plan".

  const SETUP_COPY: Record<SetupStepKey, { label: string; why: string; cta: string; tab: Tab }> = {
    groups: {
      label: 'Gruppen',
      why: 'Die Spalten des Kalenders. Jede Gruppe besucht jedes Thema.',
      cta: 'bearbeiten',
      tab: 'groups',
    },
    phases: {
      label: 'Phasen',
      why: 'Teilen die Woche in Abschnitte mit eigenen Gruppen.',
      cta: 'bearbeiten',
      tab: 'phases',
    },
    teachers: {
      label: 'Ausbildner',
      why: 'Ohne sie prüft nichts auf Konflikte — doppelt eingeteilt fällt dann niemandem auf.',
      cta: 'anlegen',
      tab: 'teachers',
    },
    rooms: {
      label: 'Räume',
      why: 'Geben weiche Konflikte. Geteilte Flächen wie «draussen» werden ausgenommen.',
      cta: 'anlegen',
      tab: 'rooms',
    },
    subjects: {
      label: 'Themen',
      why: 'Das, was auf den Kalender gezogen wird. Holt seine Vorgaben aus den beiden Listen darüber.',
      cta: 'anlegen',
      tab: 'subjects',
    },
  };

  /** A handful of names, so a done row says what is in the list. */
  function nameSummary(names: string[]): string {
    const shown = names.slice(0, 3).join(', ');
    return names.length > 3 ? `${shown} und ${names.length - 3} weitere` : shown;
  }

  const setupRows = $derived.by(() =>
    setupSteps(appState).map((step) => {
      const copy = SETUP_COPY[step.key];
      let note = copy.why;
      let warn = false;
      if (step.key === 'phases' && phaseWarning) {
        note = phaseWarning;
        warn = true;
      } else if (step.done) {
        if (step.key === 'groups') {
          note = sortedGroups.filter(g => g.enabled).map(g => g.label).join(', ');
        } else if (step.key === 'phases') {
          note = phases
            .map(ph => `${ph.label} ${DAY_NAMES[ph.startDay]}–${DAY_NAMES[ph.endDay]}`)
            .join(' · ');
        } else if (step.key === 'teachers') {
          note = nameSummary(appState.teachers.map(t => t.name));
        } else if (step.key === 'rooms') {
          note = nameSummary(appState.rooms.map(r => r.name));
        } else {
          const lessons = appState.subjects.filter(x => x.kind === 'lesson').length;
          const oneoffs = appState.subjects.filter(x => x.kind === 'oneoff').length;
          const pauses = appState.subjects.filter(x => x.kind === 'break').length;
          note = [
            `${lessons} ${lessons === 1 ? 'Thema' : 'Themen'}`,
            ...(oneoffs > 0 ? [`${oneoffs} ${oneoffs === 1 ? 'Programmpunkt' : 'Programmpunkte'}`] : []),
            ...(pauses > 0 ? [`${pauses} ${pauses === 1 ? 'Pause' : 'Pausen'}`] : []),
          ].join(' · ');
        }
      }
      // A done row is no longer an invitation to create something — it is the
      // list as it stands, and the way in is to change it.
      return { ...step, ...copy, note, warn, cta: step.done ? 'bearbeiten' : copy.cta };
    }),
  );

  const setupOpenCount = $derived(setupRows.filter(r => !r.done).length);

  /** Jump to the tab a row names — the dialog is already open, so no request. */
  function goToTab(tab: Tab, opts: { createSubject?: boolean } = {}): void {
    activeTab = tab;
    introOpen = false;
    if (opts.createSubject) {
      selectedSubjectId = null;
      addingSubject = true;
    }
  }

  /** What each tab holds, so the strip says where the gaps are. */
  const tabCounts = $derived<Partial<Record<Tab, number>>>({
    groups: appState.groups.filter(g => g.enabled).length,
    phases: appState.phases.length,
    teachers: appState.teachers.length,
    rooms: appState.rooms.length,
    subjects: appState.subjects.filter(x => x.kind !== 'break').length,
  });

  // ─── Master-detail selection ──────────────────────────────────────────────
  let selectedTeacherId: ID | null = $state(getState().teachers[0]?.id ?? null);
  let selectedRoomId: ID | null = $state(getState().rooms[0]?.id ?? null);
  let selectedSubjectId: ID | null = $state(
    untrack(() => (createSubject ? null : getState().subjects[0]?.id ?? null)),
  );
  let addingSubject = $state(untrack(() => createSubject));

  const selectedTeacher = $derived(appState.teachers.find(t => t.id === selectedTeacherId) ?? null);
  const selectedRoom    = $derived(appState.rooms.find(r => r.id === selectedRoomId) ?? null);
  const selectedSubject = $derived(appState.subjects.find(s => s.id === selectedSubjectId) ?? null);

  // Alphabetical everywhere, the three kinds kept apart: the stored order is
  // insertion order, which stops being findable at about a dozen subjects.
  /** K3: ← → / Home / End move between the config tabs. */
  function onTabKey(e: KeyboardEvent): void {
    const keys = TABS.map(t => t.key);
    const i = keys.indexOf(activeTab);
    let next: Tab | undefined;
    if (e.key === 'ArrowRight') next = keys[(i + 1) % keys.length];
    else if (e.key === 'ArrowLeft') next = keys[(i - 1 + keys.length) % keys.length];
    else if (e.key === 'Home') next = keys[0];
    else if (e.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    activeTab = next;
    introOpen = false;
    const id = `cfg-tab-${next}`;
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  /** Themen whose card label cannot be told from another's — see `format.ts`. */
  const shortNameClashes = $derived(collidingSubjectShorts(appState.subjects));

  /** What the grid actually draws right now — derived, explicit, or a mix. */
  const derivedGrid = $derived(gridWindow(appState));

  const listedSubjects = $derived([
    ...sortSubjects(appState.subjects.filter(s => s.kind === 'lesson')),
    ...sortSubjects(appState.subjects.filter(s => s.kind === 'oneoff')),
    ...sortSubjects(appState.subjects.filter(s => s.kind === 'break')),
  ]);

  // A fresh entity opens on a colour that is far from the ones already in use.
  const nextTeacherColor = $derived(generateDistinctColor(appState.teachers.map(t => t.color)));
  const nextRoomColor    = $derived(generateDistinctColor(appState.rooms.map(r => r.color)));
  const nextSubjectColor = $derived(generateDistinctColor(appState.subjects.map(s => s.color)));

  /** After a delete, land on the entity that slid into the removed one's place. */
  function neighbourId(list: { id: ID }[], index: number): ID | null {
    return list[index]?.id ?? list.at(-1)?.id ?? null;
  }

  // Quick add: a name and Enter. The short name is derived and the colour is
  // picked to sit far from the ones in use — both editable in the pane that
  // opens right after, which is where they belong anyway.
  function quickAddTeacher(name: string): void {
    selectedTeacherId = addTeacher(name, generateInitials(name), nextTeacherColor);
  }

  function quickAddRoom(name: string): void {
    selectedRoomId = addRoom(name, nextRoomColor, false);
  }

  // ─── Groups ───────────────────────────────────────────────────────────────
  function nextGroupLabel(): string {
    let i = 1;
    while (appState.groups.some(g => g.label === `G${i}`)) i++;
    return `G${i}`;
  }
  // No confirm. The deletion is one `setState` with a label, so Ctrl+Z and the
  // toast's own "Rückgängig" both take it back — an OS dialog was interrupting
  // for something a keystroke reverses, and it could not say the count as
  // anything but a sentence. `removeGroup` names the count in the toast.

  // Drag to reorder: the rows *are* the columns of the timetable, so dragging
  // them is the gesture that matches. The ▲▼ buttons stay for the keyboard.
  let dragId: ID | null = $state(null);

  function onDrop(targetId: ID): void {
    const dragged = dragId;
    const to = sortedGroups.findIndex(g => g.id === targetId);
    dragId = null;
    if (dragged === null || to < 0) return;
    moveGroupToIndex(dragged, to);
  }

  // ─── Phases ───────────────────────────────────────────────────────────────
  /** A new phase takes the days after the last one, through Friday. */
  function submitPhase(label: string): void {
    const lastDay = appState.phases.reduce((m, p) => Math.max(m, p.endDay), -1);
    const start = Math.min(lastDay + 1, DAY_NAMES.length - 1);
    addPhase(label, start, DAY_NAMES.length - 1, appState.groups.filter(g => g.enabled).map(g => g.id));
  }

  // Moving one end past the other drags the other end along, so a phase can
  // never end before it starts.
  function setPhaseStart(id: ID, startDay: number, endDay: number): void {
    updatePhase(id, startDay > endDay ? { startDay, endDay: startDay } : { startDay });
  }

  function setPhaseEnd(id: ID, endDay: number, startDay: number): void {
    updatePhase(id, endDay < startDay ? { endDay, startDay: endDay } : { endDay });
  }

  // Same again: removing a phase leaves its Lektionen on no calendar, which the
  // toast says, and Rückgängig puts back.

  /** Colour a phase gets in the week strip — position, not identity. */
  /**
   * G4: neutral steps, not the UI accent pair. The strip used to paint KVK in
   * --color-primary and WK in --color-accent — the two hues app.css explicitly
   * reserves for "this is a control", spent on what is plainly data. A phase is
   * a stretch of week, not a button; until Phase carries a colour field of its
   * own, it is drawn as ink at four strengths.
   */
  const PHASE_HUES = [
    'color-mix(in oklab, var(--color-base-content) 62%, transparent)',
    'color-mix(in oklab, var(--color-base-content) 40%, transparent)',
    'color-mix(in oklab, var(--color-base-content) 26%, transparent)',
    'color-mix(in oklab, var(--color-base-content) 16%, transparent)',
  ];

  // Phases are drawn independently, so a bad day range silently hides events
  // rather than erroring — surface the common mistakes instead.
  const phaseWarning = $derived.by(() => {
    const problems: string[] = [];
    if (appState.phases.some(p => p.endDay < p.startDay)) {
      problems.push('eine Phase endet vor ihrem Beginn');
    }
    if (appState.phases.some(p => p.groupIds.length === 0)) {
      problems.push('eine Phase hat keine Gruppen');
    }
    const covered = new Set<number>();
    let overlaps = false;
    for (const p of appState.phases) {
      for (let d = p.startDay; d <= p.endDay; d++) {
        if (covered.has(d)) overlaps = true;
        covered.add(d);
      }
    }
    if (overlaps) problems.push('zwei Phasen decken denselben Tag ab');
    const uncovered = DAY_NAMES.filter((_, i) => !covered.has(i));
    if (uncovered.length > 0) problems.push(`${uncovered.join(', ')} von keiner Phase abgedeckt`);
    return problems.length > 0 ? `Phasen prüfen: ${problems.join('; ')}.` : null;
  });

  /**
   * Which phase owns each weekday — drives the strip above the phase table.
   *
   * Through `phaseForDay`, which is what every other part of the app asks. This
   * open-coded the range test against the *sorted* list, so with two phases
   * overlapping — the state the warning above exists for — the strip named one
   * phase and the grid drew the other's lanes.
   */
  const weekStrip = $derived(
    DAY_NAMES.map((name, day) => {
      const phase = phaseForDay(appState, day);
      const index = phase ? phases.findIndex(p => p.id === phase.id) : -1;
      return {
        name,
        phase,
        hue: index >= 0 ? PHASE_HUES[index % PHASE_HUES.length]! : null,
      };
    }),
  );

  // ─── Plan & data ──────────────────────────────────────────────────────────
  let importError: string | null = $state(null);
  let importFileEl: HTMLInputElement | undefined = $state();

  function exportPlan(): void {
    const state = getState();
    const blob = new Blob([serializePlan(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = planFileName(state);
    a.click();
    URL.revokeObjectURL(url);
    // Records that a copy of this week now exists outside the browser, which is
    // what the toolbar's staleness hint reads.
    markExported();
  }

  async function handleImportFile(file: File): Promise<void> {
    importError = null;
    const result = parsePlan(await file.text());
    if (!result.ok) {
      importError = result.error;
      return;
    }
    const incoming = result.state;
    const events = incoming.events.length;
    if (!window.confirm(
      `«${incoming.name}» laden?\n\n` +
      `Er enthält ${events} ${events === 1 ? 'Lektion' : 'Lektionen'} und beginnt am ${fullDateLabel(incoming.wkStartDate)}.\n\n` +
      'Der Plan in diesem Browser wird ersetzt und der Verlauf gelöscht. ' +
      'Wer den aktuellen Plan behalten will, exportiert ihn vorher.',
    )) return;
    replacePlan(incoming);
    onclose();
  }

  function onImportChange(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so choosing the same file twice fires a change event both times.
    input.value = '';
    if (file) void handleImportFile(file);
  }

  function handleLoadSample(): void {
    loadSampleData();
    onclose();
  }

  function handleClearAll(): void {
    if (!window.confirm(
      'ALLE Daten löschen?\n\nDas entfernt endgültig jede Lektion, jede Gruppe, jeden Ausbildner, jeden Raum und jedes Thema und setzt alles zurück.\n\nDas kann nicht rückgängig gemacht werden.'
    )) return;
    resetToDefaults();
    onclose();
  }

  /**
   * Z2: focus the dialog itself, not its close button.
   *
   * `showModal()` hands focus to the first focusable descendant, which in every
   * one of these is the ✕ — so a keyboard user opened the dialog already on
   * "leave", and their first Tab went out of the content rather than into it.
   * The panel takes `tabindex="-1"` so it can hold focus without joining the tab
   * order; the first Tab then lands on the first real control.
   */
  let dialogEl: HTMLDialogElement;
  let sheetEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (!dialogEl) return;
    dialogEl.showModal();
    sheetEl?.focus();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} onclose={onclose} onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}
  class="modal">
  <div bind:this={sheetEl} class="config-panel" tabindex="-1">

    <!-- Header -->
    <header class="cfg-head">
      <h3 class="cfg-title">Konfiguration</h3>
      <button class="cfg-x" onclick={onclose} aria-label="Schliessen">
        <Icon name="x" size={16} />
      </button>
    </header>

    <!-- Tabs -->
    <div role="tablist" class="cfg-tabs" aria-label="Konfiguration">
      {#each TABS as tab (tab.key)}
        <button
          role="tab"
          id="cfg-tab-{tab.key}"
          aria-controls="cfg-panel"
          class="cfg-tab"
          class:cfg-tab-on={activeTab === tab.key}
          aria-selected={activeTab === tab.key}
          tabindex={activeTab === tab.key ? 0 : -1}
          onkeydown={onTabKey}
          onclick={() => { activeTab = tab.key; introOpen = false; }}
        >
          {tab.label}
          <!-- What is in there, and — as a 0 in the warning colour — what is
               not. The Einrichtung rows and this strip read the same numbers. -->
          {#if tabCounts[tab.key] !== undefined}
            <span
              class="tab-count wk-num"
              class:tab-count-zero={tabCounts[tab.key] === 0}
            >{tabCounts[tab.key]}</span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- One-line intro; the rest is behind the ⓘ -->
    <div class="intro-band">
      <p>{TAB_INTRO[activeTab].short}</p>
      <button class="intro-more" onclick={() => (introOpen = !introOpen)}>
        <Icon name="info" size={13} />
        {introOpen ? 'weniger' : 'mehr'}
      </button>
    </div>
    {#if introOpen}
      <p class="intro-long">{TAB_INTRO[activeTab].long}</p>
    {/if}

    <!-- Content -->
    <div class="cfg-body" role="tabpanel" id="cfg-panel" aria-labelledby="cfg-tab-{activeTab}">

      <!-- ════ EINRICHTUNG ═══════════════════════════════════════════════════ -->
      {#if activeTab === 'setup'}
        <div class="pane">
          <div class="pane-scroll">
            <h4 class="section-title">
              {setupOpenCount > 0
                ? 'Was dieser Plan noch braucht'
                : 'Dieser Plan ist eingerichtet'}
            </h4>

            <div class="setup-list">
              {#each setupRows as row (row.key)}
                <button
                  class="setup-row"
                  class:setup-row-open={!row.done}
                  onclick={() => goToTab(row.tab, { createSubject: row.key === 'subjects' && !row.done })}
                >
                  <span class="setup-mark" class:setup-mark-done={row.done} aria-hidden="true">
                    {#if row.done}<Icon name="check" size={13} />{/if}
                  </span>
                  <span class="setup-main">
                    <span class="setup-label">
                      {row.label}
                      <span class="setup-count wk-num" class:setup-count-zero={row.count === 0}>{row.count}</span>
                    </span>
                    <span class="setup-note" class:setup-note-warn={row.warn}>{row.note}</span>
                  </span>
                  <span class="setup-cta">
                    {row.cta} <Icon name="chevronRight" size={12} />
                  </span>
                </button>
              {/each}
            </div>

            <!-- Not a step: `createDefaultState` picks the coming Monday, which
                 is often already right, and nothing records whether anybody
                 looked at it. So it is stated and changeable, never ticked. -->
            <div class="setup-aside">
              <button class="setup-side-row" onclick={() => goToTab('data')}>
                <span class="setup-side-label">WK-Woche</span>
                <span class="setup-side-value wk-num">{weekLabel}</span>
                <span class="setup-cta">ändern <Icon name="chevronRight" size={12} /></span>
              </button>

              {#if isPristineState(appState)}
                <button class="setup-side-row" onclick={loadSampleData}>
                  <span class="setup-side-label">Beispielwoche</span>
                  <span class="setup-side-value">Eine vollständige Woche zum Anschauen — ersetzt den leeren Plan</span>
                  <span class="setup-cta">laden <Icon name="chevronRight" size={12} /></span>
                </button>
              {/if}
            </div>

            {#if setupOpenCount === 0}
              <p class="setup-done-hint">
                Themen aus der Seitenleiste auf den Kalender ziehen. Alles hier bleibt die ganze
                Woche änderbar.
              </p>
            {/if}
          </div>
        </div>

      <!-- ════ GROUPS ════════════════════════════════════════════════════════ -->
      {:else if activeTab === 'groups'}
        <div class="pane">
          <div class="pane-scroll">
            {#if appState.groups.length > 0}
              <div class="table">
                <div class="table-head grid-groups">
                  <span></span>
                  <span class="text-center">Aktiv</span>
                  <span>Bezeichnung</span>
                  <span class="text-center">Reihenfolge</span>
                  <span class="text-center">Abdeckung</span>
                  <span></span>
                  <span></span>
                </div>
                {#each sortedGroups as g, i (g.id)}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="table-row grid-groups"
                    class:row-off={!g.enabled}
                    class:row-dragging={dragId === g.id}
                    draggable="true"
                    ondragstart={() => (dragId = g.id)}
                    ondragover={(e) => e.preventDefault()}
                    ondrop={(e) => { e.preventDefault(); onDrop(g.id); }}
                    ondragend={() => (dragId = null)}
                  >
                    <span class="drag-handle" title="Ziehen, um die Spalten neu zu ordnen">
                      <Icon name="grip" size={14} />
                    </span>
                    <div class="flex justify-center">
                      <input type="checkbox" class="toggle toggle-primary toggle-sm"
                        checked={g.enabled}
                        aria-label="Gruppe aktiv"
                        onchange={(e) => updateGroup(g.id, { enabled: (e.currentTarget as HTMLInputElement).checked })}
                      />
                    </div>
                    <input class="input input-bordered input-sm w-28" type="text" value={g.label}
                      aria-label="Gruppenbezeichnung"
                      onchange={(e) => updateGroup(g.id, { label: (e.currentTarget as HTMLInputElement).value })}
                    />
                    <!-- E4: the up/down pair is the one reorder mechanism, and it
                         sits next to the label it moves rather than at the far
                         edge of the table where it was two near-invisible
                         chevrons a column away from anything. Dragging the row
                         still works and is still the fast path — it is the same
                         gesture on the same row, not a second control. -->
                    <div class="order-btns" role="group" aria-label="Reihenfolge">
                      <button class="order-btn" disabled={i === 0}
                        onclick={() => moveGroupUp(g.id)}
                        title="Nach oben" aria-label="Nach oben">
                        <Icon name="chevronUp" size={13} />
                      </button>
                      <button class="order-btn" disabled={i === sortedGroups.length - 1}
                        onclick={() => moveGroupDown(g.id)}
                        title="Nach unten" aria-label="Nach unten">
                        <Icon name="chevronDown" size={13} />
                      </button>
                    </div>
                    <!-- Not the same switch as "Aktiv": this lane keeps its
                         column, its Lektionen, its Mittagessen and every
                         Programmpunkt. It is only out of the rotation — the
                         group on its own programme. -->
                    <div class="flex justify-center">
                      <input type="checkbox" class="toggle toggle-primary toggle-sm"
                        checked={!g.excludeFromCoverage}
                        disabled={!g.enabled}
                        aria-label="Gruppe zählt zur Abdeckung"
                        title={g.excludeFromCoverage
                          ? `${g.label} hat ein eigenes Programm: keine Abdeckung und keine gemeinsamen Themen, Pausen und Programmpunkte aber schon`
                          : `${g.label} zählt zur Abdeckung`}
                        onchange={(e) => updateGroup(g.id, { excludeFromCoverage: !(e.currentTarget as HTMLInputElement).checked })}
                      />
                    </div>
                    <span></span>
                    <button class="mini mini-danger"
                      onclick={() => removeGroup(g.id)}
                      title={eventCountForGroup(g.id) === 0
                        ? `Gruppe ${g.label} löschen`
                        : `Gruppe ${g.label} löschen — mit ${eventCountForGroup(g.id)} Lektionen`}
                      aria-label="Gruppe löschen">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                {/each}
              </div>
              <p class="field-hint mt-3">
                Eine ausgeschaltete Gruppe behält ihre Lektionen. Sie werden nur nicht mehr
                angezeigt und lösen keine Konflikte mehr aus.
              </p>
              <p class="field-hint mt-1">
                <strong>Abdeckung</strong> ausschalten für eine Gruppe mit eigenem Programm
                (z.&nbsp;B. Kulturgüterschutz): Sie bleibt im Kalender und behält ihre Lektionen.
                Gemeinsame Pausen und Programmpunkte (Mittagessen, Begrüssung, Schlussrapport)
                bekommt sie weiterhin, gemeinsame <em>Themen</em> wie die Übung nicht. Zur
                Abdeckung zählt sie nicht mehr.
              </p>
            {:else}
              <p class="pane-empty">Noch keine Gruppen. Unten eine hinzufügen.</p>
            {/if}
          </div>

          <AddRow
            label="Gruppe hinzufügen"
            placeholder="G4"
            nextValue={nextGroupLabel}
            onadd={addGroup}
            inputClass="w-28"
          />
        </div>

      <!-- ════ PHASES ════════════════════════════════════════════════════════ -->
      {:else if activeTab === 'phases'}
        <div class="pane">
          <div class="pane-scroll">
            <!-- The week at a glance: the one picture that explains the model. -->
            <div class="week-strip">
              {#each weekStrip as day (day.name)}
                <div class="strip-day" style={day.hue ? `--ph:${day.hue}` : ''} class:strip-gap={!day.phase}>
                  <span class="strip-name">{day.name}</span>
                  <span class="strip-phase">{day.phase?.label ?? 'keine Phase'}</span>
                </div>
              {/each}
            </div>

            {#if phaseWarning}
              <p class="warn-banner">
                <Icon name="alert" size={14} /> {phaseWarning}
              </p>
            {/if}

            {#if appState.phases.length > 0}
              <div class="table">
                <div class="table-head grid-phases">
                  <span>Bezeichnung</span>
                  <span>Von</span>
                  <span>Bis</span>
                  <span>Gruppen</span>
                  <span></span>
                </div>
                {#each phases as p, i (p.id)}
                  <div class="table-row grid-phases">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="phase-swatch" style="background:{PHASE_HUES[i % PHASE_HUES.length]}"></span>
                      <input class="input input-bordered input-sm w-full" type="text" value={p.label}
                        aria-label="Phasenbezeichnung"
                        onchange={(e) => updatePhase(p.id, { label: (e.currentTarget as HTMLInputElement).value })}
                      />
                    </div>
                    <select class="select select-bordered select-sm" value={p.startDay}
                      aria-label="Erster Tag"
                      onchange={(e) => setPhaseStart(p.id, Number((e.currentTarget as HTMLSelectElement).value), p.endDay)}>
                      {#each DAY_NAMES as name, d (name)}
                        <option value={d}>{name}</option>
                      {/each}
                    </select>
                    <select class="select select-bordered select-sm" value={p.endDay}
                      aria-label="Letzter Tag"
                      onchange={(e) => setPhaseEnd(p.id, Number((e.currentTarget as HTMLSelectElement).value), p.startDay)}>
                      {#each DAY_NAMES as name, d (name)}
                        <option value={d}>{name}</option>
                      {/each}
                    </select>
                    <div class="lane-picks">
                      {#each sortedGroups as g (g.id)}
                        <label class="lane-pick" class:lane-pick-on={p.groupIds.includes(g.id)}>
                          <input type="checkbox"
                            checked={p.groupIds.includes(g.id)}
                            onchange={(e) => updatePhase(p.id, {
                              groupIds: (e.currentTarget as HTMLInputElement).checked
                                ? [...p.groupIds, g.id]
                                : p.groupIds.filter(id => id !== g.id),
                            })}
                          />
                          {g.label}
                        </label>
                      {/each}
                    </div>
                    <button class="mini mini-danger"
                      onclick={() => removePhase(p.id)}
                      title={eventCountForPhase(p.id) === 0
                        ? `Phase ${p.label} löschen`
                        : `Phase ${p.label} löschen — ${eventCountForPhase(p.id)} Lektionen werden dann nicht mehr angezeigt`}
                      aria-label="Phase löschen">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="pane-empty">Noch keine Phasen. Unten eine hinzufügen.</p>
            {/if}
          </div>

          <AddRow label="Phase hinzufügen" placeholder="Name der Phase" onadd={submitPhase} />
        </div>

      <!-- ════ TEACHERS ══════════════════════════════════════════════════════ -->
      {:else if activeTab === 'teachers'}
        <MasterDetail
          items={appState.teachers}
          selectedId={selectedTeacherId}
          addLabel="Ausbildner hinzufügen"
          placeholder="Name des Ausbildners"
          emptyListText="Noch keine Ausbildner"
          onselect={(id) => (selectedTeacherId = id)}
          onquickadd={quickAddTeacher}
        >
          {#snippet row(t)}
            <span
              class="list-avatar"
              style="background:{t.color}; color:{getContrastColor(t.color)}"
            >{teacherShort(t)}</span>
            <span class="truncate min-w-0 flex-1">{t.name}</span>
            {#if t.unavailable.length > 0}
              <span class="row-tag" title={t.unavailable.map(describeWindow).join(' · ')}>abwesend</span>
            {/if}
          {/snippet}
          {#snippet detail()}
            {#if selectedTeacher}
              {#key selectedTeacher.id}
                <TeacherDetail
                  teacher={selectedTeacher}
                  ondeleted={(i) => (selectedTeacherId = neighbourId(getState().teachers, i))}
                />
              {/key}
            {:else}
              <div class="empty-detail">
                <Icon name="users" size={26} />
                <span>Unten einen Namen eingeben, um einen Ausbildner hinzuzufügen — bearbeitet wird er dann hier.</span>
              </div>
            {/if}
          {/snippet}
        </MasterDetail>

      <!-- ════ ROOMS ═════════════════════════════════════════════════════════ -->
      {:else if activeTab === 'rooms'}
        <MasterDetail
          items={appState.rooms}
          selectedId={selectedRoomId}
          addLabel="Raum hinzufügen"
          placeholder="Raumname"
          emptyListText="Noch keine Räume"
          onselect={(id) => (selectedRoomId = id)}
          onquickadd={quickAddRoom}
        >
          {#snippet row(r)}
            <span class="w-2.5 h-full min-h-[1.4rem] rounded-sm shrink-0 self-stretch" style="background:{r.color}"></span>
            <span class="truncate min-w-0 flex-1">{r.name}</span>
            {#if r.unavailable.length > 0}
              <span class="row-tag" title={r.unavailable.map(describeWindow).join(' · ')}>gesperrt</span>
            {/if}
            {#if r.excludeFromConflictCheck}
              <span class="row-tag">geteilt</span>
            {/if}
          {/snippet}
          {#snippet detail()}
            {#if selectedRoom}
              {#key selectedRoom.id}
                <RoomDetail
                  room={selectedRoom}
                  ondeleted={(i) => (selectedRoomId = neighbourId(getState().rooms, i))}
                />
              {/key}
            {:else}
              <div class="empty-detail">
                <Icon name="pin" size={26} />
                <span>Unten einen Namen eingeben, um einen Raum hinzuzufügen — bearbeitet wird er dann hier.</span>
              </div>
            {/if}
          {/snippet}
        </MasterDetail>

      <!-- ════ SUBJECTS ══════════════════════════════════════════════════════ -->
      {:else if activeTab === 'subjects'}
        <MasterDetail
          items={listedSubjects}
          selectedId={selectedSubjectId}
          adding={addingSubject}
          addLabel="Thema hinzufügen"
          emptyListText="Noch keine Themen"
          onselect={(id) => { selectedSubjectId = id; addingSubject = false; }}
          onadd={() => { addingSubject = true; selectedSubjectId = null; }}
        >
          {#snippet row(s)}
            <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{s.color}"></span>
            <span class="truncate min-w-0 flex-1">{s.name}</span>
            <!-- N1: two Themen whose cards read the same on a narrow lane. The
                 list is where you can see both at once, so it is where the
                 clash is named. -->
            {#if shortNameClashes.has(s.id)}
              <span class="row-tag row-tag-warn" title="Gleiche Kartenbeschriftung wie ein anderes Thema — Kürzel setzen">Kürzel</span>
            {/if}
            {#if s.kind === 'break'}
              <span class="row-tag">Pause</span>
            {:else if s.kind === 'oneoff'}
              <span class="row-tag">Programmpunkt</span>
            {/if}
          {/snippet}
          {#snippet detail()}
            {#if addingSubject || selectedSubject}
              {#key selectedSubject?.id ?? 'new'}
                <SubjectDetail
                  subject={addingSubject ? null : selectedSubject}
                  draftColor={nextSubjectColor}
                  oncreated={(id) => { addingSubject = false; selectedSubjectId = id; }}
                  oncancel={() => { addingSubject = false; selectedSubjectId = listedSubjects[0]?.id ?? null; }}
                  ondeleted={() => (selectedSubjectId = listedSubjects.find(s => s.id !== selectedSubjectId)?.id ?? null)}
                  onnavigate={(tab) => goToTab(tab)}
                />
              {/key}
            {:else}
              <div class="empty-detail">
                <Icon name="calendar" size={26} />
                <span>Ein Thema zum Bearbeiten wählen, oder ein neues hinzufügen.</span>
              </div>
            {/if}
          {/snippet}
        </MasterDetail>

      <!-- ════ PLAN & DATA ═══════════════════════════════════════════════════ -->
      {:else if activeTab === 'data'}
        <div class="pane">
          <div class="pane-scroll">
            <div class="data-stack">

              <section class="data-card">
                <h4 class="section-title">Planname</h4>
                <p class="field-hint">
                  Erscheint in der Werkzeugleiste, auf den gedruckten Plänen und im Namen der Exportdatei.
                </p>
                <input
                  class="input input-bordered input-sm w-80 max-w-full"
                  type="text"
                  value={appState.name}
                  placeholder="z. B. WK 2026 Zug 3"
                  aria-label="Planname"
                  onchange={(e) => setPlanName((e.currentTarget as HTMLInputElement).value.trim() || 'WK-Plan')}
                />
              </section>

              <section class="data-card">
                <h4 class="section-title">WK-Woche</h4>
                <p class="field-hint">
                  Der Montag, an dem der WK beginnt. Jedes Datum rastet auf seinen Montag ein.
                  Die Woche steht im Kalender über den Spalten und auf jedem gedruckten Plan.
                </p>
                <div class="week-row">
                  <button
                    class="btn btn-sm btn-square"
                    onclick={() => shiftWeek(-1)}
                    title="Eine Woche zurück"
                    aria-label="Eine Woche zurück"
                  ><Icon name="chevronLeft" size={15} /></button>
                  <input
                    class="input input-bordered input-sm"
                    type="date"
                    value={appState.wkStartDate}
                    aria-label="WK-Woche (Montag)"
                    onchange={(e) => setWkStartDate((e.currentTarget as HTMLInputElement).value)}
                  />
                  <button
                    class="btn btn-sm btn-square"
                    onclick={() => shiftWeek(1)}
                    title="Eine Woche vor"
                    aria-label="Eine Woche vor"
                  ><Icon name="chevronRight" size={15} /></button>
                  <span class="week-label wk-num">{weekLabel}</span>
                </div>
              </section>

              <!-- H1: the hours the grid draws. One window for the whole WK —
                   the same hour has to sit at the same height in the KVK and
                   the WK segment or the two stop lining up. -->
              <section class="data-card">
                <h4 class="section-title">Tagesraster</h4>
                <p class="field-hint">
                  Von wann bis wann der Kalender Stunden zeichnet — für die ganze Woche.
                  Leer lassen: dann richtet sich das Raster nach dem Plan und lässt oben
                  und unten etwas Luft zum Ziehen. Eng gesetzt spart es Höhe, weil keine
                  leeren Stunden mehr gezeichnet werden.
                </p>
                <div class="grid-row">
                  <label class="grid-field">
                    <span class="field-label">Von</span>
                    <TimeField
                      value={appState.gridStartTime ?? ''}
                      allowEmpty
                      emptyLabel="automatisch"
                      from="00:00"
                      to="23:45"
                      ariaLabel="Raster von"
                      onpick={(v: string) => setGridWindow({ gridStartTime: v === '' ? null : v })}
                    />
                  </label>
                  <label class="grid-field">
                    <span class="field-label">Bis</span>
                    <TimeField
                      value={appState.gridEndTime ?? ''}
                      allowEmpty
                      emptyLabel="automatisch"
                      from="00:00"
                      to="24:00"
                      ariaLabel="Raster bis"
                      onpick={(v: string) => setGridWindow({ gridEndTime: v === '' ? null : v })}
                    />
                  </label>
                  <span class="grid-note wk-num">
                    {#if appState.gridStartTime === null && appState.gridEndTime === null}
                      zurzeit {derivedGrid.start}–{derivedGrid.end}
                    {:else}
                      Raster {derivedGrid.start}–{derivedGrid.end}
                    {/if}
                  </span>
                  {#if appState.gridStartTime !== null || appState.gridEndTime !== null}
                    <button
                      class="btn btn-ghost btn-xs"
                      onclick={() => setGridWindow({ gridStartTime: null, gridEndTime: null })}
                    >Zurücksetzen</button>
                  {/if}
                </div>
              </section>

              {#if isPristineState(appState)}
                <section class="data-card">
                  <h4 class="section-title">Beispieldaten</h4>
                  <p class="field-hint">
                    Lädt eine vollständige Beispielwoche — Gruppen, Ausbildner, Räume, Themen und
                    Lektionen —, um die App auszuprobieren. Nur verfügbar, solange noch nichts erfasst
                    wurde: das Laden ersetzt den ganzen (bisher leeren) Plan.
                  </p>
                  <button class="btn btn-sm gap-1.5" onclick={handleLoadSample}>
                    <Icon name="calendar" size={14} /> Beispieldaten laden
                  </button>
                </section>
              {/if}

              <section class="data-card">
                <h4 class="section-title">Plandatei</h4>
                <p class="field-hint">
                  Der Plan liegt nur in diesem Browser. Mit einer Datei sichert man ihn, nimmt ihn auf
                  einen anderen Rechner mit oder gibt ihn weiter.
                </p>
                <div class="data-actions">
                  <button class="btn btn-sm btn-primary gap-1.5" onclick={exportPlan}>
                    <Icon name="download" size={14} /> Plan exportieren …
                  </button>
                  <button class="btn btn-sm gap-1.5" onclick={() => importFileEl?.click()}>
                    <Icon name="upload" size={14} /> Plan importieren …
                  </button>
                  <input
                    bind:this={importFileEl}
                    type="file"
                    accept="application/json,.json"
                    class="hidden"
                    onchange={onImportChange}
                  />
                </div>
                <p class="field-hint">
                  <span class="wk-num">{appState.events.length}</span> Lektionen ·
                  <span class="wk-num">{appState.subjects.length}</span> Themen ·
                  <span class="wk-num">{appState.teachers.length}</span> Ausbildner ·
                  <span class="wk-num">{appState.rooms.length}</span> Räume
                </p>
                {#if importError}
                  <p class="warn-banner"><Icon name="alert" size={14} /> {importError}</p>
                {/if}
              </section>

              <section class="data-card data-card-danger">
                <h4 class="section-title">Zurücksetzen</h4>
                <div class="danger-body">
                  <span class="danger-note">
                    Entfernt jede Lektion, jede Gruppe, jeden Ausbildner, jeden Raum und jedes Thema und beginnt
                    wieder mit einem leeren Plan. Vorher exportieren, wenn etwas erhalten bleiben soll.
                  </span>
                  <button class="btn btn-sm btn-error gap-1.5" onclick={handleClearAll}>
                    <Icon name="trash" size={13} /> Alle Daten zurücksetzen
                  </button>
                </div>
              </section>

            </div>
          </div>
        </div>
      {/if}

    </div>

  </div>
</dialog>

<style>
  /* H1: the two ends of the day, side by side with what they currently resolve to. */
  .grid-row {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
  }
  .grid-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .grid-note {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
    padding-bottom: 6px;
  }

  dialog::backdrop {
    background: var(--wk-scrim);
  }

  /* Anchored near the top instead of centred. The height was pinned at 82vh
     because a content-sized dialog moved its own tab strip out from under the
     pointer whenever a shorter tab shrank it — a real hazard, fixed at the
     wrong end. Pinning the *top edge* removes the hazard directly, which then
     lets the height tell the truth: Phasen showed two rows over 226px of void
     with the footer stranded at the bottom of the screen. */
  dialog.modal {
    align-items: flex-start;
    padding-top: 6vh;
  }

  .config-panel {
    display: flex;
    flex-direction: column;
    width: min(1000px, 92vw);
    height: auto;
    /* Enough that an empty tab is still a dialog; capped so a full Themen list
       still scrolls inside the panel rather than running off the screen. */
    min-height: 420px;
    max-height: 84vh;
    background: var(--wk-surface);
    color: var(--wk-text);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
    overflow: hidden;
  }

  .week-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .week-label {
    margin-left: 0.35rem;
    font-size: var(--wk-fs-sm);
    font-weight: 600;
    color: var(--wk-text-mute);
  }

  .cfg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .cfg-title {
    font-size: var(--wk-fs-lg);
    font-weight: 700;
    margin: 0;
  }

  .cfg-x {
    display: flex;
    padding: 0.3rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .cfg-x:hover { background: var(--wk-surface-alt); color: var(--wk-text); }

  .cfg-tabs {
    display: flex;
    gap: 0.15rem;
    padding: 0 1.25rem;
    border-bottom: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .cfg-tab {
    padding: 0.6rem 0.7rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-sm);
    font-weight: 550;
    cursor: pointer;
  }
  .cfg-tab:hover { color: var(--wk-text); }

  /* The count is a fact about the tab, not a badge shouting for attention —
     except at 0, which is the whole point of showing it. */
  .tab-count {
    margin-left: 0.3rem;
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    color: var(--wk-text-faint);
  }
  .tab-count-zero { color: var(--color-warning); }
  .cfg-tab-on {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
    font-weight: 650;
  }

  .intro-band {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-shrink: 0;
    padding: 0.45rem 1.25rem;
    background: var(--wk-surface-alt);
    border-bottom: 1px solid var(--wk-line);
  }

  .intro-band p {
    margin: 0;
    flex: 1;
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
  }

  .intro-more {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    border: none;
    background: none;
    color: var(--color-primary);
    font-size: var(--wk-fs-2xs);
    cursor: pointer;
  }
  .intro-more:hover { text-decoration: underline; }

  .intro-long {
    flex-shrink: 0;
    margin: 0;
    padding: 0.55rem 1.25rem;
    font-size: var(--wk-fs-xs);
    line-height: 1.55;
    color: var(--wk-text-mute);
    background: var(--wk-surface-alt);
    border-bottom: 1px solid var(--wk-line);
  }

  .cfg-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    overflow: hidden;
  }

  .pane-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.4rem;
  }

  /* ── Einrichtung ────────────────────────────────────────────────────────
     One row per step, the whole width, because the row *is* the link: the
     label, what is in there and the way in are one target. */
  .setup-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0.85rem 0 1.1rem;
  }

  .setup-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    text-align: left;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: none;
    cursor: pointer;
  }
  .setup-row:hover { background: var(--wk-surface-alt); }
  .setup-row-open { border-color: color-mix(in oklab, var(--color-warning) 40%, var(--wk-line)); }

  /* Empty circle / filled check — the two states of a step, at the same size,
     so the column reads as a list of marks rather than as things appearing. */
  .setup-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1.5px solid color-mix(in oklab, var(--color-warning) 55%, transparent);
    color: var(--wk-surface);
  }
  .setup-mark-done {
    border-color: transparent;
    background: var(--color-success);
    color: var(--wk-surface);
  }

  .setup-main {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
    flex: 1;
  }

  .setup-label {
    font-size: var(--wk-fs-sm);
    font-weight: 600;
    color: var(--wk-text);
  }

  .setup-count {
    margin-left: 0.35rem;
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    color: var(--wk-text-faint);
  }
  .setup-count-zero { color: var(--color-warning); }

  .setup-note {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .setup-note-warn { color: var(--color-warning); }

  .setup-cta {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
    font-size: var(--wk-fs-xs);
    font-weight: 600;
    color: var(--color-primary);
  }

  /* The two things that are not steps, set apart from the ones that are. */
  .setup-aside {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--wk-line);
  }

  .setup-side-row {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    width: 100%;
    text-align: left;
    padding: 0.4rem 0.7rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: none;
    cursor: pointer;
  }
  .setup-side-row:hover { background: var(--wk-surface-alt); }

  .setup-side-label {
    font-size: var(--wk-fs-xs);
    font-weight: 600;
    color: var(--wk-text);
    flex-shrink: 0;
  }

  .setup-side-value {
    flex: 1;
    min-width: 0;
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .setup-done-hint {
    margin-top: 1rem;
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-faint);
  }

  .pane-empty {
    font-size: var(--wk-fs-sm);
    color: var(--wk-text-faint);
    text-align: center;
    padding: 1.5rem 0;
  }

  /* ── Tables ─────────────────────────────────────────────────────────────── */
  .table {
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-md);
    overflow: hidden;
    max-width: 46rem;
  }

  .table-head {
    align-items: center;
    padding: 0.4rem 0.85rem;
    background: var(--wk-surface-alt);
    border-bottom: 1px solid var(--wk-line);
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--wk-text-faint);
  }

  .table-row {
    align-items: center;
    padding: 0.4rem 0.85rem;
    border-bottom: 1px solid var(--wk-line);
    transition: background 0.1s;
  }
  .table-row:last-child { border-bottom: 0; }
  .table-row:hover { background: color-mix(in oklab, var(--color-base-content) 3%, transparent); }

  .row-off { opacity: 0.45; }
  .row-dragging { opacity: 0.4; background: color-mix(in oklab, var(--color-primary) 10%, transparent); }

  /* The order control sits next to the label it reorders, not at the far edge
     of the table with 1fr of nothing between them — the slack goes after it. */
  .grid-groups {
    display: grid;
    grid-template-columns: 1.4rem 3rem auto 5.6rem 5.5rem 1fr 2rem;
    gap: 0.6rem;
    align-items: center;
  }

  .grid-phases {
    display: grid;
    grid-template-columns: minmax(9rem, 1fr) 5.5rem 5.5rem minmax(10rem, 1.2fr) 2rem;
    gap: 0.6rem;
  }

  .drag-handle {
    display: flex;
    color: var(--wk-text-faint);
    cursor: grab;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .table-row:hover .drag-handle,
  .table-row:focus-within .drag-handle { opacity: 1; }
  .drag-handle:active { cursor: grabbing; }

  /* A segmented pair, framed so it reads as one control. Stacked and unframed
     at the table's outer edge, the two chevrons were 12px of near-invisible
     grey that nobody would find. */
  .order-btns {
    display: inline-flex;
    align-items: stretch;
    justify-self: center;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    overflow: hidden;
  }

  .order-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    color: var(--wk-text-mute);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .order-btn + .order-btn { border-left: 1px solid var(--wk-line); }
  .order-btn:hover:not(:disabled) { background: var(--wk-surface-alt); color: var(--wk-text); }
  .order-btn:disabled { opacity: 0.3; cursor: default; }

  .mini {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 18px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .mini:hover:not(:disabled) { background: var(--wk-surface-alt); color: var(--wk-text); }
  .mini:disabled { opacity: 0.25; cursor: default; }

  .mini-danger { height: 24px; }
  .mini-danger:hover {
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 12%, transparent);
  }

  .row-tag {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    flex-shrink: 0;
  }

  /* The base tag is a bare word; this one has to read as a *flag*, so it takes
     a border and a tint of its own rather than only a colour. */
  .row-tag-warn {
    color: var(--color-warning);
    border: 1px solid color-mix(in oklab, var(--color-warning) 45%, transparent);
    background: color-mix(in oklab, var(--color-warning) 12%, transparent);
    border-radius: var(--wk-r-sm);
    padding: 0 5px;
    line-height: 1.5;
  }

  /* ── Phases: the week strip ─────────────────────────────────────────────── */
  .week-strip {
    display: flex;
    gap: 3px;
    margin-bottom: 1rem;
    max-width: 46rem;
  }

  .strip-day {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.45rem 0.55rem;
    border-radius: var(--wk-r-sm);
    border-top: 3px solid var(--ph, var(--wk-line-strong));
    background: color-mix(in oklab, var(--ph, gray) 9%, var(--wk-surface-alt));
    min-width: 0;
  }

  .strip-gap {
    background: repeating-linear-gradient(
      135deg,
      transparent 0 5px,
      color-mix(in oklab, var(--color-error) 12%, transparent) 5px 10px
    );
    border-top-color: var(--color-error);
  }

  .strip-name {
    font-size: var(--wk-fs-xs);
    font-weight: 700;
  }

  .strip-phase {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-mute);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .phase-swatch {
    width: 8px;
    height: 22px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .lane-picks {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .lane-pick {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    font-size: var(--wk-fs-xs);
    cursor: pointer;
  }
  .lane-pick-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
    font-weight: 600;
  }
  .lane-pick input { accent-color: var(--color-primary); }

  .warn-banner {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 46rem;
    margin-bottom: 0.9rem;
    padding: 0.5rem 0.7rem;
    border-radius: var(--wk-r-sm);
    font-size: var(--wk-fs-xs);
    background: color-mix(in oklab, var(--color-warning) 13%, transparent);
    color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text));
  }

  /* ── Plan & data ────────────────────────────────────────────────────────── */
  .data-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 46rem;
  }

  .data-card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-md);
    background: var(--wk-surface-alt);
  }

  .data-card-danger {
    border-color: color-mix(in oklab, var(--color-error) 35%, transparent);
    background: color-mix(in oklab, var(--color-error) 6%, transparent);
  }

  .data-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .danger-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .danger-note {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
  }
</style>
