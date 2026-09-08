<script lang="ts">
  import { onMount } from 'svelte';
  import { Calendar, type EventClickArg, type EventDropArg } from '@fullcalendar/core';
  import deLocale from '@fullcalendar/core/locales/de';
  import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
  import interactionPlugin, { type EventReceiveArg, type DateClickArg } from '@fullcalendar/interaction';
  import type { EventResizeDoneArg } from '@fullcalendar/interaction';
  import { getState, updateEvent, updateEvents, placeSubject } from '../state/store.svelte';
  import {
    getSelectedEventId, getSelectedEventIds, selectEvent, toggleEventSelection, addToSelection,
    getHighlightedEventIds, getSpotlightSubjectId, getFlash, requestConfig,
    openQuickEdit, closeQuickEdit, getReveal, slotHeight, consumeDateClickGuard,
  } from '../state/ui.svelte';
  import { previewClashDetail } from '../conflicts/detector';
  import {
    groupsToResources, buildFCEvents, extractDayIndex, phaseDayCount, dayDate,
    formatTime, isMultiGroupEvent, addMinutesToTime, clampGroupDelta, DAY_NAMES,
    sortSubjects, timeDiffMinutes, type FCEventTeacher, type FCEventRoom,
  } from '../utils/timeUtils';
  import { missingLaneIdsForSubject } from '../reports/reports';
  import { getContrastColor } from '../utils/colorUtils';
  import { escapeHtml } from '../utils/format';
  import { iconSvg } from '../utils/icons';
  import Icon from './Icon.svelte';
  import ProgrammpunktDialog from './ProgrammpunktDialog.svelte';
  import {
    ALL_GROUPS, CONFLICT_KIND_LABELS, type ConflictKind, type EventFilter, type ID, type Phase,
  } from '../types';

  interface Props {
    selectedEventId: string | null;
    phase: Phase;
    filter?: EventFilter | null;
  }

  let { selectedEventId = $bindable(), phase, filter = null }: Props = $props();

  let calendarEl: HTMLDivElement;
  let calendar: Calendar;

  // The grid runs 07:00–19:00 so the fringes stay reachable, but the training
  // day is 08:00–17:00 — the band a click is pulled back into.
  const GRID_MIN_MIN = 7 * 60;   // keep in step with slotMinTime/slotMaxTime below
  const GRID_MAX_MIN = 19 * 60;
  const DAY_START_MIN = 8 * 60;
  const DAY_END_MIN = 17 * 60;

  // Subject-picker popup state (for dateClick on empty cells)
  interface PlacePending { date: Date; groupId: ID; x: number; y: number; }
  let placePending: PlacePending | null = $state(null);

  // FC labels body columns with fc-day-mon/tue/… but leaves resource header cells
  // (G1/G2/G3) with only `fc-col-header-cell fc-resource`. Both carry data-date,
  // so the first column of each day is tagged here for the CSS to hook onto —
  // and every column learns whether its day is an odd one, which drives the
  // alternating day band.
  //
  // `wk-day-first` marks that first column too, but including the very first day
  // (`wk-day-start` deliberately skips it — there is no rule to draw there).
  // It is what lets a multi-group block print its title once per day instead of
  // once per lane.
  function tagDayBoundaries(): void {
    if (!calendarEl) return;
    for (const sel of ['.fc-col-header-cell.fc-resource', '.fc-timegrid-col.fc-resource']) {
      let prevDate: string | null = null;
      let dayIdx = -1;
      for (const el of calendarEl.querySelectorAll<HTMLElement>(sel)) {
        const date = el.getAttribute('data-date');
        const isNewDay = date !== prevDate;
        if (isNewDay) dayIdx++;
        el.classList.toggle('wk-day-start', prevDate !== null && isNewDay);
        el.classList.toggle('wk-day-first', isNewDay);
        el.classList.toggle('wk-day-alt', dayIdx % 2 === 1);
        prevDate = date;
      }
    }
  }

  // ─── Selection / highlight / spotlight are painted onto the DOM ─────────────
  // They change far more often than the event data and never affect layout, so
  // toggling classes beats rebuilding every event through the store.
  function paintStates(): void {
    if (!calendarEl) return;
    const selected = new Set(getSelectedEventIds());
    const highlighted = new Set(getHighlightedEventIds());
    const spotlight = getSpotlightSubjectId();
    for (const el of calendarEl.querySelectorAll<HTMLElement>('.fc-event')) {
      const id = el.dataset['wkEventId'];
      const subjectId = el.dataset['wkSubjectId'];
      el.classList.toggle('wk-selected', id !== undefined && selected.has(id));
      el.classList.toggle('wk-flash', id !== undefined && highlighted.has(id));
      el.classList.toggle('wk-dimmed', spotlight !== null && subjectId !== spotlight);
    }
    paintOwingLanes(spotlight);
  }

  /**
   * Mark the lane headers that still owe the spotlighted Thema. Dimming can only
   * show where a subject *is*; the question the sidebar chip is hovered to
   * answer is where it is not, and there is no card there to highlight — so the
   * header carries it. `missingLaneIdsForSubject` is the same computation behind
   * the chip's tooltip and the report, resolved per phase.
   */
  function paintOwingLanes(subjectId: ID | null): void {
    if (!calendarEl) return;
    const owing = subjectId === null
      ? new Set<ID>()
      : new Set(missingLaneIdsForSubject(getState(), subjectId, phase));
    for (const el of calendarEl.querySelectorAll<HTMLElement>('.fc-col-header-cell.fc-resource')) {
      const resourceId = el.getAttribute('data-resource-id');
      el.classList.toggle('wk-lane-owes', resourceId !== null && owing.has(resourceId));
    }
  }

  function eventElement(id: ID): HTMLElement | null {
    return calendarEl?.querySelector<HTMLElement>(`.fc-event[data-wk-event-id="${CSS.escape(id)}"]`) ?? null;
  }

  function handleEventClick(info: EventClickArg): void {
    const id = info.event.extendedProps['eventId'] as ID;

    // Ctrl/Cmd toggles a card in or out, Shift only adds — the two gestures
    // people already have for "and this one too". No popover for a set: its
    // fields edit one block.
    const toggling = info.jsEvent.metaKey || info.jsEvent.ctrlKey;
    if (toggling || info.jsEvent.shiftKey) {
      closeQuickEdit();
      if (toggling) toggleEventSelection(id);
      else addToSelection([id]);
      return;
    }

    // Double click goes straight to the full editor; a single click selects and
    // offers the three fields that actually change day to day.
    if (info.jsEvent.detail >= 2) {
      closeQuickEdit();
      selectedEventId = id;
      return;
    }
    selectEvent(id);
    const rect = info.el.getBoundingClientRect();
    openQuickEdit(id, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }

  /** Minutes since midnight, for comparing against the grid's own bounds. */
  function minutesOfDay(time: string): number {
    return timeDiffMinutes('00:00', time);
  }

  function handleEventDrop(info: EventDropArg): void {
    const eventId = info.event.extendedProps['eventId'] as ID;
    const newStart = info.event.start!;
    const newEnd = info.event.end!;

    // Dragging one card of a selection moves the whole set by the same delta.
    // Lanes are deliberately left alone: dropping five blocks into the one lane
    // under the pointer would stack them, which is never the intent.
    const selection = getSelectedEventIds();
    if (selection.length > 1 && selection.includes(eventId)) {
      const moving = getState().events.filter(ev => selection.includes(ev.id));
      // The set moves as one. Clamping each block to the week on its own is what
      // the single-card path wants and what a selection must not have: the ones
      // already on Friday stop, the rest keep going, and the shape of the
      // selection changes under a single undo entry. Same for the day's own
      // bounds, which `addMinutesToTime` would otherwise fold to 00:00/23:59.
      const dayDelta = clampGroupDelta(
        moving.map(ev => ev.dayIndex), info.delta.days, 0, DAY_NAMES.length - 1,
      );
      const minuteDelta = clampGroupDelta(
        moving.flatMap(ev => [minutesOfDay(ev.startTime), minutesOfDay(ev.endTime)]),
        info.delta.milliseconds / 60_000,
        GRID_MIN_MIN,
        GRID_MAX_MIN,
      );
      if (dayDelta === 0 && minuteDelta === 0) {
        // Nothing can move, so nothing is recorded — and FullCalendar has
        // already drawn the drop, so the view has to be put back.
        info.revert();
        return;
      }
      updateEvents(selection, ev => ({
        dayIndex: ev.dayIndex + dayDelta,
        startTime: addMinutesToTime(ev.startTime, minuteDelta),
        endTime: addMinutesToTime(ev.endTime, minuteDelta),
      }), 'verschieben');
      return;
    }

    const storedEv = getState().events.find(e => e.id === eventId);
    const isMulti = storedEv !== undefined && isMultiGroupEvent(storedEv);

    const patch: Parameters<typeof updateEvent>[1] = {
      dayIndex: extractDayIndex(newStart),
      startTime: formatTime(newStart),
      endTime: formatTime(newEnd),
    };

    if (!isMulti) {
      const resource = info.event.getResources()[0];
      if (resource) patch.groupId = resource.id;
    }

    updateEvent(eventId, patch, `${info.event.title} verschieben`);
  }

  function handleEventResize(info: EventResizeDoneArg): void {
    const eventId = info.event.extendedProps['eventId'] as ID;
    const newStart = info.event.start!;
    const newEnd = info.event.end!;

    updateEvent(eventId, {
      dayIndex: extractDayIndex(newStart),
      startTime: formatTime(newStart),
      endTime: formatTime(newEnd),
    }, `Dauer von ${info.event.title} ändern`);
  }

  function handleEventReceive(info: EventReceiveArg): void {
    const movedId = info.event.extendedProps['eventId'] as ID | undefined;
    const subjectId = info.event.extendedProps['subjectId'] as ID | undefined;
    const resource = info.event.getResources()[0];
    const start = info.event.start!;
    const end = info.event.end;

    // Always remove FC's auto-created event — we own event creation via store
    info.event.remove();

    // An existing event dragged in from another phase's calendar. FC has already
    // dropped it from the source view, so the store must be updated or the event
    // would vanish until the next reload.
    if (movedId) {
      const stored = getState().events.find(e => e.id === movedId);
      if (!stored) return;
      updateEvent(movedId, {
        dayIndex: extractDayIndex(start),
        startTime: formatTime(start),
        endTime: end ? formatTime(end) : stored.endTime,
        // A multi-group event keeps the ALL_GROUPS sentinel and simply follows
        // the lanes of whichever phase now owns its day.
        groupId: isMultiGroupEvent(stored) ? ALL_GROUPS : resource?.id ?? stored.groupId,
      }, `${info.event.title} verschieben`);
      return;
    }

    if (!subjectId) return;
    const subject = getState().subjects.find(s => s.id === subjectId);
    if (!subject) return;
    if (!subject.isMultiGroup && !resource) return;

    placeSubject(subjectId, extractDayIndex(start), formatTime(start), resource?.id ?? ALL_GROUPS);
  }

  function handleDateClick(info: DateClickArg): void {
    // A marquee ends on mouseup over an empty slot, which is also what opens the
    // placement picker. The marquee claims that one click.
    if (consumeDateClickGuard()) return;
    const resource = info.resource;
    if (!resource) return;
    closeQuickEdit();
    selectEvent(null);
    placePending = {
      // Clicking a few pixels above the 08:00 rule used to open the picker on
      // "07:30" — a time outside the training day, above the current scroll
      // position, chosen by the click's overshoot rather than by anyone.
      date: clampToDay(info.date),
      groupId: resource.id,
      x: info.jsEvent.clientX,
      y: info.jsEvent.clientY,
    };
  }

  /** Pull a clicked time into the day's main band, 08:00–17:00. */
  function clampToDay(date: Date): Date {
    const out = new Date(date);
    const minutes = out.getHours() * 60 + out.getMinutes();
    if (minutes < DAY_START_MIN) out.setHours(8, 0, 0, 0);
    else if (minutes > DAY_END_MIN) out.setHours(17, 0, 0, 0);
    return out;
  }

  function placePendingSubject(subjectId: ID): void {
    if (!placePending) return;
    const { date, groupId } = placePending;
    placeSubject(subjectId, extractDayIndex(date), formatTime(date), groupId);
    placePending = null;
  }

  // ─── Programmpunkt creation ────────────────────────────────────────────────
  // The cell that was clicked already answers day, time and lane, so the dialog
  // only has to ask for the things that make it a *thing*: name, length, colour
  // and whether it is one lane or all of them.
  interface OneOffPending { dayIndex: number; startTime: string; groupId: ID; }
  let newOneOff: OneOffPending | null = $state(null);

  function openProgrammpunkt(): void {
    if (!placePending) return;
    const { date, groupId } = placePending;
    newOneOff = { dayIndex: extractDayIndex(date), startTime: formatTime(date), groupId };
    placePending = null;
  }

  /**
   * Hand the freshly made card to the quick edit, which is where Ausbildner
   * and Raum are set everywhere else in this app — and which carries the route
   * on to the full editor. The card only exists once FC has repainted, so the
   * anchor is measured a frame later, the same way the flash and reveal effects
   * below wait for it.
   */
  function quickEditNewCard(eventId: ID): void {
    newOneOff = null;
    requestAnimationFrame(() => {
      const el = eventElement(eventId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      selectEvent(eventId);
      openQuickEdit(eventId, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    });
  }

  // ─── Live clash preview ────────────────────────────────────────────────────
  // FC calls eventAllow continuously while dragging. Nothing is ever refused —
  // conflicts stay advisory — but the mirror can say what the drop would cost
  // before the mouse is released.
  //
  // The rules themselves live in the detector: this used to be a second copy of
  // them here, and the copy had drifted into missing the all-lanes break, the
  // defaults of a chip dragged from the sidebar, and availability windows.
  function paintClashPreview(
    span: { start: Date; end: Date; resourceId?: string },
    movingEvent: { extendedProps: Record<string, unknown> } | null,
  ): void {
    const state = getState();
    const eventId = (movingEvent?.extendedProps['eventId'] as ID | undefined) ?? null;
    const stored = eventId ? state.events.find(e => e.id === eventId) ?? null : null;
    const subjectId =
      stored?.subjectId ?? (movingEvent?.extendedProps['subjectId'] as ID | undefined) ?? null;

    if (!subjectId) {
      clearClashPreview();
      return;
    }

    // A chip has no stored event yet, so its lane comes from the subject's own
    // "all lanes" flag and from whichever column the pointer is over.
    const subject = state.subjects.find(s => s.id === subjectId);
    const multi = stored ? isMultiGroupEvent(stored) : subject?.isMultiGroup === true;
    const groupId = multi ? ALL_GROUPS : span.resourceId ?? stored?.groupId ?? '';

    const { level, eventIds } = previewClashDetail(state, {
      eventId,
      subjectId,
      groupId,
      dayIndex: extractDayIndex(span.start),
      startTime: formatTime(span.start),
      endTime: formatTime(span.end),
      teacherIds: stored?.teacherIds ?? 'inherit',
      roomId: stored?.roomId ?? 'inherit',
    });

    if (level) calendarEl.dataset['clash'] = level;
    else delete calendarEl.dataset['clash'];

    // The tint says a price will be paid; this says to whom. In a dense column
    // four cards sit within a few pixels of the pointer and the mirror alone
    // never named which of them the drop would land on.
    const targets = new Set(eventIds);
    for (const el of calendarEl.querySelectorAll<HTMLElement>('.fc-event')) {
      const id = el.dataset['wkEventId'];
      el.classList.toggle('wk-clash-target', id !== undefined && targets.has(id));
    }
  }

  function clearClashPreview(): void {
    if (!calendarEl) return;
    delete calendarEl.dataset['clash'];
    for (const el of calendarEl.querySelectorAll<HTMLElement>('.wk-clash-target')) {
      el.classList.remove('wk-clash-target');
    }
  }

  onMount(() => {
    calendar = new Calendar(calendarEl, {
      // No @fullcalendar/adaptive: its print mode flattens the time grid into a
      // list of cards — no axis, no hour lines, no proportional times — which is
      // the opposite of what a timetable on paper is for. The print rules in
      // calendar.css unclip the real grid instead.
      plugins: [resourceTimeGridPlugin, interactionPlugin],
      schedulerLicenseKey: 'GPL-My-Project-Is-Open-Source',
      // Generic resourceTimeGrid (not …Week) so each phase can span its own
      // number of days rather than the whole Mon–Fri week.
      initialView: 'resourceTimeGrid',
      duration: { days: phaseDayCount(phase) },
      datesAboveResources: true,
      // Order columns by our explicit `order` field. Without this, FC's default
      // ('id,title') sorts by the random nanoid id — which reshuffles groups on
      // every reload until a save pins the ids.
      resourceOrder: 'order',
      firstDay: 1,
      weekends: false,
      locale: deLocale,
      allDaySlot: false,
      nowIndicator: true,
      // Shades the fringes of the training day: before 08:00 and after 17:00.
      businessHours: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '17:00' },
      // Starting the grid on the hour is what makes the labels read 08:00, 09:00
      // rather than 07:30, 08:30 — slotLabelInterval counts from slotMinTime.
      slotMinTime: '07:00:00',
      slotMaxTime: '19:00:00',
      slotDuration: '00:15:00',
      snapDuration: '00:15:00',
      slotLabelInterval: '01:00:00',
      slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      defaultRangeSeparator: '–',
      editable: true,
      droppable: true,
      headerToolbar: false,
      initialDate: dayDate(getState().wkStartDate, phase.startDay),
      // Natural height: the phases share one scroller in App.svelte, which keeps
      // their time rows locked together without syncing two scroll positions.
      height: 'auto',
      stickyHeaderDates: true,
      resources(_info, successCallback) {
        successCallback(groupsToResources(getState().groups, phase.groupIds));
      },
      events(_info, successCallback) {
        successCallback(buildFCEvents(getState(), phase, filter));
      },
      eventClick: handleEventClick,
      eventDrop: handleEventDrop,
      eventResize: handleEventResize,
      eventReceive: handleEventReceive,
      eventAllow(span, movingEvent) {
        paintClashPreview(span as { start: Date; end: Date; resourceId?: string }, movingEvent);
        return true;
      },
      eventDragStop() { clearClashPreview(); },
      eventResizeStop() { clearClashPreview(); },
      // FC pulls the event out of this view the moment it is dropped on another
      // phase. Re-reading the store puts back whatever is actually true, so a
      // drop the target refuses can't leave a hole here.
      eventLeave() { calendar.refetchEvents(); },
      dateClick: handleDateClick,
      datesSet: tagDayBoundaries,
      viewDidMount: tagDayBoundaries,
      eventDidMount(arg) {
        const id = arg.event.extendedProps['eventId'] as ID | undefined;
        const color = arg.event.extendedProps['color'] as string | undefined;
        if (id) arg.el.dataset['wkEventId'] = id;
        const subjectId = arg.event.extendedProps['subjectId'] as ID | undefined;
        if (subjectId) arg.el.dataset['wkSubjectId'] = subjectId;
        // The tint, the border and the spine are all mixed from this one value
        // in CSS, which is what lets dark mode use a different recipe.
        if (color) arg.el.style.setProperty('--ev-color', color);

        // A clamped title still has to be readable in full somewhere.
        const teachers = (arg.event.extendedProps['teachers'] as FCEventTeacher[] | undefined) ?? [];
        const room = arg.event.extendedProps['room'] as FCEventRoom | null | undefined;
        const kinds = (arg.event.extendedProps['conflictKinds'] as ConflictKind[] | undefined) ?? [];
        arg.el.title = [
          arg.event.title,
          arg.timeText,
          teachers.map(t => t.name).join(', '),
          room?.name,
          kinds.length > 0 ? `⚠ Konflikt: ${kinds.map(k => CONFLICT_KIND_LABELS[k]).join(' + ')}` : null,
        ].filter(Boolean).join(' · ');
      },
      eventContent(arg) {
        const teachers = arg.event.extendedProps['teachers'] as FCEventTeacher[] | undefined;
        const room = arg.event.extendedProps['room'] as FCEventRoom | null | undefined;

        // Every value below comes from user-entered config, and FC takes an HTML
        // string, so each one is escaped on the way in.
        const title = escapeHtml(arg.event.title);

        // During sidebar drag, the mirror event only has { subjectId } — render title-only preview
        if (teachers === undefined) {
          return {
            html: `<div class="wk-ev-body"><div class="wk-ev-top"><div class="wk-ev-title">${title}</div></div></div>`,
          };
        }

        const hard = (arg.event.extendedProps['hardConflict'] as boolean | undefined) ?? false;
        const hasConflict = (arg.event.extendedProps['hasConflict'] as boolean | undefined) ?? false;
        const overrides = (arg.event.extendedProps['overrides'] as string[] | undefined) ?? [];

        // No layers icon for a multi-group block: it is drawn once per lane, so
        // the icon was repeated across the whole day to say what the unbroken
        // band already says. Only the first lane carries any text at all —
        // see `.wk-day-first` in calendar.css.
        const flags = [
          overrides.length > 0
            ? `<span class="wk-ev-flag" title="Weicht von der Themenvorgabe ab: ${escapeHtml(overrides.join(', '))}">${iconSvg('pencil', 11)}</span>`
            : '',
          hasConflict
            ? `<span class="wk-ev-flag ${hard ? 'wk-ev-flag-hard' : 'wk-ev-flag-soft'}" title="${hard ? 'Harter Konflikt' : 'Raum doppelt belegt'}">${iconSvg('alert', 12)}</span>`
            : '',
        ].join('');

        const teacherHtml = teachers.length > 0
          ? `<div class="wk-ev-teachers">${
              teachers.map(t =>
                `<span class="wk-ev-av" style="background:${escapeHtml(t.color)};color:${getContrastColor(t.color)}" title="${escapeHtml(t.name)}">${escapeHtml(t.shortName)}</span>`
              ).join('')
            }</div>`
          : '';

        // A pill carrying the room's own code, not a colour swatch beside a name
        // that gets dropped. The swatch could only be decoded against the
        // Legende; four characters name the place outright, and they fit in
        // every lane the app draws — which the full name never did.
        const roomHtml = room
          ? `<span class="wk-ev-room" style="--room:${escapeHtml(room.color)}"><span class="wk-ev-room-code">${escapeHtml(room.shortName)}</span><span class="wk-ev-room-name">${escapeHtml(room.name)}</span></span>`
          : '';

        // Both names ship on every card and CSS picks one, because the choice is
        // made per *lane width* — a container query — and nothing here knows how
        // wide this card will land. Same for the two halves of the time range.
        const shortName = escapeHtml(
          (arg.event.extendedProps['shortName'] as string | undefined) ?? arg.event.title,
        );
        const startTime = escapeHtml((arg.event.extendedProps['startTime'] as string | undefined) ?? '');
        const endTime = escapeHtml((arg.event.extendedProps['endTime'] as string | undefined) ?? '');

        return {
          html: `
            <div class="wk-ev-body">
              <div class="wk-ev-top">
                <div class="wk-ev-title"><span class="wk-ev-name-full">${title}</span><span class="wk-ev-name-short">${shortName}</span></div>
                <div class="wk-ev-flags">${flags}</div>
              </div>
              <div class="wk-ev-meta">
                <span class="wk-ev-time"><span class="wk-ev-t-start">${startTime}</span><span class="wk-ev-t-end">–${endTime}</span></span>
                ${teacherHtml}
                ${roomHtml}
              </div>
            </div>
          `,
        };
      },
    });
    calendar.render();

    // FC only recalculates on window resize, so collapsing a side panel would
    // otherwise leave the grid at its old width.
    const ro = new ResizeObserver(() => calendar.updateSize());
    ro.observe(calendarEl);

    return () => { ro.disconnect(); calendar.destroy(); };
  });

  // Reactively push state changes into FC
  $effect(() => {
    const s = getState();
    filter; // tracked so changing the filter re-runs the event source below
    slotHeight(); // a density change alters row heights, so FC must re-measure
    if (!calendar) return;
    calendar.setOption('duration', { days: phaseDayCount(phase) });
    calendar.refetchResources();
    // refetchEvents() re-calls the function event source above, which reads
    // getState() fresh — no source teardown/rebuild needed.
    calendar.refetchEvents();
    calendar.gotoDate(dayDate(s.wkStartDate, phase.startDay));
    // Columns are rebuilt synchronously by the refetch above, but the class tags
    // are re-applied after paint so enabling/disabling a group can't leave stale ones.
    requestAnimationFrame(() => {
      tagDayBoundaries();
      paintStates();
      calendar.updateSize();
    });
  });

  // Selection and hover states repaint on their own, without touching FC.
  $effect(() => {
    getSelectedEventId();
    getHighlightedEventIds();
    getSpotlightSubjectId();
    paintStates();
  });

  /** The one motion the CSS media query cannot reach: scrollIntoView's easing. */
  function scrollBehavior(): ScrollBehavior {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  /** How long `wk-flash` is left on — the keyframe plus a frame of slack. */
  const FLASH_MS = 800;

  function flash(el: HTMLElement): void {
    // Restart rather than stack: a second flash on a card still pulsing from the
    // first would otherwise do nothing at all.
    el.classList.remove('wk-flash');
    void el.offsetWidth;
    el.classList.add('wk-flash');
    setTimeout(() => el.classList.remove('wk-flash'), FLASH_MS);
  }

  // "Show me this one" from the conflict panel: always scrolls, because the
  // whole request is to go somewhere.
  $effect(() => {
    const request = getReveal();
    if (!request) return;
    request.token; // tracked: the same event can be revealed twice in a row
    requestAnimationFrame(() => {
      const el = eventElement(request.id);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      flash(el);
    });
  });

  /**
   * "It landed here." Undo, redo, a placement from a dialog, duplizieren, teilen
   * and copy-to-lanes all change the grid somewhere the user is not necessarily
   * looking — undo in particular named the action in a toast and left "where?"
   * to a hunt across fifty cards.
   *
   * Unlike a reveal this only scrolls when it has to: the cards are usually
   * already on screen, and yanking the grid on every Ctrl+Z would be worse than
   * the silence it replaces.
   */
  $effect(() => {
    const request = getFlash();
    if (!request) return;
    request.token;
    requestAnimationFrame(() => {
      const els = request.ids
        .map(eventElement)
        .filter((el): el is HTMLElement => el !== null);
      if (els.length === 0) return;
      if (!els.some(isOnScreen)) {
        els[0]!.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      }
      for (const el of els) flash(el);
    });
  });

  function isOnScreen(el: HTMLElement): boolean {
    const scroller = calendarEl?.closest('.phase-scroll');
    if (!scroller) return true;
    const box = el.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    return box.bottom > view.top && box.top < view.bottom;
  }
</script>

<div class="calendar-wrap">
  <div bind:this={calendarEl} class="calendar-mount wk-cal"></div>
</div>

{#if placePending}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="place-backdrop" onclick={() => placePending = null}></div>
  <div
    class="place-picker"
    style="left: {Math.min(placePending.x, window.innerWidth - 240)}px; top: {Math.min(placePending.y, window.innerHeight - 340)}px"
  >
    <div class="place-picker-header wk-eyebrow">Platzieren um {formatTime(placePending.date)}</div>
    {#each [
      { kind: 'lesson' as const, label: 'Themen' },
      { kind: 'oneoff' as const, label: 'Programmpunkte' },
      { kind: 'break' as const, label: 'Pausen' },
    ] as group (group.label)}
      {@const items = sortSubjects(getState().subjects.filter(s => s.kind === group.kind))}
      <!-- Themen is listed even when empty. This picker is one of the two ways
           to place anything, and on a fresh plan it silently offered only the
           two Pausen — a dead end with nothing saying where Themen come from.
           Programmpunkte are the opposite: the block is pure history, so it
           stays out of the way until one has actually been made. -->
      {#if items.length > 0 || group.kind === 'lesson'}
        <div class="place-group-label wk-eyebrow">{group.label}</div>
        {#each items as s (s.id)}
          <button class="place-item" onclick={() => placePendingSubject(s.id)}>
            <span class="place-dot" style="background:{s.color}"></span>
            <span class="place-name">{s.name}</span>
            {#if s.isMultiGroup}
              <Icon name="layers" size={12} class="place-icon" />
            {/if}
            <span class="place-dur wk-num">{s.defaultDurationMinutes}′</span>
          </button>
        {/each}
        {#if items.length === 0 && group.kind === 'lesson'}
          <button
            class="place-item place-item-new"
            onclick={() => { placePending = null; requestConfig('subjects', { createSubject: true }); }}
          >
            <Icon name="plus" size={13} class="place-icon" />
            <span class="place-name">Erstes Thema anlegen …</span>
          </button>
        {/if}
      {/if}
    {/each}

    <!-- The one thing this picker can create rather than place. A Programmpunkt
         belongs to the cell it is made in — day, time and lane are already
         answered by the click — so asking for it here costs one field instead
         of a detour through Konfiguration and back. -->
    <div class="place-sep"></div>
    <button class="place-item place-item-new" onclick={openProgrammpunkt}>
      <Icon name="plus" size={13} class="place-icon" />
      <span class="place-name">Neuer Programmpunkt …</span>
    </button>
  </div>
{/if}

{#if newOneOff}
  <ProgrammpunktDialog
    dayIndex={newOneOff.dayIndex}
    startTime={newOneOff.startTime}
    groupId={newOneOff.groupId}
    oncreated={quickEditNewCard}
    onclose={() => (newOneOff = null)}
  />
{/if}

<style>
  .calendar-wrap {
    position: relative;
    width: 100%;
  }

  .calendar-mount {
    width: 100%;
  }

  /* ── Subject placement picker ───────────────────────────────────────────── */
  .place-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }

  .place-picker {
    position: fixed;
    z-index: 1001;
    min-width: 210px;
    max-width: 250px;
    background: var(--wk-surface);
    /* Card-anchored, like the quick edit — same edge and shadow recipe. */
    border: 1px solid var(--wk-pop-line);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-pop-shadow);
    padding: 6px 0 7px;
    display: flex;
    flex-direction: column;
    max-height: 340px;
    overflow-y: auto;
  }

  /* Separates "place one of these" from "make a new one" — different kinds of
     action, one list. */
  .place-sep {
    height: 1px;
    background: var(--wk-line);
    margin: 5px 0 4px;
  }

  .place-picker-header {
    padding: 3px 12px 7px;
    border-bottom: 1px solid var(--wk-line);
    margin-bottom: 4px;
  }

  .place-group-label {
    padding: 5px 12px 2px;
  }

  .place-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--wk-fs-sm);
    color: var(--wk-text);
    text-align: left;
    width: 100%;
    transition: background 0.1s;
  }

  .place-item:hover {
    background: var(--wk-surface-alt);
  }

  .place-dot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .place-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .place-item :global(.place-icon) {
    color: var(--wk-text-faint);
  }

  .place-item-new {
    color: var(--color-primary);
    font-weight: 600;
  }
  .place-item-new:hover {
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
  }

  .place-dur {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    flex-shrink: 0;
  }
</style>
