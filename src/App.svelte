<script lang="ts">
  import { onMount } from 'svelte';
  import { nanoid } from 'nanoid';
  import Toolbar from './components/Toolbar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Calendar from './components/Calendar.svelte';
  import ConflictPanel from './components/ConflictPanel.svelte';
  import EventModal from './components/EventModal.svelte';
  import EventPopover from './components/EventPopover.svelte';
  import ConfigPanel from './components/ConfigPanel.svelte';
  import SidePanel from './components/SidePanel.svelte';
  import ReportPanel from './components/ReportPanel.svelte';
  import Toasts from './components/Toasts.svelte';
  import Icon from './components/Icon.svelte';
  import {
    getState, getIssueCount, updateEvent, removeEvent, addEvent,
  } from './state/store.svelte';
  import {
    getQuickEdit, closeQuickEdit, getSelectedEventId, selectEvent, getDensity, slotHeight,
  } from './state/ui.svelte';
  import { phaseGroups, phaseDayCount, addMinutesToTime, timeDiffMinutes } from './utils/timeUtils';
  import type { EventFilter, Phase, ReportTab } from './types';

  let configOpen = $state(false);
  let reportOpen = $state(false);
  let reportTab = $state<ReportTab>('coverage');
  let sidebarOpen = $state(true);
  let conflictsOpen = $state(true);
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
  const quickEdit = $derived(getQuickEdit());

  // Stored order is insertion order; the week has to read left to right.
  const orderedPhases = $derived(
    [...getState().phases].sort((a, b) => a.startDay - b.startDay),
  );

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
    orderedPhases.length;
    getDensity();
    if (!scroller) return;

    const observer = new ResizeObserver(syncPhaseLabels);
    observer.observe(scroller);
    for (const seg of scroller.querySelectorAll('.phase-seg')) observer.observe(seg);
    syncPhaseLabels();
    return () => observer.disconnect();
  });

  function openReport(tab: ReportTab): void {
    reportTab = tab;
    reportOpen = true;
  }

  // ─── Keyboard editing on the grid ──────────────────────────────────────────
  // The selected card can be nudged without reaching for the mouse: this is the
  // fastest way to close a gap left by a break, and it works on the phase the
  // event already lives in.
  function isEditing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el?.tagName) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
  }

  function handleGridKeys(e: KeyboardEvent): void {
    if (isEditing(e.target)) return;

    if (e.key === 'Escape') {
      closeQuickEdit();
      selectEvent(null);
      return;
    }

    const id = getSelectedEventId();
    if (!id || selectedEventId !== null || configOpen || reportOpen) return;
    const ev = getState().events.find(x => x.id === id);
    if (!ev) return;

    const minutes = timeDiffMinutes(ev.startTime, ev.endTime);
    const shift = e.shiftKey;

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? -15 : 15;
        if (shift) {
          // Resize: never below one slot.
          const next = Math.max(15, minutes + delta);
          updateEvent(id, { endTime: addMinutesToTime(ev.startTime, next) }, 'resizing');
        } else {
          const start = addMinutesToTime(ev.startTime, delta);
          updateEvent(id, { startTime: start, endTime: addMinutesToTime(start, minutes) }, 'moving');
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const dayIndex = Math.min(4, Math.max(0, ev.dayIndex + (e.key === 'ArrowLeft' ? -1 : 1)));
        if (dayIndex !== ev.dayIndex) updateEvent(id, { dayIndex }, 'moving');
        break;
      }
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        removeEvent(id);
        selectEvent(null);
        closeQuickEdit();
        break;
      case 'Enter':
        e.preventDefault();
        closeQuickEdit();
        selectedEventId = id;
        break;
      case 'd':
      case 'D':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          const { conflicts: _omit, ...copy } = ev;
          addEvent({ ...copy, id: nanoid() }, 'duplicating');
        }
        break;
    }
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
    <Toolbar bind:configOpen bind:filter onreport={openReport} />
  </div>

  <div class="main-area">
    <SidePanel side="left" bind:open={sidebarOpen} label="Subjects" width="208px">
      <Sidebar />
    </SidePanel>

    <div class="calendar-wrapper" bind:this={calendarWrapper}>
      <div class="phase-labels">
        {#each orderedPhases as phase, i (phase.id)}
          <div
            class="phase-label wk-eyebrow"
            class:phase-label--noaxis={i > 0}
            style={labelWidths[i] !== undefined
              ? `flex: 0 0 ${labelWidths[i]}px`
              : `flex-grow: ${phaseWeight(phase)}`}
          >{phase.label}</div>
        {/each}
      </div>

      <div class="phase-scroll" bind:this={scroller}>
        <!-- Keyed on the density: FullCalendar measures one slot row at render
             and sizes the grid from it, then stretches the rows back out to that
             height, so a shrink only takes effect on a fresh instance. -->
        {#key getDensity()}
          {#each orderedPhases as phase, i (phase.id)}
            <div
              class="phase-seg"
              class:phase-seg--noaxis={i > 0}
              style="flex-grow: {phaseWeight(phase)}"
            >
              <Calendar bind:selectedEventId {phase} {filter} />
            </div>
          {/each}
        {/key}

        {#if !hasEvents}
          <div class="empty-hint" aria-hidden="true">
            <Icon name="arrowLeft" size={20} />
            <div>Drag a subject from the sidebar onto the calendar, or click an empty slot.</div>
          </div>
        {/if}
      </div>
    </div>

    <SidePanel side="right" bind:open={conflictsOpen} label="Conflicts" width="268px" badge={conflictCount}>
      <ConflictPanel bind:selectedEventId />
    </SidePanel>
  </div>
</div>

{#if quickEdit && selectedEventId === null}
  <EventPopover
    quick={quickEdit}
    onedit={(id) => { closeQuickEdit(); selectedEventId = id; }}
  />
{/if}

{#if selectedEventId}
  <EventModal eventId={selectedEventId} onclose={() => (selectedEventId = null)} />
{/if}

{#if configOpen}
  <ConfigPanel onclose={() => (configOpen = false)} />
{/if}

{#if reportOpen}
  <ReportPanel tab={reportTab} onclose={() => (reportOpen = false)} />
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

  .calendar-wrapper {
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

  .empty-hint {
    position: absolute;
    top: 34%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    text-align: center;
    color: var(--wk-text-faint);
    font-size: var(--wk-fs-sm);
    padding: 1.25rem 1.75rem;
    background: color-mix(in oklab, var(--color-base-100) 92%, transparent);
    border-radius: var(--wk-r-md);
    border: 1.5px dashed var(--wk-line);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    max-width: 300px;
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

    .toolbar-wrapper {
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
