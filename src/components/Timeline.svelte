<script lang="ts">
  /**
   * Belegung: the WK week as one row per Ausbildner and one per Raum.
   *
   * Read-only on purpose. It exists to spot double-bookings and free time, and
   * every edit already has a home on the planning grid — so a click here goes
   * *there*, to the card, rather than growing a second set of editing gestures
   * on a view whose rows are people and rooms instead of lanes.
   */
  import { onMount, untrack } from 'svelte';
  import { Calendar, type EventClickInfo } from 'fullcalendar';
  import deLocale from 'fullcalendar/locales/de';
  import classicThemePlugin from 'fullcalendar/themes/classic';
  import resourceTimelinePlugin from 'fullcalendar-scheduler/resource-timeline';
  import { getState } from '../state/store.svelte';
  import {
    getHighlightedEventIds, getSelectedEventId, getSelectedEventIds, revealEvent, setMainView,
    timelineHourWidth,
  } from '../state/ui.svelte';
  import {
    DAY_NAMES, GRID_BUSINESS_END, GRID_BUSINESS_START, dayDate, extractDayIndex, gridWindow,
  } from '../utils/timeUtils';
  import {
    buildAvailabilityBackground, buildTimelineEvents, timelineDays, timelineNeighbour,
    timelineResources, timelineTooltip, type TimelineBarBox, type TimelineBarProps,
    type TimelineDirection, type TimelineRowProps,
  } from '../utils/timeline';
  import { timelineBar, timelineRowLabel } from '../utils/timelineContent';
  import type { EventFilter, ID } from '../types';
  import '../styles/timeline.css';

  interface Props {
    filter?: EventFilter | null;
  }

  let { filter = null }: Props = $props();

  let calendarEl: HTMLDivElement;
  let calendar: Calendar | undefined;

  const gridHours = $derived(gridWindow(getState()));
  const days = $derived(timelineDays(getState()));

  /** "Mi 16.9." — the weekday the rest of the app uses, not FC's "Mi., 16.". */
  function dayLabel(date: Date): string {
    return `${DAY_NAMES[extractDayIndex(date)] ?? ''} ${date.getDate()}.${date.getMonth() + 1}.`;
  }

  /** The first slot of each day carries the rule that separates the days. */
  function isDayStart(date: Date | undefined): boolean {
    if (!date) return false;
    const [h, m] = gridHours.start.split(':').map(Number);
    return date.getHours() === h && date.getMinutes() === m;
  }

  function handleEventClick(info: EventClickInfo): void {
    const id = info.event.extendedProps['eventId'] as ID | undefined;
    if (!id) return;
    // Back to the grid, where the card can be edited, with it scrolled into
    // view and flashed — the same "Im Kalender zeigen" the Probleme panel does.
    setMainView('plan');
    revealEvent(id);
  }

  /**
   * Selection and the Probleme panel's hover pulse, mirrored onto the bars.
   * Snapshotted for `eventClass` to read rather than toggled with `classList`:
   * v7 rewrites a bar's whole `className` whenever its own classes change, so
   * a class added from outside is gone on the next render.
   */
  let paint: { selected: Set<ID>; highlighted: Set<ID> } = {
    selected: new Set(), highlighted: new Set(),
  };

  function paintStates(): void {
    if (!calendar) return;
    paint = {
      selected: new Set(getSelectedEventIds()),
      highlighted: new Set(getHighlightedEventIds()),
    };
    calendar.render();
    paintTabStop();
  }

  // ─── One tab stop ───────────────────────────────────────────────────────────

  /**
   * The bar that holds the timeline's single tab stop, by FC event id
   * (`<eventId>@<rowId>`): the last one focused, so Tab comes back to it.
   */
  let rovingKey: string | null = null;

  function barElement(key: string): HTMLElement | null {
    return calendarEl?.querySelector<HTMLElement>(
      `.wk-tl-ev[data-wk-bar-key="${CSS.escape(key)}"]`,
    ) ?? null;
  }

  /** Every bar with its row and time, in the order the rows are drawn. */
  function barBoxes(): TimelineBarBox[] {
    if (!calendar) return [];
    const rowIndex = new Map(timelineResources(getState()).map((r, i) => [r.id, i]));
    const out: TimelineBarBox[] = [];
    for (const ev of calendar.getEvents()) {
      if (ev.display === 'background' || !ev.start || !ev.end) continue;
      const row = rowIndex.get(ev.getResources()[0]?.id ?? '');
      if (row === undefined) continue;
      out.push({ key: ev.id, row, start: ev.start.getTime(), end: ev.end.getTime() });
    }
    return out.sort((a, b) => a.row - b.row || a.start - b.start);
  }

  /**
   * The grid's K2, here too: FullCalendar gives every bar `tabindex="0"`, and
   * a week of Lektionen in four rows each put a few hundred stops between the
   * toolbar and the dock. One bar is tabbable — the last one focused, else the
   * selected Lektion's first bar, else the first bar of the top row — and the
   * arrow keys move between them. Re-applied after every refetch, because each
   * remounted bar comes back with FC's own `tabindex="0"`.
   */
  function paintTabStop(): void {
    if (!calendarEl) return;
    const bars = calendarEl.querySelectorAll<HTMLElement>('.wk-tl-ev');
    for (const el of bars) el.tabIndex = -1;
    let roving = rovingKey !== null ? barElement(rovingKey) : null;
    if (!roving) {
      const primary = getSelectedEventId();
      const boxes = barBoxes();
      const pick = boxes.find(b => primary !== null && b.key.startsWith(`${primary}@`)) ?? boxes[0];
      roving = pick ? barElement(pick.key) : null;
    }
    roving?.setAttribute('tabindex', '0');
  }

  const ARROWS: Record<string, TimelineDirection> = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  };

  function handleKeydown(e: KeyboardEvent): void {
    const dir = ARROWS[e.key];
    const el = (e.target as HTMLElement).closest<HTMLElement>('.wk-tl-ev');
    const key = el?.dataset['wkBarKey'];
    if (!dir || !key || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    // Also keeps the arrows from scrolling the timeline under the focus.
    e.preventDefault();
    const next = timelineNeighbour(barBoxes(), key, dir);
    const target = next !== null ? barElement(next) : null;
    if (!target) return;
    el.tabIndex = -1;
    target.tabIndex = 0;
    rovingKey = next;
    target.focus();
  }

  function handleFocusIn(e: FocusEvent): void {
    const key = (e.target as HTMLElement).closest<HTMLElement>('.wk-tl-ev')?.dataset['wkBarKey'];
    if (!key || key === rovingKey) return;
    rovingKey = key;
    paintTabStop();
  }

  onMount(() => {
    const cal = new Calendar(calendarEl, {
      plugins: [classicThemePlugin, resourceTimelinePlugin],
      schedulerLicenseKey: 'AGPL-My-Frontend-And-Backend-Are-Open-Source',
      initialView: 'resourceTimeline',
      initialDate: dayDate(getState().wkStartDate, days.startDay),
      duration: { days: days.dayCount },
      locale: deLocale,
      headerToolbar: false,
      // Fills the main area and scrolls its own rows, so the time header stays.
      height: '100%',
      tableHeaderSticky: true,

      // The grid's own window, per day: the night is simply not drawn.
      slotMinTime: `${gridHours.start}:00`,
      slotMaxTime: `${gridHours.end}:00`,
      slotDuration: '01:00:00',
      slotHeaderInterval: '01:00:00',
      // Kompakt is about 1300px for a five-day week, so it fits beside the dock
      // without a horizontal scrollbar; wider screens stretch the slots. The
      // wider zoom steps scroll inside FC's own time area, the row labels fixed.
      slotMinWidth: timelineHourWidth(),
      // FC widens a short event to a minimum width, and in a row of people that
      // reads as a clash: a 15-minute Pause pushed into the next Lektion stacks
      // the two as if they overlapped. Here the geometry *is* the information.
      eventMinWidth: 1,
      slotHeaderAlign: (info) => (info.isTime ? 'center' : 'start'),
      slotHeaderContent(info) {
        if (!info.date) return info.text;
        return info.isTime ? String(info.date.getHours()) : dayLabel(info.date);
      },
      businessHours: {
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: GRID_BUSINESS_START,
        endTime: GRID_BUSINESS_END,
      },
      nowIndicator: false,

      editable: false,
      selectable: false,
      eventClick: handleEventClick,

      resourceGroupField: 'section',
      resourceOrder: 'order',
      resourceColumnsWidth: 196,
      resourceColumns: [{
        field: 'title',
        headerContent: 'Ausbildner / Raum',
        cellContent(info) {
          const props = info.resource?.extendedProps as TimelineRowProps | undefined;
          if (!info.resource || !props) return '';
          return timelineRowLabel(info.resource.title, props);
        },
      }],

      resources(_info, success) {
        success(timelineResources(getState()));
      },
      events(_info, success) {
        const state = getState();
        success([...buildTimelineEvents(state, filter), ...buildAvailabilityBackground(state)]);
      },

      // v7's class names are hashed; everything styled here gets a `wk-tl-*`
      // hook instead (see timeline.css).
      viewClass: 'wk-tl',
      resourceColumnHeaderClass: 'wk-tl-colhead',
      resourceCellClass: (info) => {
        const props = info.resource?.extendedProps as TimelineRowProps | undefined;
        return props?.shared ? 'wk-tl-cell wk-tl-cell-shared' : 'wk-tl-cell';
      },
      resourceCellInnerClass: 'wk-tl-cell-inner',
      resourceGroupHeaderClass: 'wk-tl-grouphead',
      resourceGroupLaneClass: 'wk-tl-grouplane',
      resourceLaneClass: (info) => {
        const props = info.resource.extendedProps as TimelineRowProps | undefined;
        return props?.shared ? 'wk-tl-lane wk-tl-lane-shared' : 'wk-tl-lane';
      },
      slotHeaderClass: (info) => [
        'wk-tl-slothead',
        info.isTime ? 'wk-tl-slothead-time' : 'wk-tl-slothead-day',
        info.isTime && isDayStart(info.date) && 'wk-tl-daystart',
      ].filter(Boolean).join(' '),
      slotHeaderInnerClass: 'wk-tl-slothead-inner',
      slotLaneClass: (info) => (isDayStart(info.date) ? 'wk-tl-slot wk-tl-daystart' : 'wk-tl-slot'),
      eventClass: (info) => {
        if (info.event.display === 'background') return 'wk-tl-away';
        const props = info.event.extendedProps as TimelineBarProps;
        return [
          'wk-tl-ev',
          props.conflictHere === 'hard' && 'wk-tl-ev-hard',
          props.conflictHere === 'soft' && 'wk-tl-ev-soft',
          paint.selected.has(props.eventId) && 'wk-tl-selected',
          paint.highlighted.has(props.eventId) && 'wk-tl-flash',
        ].filter(Boolean).join(' ');
      },
      eventInnerClass: 'wk-tl-ev-inner',
      eventContent(info) {
        if (info.event.display === 'background') return '';
        return timelineBar(info.event.extendedProps as TimelineBarProps);
      },
      eventDidMount(info) {
        if (info.event.display === 'background') {
          const kind = info.event.extendedProps['availability'] as string;
          const note = info.event.extendedProps['note'] as string;
          info.el.title = note ? `${kind} (${note})` : kind;
          return;
        }
        const props = info.event.extendedProps as TimelineBarProps;
        info.el.dataset['wkEventId'] = props.eventId;
        info.el.dataset['wkBarKey'] = info.event.id;
        // Mounted with FC's `tabindex="0"`; only the roving bar keeps it.
        info.el.tabIndex = info.event.id === rovingKey ? 0 : -1;
        const ev = getState().events.find(e => e.id === props.eventId);
        const text = ev ? timelineTooltip(getState(), ev) : info.event.title;
        info.el.title = `${text} — im Kalender zeigen`;
        info.el.setAttribute('aria-label', `${text}. Im Kalender zeigen`);
      },
    });
    cal.render();
    calendar = cal;
    requestAnimationFrame(paintStates);

    calendarEl.addEventListener('keydown', handleKeydown);
    calendarEl.addEventListener('focusin', handleFocusIn);

    return () => {
      calendarEl.removeEventListener('keydown', handleKeydown);
      calendarEl.removeEventListener('focusin', handleFocusIn);
      cal.destroy();
      calendar = undefined;
    };
  });

  // Every store change — an edit, an undo, a colour — redraws the rows and
  // bars; the conflicts arrive already attached to the events.
  $effect(() => {
    const state = getState();
    const { start, end } = gridHours;
    const { startDay, dayCount } = days;
    filter; // tracked so changing the filter re-runs the event source
    if (!calendar) return;
    // The refetch remounts every bar, and the focused one goes with it: an
    // undo pressed on a bar dropped the focus to <body>. Put it back on the
    // tab stop, which `rovingKey` has kept on the same bar if it still exists.
    const hadFocus = calendarEl.contains(document.activeElement);
    calendar.setOption('slotMinTime', `${start}:00`);
    calendar.setOption('slotMaxTime', `${end}:00`);
    calendar.setOption('duration', { days: dayCount });
    calendar.gotoDate(dayDate(state.wkStartDate, startDay));
    calendar.refetchResources();
    calendar.refetchEvents();
    requestAnimationFrame(() => {
      paintStates();
      if (hadFocus && !calendarEl.contains(document.activeElement)) refocusTabStop();
    });
  });

  /**
   * v7 mounts a bar `visibility: hidden` until it has measured where it goes,
   * and a hidden element refuses focus — so the refocus after a refetch waits
   * a few frames for the bar to be shown.
   */
  function refocusTabStop(frames = 10): void {
    const el = calendarEl?.querySelector<HTMLElement>('.wk-tl-ev[tabindex="0"]');
    // Never pull the focus back from somewhere the user has since gone.
    if (!el || (document.activeElement !== document.body && document.activeElement !== null)) return;
    el.focus({ preventScroll: true });
    if (document.activeElement !== el && frames > 0) {
      requestAnimationFrame(() => refocusTabStop(frames - 1));
    }
  }

  $effect(() => {
    getSelectedEventIds();
    getHighlightedEventIds();
    // Only the two lists above are what this repaints for; the tab stop reads
    // the store too, and must not make every edit run it twice.
    untrack(paintStates);
  });

  /**
   * Zoom keeps the time at the left edge, the timeline's H2: the time area's
   * scroll offset is carried over as a fraction of its width, which is linear
   * in the hour width.
   */
  $effect(() => {
    const width = timelineHourWidth();
    if (!calendar || !calendarEl) return;
    const scrolled = [...calendarEl.querySelectorAll<HTMLElement>('*')]
      .filter(el => el.scrollLeft > 0)
      .map(el => ({ el, frac: el.scrollLeft / el.scrollWidth }));
    calendar.setOption('slotMinWidth', width);
    requestAnimationFrame(() => {
      for (const { el, frac } of scrolled) el.scrollLeft = Math.round(frac * el.scrollWidth);
      paintTabStop();
    });
  });
</script>

<div class="timeline-wrap">
  <div bind:this={calendarEl} class="timeline-mount wk-tl-cal"></div>
</div>

<style>
  .timeline-wrap {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0;
  }

  .timeline-mount {
    flex: 1;
    min-height: 0;
  }
</style>
