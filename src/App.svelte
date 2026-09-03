<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from './components/Toolbar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Calendar from './components/Calendar.svelte';
  import ConflictPanel from './components/ConflictPanel.svelte';
  import EventModal from './components/EventModal.svelte';
  import EventPopover from './components/EventPopover.svelte';
  import ConfigPanel from './components/ConfigPanel.svelte';
  import SidePanel from './components/SidePanel.svelte';
  import ReportPanel from './components/ReportPanel.svelte';
  import ShortcutsDialog from './components/ShortcutsDialog.svelte';
  import PlaceDialog from './components/PlaceDialog.svelte';
  import PrintDialog from './components/PrintDialog.svelte';
  import type { PrintTarget } from './print/boxes';
  import Toasts from './components/Toasts.svelte';
  import Icon from './components/Icon.svelte';
  import {
    getState, getIssueCount, updateEvents, removeEvents, duplicateEvents,
  } from './state/store.svelte';
  import {
    getQuickEdit, closeQuickEdit, getSelectedEventId, getSelectedEventIds, setSelection,
    clearSelection, getDensity, slotHeight, suppressNextDateClick,
    getPlaceRequest, clearPlaceRequest, getConfigRequest, clearConfigRequest, requestConfig,
    getReportRequest, clearReportRequest,
    type ConfigTab,
  } from './state/ui.svelte';
  import {
    phaseGroups, phaseDayCount, addMinutesToTime, timeDiffMinutes, clampDayIndex, orderedPhases,
  } from './utils/timeUtils';
  import { isEditingTarget } from './utils/format';
  import type { EventFilter, ID, Phase, ReportTab } from './types';

  let configOpen = $state(false);
  let reportOpen = $state(false);
  let printTarget = $state<PrintTarget | null>(null);
  let shortcutsOpen = $state(false);
  let reportTab = $state<ReportTab>('coverage');
  /** Preselects the report's own teacher/room dropdown when it was asked for. */
  let reportFilterId = $state<ID | null>(null);
  let sidebarOpen = $state(true);
  // Collapsed by default: the rail keeps the issue badge in view, and the grid
  // is what you open the app to look at.
  let conflictsOpen = $state(false);
  let selectedEventId = $state<string | null>(null);
  let filter = $state<EventFilter | null>(null);
  let scroller: HTMLDivElement | undefined = $state();
  let calendarWrapper: HTMLDivElement | undefined = $state();
  /** Measured widths of the phase segments; the label strip copies them. */
  let labelWidths = $state<number[]>([]);

  // Orphans join the count so a collapsed panel can't hide events that render
  // nowhere. Every badge in the app reads this same number.
  const conflictCount = $derived(getIssueCount());
  const hasEvents = $derived(getState().events.length > 0);
  // A fresh plan ships only the two Pausen, so "drag a Thema from the sidebar"
  // was an instruction with nothing to carry it out.
  const hasLessons = $derived(getState().subjects.some(s => s.kind === 'lesson'));
  const quickEdit = $derived(getQuickEdit());
  const selectedIds = $derived(getSelectedEventIds());

  const phases = $derived(orderedPhases(getState()));

  // Column count drives each phase's share of the width, so lanes stay the same
  // width across the whole week regardless of how many a phase has.
  function phaseWeight(phase: Phase): number {
    return phaseDayCount(phase) * Math.max(phaseGroups(getState(), phase).length, 1);
  }

  /**
   * The label strip has to sit exactly on the phase boundaries below it, and it
   * cannot get there by repeating the same flex sum: FullCalendar's tables carry
   * a min-content width of their own (nowrap day headers), so a segment ends up
   * a few pixels wider than its flex share and the strip drifts off. Measure the
   * segments and copy the result — the strip labels the grid, so the grid wins.
   */
  function syncPhaseLabels(): void {
    if (!scroller) return;
    const next = [...scroller.querySelectorAll('.phase-seg')].map(
      el => el.getBoundingClientRect().width,
    );
    const same =
      next.length === labelWidths.length &&
      next.every((w, i) => Math.abs(w - (labelWidths[i] ?? 0)) < 0.05);
    if (!same) labelWidths = next;
  }

  $effect(() => {
    // Re-observe whenever the segments themselves are rebuilt.
    phases.length;
    getDensity();
    if (!scroller) return;

    const observer = new ResizeObserver(syncPhaseLabels);
    observer.observe(scroller);
    for (const seg of scroller.querySelectorAll('.phase-seg')) observer.observe(seg);
    syncPhaseLabels();
    return () => observer.disconnect();
  });

  /** Ctrl+P over an open report prints that report; Abdeckung has no sheet. */
  function planTargetFor(tab: ReportTab): PrintTarget {
    return tab === 'coverage' ? 'grid' : tab;
  }

  function openReport(tab: ReportTab): void {
    reportTab = tab;
    reportOpen = true;
  }

  // ─── Cross-panel requests ──────────────────────────────────────────────────
  // A gap named in the coverage report, a sidebar chip, the first-run call to
  // action: all three want the same two dialogs, so they post a request and this
  // owns the opening. The report is closed on the way — the placement dialog
  // would otherwise open behind a full-screen overlay.

  let placing = $state<{ subjectId: ID; groupId?: ID; dayIndex?: number } | null>(null);
  let configTab = $state<ConfigTab | null>(null);
  let configCreateSubject = $state(false);

  $effect(() => {
    const request = getPlaceRequest();
    if (!request) return;
    request.token;
    reportOpen = false;
    placing = { subjectId: request.subjectId, groupId: request.groupId, dayIndex: request.dayIndex };
    clearPlaceRequest();
  });

  $effect(() => {
    const request = getConfigRequest();
    if (!request) return;
    request.token;
    configTab = request.tab;
    configCreateSubject = request.createSubject === true;
    configOpen = true;
    clearConfigRequest();
  });

  // Config hands off to the report that lists what its panes only count.
  $effect(() => {
    const request = getReportRequest();
    if (!request) return;
    request.token;
    configOpen = false;
    reportTab = request.tab;
    reportFilterId = request.filterId ?? null;
    reportOpen = true;
    clearReportRequest();
  });

  // ─── Keyboard editing on the grid ──────────────────────────────────────────
  // The selected cards can be nudged without reaching for the mouse: this is the
  // fastest way to close a gap left by a break, and it works on the phase the
  // event already lives in.

  function handleGridKeys(e: KeyboardEvent): void {
    /**
     * Ctrl/Cmd+P is the gesture everyone reaches for, and it used to hand the
     * job to the browser's own print of the DOM — the path the PDF renderer
     * exists to replace. Checked before the text-field guard, because printing
     * is not an editing action and browsers do not suppress it in a field
     * either.
     */
    if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      if (printTarget === null) {
        printTarget = reportOpen ? planTargetFor(reportTab) : 'grid';
        // Same as the report's own Drucken button: the dialog replaces the
        // overlay rather than stacking on top of it.
        reportOpen = false;
      }
      return;
    }

    if (isEditingTarget(e.target)) return;

    // "?" is the one shortcut that has to be discoverable without being known.
    // It closes itself, but never opens on top of another dialog.
    if (e.key === '?') {
      if (shortcutsOpen) {
        e.preventDefault();
        shortcutsOpen = false;
        return;
      }
      if (configOpen || reportOpen || printTarget || selectedEventId !== null) return;
      e.preventDefault();
      shortcutsOpen = true;
      return;
    }

    if (e.key === 'Escape') {
      closeQuickEdit();
      clearSelection();
      return;
    }

    const overlayOpen =
      selectedEventId !== null || configOpen || reportOpen || shortcutsOpen || printTarget !== null;

    if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A') && !overlayOpen) {
      e.preventDefault();
      selectAllVisible();
      return;
    }

    const ids = getSelectedEventIds();
    if (ids.length === 0 || overlayOpen) return;

    const state = getState();
    const events = state.events.filter(ev => ids.includes(ev.id));
    if (events.length === 0) return;

    const shift = e.shiftKey;

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? -15 : 15;
        if (shift) {
          // Resize: never below one slot. Each block keeps its own length.
          updateEvents(ids, ev => {
            const minutes = Math.max(15, timeDiffMinutes(ev.startTime, ev.endTime) + delta);
            return { endTime: addMinutesToTime(ev.startTime, minutes) };
          }, 'Dauer ändern');
        } else {
          updateEvents(ids, ev => {
            const minutes = timeDiffMinutes(ev.startTime, ev.endTime);
            const start = addMinutesToTime(ev.startTime, delta);
            return { startTime: start, endTime: addMinutesToTime(start, minutes) };
          }, 'verschieben');
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const step = e.key === 'ArrowLeft' ? -1 : 1;
        // At the edge of the week nothing can move, and an undo entry for a
        // keypress that changed nothing is worse than no feedback.
        if (events.every(ev => clampDayIndex(ev.dayIndex + step) === ev.dayIndex)) break;
        updateEvents(ids, ev => ({ dayIndex: clampDayIndex(ev.dayIndex + step) }), 'verschieben');
        break;
      }
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        removeEvents(ids);
        clearSelection();
        closeQuickEdit();
        break;
      case 'Enter':
        e.preventDefault();
        closeQuickEdit();
        selectedEventId = getSelectedEventId();
        break;
      case 'd':
      case 'D':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          // Select the copies, not the originals: the next arrow key belongs to
          // what was just created.
          const copies = duplicateEvents(ids);
          if (copies.length > 0) setSelection(copies);
        }
        break;
    }
  }

  /** Everything the grid is currently drawing — the filter narrows this too. */
  function selectAllVisible(): void {
    if (!scroller) return;
    const ids = [...scroller.querySelectorAll<HTMLElement>('.fc-event[data-wk-event-id]')]
      .map(el => el.dataset['wkEventId'])
      .filter((id): id is ID => Boolean(id));
    closeQuickEdit();
    // A multi-group event is drawn once per lane, so the same id comes back
    // several times.
    setSelection([...new Set(ids)]);
  }

  // ─── Marquee ───────────────────────────────────────────────────────────────
  // Dragging across empty grid selects what it covers. FullCalendar has no
  // range selection enabled, so the empty background is free for this; the only
  // thing that has to be kept out of the way is its dateClick, which fires on
  // the mouseup that ends the marquee.

  interface Marquee { x1: number; y1: number; x2: number; y2: number; }
  let marquee = $state<Marquee | null>(null);

  const marqueeRect = $derived(
    marquee
      ? {
          left: Math.min(marquee.x1, marquee.x2),
          top: Math.min(marquee.y1, marquee.y2),
          width: Math.abs(marquee.x2 - marquee.x1),
          height: Math.abs(marquee.y2 - marquee.y1),
        }
      : null,
  );

  function eventsWithin(rect: { left: number; top: number; width: number; height: number }): ID[] {
    if (!scroller) return [];
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const hit = new Set<ID>();
    for (const el of scroller.querySelectorAll<HTMLElement>('.fc-event[data-wk-event-id]')) {
      const r = el.getBoundingClientRect();
      if (r.right < rect.left || r.left > right || r.bottom < rect.top || r.top > bottom) continue;
      const id = el.dataset['wkEventId'];
      if (id) hit.add(id);
    }
    return [...hit];
  }

  function onScrollerPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !scroller) return;
    const target = e.target as HTMLElement | null;
    // Cards own their own drag and resize gestures.
    if (!target || target.closest('.fc-event')) return;

    const origin = { x: e.clientX, y: e.clientY };
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let base: ID[] = [];
    let active = false;

    const move = (ev: PointerEvent): void => {
      // Below the threshold this is still a click on an empty slot, which is
      // how a subject gets placed without dragging.
      if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 6) return;
      if (!active) {
        active = true;
        base = additive ? getSelectedEventIds() : [];
        closeQuickEdit();
      }
      marquee = { x1: origin.x, y1: origin.y, x2: ev.clientX, y2: ev.clientY };
      if (marqueeRect) setSelection([...new Set([...base, ...eventsWithin(marqueeRect)])]);
    };

    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!active) return;
      suppressNextDateClick();
      marquee = null;
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /**
   * Give the week its own sheet.
   *
   * FullCalendar sizes its columns in JS and writes the result as inline pixel
   * widths, so a print viewport narrower than the screen leaves those widths in
   * place and the phases overlap. Rather than fight the reflow, the page box is
   * sized to the grid that is already laid out; the printer's own fit-to-page
   * then scales it down, which is what every calendar app ends up doing.
   */
  function printPageStyle(): HTMLStyleElement {
    let el = document.getElementById('wk-print-page') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'wk-print-page';
      document.head.appendChild(el);
    }
    return el;
  }

  function fitGridToPage(): void {
    // The report overlay brings its own layout and prints on plain A4.
    if (reportOpen || !calendarWrapper || !scroller) {
      printPageStyle().textContent = '';
      return;
    }
    const width = Math.ceil(calendarWrapper.scrollWidth) + 4;
    const height = Math.ceil(labelStripHeight() + scroller.scrollHeight) + 4;
    if (width <= 4 || height <= 4) return;
    printPageStyle().textContent = `@page { size: ${width}px ${height}px; margin: 14px; }`;
  }

  function labelStripHeight(): number {
    return calendarWrapper?.querySelector('.phase-labels')?.getBoundingClientRect().height ?? 0;
  }

  onMount(() => {
    window.addEventListener('beforeprint', fitGridToPage);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (dark: boolean) =>
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    apply(mq.matches);
    mq.addEventListener('change', e => apply(e.matches));

    // The grid runs 07:00–19:00 so the fringes are reachable, but the day starts
    // at 08:00 — open there rather than on an hour of empty rows.
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (scroller) scroller.scrollTop = 4 * slotHeight();
      }, 60);
    });

    return () => window.removeEventListener('beforeprint', fitGridToPage);
  });
