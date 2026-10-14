<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Toolbar from './components/Toolbar.svelte';
  import WorkDock from './components/WorkDock.svelte';
  import Calendar from './components/Calendar.svelte';
  import Timeline from './components/Timeline.svelte';
  import EventModal from './components/EventModal.svelte';
  import EventPopover from './components/EventPopover.svelte';
  import ConfigPanel from './components/ConfigPanel.svelte';
  import ReportPanel from './components/ReportPanel.svelte';
  import ShortcutsDialog from './components/ShortcutsDialog.svelte';
  import PlaceDialog from './components/PlaceDialog.svelte';
  import PrintDialog from './components/PrintDialog.svelte';
  import type { PrintTarget } from './print/boxes';
  import Toasts from './components/Toasts.svelte';
  import Icon from './components/Icon.svelte';
  import {
    getState, getIssueCount, getConflicts, updateEvents, removeEvents, duplicateEvents,
    loadSampleData,
  } from './state/store.svelte';
  import { isPristineState } from './state/persistence';
  import {
    getQuickEdit, openQuickEdit, closeQuickEdit, getSelectedEventId, getSelectedEventIds, setSelection,
    clearSelection, getDensity, slotHeight, suppressNextDateClick,
    getPlaceRequest, clearPlaceRequest, getConfigRequest, clearConfigRequest, requestConfig,
    getReportRequest, clearReportRequest,
    isPhaseCollapsed, togglePhaseCollapsed, expandPhase, getReveal, getFlash,
    getMainView, setMainView,
    type ConfigTab,
  } from './state/ui.svelte';
  import {
    phaseGroups, phaseDayCount, addMinutesToTime, timeDiffMinutes, clampGroupDelta, orderedPhases,
    eventInPhase, gridWindow, timeToMinutes, GRID_BUSINESS_START, dayDateLabel, DAY_NAMES,
  } from './utils/timeUtils';
  import { isEditingTarget } from './utils/format';
  import { PRINTABLE_REPORT_TABS, type EventFilter, type ID, type Phase, type ReportTab } from './types';

  let configOpen = $state(false);
  let reportOpen = $state(false);
  let printTarget = $state<PrintTarget | null>(null);
  let shortcutsOpen = $state(false);
  let reportTab = $state<ReportTab>('coverage');
  /** Preselects the report's own teacher/room dropdown when it was asked for. */
  let reportFilterId = $state<ID | null>(null);
  // One dock, two tabs. Probleme is not a second panel any more, so it neither
  // takes a second 40px rail nor floats over the lanes it is talking about.
  let dockOpen = $state(true);
  let dockTab = $state<'subjects' | 'problems'>('subjects');
  let selectedEventId = $state<string | null>(null);
  let filter = $state<EventFilter | null>(null);
  let scroller: HTMLDivElement | undefined = $state();

  /**
   * H2: a density change keeps the *hour*, not the pixel.
   *
   * The calendars are keyed on the density and re-mount, but `.phase-scroll` is
   * ours and survives — so its `scrollTop` was carried across unchanged while
   * the content under it grew or shrank by a third. Scrolled to 10:00 at M and
   * switched to L, you landed at 09:20: the one thing being looked at was the
   * one thing not carried over. The grid's time axis is linear in its own
   * height, so holding the *fraction* holds the hour.
   */
  /** L1: Mo–Fr of the WK week, for the empty-state card. */
  const weekRangeLabel = $derived(
    `${dayDateLabel(getState().wkStartDate, 0)} – ${dayDateLabel(getState().wkStartDate, 4)}`,
  );

  let prevSlotH = slotHeight();
  $effect(() => {
    const h = slotHeight();
    const el = scroller;
    const was = prevSlotH;
    prevSlotH = h;
    if (!el || h === was || was === 0) return;
    const top = el.scrollTop;
    if (top === 0) return;
    // After the re-mounted calendars have laid out at the new row height.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { el.scrollTop = Math.round(top * (h / was)); });
    });
  });
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

  // ─── Collapsed phases ──────────────────────────────────────────────────────
  // A folded phase is drawn as a rail so the rest of the week gets its width.
  // Nothing else changes: the store, the conflict detector, the reports and
  // every printed sheet never learn that a phase is folded.

  /**
   * Only one calendar shows the time gutter, and it has to be the leftmost
   * *open* one — with the KVK folded away, `i > 0` would have hidden the axis on
   * the only grid still drawn and left the week without hour labels.
   */
  const axisPhaseId = $derived(phases.find(p => !isPhaseCollapsed(p.id))?.id ?? null);

  /** What a rail says about what it is hiding. */
  function railStats(phase: Phase): { events: number; problems: number } {
    const state = getState();
    const inPhase = state.events.filter(ev => eventInPhase(state, ev, phase));
    const flagged = new Set(getConflicts().flatMap(c => c.involvedEventIds));
    return {
      events: inPhase.length,
      problems: inPhase.filter(ev => flagged.has(ev.id)).length,
    };
  }

  /**
   * "Show me this one" and "it landed here" both point at a card, and a folded
   * phase draws none — so the phase is unfolded first and the calendar that
   * mounts for it picks the request up itself (both effects there re-run when
   * their component mounts).
   */
  function expandPhaseOf(ids: ID[]): void {
    const state = getState();
    for (const id of ids) {
      const ev = state.events.find(e => e.id === id);
      if (!ev) continue;
      for (const phase of state.phases) {
        if (eventInPhase(state, ev, phase)) expandPhase(phase.id);
      }
    }
  }

  $effect(() => {
    const request = getReveal();
    if (!request) return;
    request.token;
    untrack(() => {
      // "Show me this card" means the planning grid, wherever it was asked
      // from — a Belegung bar or a Probleme row clicked while the timeline is up.
      setMainView('plan');
      expandPhaseOf([request.id]);
    });
  });

  $effect(() => {
    const request = getFlash();
    if (!request) return;
    request.token;
    untrack(() => expandPhaseOf(request.ids));
  });

  // Column count drives each phase's share of the width, so lanes stay the same
  // width across the whole week regardless of how many a phase has.
  function phaseWeight(phase: Phase): number {
    return phaseDayCount(phase) * Math.max(phaseGroups(getState(), phase).length, 1);
  }

  /**
   * The label strip has to sit exactly on the phase boundaries below it, and it
   * cannot get there by repeating the same flex sum: FullCalendar's grid carries
   * a min-content width of its own (nowrap day headers), so a segment ends up
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

  /**
   * Ctrl+P over an open report prints that report. Abdeckung and Abweichungen
   * have no sheet of their own — they are read here and acted on here — so they
   * fall back to the week itself.
   */
  function planTargetFor(tab: ReportTab): PrintTarget {
    return PRINTABLE_REPORT_TABS.includes(tab) ? (tab as PrintTarget) : 'grid';
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

    // The Belegung view is read-only: nudging, deleting or Ctrl+A-ing cards
    // that are not on screen would edit the plan out of sight.
    const overlayOpen =
      selectedEventId !== null || configOpen || reportOpen || shortcutsOpen || printTarget !== null
      || getMainView() === 'timeline';

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
        const grid = gridWindow(state);
        if (shift) {
          // Resize: never below one slot, never past the last drawn one. Each
          // block keeps its own length, so this one really is per-block — a
          // resize is not a rigid move of a set.
          updateEvents(ids, ev => {
            const longest = timeToMinutes(grid.end) - timeToMinutes(ev.startTime);
            const minutes = Math.min(
              Math.max(15, timeDiffMinutes(ev.startTime, ev.endTime) + delta),
              Math.max(15, longest),
            );
            return { endTime: addMinutesToTime(ev.startTime, minutes) };
          }, 'Dauer ändern');
        } else {
          // The same rule the drag path follows (`clampGroupDelta` in
          // Calendar.svelte): the selection moves as one or not at all. Clamping
          // each block on its own let the ones at the edge stop while the rest
          // kept going, silently reshaping the selection under a single undo
          // entry — and, with an explicit Tagesraster, pushed a block outside
          // the drawn hours, where no calendar renders it and the Probleme panel
          // does not list it either.
          const minuteDelta = clampGroupDelta(
            events.flatMap(ev => [timeToMinutes(ev.startTime), timeToMinutes(ev.endTime)]),
            delta,
            timeToMinutes(grid.start),
            timeToMinutes(grid.end),
          );
          if (minuteDelta === 0) break;
          updateEvents(ids, ev => ({
            startTime: addMinutesToTime(ev.startTime, minuteDelta),
            endTime: addMinutesToTime(ev.endTime, minuteDelta),
          }), 'verschieben');
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const step = e.key === 'ArrowLeft' ? -1 : 1;
        // As above: all of them or none. At the edge of the week nothing can
        // move, and an undo entry for a keypress that changed nothing is worse
        // than no feedback.
        const dayDelta = clampGroupDelta(
          events.map(ev => ev.dayIndex), step, 0, DAY_NAMES.length - 1,
        );
        if (dayDelta === 0) break;
        updateEvents(ids, ev => ({ dayIndex: ev.dayIndex + dayDelta }), 'verschieben');
        break;
      }
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        removeEvents(ids);
        clearSelection();
        closeQuickEdit();
        break;
      case 'Enter': {
        // E3: Enter opens what a click opens. It used to reach for the full
        // modal while a click opened the popover — the same card and the same
        // intent, answered differently depending on the input device.
        e.preventDefault();
        const primary = getSelectedEventId();
        if (!primary) break;
        const card = document.querySelector<HTMLElement>(`[data-wk-event-id="${primary}"]`);
        if (!card) {
          // No card on the grid to anchor a popover to — the modal's one job.
          selectedEventId = primary;
          break;
        }
        const rect = card.getBoundingClientRect();
        openQuickEdit(primary, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
        break;
      }
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
    const ids = [...scroller.querySelectorAll<HTMLElement>('.wk-fc-event[data-wk-event-id]')]
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
    for (const el of scroller.querySelectorAll<HTMLElement>('.wk-fc-event[data-wk-event-id]')) {
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
    if (!target || target.closest('.wk-fc-event')) return;

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

  onMount(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (dark: boolean) =>
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    apply(mq.matches);
    mq.addEventListener('change', e => apply(e.matches));

    // The drawn hours leave room above the training day so the fringe stays
    // reachable — open on 08:00 rather than on that empty margin. The offset is
    // measured from the window rather than assumed: it used to be a hardcoded
    // four slots, which was only right while the grid always began at 07:00.
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (!scroller) return;
        const slots = Math.max(
          0,
          (timeToMinutes(GRID_BUSINESS_START) - timeToMinutes(gridWindow(getState()).start)) / 15,
        );
        scroller.scrollTop = slots * slotHeight();
      }, 60);
    });

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
      onshowissues={() => { dockTab = 'problems'; dockOpen = true; }}
      onshowshortcuts={() => (shortcutsOpen = true)}
    />
  </div>

  <div class="main-area">
    <WorkDock
      bind:open={dockOpen}
      bind:tab={dockTab}
      bind:selectedEventId
      issueCount={conflictCount}
    />

    <!-- Hidden rather than unmounted while the Belegung is up: the grid keeps
         its scroll position, its folded phases and its two FullCalendar
         instances, and a click on a bar comes back to it without a rebuild. -->
    <div
      class="calendar-wrapper"
      class:calendar-wrapper--hidden={getMainView() === 'timeline'}
      bind:this={calendarWrapper}
    >
      <div class="phase-labels">
        {#each phases as phase, i (phase.id)}
          {@const collapsed = isPhaseCollapsed(phase.id)}
          <!-- The strip is where a phase is folded and unfolded: it is the one
               element that already names the phase and spans exactly what would
               disappear. -->
          <button
            class="phase-label wk-eyebrow"
            class:phase-label--noaxis={phase.id !== axisPhaseId && !collapsed}
            class:phase-label--collapsed={collapsed}
            style={labelWidths[i] !== undefined
              ? `flex: 0 0 ${labelWidths[i]}px`
              : collapsed ? 'flex: 0 0 var(--wk-phase-rail-w)' : `flex-grow: ${phaseWeight(phase)}`}
            aria-expanded={!collapsed}
            title="Phase {phase.label} {collapsed ? 'ausklappen' : 'einklappen'}"
            onclick={() => togglePhaseCollapsed(phase.id)}
          >
            <!-- Points the way the phase is about to move, the same way the
                 side panels' toggles do: ‹ folds it away, › brings it back. -->
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={12} class="phase-chevron" />
            {#if !collapsed}<span class="phase-label-text">{phase.label}</span>{/if}
          </button>
        {/each}
      </div>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="phase-scroll" bind:this={scroller} onpointerdown={onScrollerPointerDown}>
        <!-- Keyed on the density: FullCalendar v6 measured one slot row at
             render and stretched the rows back out to that height, so a shrink
             only took effect on a fresh instance. v7 sizes rows from the axis
             label and likely re-measures live; the key stays until that is
             verified here. -->
        <!-- Keyed on the axis owner too: which grid draws the time gutter is a
             render-time measurement in FullCalendar, so handing it to another
             phase means building that calendar again. -->
        {#key `${getDensity()}|${axisPhaseId}`}
          {#each phases as phase (phase.id)}
            {@const collapsed = isPhaseCollapsed(phase.id)}
            <div
              class="phase-seg"
              class:phase-seg--noaxis={phase.id !== axisPhaseId && !collapsed}
              class:phase-seg--collapsed={collapsed}
              style={collapsed ? '' : `flex-grow: ${phaseWeight(phase)}`}
            >
              {#if collapsed}
                {@const stats = railStats(phase)}
                <button
                  class="phase-rail"
                  title="Phase {phase.label} ausklappen — {stats.events} {stats.events === 1 ? 'Lektion' : 'Lektionen'} geplant"
                  onclick={() => togglePhaseCollapsed(phase.id)}
                >
                  <!-- The rail is the whole reassurance that nothing was
                       deleted: the plan is untouched underneath, so it says how
                       much of it is folded away — and keeps the problem count
                       visible, because a conflict in here still counts. -->
                  {#if stats.problems > 0}
                    <span class="rail-badge">{stats.problems}</span>
                  {/if}
                  <span class="rail-name">{phase.label}</span>
                  <span class="rail-count wk-num">{stats.events}</span>
                </button>
              {:else}
                <Calendar bind:selectedEventId {phase} {filter} />
              {/if}
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
            <div class="empty-title">Dieser Plan ist noch leer</div>
            <!-- «Erstes Thema anlegen» was one step of three presented as the
                 whole job: a Thema picks its Vorgaben from the Ausbildner and
                 Räume that do not exist yet, and nothing said so. Einrichtung
                 is the screen that names all three and their order. -->
            <div>Ausbildner, Räume und Themen werden einmal erfasst — danach wird geplant.</div>
            <button class="empty-cta" onclick={() => requestConfig('setup')}>
              <Icon name="settings" size={14} /> Einrichtung öffnen
            </button>
            {#if isPristineState(getState())}
              <button class="empty-cta empty-cta--secondary" onclick={loadSampleData}>
                <Icon name="calendar" size={14} /> oder Beispieldaten laden
              </button>
            {/if}
          {/if}

          <!-- L1: which week is this?
               Pass 3 moved the week control into Konfiguration › Plan & Daten,
               rightly: it is set once per WK and read never, because the column
               headers print it. But *set once* means set at the start, and this
               card is the one screen that knows it is the start — so the plan
               sat on whatever Monday `createDefaultState` picked until someone
               found the sixth tab. -->
          <button class="empty-week" onclick={() => requestConfig('plan')}>
            WK-Woche: <span class="wk-num">{weekRangeLabel}</span> · ändern
          </button>
        </div>
      {/if}
    </div>

    {#if getMainView() === 'timeline'}
      <Timeline {filter} />
    {/if}
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
    <button class="selbar-btn" onclick={clearSelection}>Auswahl aufheben</button>
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
  <EventPopover quick={quickEdit} />
{/if}

<!-- E1: the modal is no longer the "full" editor beside a "quick" one — the
     popover holds every field. It is what opens for a Lektion with no card on
     the grid to anchor a popover to: an orphan outside every Phase, opened from
     the Probleme panel. -->
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

<!-- Only ever seen on paper, and only through the browser's own File > Print:
     Ctrl/Cmd+P is intercepted and opens the Drucken dialog instead. -->
<div class="print-notice">
  <h1>Dieser Plan wird nicht aus dem Browser gedruckt.</h1>
  <p>
    Im WK-Planer auf <strong>Drucken</strong> klicken — oder
    <strong>Ctrl/Cmd + P</strong>. Dort entstehen <strong>Arbeitsprogramm</strong> und
    <strong>Handzettel</strong> als PDF, mit Schnittmarken, Phasenauswahl,
    Ausrichtung und Vorschau.
  </p>
  <p>Diese Seite ist nur ein Hinweis und enthält keine Planungsdaten.</p>
</div>

<Toasts />

<style>
  /* L1 */
  .empty-week {
    margin-top: 0.35rem;
    align-self: flex-start;
    background: none;
    border: none;
    padding: 2px 0;
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--wk-line-strong);
    text-underline-offset: 3px;
  }
  .empty-week:hover { color: var(--wk-text); }

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
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .calendar-wrapper--hidden {
    display: none;
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
    display: flex;
    align-items: center;
    gap: 0.35rem;
    /* A band, not a row. It carries one word per phase and used to spend 36px
       of the app's scarcest dimension on it — a slot and a half of grid.

       `font: inherit` used to sit here, *after* the other font declarations, and
       it is a shorthand: it reset the `.wk-eyebrow` on this very element back to
       inherited 16px/1.5 body text. The strip was 36px tall because it was
       rendering at a size nobody had chosen. The button now takes the eyebrow it
       asks for, one step up for presence — these are the only labels the phases
       get on the main screen. */
    padding: 0.2rem 0.6rem;
    border: 0;
    border-left: 2px solid var(--wk-line-strong);
    background: transparent;
    font-family: inherit;
    font-size: var(--wk-fs-xs);
    font-weight: 700;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
  }

  .phase-label:hover {
    background: var(--wk-surface);
    color: var(--wk-text);
  }

  .phase-label-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The icon is a 12px box on the text's own centre line, which the glyphs it
     replaced were not: ⌄ sat below the cap height of an uppercase label. */
  .phase-label :global(.phase-chevron) {
    flex-shrink: 0;
    color: var(--wk-text-faint);
  }

  .phase-label:hover :global(.phase-chevron) {
    color: var(--wk-text);
  }

  .phase-label--collapsed {
    justify-content: center;
    padding: 0.2rem 0;
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

  /* ── Folded phase ───────────────────────────────────────────────────────── */
  /* `align-self: stretch` rather than a height: the scroller lays its segments
     out along one flex line, so the rail takes the height of the tallest of
     them — the grid next to it — and runs the full length of the week. */
  .phase-seg--collapsed {
    flex: 0 0 var(--wk-phase-rail-w);
    align-self: stretch;
    /* Fills the viewport even when *every* phase is folded, where there is no
       grid left for the flex line to take its height from. */
    min-height: 100%;
    background: var(--wk-surface-alt);
  }

  .phase-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    height: 100%;
    padding: 0.7rem 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--wk-text-mute);
  }

  .phase-rail:hover {
    background: var(--wk-surface);
    color: var(--wk-text);
  }

  .rail-name {
    writing-mode: vertical-rl;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .rail-count {
    writing-mode: vertical-rl;
    font-size: 0.62rem;
    color: var(--wk-text-faint);
  }

  .rail-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 700;
    background: var(--color-error);
    color: white;
    flex-shrink: 0;
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

  .empty-cta--secondary {
    background: transparent;
    color: var(--wk-text-mute);
    border: 1.5px solid var(--wk-line-strong);
  }
  .empty-cta--secondary:hover { filter: none; background: var(--wk-surface-alt); }

  /* The app itself prints nothing any more. Arbeitsprogramm and Handzettel are
     drawn as PDFs in src/print/ and previewed in the Drucken dialog, which is
     what Ctrl/Cmd+P opens — so there is no second, worse print layout of the
     DOM to keep in step with them. Only the browser's own File > Print still
     lands here, and it gets a note saying where the real thing is rather than a
     wasted sheet of app chrome. */
  .print-notice { display: none; }

  @media print {
    @page {
      size: A4 portrait;
      margin: 18mm;
    }

    .app-layout { display: none !important; }

    /* The overlays live outside .app-layout, and any of them can be open when
       the browser's print is triggered. */
    :global(.report-overlay),
    :global(.toast-stack),
    :global(dialog) {
      display: none !important;
    }

    .print-notice {
      display: block;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      color: #000;
      max-width: 46em;
    }

    .print-notice h1 {
      font-size: 15pt;
      font-weight: 700;
      margin: 0 0 0.7em;
    }

    .print-notice p {
      font-size: 11pt;
      line-height: 1.55;
      margin: 0 0 0.6em;
    }
  }

</style>
