<script lang="ts">
  /**
   * Belegung: the WK week as one row per Ausbildner and one per Raum.
   *
   * Read-only on purpose. It exists to spot double-bookings and free time, and
   * every edit already has a home on the planning grid — so a click here goes
   * *there*, to the card, rather than growing a second set of editing gestures
   * on a view whose rows are people and rooms instead of lanes.
   */
  import { onMount } from 'svelte';
  import { Calendar, type EventClickInfo } from 'fullcalendar';
  import deLocale from 'fullcalendar/locales/de';
  import classicThemePlugin from 'fullcalendar/themes/classic';
  import resourceTimelinePlugin from 'fullcalendar-scheduler/resource-timeline';
  import { getState } from '../state/store.svelte';
  import {
    getHighlightedEventIds, getSelectedEventIds, revealEvent, setMainView,
  } from '../state/ui.svelte';
  import {
    DAY_NAMES, GRID_BUSINESS_END, GRID_BUSINESS_START, dayDate, extractDayIndex, gridWindow,
  } from '../utils/timeUtils';
  import {
    buildAvailabilityBackground, buildTimelineEvents, timelineDays, timelineResources,
    timelineTooltip, type TimelineBarProps, type TimelineRowProps,
  } from '../utils/timeline';
  import { escapeHtml } from '../utils/format';
  import { getContrastColor } from '../utils/colorUtils';
  import { iconSvg } from '../utils/icons';
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

  /** Selection and the Probleme panel's hover pulse, mirrored onto the bars. */
  function paintStates(): void {
    if (!calendarEl) return;
    const selected = new Set(getSelectedEventIds());
    const highlighted = new Set(getHighlightedEventIds());
    for (const el of calendarEl.querySelectorAll<HTMLElement>('.wk-tl-ev')) {
      const id = el.dataset['wkEventId'];
      el.classList.toggle('wk-tl-selected', id !== undefined && selected.has(id));
      el.classList.toggle('wk-tl-flash', id !== undefined && highlighted.has(id));
    }
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
      // About 1300px for a five-day week at hourly slots, so it fits beside the
      // dock without a horizontal scrollbar; wider screens stretch the slots.
      slotMinWidth: 20,
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
          const name = escapeHtml(info.resource.title);
          const color = escapeHtml(props.color);
          // An Ausbildner gets the avatar the cards carry; a Raum the room-code
          // pill. Same two marks as everywhere else in the app.
          const mark = props.kind === 'teacher'
            ? `<span class="wk-tl-av" style="background:${color};color:${getContrastColor(props.color)}">${escapeHtml(props.short)}</span>`
            : `<span class="wk-tl-room" style="--room:${color}">${escapeHtml(props.short)}</span>`;
          const shared = props.shared
            ? `<span class="wk-tl-shared" title="Vom Konfliktcheck ausgenommen — mehrere Lektionen gleichzeitig sind hier in Ordnung">geteilt</span>`
            : '';
          return { html: `${mark}<span class="wk-tl-name" title="${name}">${name}</span>${shared}` };
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
        ].filter(Boolean).join(' ');
      },
      eventInnerClass: 'wk-tl-ev-inner',
      eventContent(info) {
        if (info.event.display === 'background') return '';
        const props = info.event.extendedProps as TimelineBarProps;
        // A clash in *another* row of the same Lektion, still flagged here so a
        // bar never reads cleaner than the card it stands for.
        const flagLevel = props.conflictHere ?? props.conflictElsewhere;
        const flag = flagLevel
          ? `<span class="wk-tl-flag wk-tl-flag-${flagLevel}">${iconSvg('alert', 10)}</span>`
          : '';
        return {
          html: `${flag}<span class="wk-tl-lanes">${escapeHtml(props.lanes)}</span><span class="wk-tl-subj">${escapeHtml(props.subjectShort)}</span>`,
        };
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
        info.el.style.setProperty('--ev-color', props.color);
        const ev = getState().events.find(e => e.id === props.eventId);
        const text = ev ? timelineTooltip(getState(), ev) : info.event.title;
        info.el.title = `${text} — im Kalender zeigen`;
        info.el.setAttribute('aria-label', `${text}. Im Kalender zeigen`);
      },
    });
    cal.render();
    calendar = cal;
    requestAnimationFrame(paintStates);

    return () => {
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
    calendar.setOption('slotMinTime', `${start}:00`);
    calendar.setOption('slotMaxTime', `${end}:00`);
    calendar.setOption('duration', { days: dayCount });
    calendar.gotoDate(dayDate(state.wkStartDate, startDay));
    calendar.refetchResources();
    calendar.refetchEvents();
    requestAnimationFrame(paintStates);
  });

  $effect(() => {
    getSelectedEventIds();
    getHighlightedEventIds();
    paintStates();
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
