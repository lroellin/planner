<script lang="ts">
  import {
    getState, undo, redo, undoSteps, canUndo, canRedo, setWkStartDate, getIssueCount,
    getAffectedEventCount, undoLabel, redoLabel, undoHistory, exportStaleness,
  } from "../state/store.svelte";
  import { getDensity, setDensity, requestConfig, type Density } from "../state/ui.svelte";
  import { formatDate, dayDateLabel, sortSubjects } from "../utils/timeUtils";
  import { teacherShort, isEditingTarget } from "../utils/format";
  import { getContrastColor } from "../utils/colorUtils";
  import Icon from "./Icon.svelte";
  import type { EventFilter, ReportTab } from "../types";

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

  // "teacher:abc" ⇄ { kind, id }; "" means no filter
  const filterValue = $derived(filter ? `${filter.kind}:${filter.id}` : "");

  // Programmpunkte, then breaks — each block alphabetical, the sidebar's order.
  const legendSubjects = $derived([
    ...sortSubjects(appState.subjects.filter(s => s.kind === 'lesson')),
    ...sortSubjects(appState.subjects.filter(s => s.kind === 'oneoff')),
    ...sortSubjects(appState.subjects.filter(s => s.kind === 'break')),
  ]);

  const weekLabel = $derived(
    `${dayDateLabel(appState.wkStartDate, 0)}–${dayDateLabel(appState.wkStartDate, 4)}`,
  );

  let menu: 'legend' | 'week' | 'history' | 'more' | null = $state(null);

  /**
   * The bar carries more than fits, and it used to deal with that by not
   * dealing with it: `.bar-left`/`.bar-right` are `flex: 1; min-width: 0` but
   * every child is nowrap text, so nothing could shrink and `justify-content:
   * flex-end` pushed the right group's overflow *out of its own left edge* —
   * straight across the week nav. At 1280px that was seven overlapping pairs.
   *
   * So the collapse is explicit and ordered, cheapest loss first: labels off
   * the two wide actions, then the three things that are consulted rarely
   * (legend, shortcuts, density) into one "⋯". Both thresholds are measured
   * against what the bar actually needs, not round numbers.
   */
  let barWidth = $state(typeof window === 'undefined' ? 1600 : window.innerWidth);
  const dense = $derived(barWidth < 1500);
  const tight = $derived(barWidth < 1360);

  // No width-guard on `menu` any more: the overflow is a permanent button (B5)
  // and the legend renders from whichever anchor is on screen — bar-left while
  // there is room for its own button, the overflow once there is not. Both
  // states are legal at every width, so nothing here has to close them.

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

  function applyFilter(raw: string): void {
    if (!raw) {
      filter = null;
      return;
    }
    const [kind, ...rest] = raw.split(':');
    filter = { kind: kind as EventFilter['kind'], id: rest.join(':') };
  }

  function shiftWeek(delta: number): void {
    // Parse as local date to avoid UTC-offset shifting the day
    const [y, m, day] = appState.wkStartDate.split('-').map(Number);
    const d = new Date(y!, m! - 1, day!);
    d.setDate(d.getDate() + delta * 7);
    setWkStartDate(formatDate(d));
  }

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
{#snippet legendPanel(align: 'left' | 'right')}
  <div class="pop pop-legend {align === 'left' ? 'pop-left' : 'pop-right'}">
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
    <!-- The wordmark names the app once, at the start of a session; the plan
         name is what tells you which week you are in, and it is the only
         editable thing here. It gets the weight. -->
    <span class="wordmark">WK<span class="wordmark-thin">Planer</span></span>

    <button
      class="plan-name"
      onclick={() => (configOpen = true)}
      title="Umbenennen unter Konfiguration › Plan &amp; Daten"
    >{appState.name}</button>

    <label class="filter" title="Nur Lektionen eines Ausbildners, eines Raums oder einer Gruppe zeigen">
      <Icon name="filter" size={13} />
      <select
        class="filter-select"
        value={filterValue}
        onchange={(e) => applyFilter((e.currentTarget as HTMLSelectElement).value)}
        aria-label="Lektionen filtern"
      >
        <option value="">Alle Lektionen</option>
        <optgroup label="Ausbildner">
          {#each appState.teachers as t (t.id)}
            <option value="teacher:{t.id}">{t.name}</option>
          {/each}
        </optgroup>
        <optgroup label="Räume">
          {#each appState.rooms as r (r.id)}
            <option value="room:{r.id}">{r.name}</option>
          {/each}
        </optgroup>
        <optgroup label="Gruppen">
          {#each appState.groups.filter(g => g.enabled) as g (g.id)}
            <option value="group:{g.id}">{g.label}</option>
          {/each}
        </optgroup>
      </select>
    </label>

    <!-- B4: with the week nav centred on the viewport there was a ~300px hole
         between it and the filter it belongs with — "which week am I editing"
         and "what am I looking at" are the same question, asked twice. It sits
         with the rest of the view controls now, and the bar is two groups
         rather than three. -->
    <div class="week-nav">
      <button class="tb-icon" onclick={() => shiftWeek(-1)} title="Vorherige Woche" aria-label="Vorherige Woche">
        <Icon name="chevronLeft" size={16} />
      </button>
      <div class="week-wrap">
        <button
          class="week-btn"
          class:tb-btn-on={menu === 'week'}
          onclick={() => (menu = menu === 'week' ? null : 'week')}
          title="WK-Woche wählen"
        >
          <Icon name="calendar" size={14} />
          <span class="wk-num">{weekLabel}</span>
        </button>
        {#if menu === 'week'}
          <div class="pop pop-left">
            <div class="pop-title wk-eyebrow">WK-Woche (Montag)</div>
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              value={appState.wkStartDate}
              onchange={(e) => {
                setWkStartDate((e.currentTarget as HTMLInputElement).value);
                menu = null;
              }}
            />
            <p class="pop-empty">Jedes Datum rastet auf seinen Montag ein.</p>
          </div>
        {/if}
      </div>
      <button class="tb-icon" onclick={() => shiftWeek(1)} title="Nächste Woche" aria-label="Nächste Woche">
        <Icon name="chevronRight" size={16} />
      </button>
    </div>

    {#if !tight}
      <div class="legend-wrap">
        <button
          class="tb-btn"
          class:tb-btn-on={menu === 'legend'}
          onclick={() => (menu = menu === 'legend' ? null : 'legend')}
          title="Was die Farben bedeuten"
        >
          <Icon name="palette" size={15} /> Legende
        </button>
        {#if menu === 'legend'}{@render legendPanel('left')}{/if}
      </div>
    {/if}
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
          {#if tight}
            <div class="pop-title wk-eyebrow">Zeilenhöhe</div>
            <div class="pop-density">{@render densityControl()}</div>
          {/if}
          <!-- "Ansicht" belongs to the Legende, which only lands in this menu
               on a narrow bar. Above that width the group collapsed to a single
               Tastenkürzel item under a heading that did not describe it. -->
          {#if tight}
            <div class="pop-title wk-eyebrow">Ansicht</div>
            <button class="pop-item pop-item-row" onclick={() => (menu = 'legend')}>
              <Icon name="palette" size={14} />
              <span class="pop-item-label">Legende</span>
            </button>
          {/if}
          <div class="pop-title wk-eyebrow">Hilfe</div>
          <button
            class="pop-item pop-item-row"
            onclick={() => { menu = null; onshowshortcuts(); }}
          >
            <Icon name="keyboard" size={14} />
            <span class="pop-item-label">Tastenkürzel</span>
            <span class="pop-item-hint">?</span>
          </button>
        </div>
      {/if}
      {#if menu === 'legend' && tight}{@render legendPanel('right')}{/if}
    </div>

    <!-- Ghost, not primary: it is opened once at the start of a WK, and being
         the loudest thing on the bar said otherwise. -->
    <button class="tb-btn tb-btn-framed" onclick={() => (configOpen = true)}>
      <Icon name="settings" size={15} /> Konfiguration
    </button>
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
    height: 46px;
    padding: 0 0.65rem;
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

  /* The week nav travels with the filter it belongs to. `overflow: hidden` per
     group — the belt-and-braces the review asked for — is deliberately *not*
     used here, because every group contains an absolutely-positioned popover
     and clipping the bar would clip those; a menu that cannot be read is a
     worse failure than the one it guards against. The two collapse steps above
     are what keep the groups from meeting. */
  .week-nav {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
    margin-left: 0.15rem;
  }

  /* A mark, not a headline. At 14px/750 it was within a hair of the plan name's
     13px/600 and the two read as one competing pair; the app's own name is the
     one thing on this bar nobody needs to read twice. */
  .wordmark {
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--wk-text-faint);
    margin-right: 0.55rem;
    white-space: nowrap;
  }

  .wordmark-thin {
    font-weight: 500;
    margin-left: 0.3em;
  }

  .plan-name {
    max-width: 14rem;
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

  /* ── Controls ───────────────────────────────────────────────────────────── */
  .filter {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.5rem;
    height: 30px;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    color: var(--wk-text-mute);
    background: var(--wk-surface);
  }
  .filter:focus-within {
    border-color: var(--color-primary);
  }

  .filter-select {
    border: none;
    background: none;
    outline: none;
    font-size: var(--wk-fs-sm);
    color: var(--wk-text);
    max-width: 150px;
    cursor: pointer;
  }

  .tb-btn,
  .tb-icon,
  .week-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    height: 30px;
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
    width: 30px;
    padding: 0;
    justify-content: center;
  }

  /* Step one of the collapse: the label goes, the button keeps its hit area and
     its tooltip. */
  .tb-btn-icon {
    padding: 0 0.4rem;
    gap: 0.15rem;
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
  .tb-icon:hover:not(:disabled),
  .week-btn:hover {
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

  .week-btn {
    border-color: var(--wk-line);
    font-weight: 600;
    color: var(--wk-text);
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

  .pop-item-row {
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
  .legend-wrap,
  .week-wrap {
    position: relative;
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
