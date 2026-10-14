<script lang="ts">
  import {
    getState, undo, redo, undoSteps, canUndo, canRedo, getIssueCount,
    getAffectedEventCount, undoLabel, redoLabel, undoHistory, exportStaleness,
  } from "../state/store.svelte";
  import { getDensity, setDensity, requestConfig, type Density } from "../state/ui.svelte";
  import { setupSteps } from "../state/setup";
  import { sortSubjects } from "../utils/timeUtils";
  import { teacherShort, isEditingTarget } from "../utils/format";
  import { getContrastColor } from "../utils/colorUtils";
  import Icon from "./Icon.svelte";
  import type { EventFilter, ReportTab } from "../types";

  const SOURCE_URL = "https://github.com/lroellin/planner";

  interface Props {
    configOpen: boolean;
    filter: EventFilter | null;
    onreport: (tab: ReportTab) => void;
    /** Opens the PDF print dialog, which owns the choice of what to print. */
    onprint: () => void;
    /** The issue badge is the one place that says something is wrong; it has to
     *  be able to open the panel that says what. */
    onshowissues: () => void;
    onshowshortcuts: () => void;
  }

  let {
    configOpen = $bindable(), filter = $bindable(), onreport, onprint, onshowissues,
    onshowshortcuts,
  }: Props = $props();

  const appState = $derived(getState());

  // Nothing can be placed until Ausbildner, Räume and Themen exist, and this
  // button is the only way to any of them.
  const SETUP_LABELS: Record<string, string> = {
    groups: 'Gruppen', phases: 'Phasen', teachers: 'Ausbildner',
    rooms: 'Räume', subjects: 'Themen',
  };
  const openSetup = $derived(setupSteps(appState).filter(step => !step.done));
  const setupDone = $derived(openSetup.length === 0);
  const openSetupLabels = $derived(openSetup.map(step => SETUP_LABELS[step.key]).join(', '));
  // Conflicts *and* orphans — the same number the conflict panel shows, so the
  // two badges cannot disagree.
  const conflictCount = $derived(getIssueCount());
  const affectedCount = $derived(getAffectedEventCount());

  /**
   * A drop in the count is the only feedback that says the last edit helped, and
   * it used to happen between two frames with nothing to notice. The tick is
   * driven from a plain effect rather than a transition because the element is
   * not replaced — only its text changes.
   */
  let badgeTick = $state(0);
  let lastCount: number | null = null;
  $effect(() => {
    const now = conflictCount;
    // First run only records: the badge should not tick merely for existing.
    if (lastCount !== null && now !== lastCount) badgeTick++;
    lastCount = now;
  });

  /**
   * The plan lives in one browser's localStorage. That fact was stated exactly
   * once, on the last tab of the config dialog, and nothing tracked how long it
   * had been true — so a week's work could sit one "clear site data" from gone
   * with the app perfectly silent about it.
   */
  const staleness = $derived(exportStaleness());
  let exportHintDismissed = $state(false);
  const showExportHint = $derived(staleness.stale && !exportHintDismissed);

  /**
   * What the filter is set to, said in words.
   *
   * It used to be a permanent 158px `<select>` reading "Alle Lektionen" — a
   * fifth of the left-hand bar spent, at all times, saying that no filter is
   * on. Off, it is now an icon; on, it is a chip naming the one thing you are
   * looking at, with the × that turns it off. The state that matters is the
   * loud one.
   */
  const filterLabel = $derived.by(() => {
    if (!filter) return null;
    const { kind, id } = filter;
    if (kind === 'teacher') return appState.teachers.find(t => t.id === id)?.name ?? null;
    if (kind === 'room') return appState.rooms.find(r => r.id === id)?.name ?? null;
    return appState.groups.find(g => g.id === id)?.label ?? null;
  });

  const FILTER_KIND_LABEL: Record<EventFilter['kind'], string> = {
    teacher: 'Ausbildner', room: 'Raum', group: 'Gruppe',
  };

  function setFilter(kind: EventFilter['kind'], id: string): void {
    filter = { kind, id };
    menu = null;
  }

  // Programmpunkte, then breaks — each block alphabetical, the sidebar's order.
  const legendSubjects = $derived([
    ...sortSubjects(appState.subjects.filter(s => s.kind === 'lesson')),
    ...sortSubjects(appState.subjects.filter(s => s.kind === 'oneoff')),
    ...sortSubjects(appState.subjects.filter(s => s.kind === 'break')),
  ]);

  let menu: 'legend' | 'filter' | 'history' | 'more' | null = $state(null);

  /**
   * The bar carries more than fits at some widths, so the collapse is explicit
   * and ordered, cheapest loss first: labels off the two wide actions, then the
   * density control into the "⋯".
   *
   * The left group lost ~370px in this pass — the wordmark, the week nav and
   * the Legende button all left it — so both thresholds drop by about that
   * much: what used to need 1500px to stay labelled now needs 1130.
   */
  let barWidth = $state(typeof window === 'undefined' ? 1600 : window.innerWidth);
  const dense = $derived(barWidth < 1130);
  const tight = $derived(barWidth < 1000);

  const history = $derived(undoHistory());

  function undoTo(index: number): void {
    menu = null;
    undoSteps(index + 1);
  }

  // S/M/L rather than initials: "Compact" and "Comfortable" both start with C.
  const DENSITIES: { key: Density; label: string; short: string }[] = [
    { key: 'compact', label: 'Kompakt', short: 'S' },
    { key: 'normal', label: 'Normal', short: 'M' },
    { key: 'comfortable', label: 'Weit', short: 'L' },
  ];

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') menu = null;
    if (!(e.ctrlKey || e.metaKey)) return;
    // Ctrl+Z belongs to the focused field while text is being edited — taking it
    // for app-level undo there would revert the whole schedule instead of a typo.
    if (isEditingTarget(e.target)) return;
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if (e.key === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    }
    if (e.key === "y") {
      e.preventDefault();
      redo();
    }
  }
