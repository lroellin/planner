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
    getHighlightedEventIds, getSpotlightSubjectId,
    openQuickEdit, closeQuickEdit, getReveal, slotHeight, consumeDateClickGuard,
  } from '../state/ui.svelte';
  import { previewClash } from '../conflicts/detector';
  import {
    groupsToResources, buildFCEvents, extractDayIndex, phaseDayCount, dayDate, clampDayIndex,
    formatTime, isMultiGroupEvent, addMinutesToTime,
    sortSubjects, type FCEventTeacher, type FCEventRoom,
  } from '../utils/timeUtils';
  import { getContrastColor } from '../utils/colorUtils';
  import { escapeHtml } from '../utils/format';
  import { iconSvg } from '../utils/icons';
  import Icon from './Icon.svelte';
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

  // Subject-picker popup state (for dateClick on empty cells)
  interface PlacePending { date: Date; groupId: ID; x: number; y: number; }
  let placePending: PlacePending | null = $state(null);

  // FC labels body columns with fc-day-mon/tue/… but leaves resource header cells
  // (G1/G2/G3) with only `fc-col-header-cell fc-resource`. Both carry data-date,
  // so the first column of each day is tagged here for the CSS to hook onto —
  // and every column learns whether its day is an odd one, which drives the
  // alternating day band.
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

  function handleEventDrop(info: EventDropArg): void {
    const eventId = info.event.extendedProps['eventId'] as ID;
    const newStart = info.event.start!;
    const newEnd = info.event.end!;

    // Dragging one card of a selection moves the whole set by the same delta.
    // Lanes are deliberately left alone: dropping five blocks into the one lane
    // under the pointer would stack them, which is never the intent.
    const selection = getSelectedEventIds();
    if (selection.length > 1 && selection.includes(eventId)) {
      const dayDelta = info.delta.days;
      const minuteDelta = info.delta.milliseconds / 60_000;
      updateEvents(selection, ev => ({
        dayIndex: clampDayIndex(ev.dayIndex + dayDelta),
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
    }, `${info.event.title} in der Dauer ändern`);
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
      date: info.date,
      groupId: resource.id,
      x: info.jsEvent.clientX,
      y: info.jsEvent.clientY,
    };
  }

  function placePendingSubject(subjectId: ID): void {
    if (!placePending) return;
    const { date, groupId } = placePending;
    placeSubject(subjectId, extractDayIndex(date), formatTime(date), groupId);
    placePending = null;
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
      delete calendarEl.dataset['clash'];
      return;
    }

    // A chip has no stored event yet, so its lane comes from the subject's own
    // "all lanes" flag and from whichever column the pointer is over.
    const subject = state.subjects.find(s => s.id === subjectId);
    const multi = stored ? isMultiGroupEvent(stored) : subject?.isMultiGroup === true;
    const groupId = multi ? ALL_GROUPS : span.resourceId ?? stored?.groupId ?? '';

    const level = previewClash(state, {
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
      eventDragStop() { delete calendarEl.dataset['clash']; },
      eventResizeStop() { delete calendarEl.dataset['clash']; },
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
        const isMulti = arg.event.classNames.includes('wk-ev-multi');
        const overrides = (arg.event.extendedProps['overrides'] as string[] | undefined) ?? [];

        const flags = [
          isMulti
            ? `<span class="wk-ev-flag" title="Jede Gruppe dieser Phase">${iconSvg('layers', 11)}</span>`
            : '',
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

        const roomHtml = room
          ? `<div class="wk-ev-room"><span class="wk-ev-room-tag" style="background:${escapeHtml(room.color)}"></span><span class="wk-ev-room-name">${escapeHtml(room.name)}</span></div>`
          : '';

        return {
          html: `
            <div class="wk-ev-body">
              <div class="wk-ev-top">
                <div class="wk-ev-title">${title}</div>
                <div class="wk-ev-flags">${flags}</div>
              </div>
              <div class="wk-ev-meta">
                <span class="wk-ev-time">${escapeHtml(arg.timeText)}</span>
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

  // "Show me this one" from the conflict panel.
  $effect(() => {
    const request = getReveal();
    if (!request) return;
    request.token; // tracked: the same event can be revealed twice in a row
    requestAnimationFrame(() => {
      const el = eventElement(request.id);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('wk-flash');
      setTimeout(() => el.classList.remove('wk-flash'), 2400);
    });
  });
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
    {#each [{ isBreak: false, label: 'Themen' }, { isBreak: true, label: 'Pausen' }] as group (group.label)}
      {@const items = sortSubjects(getState().subjects.filter(s => s.isBreak === group.isBreak))}
      {#if items.length > 0}
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
      {/if}
    {/each}
  </div>
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
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
    padding: 6px 0 7px;
    display: flex;
    flex-direction: column;
    max-height: 340px;
    overflow-y: auto;
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

  .place-dur {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    flex-shrink: 0;
  }
</style>