</script>

<svelte:window onkeydown={handleGridKeys} />

<div class="app-layout">
  <div class="toolbar-wrapper">
    <Toolbar
      bind:configOpen
      bind:filter
      onreport={openReport}
      onprint={() => (printTarget = 'grid')}
      onshowissues={() => (conflictsOpen = true)}
      onshowshortcuts={() => (shortcutsOpen = true)}
    />
  </div>

  <div class="main-area">
    <SidePanel side="left" bind:open={sidebarOpen} label="Themen" width="240px">
      <Sidebar />
    </SidePanel>

    <div class="calendar-wrapper" bind:this={calendarWrapper}>
      <div class="phase-labels">
        {#each phases as phase, i (phase.id)}
          <div
            class="phase-label wk-eyebrow"
            class:phase-label--noaxis={i > 0}
            style={labelWidths[i] !== undefined
              ? `flex: 0 0 ${labelWidths[i]}px`
              : `flex-grow: ${phaseWeight(phase)}`}
          >{phase.label}</div>
        {/each}
      </div>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="phase-scroll" bind:this={scroller} onpointerdown={onScrollerPointerDown}>
        <!-- Keyed on the density: FullCalendar measures one slot row at render
             and sizes the grid from it, then stretches the rows back out to that
             height, so a shrink only takes effect on a fresh instance. -->
        {#key getDensity()}
          {#each phases as phase, i (phase.id)}
            <div
              class="phase-seg"
              class:phase-seg--noaxis={i > 0}
              style="flex-grow: {phaseWeight(phase)}"
            >
              <Calendar bind:selectedEventId {phase} {filter} />
            </div>
          {/each}
        {/key}
      </div>

      {#if !hasEvents}
        <!-- Anchored at the sidebar edge rather than centred in the WK phase,
             where a lone ← pointing across 1200px read as a caption for the
             Mi/Do columns. -->
        <div class="empty-hint">
          {#if hasLessons}
            <Icon name="arrowLeft" size={18} />
            <div>Ein Thema aus der Seitenleiste auf den Kalender ziehen, oder ein leeres Feld anklicken.</div>
          {:else}
            <div class="empty-title">Noch keine Themen</div>
            <div>Themen sind das, was auf den Kalender gezogen wird. Für diesen WK ist noch keines erfasst.</div>
            <button class="empty-cta" onclick={() => requestConfig('subjects', { createSubject: true })}>
              <Icon name="plus" size={14} /> Erstes Thema anlegen
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- The dock keeps the collapsed rail's 40px in the flex row; the panel
         itself floats out of it over the calendar when open, so the grid never
         reflows for it. -->
    <div class="right-dock">
      <SidePanel
        side="right"
        bind:open={conflictsOpen}
        label="Konflikte"
        width="268px"
        badge={conflictCount}
        overlay
      >
        <ConflictPanel bind:selectedEventId />
      </SidePanel>
    </div>
  </div>
</div>

{#if marqueeRect && marqueeRect.width > 2 && marqueeRect.height > 2}
  <div
    class="marquee"
    aria-hidden="true"
    style="left:{marqueeRect.left}px; top:{marqueeRect.top}px; width:{marqueeRect.width}px; height:{marqueeRect.height}px"
  ></div>
{/if}

<!-- A set has no popover and no modal, so without this bar the only way to act
     on one is the keyboard, and nothing on screen says how many are selected. -->
{#if selectedIds.length > 1}
  <div class="selbar" role="status">
    <span class="selbar-count wk-num">{selectedIds.length}</span>
    <span class="selbar-text">Lektionen ausgewählt</span>
    <div class="selbar-sep"></div>
    <button
      class="selbar-btn"
      onclick={() => {
        const copies = duplicateEvents(selectedIds);
        if (copies.length > 0) setSelection(copies);
      }}
    >
      <Icon name="copy" size={13} /> Duplizieren
    </button>
    <button
      class="selbar-btn selbar-btn-danger"
      onclick={() => { removeEvents(selectedIds); clearSelection(); }}
    >
      <Icon name="trash" size={13} /> Löschen
    </button>
    <button class="selbar-btn" onclick={clearSelection}>Aufheben</button>
    <div class="selbar-sep"></div>
    <!-- The only contextual place these are taught. The shortcut sheet lists
         them, but its button lives in the "⋯" menu below 1360px and nothing
         else in the app mentions that a selection can be nudged at all. -->
    <span class="selbar-keys">
      <kbd>↑↓</kbd> 15 min · <kbd>←→</kbd> Tag
    </span>
  </div>
{/if}

{#if quickEdit && selectedEventId === null && selectedIds.length <= 1}
  <EventPopover
    quick={quickEdit}
    onedit={(id) => { closeQuickEdit(); selectedEventId = id; }}
  />
{/if}

{#if selectedEventId}
  <EventModal eventId={selectedEventId} onclose={() => (selectedEventId = null)} />
{/if}

{#if configOpen}
  <ConfigPanel
    initialTab={configTab}
    createSubject={configCreateSubject}
    onclose={() => { configOpen = false; configTab = null; configCreateSubject = false; }}
  />
{/if}

{#if reportOpen}
  <ReportPanel
    tab={reportTab}
    filterId={reportFilterId}
    onprint={(t) => { reportOpen = false; printTarget = t; }}
    ontab={(t) => (reportTab = t)}
    onclose={() => { reportOpen = false; reportFilterId = null; }}
  />
{/if}

{#if printTarget}
  <PrintDialog target={printTarget} onclose={() => (printTarget = null)} />
{/if}

{#if shortcutsOpen}
  <ShortcutsDialog onclose={() => (shortcutsOpen = false)} />
{/if}

{#if placing}
  <PlaceDialog
    subjectId={placing.subjectId}
    groupId={placing.groupId}
    dayIndex={placing.dayIndex}
    onclose={() => (placing = null)}
  />
{/if}

<Toasts />

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    height: 100vh;
  }

  :global(#app) {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .app-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--wk-surface);
  }

  .toolbar-wrapper {
    flex-shrink: 0;
    border-bottom: 1px solid var(--wk-line);
  }

  .main-area {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .right-dock {
    position: relative;
    width: 40px;
    flex-shrink: 0;
  }

  /* The dock is the positioning context, so the panel inside it no longer
     stretches as a flex child of .main-area and has to be told to fill it. */
  .right-dock > :global(.side-panel) {
    height: 100%;
  }

  .calendar-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .phase-labels {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid var(--wk-line);
    background: var(--wk-surface-alt);
  }

  .phase-label {
    /* First-paint fallback only: mirrors .phase-seg's basis so the strip is
       roughly right before syncPhaseLabels() measures the real boundaries and
       pins each label to its segment. */
    flex-basis: var(--wk-axis-w);
    min-width: 0;
    padding: 0.35rem 0.7rem;
    border-left: 2px solid var(--wk-line-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Only the first phase carries the time gutter, so the others have no axis
     width to account for. */
  .phase-label--noaxis {
    flex-basis: 0;
  }

  .phase-label:first-child {
    border-left: 0;
  }

  /* One scroller for every phase, so their time rows can never drift apart */
  .phase-scroll {
    position: relative;
    flex: 1;
    display: flex;
    align-items: flex-start;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  .phase-seg {
    /* Basis covers the time gutter so flex-grow divides only the lane area —
       otherwise the fixed gutter eats a far bigger share of a narrow phase and
       its columns come out narrower than the wide phase's. */
    flex-basis: var(--wk-axis-w);
    min-width: 0;
    border-left: 2px solid var(--wk-line-strong);
  }

  .phase-seg--noaxis {
    flex-basis: 0;
  }

  .phase-seg:first-child {
    border-left: 0;
  }

  /* ── Marquee & selection bar ────────────────────────────────────────────── */
  .marquee {
    position: fixed;
    z-index: 900;
    pointer-events: none;
    border: 1px solid var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 12%, transparent);
    border-radius: 3px;
  }

  .selbar {
    position: fixed;
    left: 50%;
    /* Above the toasts, which own the bottom centre. */
    bottom: 68px;
    transform: translateX(-50%);
    z-index: 950;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem 0.4rem 0.7rem;
    background: var(--wk-surface);
    border: 1px solid var(--wk-line-strong);
    border-radius: 999px;
    box-shadow: var(--wk-shadow-2);
    font-size: var(--wk-fs-xs);
    /* The toast directly below rises in; this used to appear in one frame, so
       the pair read as two unrelated mechanisms. */
    animation: selbar-in 0.12s ease-out;
  }

  @keyframes selbar-in {
    from { opacity: 0; transform: translate(-50%, 6px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }

  .selbar-keys {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--wk-text-faint);
    font-size: var(--wk-fs-2xs);
    white-space: nowrap;
  }

  .selbar-keys kbd {
    font-family: inherit;
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    padding: 0.05rem 0.3rem;
    border: 1px solid var(--wk-line);
    border-radius: 3px;
    background: var(--wk-surface-alt);
    color: var(--wk-text-mute);
  }

  .selbar-count {
    font-weight: 700;
    color: var(--color-primary);
  }

  .selbar-text {
    color: var(--wk-text-mute);
  }

  .selbar-sep {
    width: 1px;
    height: 16px;
    background: var(--wk-line);
  }

  .selbar-btn {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.55rem;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--wk-text);
    font-size: var(--wk-fs-xs);
    font-weight: 550;
    cursor: pointer;
  }
  .selbar-btn:hover { background: var(--wk-surface-alt); }

  .selbar-btn-danger { color: var(--color-error); }
  .selbar-btn-danger:hover {
    background: color-mix(in oklab, var(--color-error) 12%, transparent);
  }

  /* Beside the sidebar it refers to, not centred three phases away. Above the
     grid rather than behind it: the block now overlaps real columns, where the
     old centred position happened to sit on empty space. */
  .empty-hint {
    position: absolute;
    z-index: 5;
    /* Anchored to the wrapper, not the scroller: inside the scroller it moved
       with the grid and slid up under the sticky day headers. */
    top: 7.5rem;
    left: calc(var(--wk-axis-w) + 1.25rem);
    color: var(--wk-text-faint);
    font-size: var(--wk-fs-sm);
    line-height: 1.5;
    padding: 1.1rem 1.35rem;
    background: var(--wk-surface);
    box-shadow: var(--wk-shadow-2);
    border-radius: var(--wk-r-md);
    border: 1.5px dashed var(--wk-line-strong);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.55rem;
    max-width: 320px;
  }

  .empty-title {
    font-size: var(--wk-fs-md);
    font-weight: 650;
    color: var(--wk-text);
  }

  .empty-cta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.7rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: var(--color-primary);
    color: var(--color-primary-content);
    font-size: var(--wk-fs-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .empty-cta:hover { filter: brightness(1.07); }
  .empty-cta:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  /* Printing the grid is a question of unclipping, not of relayout: every flex
     rule below stays exactly as it is on screen, and only the 100vh cages and
     the scrollers are opened up. Switching .main-area to `display: block` (the
     obvious move) collapses the calendar's width and FullCalendar's absolutely
     positioned events then stack at the top of the page. */
  @media print {
    /* Default sheet; fitGridToPage() replaces it with a grid-sized page box
       whenever the calendar itself is what is being printed. */
    @page {
      size: A4 portrait;
      margin: 10mm;
    }

    .toolbar-wrapper,
    .selbar,
    .marquee,
    .right-dock {
      display: none !important;
    }

    .app-layout,
    .main-area,
    .calendar-wrapper,
    .phase-scroll {
      height: auto !important;
      max-height: none !important;
      min-height: 0 !important;
      overflow: visible !important;
    }

    .phase-scroll {
      display: flex !important;
      align-items: flex-start !important;
    }

  }
</style>
