<script lang="ts">
  import {
    getState, undo, redo, undoSteps, canUndo, canRedo, setWkStartDate, getIssueCount,
    undoLabel, redoLabel, undoHistory,
  } from "../state/store.svelte";
  import { getDensity, setDensity, type Density } from "../state/ui.svelte";
  import { formatDate, dayDateLabel, sortSubjects } from "../utils/timeUtils";
  import { teacherShort, isEditingTarget } from "../utils/format";
  import Icon from "./Icon.svelte";
  import type { EventFilter, ReportTab } from "../types";

  interface Props {
    configOpen: boolean;
    filter: EventFilter | null;
    onreport: (tab: ReportTab) => void;
    /** The issue badge is the one place that says something is wrong; it has to
     *  be able to open the panel that says what. */
    onshowissues: () => void;
    onshowshortcuts: () => void;
  }

  let {
    configOpen = $bindable(), filter = $bindable(), onreport, onshowissues, onshowshortcuts,
  }: Props = $props();

  const appState = $derived(getState());
  // Conflicts *and* orphans — the same number the conflict panel shows, so the
  // two badges cannot disagree.
  const conflictCount = $derived(getIssueCount());

  // "teacher:abc" ⇄ { kind, id }; "" means no filter
  const filterValue = $derived(filter ? `${filter.kind}:${filter.id}` : "");

  // Breaks last, each block alphabetical — the same order as the sidebar.
  const legendSubjects = $derived([
    ...sortSubjects(appState.subjects.filter(s => !s.isBreak)),
    ...sortSubjects(appState.subjects.filter(s => s.isBreak)),
  ]);

  const weekLabel = $derived(
    `${dayDateLabel(appState.wkStartDate, 0)}–${dayDateLabel(appState.wkStartDate, 4)}`,
  );

  let menu: 'print' | 'legend' | 'week' | 'history' | null = $state(null);

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

  const PRINT_TARGETS: { tab: ReportTab | 'grid'; label: string; hint: string }[] = [
    { tab: 'grid', label: 'Wochenraster', hint: 'Der Stundenplan wie angezeigt' },
    { tab: 'groups', label: 'Gruppenpläne', hint: 'Eine Seite pro Gruppe' },
    { tab: 'teachers', label: 'Gruppenführerpläne', hint: 'Eine Seite pro Gruppenführer' },
    { tab: 'rooms', label: 'Raumpläne', hint: 'Eine Seite pro Raum' },
    { tab: 'coverage', label: 'Abdeckung', hint: 'Wer noch was braucht' },
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

  function print(target: ReportTab | 'grid'): void {
    menu = null;
    if (target === 'grid') {
      window.print();
      return;
    }
    onreport(target);
    // The overlay has to be mounted (and its print stylesheet applied) before
    // the print dialog samples the page.
    setTimeout(() => window.print(), 350);
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

<svelte:window on:keydown={handleKeydown} />

<div class="bar">
  <!-- ── Identity + filter ────────────────────────────────────────────────── -->
  <div class="bar-left">
    <span class="wordmark">WK<span class="wordmark-thin">Planner</span></span>

    <button
      class="plan-name"
      onclick={() => (configOpen = true)}
      title="Umbenennen unter Konfiguration → Plan &amp; Daten"
    >{appState.name}</button>

    <label class="filter" title="Nur Lektionen zeigen, die … betreffen">
      <Icon name="filter" size={13} />
      <select
        class="filter-select"
        value={filterValue}
        onchange={(e) => applyFilter((e.currentTarget as HTMLSelectElement).value)}
        aria-label="Lektionen filtern"
      >
        <option value="">Alle Lektionen</option>
        <optgroup label="Gruppenführer">
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

    <div class="legend-wrap">
      <button
        class="tb-btn"
        class:tb-btn-on={menu === 'legend'}
        onclick={() => (menu = menu === 'legend' ? null : 'legend')}
        title="Was die Farben bedeuten"
      >
        <Icon name="palette" size={15} /> Legende
      </button>
      {#if menu === 'legend'}
        <div class="pop pop-left">
          <div class="pop-title wk-eyebrow">Gruppenführer</div>
          {#each appState.teachers as t (t.id)}
            <div class="legend-row">
              <span class="legend-av" style="background:{t.color}">{teacherShort(t)}</span>
              <span class="truncate">{t.name}</span>
            </div>
          {:else}
            <p class="pop-empty">Noch keine Gruppenführer.</p>
          {/each}
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
          <div class="pop-title wk-eyebrow">Themen</div>
          {#each legendSubjects as s (s.id)}
            <div class="legend-row">
              <span class="legend-dot" style="background:{s.color}"></span>
              <span class="truncate">{s.name}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- ── The week ─────────────────────────────────────────────────────────── -->
  <div class="bar-center">
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
        <div class="pop pop-center">
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

  <!-- ── Actions ──────────────────────────────────────────────────────────── -->
  <div class="bar-right">
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

    <div class="tb-divider"></div>

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

    {#if conflictCount > 0}
      <button
        class="issues"
        onclick={onshowissues}
        title="Konflikte und Lektionen, die kein Kalender zeichnet — Liste öffnen"
      >
        <Icon name="alert" size={13} />
        {conflictCount} {conflictCount === 1 ? "Problem" : "Probleme"}
      </button>
    {/if}

    <div class="tb-divider"></div>

    <button class="tb-btn" onclick={() => onreport('coverage')} title="Abdeckung und Pläne">
      <Icon name="report" size={15} /> Auswertungen
    </button>

    <div class="legend-wrap">
      <button
        class="tb-btn"
        class:tb-btn-on={menu === 'print'}
        onclick={() => (menu = menu === 'print' ? null : 'print')}
      >
        <Icon name="printer" size={15} /> Drucken
        <Icon name="chevronDown" size={12} />
      </button>
      {#if menu === 'print'}
        <div class="pop pop-right">
          <div class="pop-title wk-eyebrow">Drucken …</div>
          {#each PRINT_TARGETS as target (target.tab)}
            <button class="pop-item" onclick={() => print(target.tab)}>
              <span class="pop-item-label">{target.label}</span>
              <span class="pop-item-hint">{target.hint}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button
      class="tb-icon"
      onclick={onshowshortcuts}
      title="Tastenkürzel (?)"
      aria-label="Tastenkürzel"
    ><Icon name="keyboard" size={15} /></button>

    <button class="btn btn-primary btn-sm gap-1.5" onclick={() => (configOpen = true)}>
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

  .bar-center {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .wordmark {
    font-size: var(--wk-fs-md);
    font-weight: 750;
    letter-spacing: -0.01em;
    color: var(--wk-text);
    margin-right: 0.5rem;
    white-space: nowrap;
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
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .plan-name:hover {
    border-color: var(--wk-line);
    color: var(--wk-text);
  }

  .wordmark-thin {
    font-weight: 400;
    color: var(--wk-text-faint);
    margin-left: 0.22em;
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
  }

  /* ── Issue badge ────────────────────────────────────────────────────────── */
  .issues {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    height: 24px;
    padding: 0 0.5rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: color-mix(in oklab, var(--color-error) 13%, transparent);
    color: var(--color-error);
    font-size: var(--wk-fs-xs);
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
  }

  .issues:hover {
    background: color-mix(in oklab, var(--color-error) 22%, transparent);
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
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
  }

  .pop-left { left: 0; }
  .pop-right { right: 0; }
  .pop-center { left: 50%; transform: translateX(-50%); }

  .pop-title {
    padding: 0.4rem 0.35rem 0.2rem;
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

  .legend-av {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 9px;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
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

  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    border: none;
    background: transparent;
    cursor: default;
  }
</style>