</script>

<svelte:window bind:innerWidth={barWidth} on:keydown={handleKeydown} />

<!-- The whole key at once. It used to be one 210px column of 21 rows in a
     60vh box: 640px of content in 540px, so "Mittagessen" was cut mid-row and
     the only thing telling you there was more was an overlay scrollbar that is
     invisible until you scroll. Three columns fit the lot with room to spare,
     and the scroll cap stays as a backstop for a very long Themen list. -->
{#snippet legendPanel()}
  <div class="pop pop-legend pop-right">
    <section class="legend-col">
      <div class="pop-title wk-eyebrow">Ausbildner</div>
      {#each appState.teachers as t (t.id)}
        <div class="legend-row">
          <span
            class="legend-av"
            style="background:{t.color}; color:{getContrastColor(t.color)}"
          >{teacherShort(t)}</span>
          <span class="truncate">{t.name}</span>
        </div>
      {:else}
        <p class="pop-empty">Noch keine Ausbildner.</p>
      {/each}
    </section>

    <section class="legend-col">
      <div class="pop-title wk-eyebrow">Räume</div>
      {#each appState.rooms as r (r.id)}
        <div class="legend-row">
          <span class="legend-tag" style="background:{r.color}"></span>
          <span class="truncate">{r.name}</span>
          {#if r.excludeFromConflictCheck}
            <span class="legend-note">geteilt</span>
          {/if}
        </div>
      {:else}
        <p class="pop-empty">Noch keine Räume.</p>
      {/each}
    </section>

    <section class="legend-col">
      <div class="pop-title wk-eyebrow">Themen</div>
      {#each legendSubjects as s (s.id)}
        <div class="legend-row">
          <span class="legend-dot" style="background:{s.color}"></span>
          <span class="truncate">{s.name}</span>
        </div>
      {/each}
    </section>

    <!-- The three columns above are dictionaries you can also read in
         Konfiguration. These are the marks that exist nowhere else: what the
         grid draws on a card and never spells out. -->
    <section class="legend-col">
      <div class="pop-title wk-eyebrow">Markierungen</div>
      <div class="legend-row">
        <span class="legend-mark mark-hard"></span>
        <span class="truncate">Harter Konflikt</span>
      </div>
      <div class="legend-row">
        <span class="legend-mark mark-soft"></span>
        <span class="truncate">Weicher Konflikt</span>
      </div>
      <div class="legend-row">
        <span class="legend-mark mark-break"></span>
        <span class="truncate">Pause</span>
      </div>
      <div class="legend-row">
        <span class="legend-mark mark-icon"><Icon name="layers" size={11} /></span>
        <span class="truncate">Alle Gruppen</span>
      </div>
      <div class="legend-row">
        <span class="legend-mark mark-icon"><Icon name="pencil" size={11} /></span>
        <span class="truncate">Von der Vorgabe abweichend</span>
      </div>
    </section>
  </div>
{/snippet}

{#snippet densityControl()}
  <div class="density" role="group" aria-label="Zeilenhöhe">
    <Icon name="rows" size={13} class="density-icon" />
    {#each DENSITIES as d (d.key)}
      <button
        class="density-btn"
        class:density-btn-on={getDensity() === d.key}
        onclick={() => setDensity(d.key)}
        title="Zeilenhöhe: {d.label}"
        aria-pressed={getDensity() === d.key}
      >{d.short}</button>
    {/each}
  </div>
{/snippet}

<div class="bar">
  <!-- ── Identity + filter ────────────────────────────────────────────────── -->
  <div class="bar-left">
    <!-- The wordmark is gone. It said "WK PLANER" beside a plan called "WK 2026
         Tuggen/Reichenburg", 90px of the bar spent naming the app to the one
         person who already knows which app they opened — and the browser tab
         says it anyway. The plan name is the identity now; it is also the only
         editable thing here, so it gets the weight and the width. -->
    <button
      class="plan-name"
      onclick={() => requestConfig('plan')}
      title="{appState.name} — umbenennen unter Konfiguration › Plan &amp; Daten"
    >{appState.name}</button>

    <!-- Off: one icon. On: a chip naming the filter, with its own ×. -->
    <div class="legend-wrap">
      <button
        class="filter-btn"
        class:filter-btn-on={filter !== null}
        class:tb-btn-on={menu === 'filter' && filter === null}
        onclick={() => (menu = menu === 'filter' ? null : 'filter')}
        title={filter
          ? `Gefiltert auf ${FILTER_KIND_LABEL[filter.kind]} ${filterLabel ?? ''} — nur diese Lektionen werden gezeigt`
          : 'Nur Lektionen eines Ausbildners, eines Raums oder einer Gruppe zeigen'}
        aria-label="Lektionen filtern"
      >
        <Icon name="filter" size={13} />
        {#if filter}<span class="filter-name">{filterLabel ?? '?'}</span>{/if}
      </button>
      {#if filter}
        <button
          class="filter-clear"
          onclick={() => (filter = null)}
          title="Filter aufheben — wieder alle Lektionen zeigen"
          aria-label="Filter aufheben"
        ><Icon name="x" size={11} /></button>
      {/if}
      {#if menu === 'filter'}
        <div class="pop pop-left pop-filter">
          <button
            class="pop-item pop-item-row"
            class:pop-item-on={filter === null}
            onclick={() => { filter = null; menu = null; }}
          >
            <span class="pop-item-label">Alle Lektionen</span>
          </button>
          {#if appState.teachers.length > 0}
            <div class="pop-title wk-eyebrow">Ausbildner</div>
            {#each appState.teachers as t (t.id)}
              <button
                class="pop-item pop-item-row"
                class:pop-item-on={filter?.kind === 'teacher' && filter.id === t.id}
                onclick={() => setFilter('teacher', t.id)}
              >
                <span class="legend-dot" style="background:{t.color}"></span>
                <span class="pop-item-label">{t.name}</span>
              </button>
            {/each}
          {/if}
          {#if appState.rooms.length > 0}
            <div class="pop-title wk-eyebrow">Räume</div>
            {#each appState.rooms as r (r.id)}
              <button
                class="pop-item pop-item-row"
                class:pop-item-on={filter?.kind === 'room' && filter.id === r.id}
                onclick={() => setFilter('room', r.id)}
              >
                <span class="legend-dot" style="background:{r.color}"></span>
                <span class="pop-item-label">{r.name}</span>
              </button>
            {/each}
          {/if}
          <div class="pop-title wk-eyebrow">Gruppen</div>
          {#each appState.groups.filter(g => g.enabled) as g (g.id)}
            <button
              class="pop-item pop-item-row"
              class:pop-item-on={filter?.kind === 'group' && filter.id === g.id}
              onclick={() => setFilter('group', g.id)}
            >
              <span class="pop-item-label">{g.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Actions ──────────────────────────────────────────────────────────── -->
  <div class="bar-right">
    {#if !tight}
      {@render densityControl()}
      <div class="tb-divider"></div>
    {/if}

    <button
      class="tb-icon"
      disabled={!canUndo()}
      onclick={undo}
      title={canUndo() ? `Rückgängig: ${undoLabel() ?? ''} (Ctrl+Z)` : 'Nichts rückgängig zu machen'}
      aria-label="Rückgängig"
    ><Icon name="undo" size={15} /></button>

    <!-- Ctrl+Z five times and then reading the grid to work out where you have
         landed is not a way to get back to before lunch was moved. -->
    <div class="legend-wrap">
      <button
        class="tb-caret"
        class:tb-btn-on={menu === 'history'}
        disabled={!canUndo()}
        onclick={() => (menu = menu === 'history' ? null : 'history')}
        title="Verlauf"
        aria-label="Verlauf"
      ><Icon name="chevronDown" size={12} /></button>
      {#if menu === 'history'}
        <div class="pop pop-right">
          <div class="pop-title wk-eyebrow">Rückgängig bis …</div>
          {#each history as label, i (i)}
            <button class="pop-item pop-item-row" onclick={() => undoTo(i)}>
              <span class="pop-item-label">{label}</span>
              <span class="pop-item-hint wk-num">{i + 1}×</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button
      class="tb-icon"
      disabled={!canRedo()}
      onclick={redo}
      title={canRedo() ? `Wiederholen: ${redoLabel() ?? ''} (Ctrl+Shift+Z)` : 'Nichts zu wiederholen'}
      aria-label="Wiederholen"
    ><Icon name="redo" size={15} /></button>

    <!-- Always rendered, and the count leads. It used to appear only when
         something was wrong, which reflowed the whole right-hand group the
         moment a conflict was fixed, and it was drawn as a quiet outline pill
         while Konfiguration — opened once a week — was the only solid button on
         the bar. Clean is a state worth showing, so it stays put and goes
         quiet rather than vanishing. -->
    {#key badgeTick}
    <button
      class="issues"
      class:issues-clear={conflictCount === 0}
      class:issues-tick={badgeTick > 0}
      onclick={onshowissues}
      title={conflictCount > 0
        ? `${conflictCount} Konflikte über ${affectedCount} ${affectedCount === 1 ? 'Lektion' : 'Lektionen'} — Liste öffnen`
        : 'Keine Konflikte, alles liegt in einer Phase — Liste öffnen'}
    >
      <Icon name={conflictCount > 0 ? 'alert' : 'check'} size={13} />
      {#if conflictCount > 0}
        <span class="wk-num">{conflictCount}</span>
        {conflictCount === 1 ? 'Problem' : 'Probleme'}
      {:else}
        Keine Probleme
      {/if}
    </button>
    {/key}

    <!-- K4: the number everyone watches changed silently. The badge ticks and
         re-colours, both of which say nothing to a screen reader — while toasts
         have aria-live and the selection bar has role="status", so the pattern
         was established and this was left out. Outside the {#key} block, or the
         re-mount would re-announce it unchanged. -->
    <span class="sr-only" aria-live="polite">
      {conflictCount > 0
        ? `${conflictCount} ${conflictCount === 1 ? 'Problem' : 'Probleme'}`
        : 'Keine Probleme'}
    </span>

    <!-- The plan exists in this browser and nowhere else. Quiet, dismissible,
         and shown only once there is a week worth losing — but shown, because
         the alternative is finding out from an empty grid. -->
    {#if showExportHint}
      <button
        class="export-hint"
        onclick={() => requestConfig('plan')}
        title={staleness.days === null
          ? 'Dieser Plan wurde noch nie in eine Datei gesichert. Er liegt nur in diesem Browser.'
          : `Letzte Sicherung vor ${staleness.days} Tagen. Der Plan liegt nur in diesem Browser.`}
      >
        <Icon name="download" size={13} />
        {staleness.days === null ? 'noch nie gesichert' : `zuletzt vor ${staleness.days} Tagen gesichert`}
      </button>
      <button
        class="export-hint-x"
        onclick={() => (exportHintDismissed = true)}
        title="Hinweis ausblenden"
        aria-label="Hinweis ausblenden"
      ><Icon name="x" size={11} /></button>
    {/if}

    <div class="tb-divider"></div>

    <button
      class="tb-btn"
      class:tb-btn-icon={dense}
      onclick={() => onreport('coverage')}
      title="Auswertungen — Abdeckung und Pläne"
      aria-label="Auswertungen"
    >
      <Icon name="report" size={15} />{#if !dense}Auswertungen{/if}
    </button>

    <!-- One button, no submenu: every entry of the old dropdown opened this
         same dialog, which then asked the same question again with the answer
         already filled in. The dialog owns the choice. -->
    <button
      class="tb-btn"
      class:tb-btn-icon={dense}
      onclick={onprint}
      title="Drucken"
      aria-label="Drucken"
    >
      <Icon name="printer" size={15} />{#if !dense}Drucken{/if}
    </button>

    <!-- B5: Tastenkürzel lives here at every width. As a lone icon-only button
         between two labelled ones it was the only thing on the bar you had to
         hover to identify — and it is consulted about once, on the first day.
         The overflow is where a rarely-used labelled action belongs; when the
         bar is tight, the legend and the density control join it. -->
    <div class="legend-wrap">
      <button
        class="tb-icon"
        class:tb-btn-on={menu === 'more' || menu === 'legend'}
        onclick={() => (menu = menu === 'more' ? null : 'more')}
        title="Mehr"
        aria-label="Mehr"
      ><Icon name="more" size={16} /></button>
      {#if menu === 'more'}
        <div class="pop pop-right">
          <div class="pop-title wk-eyebrow">Ansicht</div>
          {#if tight}
            <div class="pop-density">{@render densityControl()}</div>
          {/if}
          <!-- The Legende lives here at every width now. As a labelled button on
               the bar it cost ~100px permanently to answer a question — "what
               does this colour mean" — that is asked on the first day and then
               about once a week; the three keys it holds are all also readable
               in Konfiguration. -->
          <button class="pop-item pop-item-row" onclick={() => (menu = 'legend')}>
            <Icon name="palette" size={14} />
            <span class="pop-item-label">Legende</span>
          </button>
          <div class="pop-title wk-eyebrow">Hilfe</div>
          <button
            class="pop-item pop-item-row"
            onclick={() => { menu = null; onshowshortcuts(); }}
          >
            <Icon name="keyboard" size={14} />
            <span class="pop-item-label">Tastenkürzel</span>
            <span class="pop-item-hint">?</span>
          </button>
          <!-- AGPLv3 source offer (section 13): everyone who uses the app over
               the network must be able to get its source. FullCalendar Premium's
               free licence depends on it — GPLv3 key on v6, AGPLv3 from v7. -->
          <a
            class="pop-item pop-item-row"
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onclick={() => (menu = null)}
          >
            <Icon name="code" size={14} />
            <span class="pop-item-label">Quellcode</span>
            <span class="pop-item-hint">AGPLv3</span>
          </a>
        </div>
      {/if}
      {#if menu === 'legend'}{@render legendPanel()}{/if}
    </div>

    <!-- Ghost, not primary: it is opened once at the start of a WK, and being
         the loudest thing on the bar said otherwise. The dot is the exception —
         while Ausbildner, Räume or Themen are still empty, nothing can be
         planned at all, and this is the only button that leads there. It
         resolves itself, so unlike the export hint beside it, it needs no × -->
    <button
      class="tb-btn tb-btn-framed"
      class:tb-btn-todo={!setupDone}
      onclick={() => (configOpen = true)}
      title={setupDone
        ? 'Gruppen, Phasen, Ausbildner, Räume und Themen'
        : `Einrichtung offen: ${openSetupLabels}`}
    >
      <Icon name="settings" size={15} /> Konfiguration
      {#if !setupDone}<span class="tb-dot" aria-hidden="true"></span>{/if}
    </button>
    <span class="sr-only" aria-live="polite">
      {setupDone ? '' : `Einrichtung offen: ${openSetupLabels}`}
    </span>
  </div>
</div>

{#if menu}
  <button class="menu-backdrop" aria-label="Menü schliessen" onclick={() => (menu = null)}></button>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    /* 42, not 46. Four pixels is not much on its own; it is the same four the
       phase strip and the column headers each gave back in this pass, and
       together they are a whole 15-minute slot of grid. */
    height: 42px;
    padding: 0 0.55rem;
    background: var(--wk-surface);
  }

  .bar-left,
  .bar-right {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: 1;
    min-width: 0;
  }

  .bar-right {
    justify-content: flex-end;
  }

  /* `overflow: hidden` per group is deliberately *not* used here, because both
     groups contain absolutely-positioned popovers and clipping the bar would
     clip those; the two collapse steps above are what keep them from meeting. */

  /* The bar's identity, and the only editable thing on it. The cap is a
     fraction of the viewport rather than a fixed 14rem: a plan name is a place
     and a year, it is read once per session, and on a 1280px screen 224px of it
     was a seventh of the bar. It truncates; the tooltip and Konfiguration hold
     the full string. */
  .plan-name {
    max-width: min(15vw, 13rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0.15rem 0.45rem;
    border: 1px solid transparent;
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text);
    font-size: var(--wk-fs-md);
    font-weight: 700;
    letter-spacing: -0.01em;
    cursor: pointer;
  }
  .plan-name:hover {
    border-color: var(--wk-line);
    background: var(--wk-surface-alt);
  }

  /* ── Filter ─────────────────────────────────────────────────────────────── */
  /* Unset it is a 28px icon; set it is a chip that names what you are looking
     at. The old control was a 158px select whose resting state read "Alle
     Lektionen" — permanent width spent saying that nothing is filtered, which
     is also the state you can see by looking at the grid. */
  .filter-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    height: 28px;
    max-width: 13rem;
    padding: 0 0.5rem;
    border: 1px solid transparent;
    border-radius: var(--wk-r-sm);
    background: transparent;
    color: var(--wk-text-faint);
    font-size: var(--wk-fs-sm);
    font-weight: 550;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .filter-btn:hover {
    background: var(--wk-surface-alt);
    color: var(--wk-text);
  }

  /* Filtering hides Lektionen. That is a state you must never be in by accident
     without knowing it, so when it is on the control stops being quiet. */
  .filter-btn-on {
    border-color: color-mix(in oklab, var(--color-primary) 45%, transparent);
    background: color-mix(in oklab, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
  }
  .filter-btn-on:hover {
    background: color-mix(in oklab, var(--color-primary) 18%, transparent);
    color: var(--color-primary);
  }

  .filter-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .filter-clear {
    display: flex;
    align-items: center;
    padding: 3px;
    margin-left: -0.15rem;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--color-primary);
    cursor: pointer;
  }
  .filter-clear:hover {
    background: color-mix(in oklab, var(--color-primary) 18%, transparent);
  }

  /* The list can run to every Ausbildner, Raum and Gruppe in the plan. */
  .pop-filter {
    min-width: 190px;
  }

  .pop-item-on {
    background: color-mix(in oklab, var(--color-primary) 12%, transparent);
  }
  .pop-item-on .pop-item-label { color: var(--color-primary); }

  /* ── Controls ───────────────────────────────────────────────────────────── */
  .tb-btn,
  .tb-icon {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    height: 28px;
    padding: 0 0.55rem;
    border: 1px solid transparent;
    border-radius: var(--wk-r-sm);
    background: transparent;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .tb-icon {
    width: 28px;
    padding: 0;
    justify-content: center;
  }

  /* Step one of the collapse: the label goes, the button keeps its hit area and
     its tooltip. */
  .tb-btn-icon {
    padding: 0 0.4rem;
    gap: 0.15rem;
  }

  .tb-btn-todo { position: relative; }

  /* The same warning hue the Einrichtung rows and the zero-counts use. */
  .tb-dot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-warning);
  }

  /* Konfiguration: framed rather than filled — present, not shouting. */
  .tb-btn-framed {
    border-color: var(--wk-line);
    color: var(--wk-text);
    font-weight: 600;
  }
  .tb-btn-framed:hover {
    border-color: var(--wk-line-strong);
  }

  .tb-btn:hover,
  .tb-icon:hover:not(:disabled) {
    background: var(--wk-surface-alt);
    color: var(--wk-text);
  }

  .tb-btn-on {
    background: var(--wk-surface-alt);
    color: var(--wk-text);
    border-color: var(--wk-line);
  }

  .tb-icon:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .tb-divider {
    width: 1px;
    height: 20px;
    background: var(--wk-line);
    margin: 0 0.25rem;
  }

  /* ── Density ────────────────────────────────────────────────────────────── */
  .density {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 2px 5px 2px 6px;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    color: var(--wk-text-faint);
  }

  .density :global(.density-icon) {
    margin-right: 3px;
  }

  .density-btn {
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--wk-text-faint);
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
    cursor: pointer;
  }
  .density-btn:hover { background: var(--wk-surface-alt); color: var(--wk-text); }
  .density-btn-on {
    background: color-mix(in oklab, var(--color-primary) 14%, transparent);
    color: var(--color-primary);
  }

  /* The undo split-button's second half. */
  .tb-caret {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 26px;
    margin-left: -4px;
    border: none;
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .tb-caret:hover:not(:disabled) {
    background: var(--wk-surface-alt);
    color: var(--wk-text);
  }
  .tb-caret:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .pop-item.pop-item-row {
    flex-direction: row !important;
    align-items: center;
    gap: 0.5rem;
    color: var(--wk-text-mute);
  }

  .pop-item-row .pop-item-label { flex: 1; }
  .pop-item-row .pop-item-hint { margin-left: auto; }

  /* ── Issue badge ────────────────────────────────────────────────────────── */
  /* One 150ms tick when the number changes — the only signal that the last edit
     landed. Keyed re-render restarts it; `prefers-reduced-motion` zeroes it. */
  .issues-tick {
    animation: issues-tick 0.15s ease-out;
  }

  @keyframes issues-tick {
    from { transform: scale(1.09); }
    to   { transform: scale(1); }
  }

  .export-hint {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid color-mix(in oklab, var(--color-warning) 45%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-warning) 12%, transparent);
    color: color-mix(in oklab, var(--color-warning) 82%, var(--wk-text));
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .export-hint:hover {
    background: color-mix(in oklab, var(--color-warning) 20%, transparent);
  }

  .export-hint-x {
    display: flex;
    padding: 2px;
    margin-left: -0.15rem;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .export-hint-x:hover { color: var(--wk-text); background: var(--wk-surface-alt); }

  .issues {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    height: 26px;
    padding: 0 0.6rem;
    border: 1px solid transparent;
    border-radius: var(--wk-r-sm);
    background: var(--color-error);
    color: var(--color-error-content);
    font-size: var(--wk-fs-xs);
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .issues:hover {
    background: color-mix(in oklab, var(--color-error) 84%, var(--color-base-content));
  }

  /* Nothing wrong: same place, same size, no voice. */
  .issues-clear {
    background: transparent;
    border-color: var(--wk-line);
    color: var(--wk-text-faint);
    font-weight: 500;
  }
  .issues-clear:hover {
    background: var(--wk-surface-alt);
    color: var(--wk-text-mute);
  }

  /* ── Popovers ───────────────────────────────────────────────────────────── */
  /* Anchors a popover, and lays out whatever sits in front of it. Flex, not the
     default block: the filter's chip and its × are two siblings here, and as
     inline-blocks they wrapped onto a second line that hung out of a 42px bar
     the moment a filter was set. */
  .legend-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .pop {
    position: absolute;
    top: calc(100% + 6px);
    z-index: 80;
    min-width: 210px;
    max-height: 60vh;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    background: var(--wk-surface);
    /* Card-anchored, like the quick edit — same edge and shadow recipe. */
    border: 1px solid var(--wk-pop-line);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-pop-shadow);
  }

  .pop-left { left: 0; }
  .pop-right { right: 0; }

  /* Three keys side by side. One column of 21 rows needed 640px and got 540, so
     the last Thema was cut in half with nothing to say so — the scrollbar that
     would have said it is an overlay scrollbar, invisible until you scroll.
     Across three columns the tallest is the Themen list alone, which is a third
     of the height, and the .pop max-height stays as the backstop for a plan
     with thirty of them. */
  .pop-legend {
    display: grid;
    /* `max-content` rather than a 150px floor: "Schutzanlage Bern-West" and
       "Karteneröffnung/-führung" were being truncated inside a popover with
       200px of unused width beside them. The cap still stops one very long
       Thema from running off the screen. */
    grid-template-columns: repeat(4, minmax(min-content, max-content));
    gap: 0 1.1rem;
    align-items: start;
    max-width: min(860px, 94vw);
  }

  .legend-col {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  /* Each column opens with its own title, so the divider rule that separates
     stacked sections would draw a stray line above every one of them. */
  .legend-col .pop-title {
    border-top: 0;
    margin-top: 0;
  }

  .pop-title {
    padding: 0.4rem 0.35rem 0.2rem;
  }

  .pop-density {
    padding: 0.15rem 0.35rem 0.35rem;
  }

  .pop-title:not(:first-child) {
    border-top: 1px solid var(--wk-line);
    margin-top: 0.3rem;
  }

  .pop-empty {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    padding: 0.1rem 0.35rem 0.3rem;
  }

  .pop-item {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    padding: 0.35rem 0.45rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .pop-item:hover { background: var(--wk-surface-alt); }
  a.pop-item { text-decoration: none; }

  .pop-item-label {
    font-size: var(--wk-fs-sm);
    font-weight: 600;
    color: var(--wk-text);
  }

  .pop-item-hint {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
  }

  .legend-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.15rem 0.35rem;
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
    min-width: 0;
  }

  /* The colour is derived from the teacher's own colour, not assumed white: a
     pale teacher colour got white-on-near-white and a text-shadow trying to
     rescue it. Same treatment as the calendar card's avatar. */
  .legend-av {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: var(--wk-fs-3xs);
    font-weight: 700;
    flex-shrink: 0;
  }

  .legend-tag {
    width: 12px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .legend-dot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .legend-note {
    margin-left: auto;
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
  }

  /* The card marks, drawn the way the grid draws them. */
  .legend-mark {
    width: 14px;
    height: 11px;
    border-radius: 2px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mark-hard {
    border: 2px solid var(--color-error);
    box-shadow: inset 0 0 0 1px var(--wk-surface);
  }

  .mark-soft {
    border: 2px dashed var(--color-warning);
  }

  .mark-break {
    background: var(--wk-surface-alt);
    border: 1px solid var(--wk-line);
    background-image: repeating-linear-gradient(
      -45deg,
      color-mix(in oklab, var(--color-base-content) 12%, transparent) 0 1px,
      transparent 1px 4px
    );
  }

  .mark-icon { color: var(--wk-text-faint); }

  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    border: none;
    background: transparent;
    cursor: default;
  }
</style>
