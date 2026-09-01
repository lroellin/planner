<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from './components/Toolbar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Calendar from './components/Calendar.svelte';
  import ConflictPanel from './components/ConflictPanel.svelte';
  import EventModal from './components/EventModal.svelte';
  import ConfigPanel from './components/ConfigPanel.svelte';
  import SidePanel from './components/SidePanel.svelte';
  import ReportPanel from './components/ReportPanel.svelte';
  import { getState } from './state/store.svelte';
  import { detectConflicts } from './conflicts/detector';
  import { phaseGroups, phaseDayCount, orphanEvents } from './utils/timeUtils';
  import type { EventFilter, Phase } from './types';

  let configOpen = $state(false);
  let reportOpen = $state(false);
  let sidebarOpen = $state(true);
  let conflictsOpen = $state(true);
  let selectedEventId = $state<string | null>(null);
  let filter = $state<EventFilter | null>(null);

  // Orphans join the count so a collapsed panel can't hide events that render nowhere.
  const conflictCount = $derived(
    detectConflicts(getState()).length + orphanEvents(getState()).length,
  );
  const hasEvents = $derived(getState().events.length > 0);

  // Stored order is insertion order; the week has to read left to right.
  const orderedPhases = $derived(
    [...getState().phases].sort((a, b) => a.startDay - b.startDay),
  );

  // Column count drives each phase's share of the width, so lanes stay the same
  // width across the whole week regardless of how many a phase has.
  function phaseWeight(phase: Phase): number {
    return phaseDayCount(phase) * Math.max(phaseGroups(getState(), phase).length, 1);
  }

  onMount(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (dark: boolean) =>
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    apply(mq.matches);
    mq.addEventListener('change', e => apply(e.matches));
  });
</script>

<div class="app-layout">
  <div class="toolbar-wrapper">
    <Toolbar bind:configOpen bind:reportOpen bind:filter />
  </div>

  <div class="main-area">
    <SidePanel side="left" bind:open={sidebarOpen} label="Subjects" width="200px">
      <Sidebar />
    </SidePanel>

    <div class="calendar-wrapper">
      <div class="phase-labels">
        {#each orderedPhases as phase (phase.id)}
          <div class="phase-label" style="flex-grow: {phaseWeight(phase)}">{phase.label}</div>
        {/each}
      </div>

      <div class="phase-scroll">
        {#each orderedPhases as phase (phase.id)}
          <div class="phase-seg" style="flex-grow: {phaseWeight(phase)}">
            <Calendar bind:selectedEventId {phase} {filter} />
          </div>
        {/each}

        {#if !hasEvents}
          <div class="empty-hint" aria-hidden="true">
            <div class="empty-icon">⟵</div>
            <div>Drag a subject from the sidebar onto the calendar to schedule it</div>
          </div>
        {/if}
      </div>
    </div>

    <SidePanel side="right" bind:open={conflictsOpen} label="Conflicts" width="260px" badge={conflictCount}>
      <ConflictPanel bind:selectedEventId />
    </SidePanel>
  </div>
</div>

{#if selectedEventId}
  <EventModal eventId={selectedEventId} onclose={() => (selectedEventId = null)} />
{/if}

{#if configOpen}
  <ConfigPanel onclose={() => (configOpen = false)} />
{/if}

{#if reportOpen}
  <ReportPanel onclose={() => (reportOpen = false)} />
{/if}

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
  }

  .phase-label {
    /* Must match .phase-seg's basis so the label boundaries land on the segment
       boundaries below them */
    flex-basis: var(--wk-axis-w);
    min-width: 0;
    padding: 0.3rem 0.6rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: color-mix(in oklab, var(--color-base-content) 50%, transparent);
    border-left: 2px solid var(--wk-line-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

  .phase-seg:first-child {
    border-left: 0;
  }

  /* Every phase keeps its own time axis. Hiding it on the later ones removes a
     cell from FC's column table, which collapsed a lane to 0px and left the
     headers 24px shorter — so the grids no longer lined up. */

  /* Pinned slot height so all phases lay out identical time rows */
  :global(.fc-timegrid-slot) {
    height: 1.5rem !important;
  }

  /* Pinned so it matches .phase-seg's flex-basis above */
  :global(.fc-timegrid-axis),
  :global(.fc-timegrid-slot-label) {
    width: var(--wk-axis-w) !important;
  }

  /* A one-lane phase gives each day a narrow header; letting "Mo. 31.8." wrap
     there made its header a line taller than the wide phase's, offsetting every
     time row between the two grids. */
  :global(.fc-col-header-cell.fc-day) {
    white-space: nowrap;
  }

  :global(.fc) {
    font-family: inherit;
  }

  .empty-hint {
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    text-align: center;
    color: color-mix(in oklab, var(--color-base-content) 40%, transparent);
    font-size: 0.85rem;
    padding: 1.25rem 2rem;
    background: color-mix(in oklab, var(--color-base-100) 92%, transparent);
    border-radius: 10px;
    border: 1.5px dashed var(--wk-line);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    max-width: 280px;
  }

  .empty-icon {
    font-size: 1.4rem;
    opacity: 0.4;
  }

  @media print {
    @page {
      size: A4 landscape;
      margin: 5mm;
    }

    .toolbar-wrapper {
      display: none !important;
    }

    .app-layout,
    .main-area {
      display: block !important;
      height: auto !important;
    }

    .calendar-wrapper {
      width: 100% !important;
    }

    /* Keep the phases side by side and let the full grid print rather than
       clipping to the on-screen scroller */
    .phase-scroll {
      display: flex !important;
      overflow: visible !important;
      height: auto !important;
    }
  }
</style>
