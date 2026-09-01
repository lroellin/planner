<script lang="ts">
  import { onMount } from 'svelte';
  import { Calendar, type EventClickArg, type EventDropArg } from '@fullcalendar/core';
  import deLocale from '@fullcalendar/core/locales/de';
  import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
  import interactionPlugin, { Draggable, type EventReceiveArg, type DateClickArg } from '@fullcalendar/interaction';
  import type { EventResizeDoneArg } from '@fullcalendar/interaction';
  import adaptivePlugin from '@fullcalendar/adaptive';
  import { nanoid } from 'nanoid';
  import { getState, addEvent, updateEvent, setState } from '../state/store.svelte';
  import {
    groupsToResources, buildFCEvents, extractDayIndex, phaseGroups, phaseDayCount, dayDate,
    formatTime, type FCEventTeacher, type FCEventRoom,
  } from '../utils/timeUtils';
  import { getContrastColor } from '../utils/colorUtils';
  import type { EventFilter, ID, Phase } from '../types';

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
  // so the first column of each day is tagged here for the CSS to hook onto.
  function tagDayBoundaries(): void {
    if (!calendarEl) return;
    for (const sel of ['.fc-col-header-cell.fc-resource', '.fc-timegrid-col.fc-resource']) {
      let prevDate: string | null = null;
      for (const el of calendarEl.querySelectorAll<HTMLElement>(sel)) {
        const date = el.getAttribute('data-date');
        el.classList.toggle('wk-day-start', prevDate !== null && date !== prevDate);
        prevDate = date;
      }
    }
  }

  function handleEventClick(info: EventClickArg): void {
    selectedEventId = info.event.extendedProps['eventId'] as ID;
  }

  function handleEventDrop(info: EventDropArg): void {
    const eventId = info.event.extendedProps['eventId'] as ID;
    const newStart = info.event.start!;
    const newEnd = info.event.end!;

    const storedEv = getState().events.find(e => e.id === eventId);
    const isMulti = storedEv && Array.isArray(storedEv.groupId);

    const patch: Parameters<typeof updateEvent>[1] = {
      dayIndex: extractDayIndex(newStart),
      startTime: formatTime(newStart),
      endTime: formatTime(newEnd),
    };

    if (!isMulti) {
      const resource = info.event.getResources()[0];
      if (resource) patch.groupId = resource.id;
    }

    updateEvent(eventId, patch);
  }

  function handleEventResize(info: EventResizeDoneArg): void {
    const eventId = info.event.extendedProps['eventId'] as ID;
    const newStart = info.event.start!;
    const newEnd = info.event.end!;

    updateEvent(eventId, {
      dayIndex: extractDayIndex(newStart),
      startTime: formatTime(newStart),
      endTime: formatTime(newEnd),
    });
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
      const state = getState();
      const stored = state.events.find(e => e.id === movedId);
      if (!stored) return;
      updateEvent(movedId, {
        dayIndex: extractDayIndex(start),
        startTime: formatTime(start),
        endTime: end ? formatTime(end) : stored.endTime,
        groupId: Array.isArray(stored.groupId)
          ? phaseGroups(state, phase).map(g => g.id)
          : resource?.id ?? stored.groupId,
      });
      return;
    }

    if (!subjectId) return;

    const state = getState();
    const subject = state.subjects.find(s => s.id === subjectId);
    if (!subject) return;

    const endMs = start.getTime() + subject.defaultDurationMinutes * 60_000;
    const dayIndex = extractDayIndex(start);
    const startTime = formatTime(start);
    const endTime = formatTime(new Date(endMs));

    if (subject.isMultiGroup) {
      const enabledGroupIds = phaseGroups(state, phase).map(g => g.id);
      addEvent({
        id: nanoid(),
        subjectId,
        groupId: enabledGroupIds,
        dayIndex,
        startTime,
        endTime,
        teacherIds: 'inherit',
        roomId: 'inherit',
      });
    } else {
      if (!resource) return;
      addEvent({
        id: nanoid(),
        subjectId,
        groupId: resource.id,
        dayIndex,
        startTime,
        endTime,
        teacherIds: 'inherit',
        roomId: 'inherit',
      });
    }
  }

  function handleDateClick(info: DateClickArg): void {
    const resource = info.resource;
    if (!resource) return;
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
    const state = getState();
    const subject = state.subjects.find(s => s.id === subjectId);
    if (!subject) { placePending = null; return; }

    const endMs = date.getTime() + subject.defaultDurationMinutes * 60_000;
    const dayIndex = extractDayIndex(date);
    const startTime = formatTime(date);
    const endTime = formatTime(new Date(endMs));

    if (subject.isMultiGroup) {
      const enabledGroupIds = phaseGroups(state, phase).map(g => g.id);
      addEvent({
        id: nanoid(),
        subjectId,
        groupId: enabledGroupIds,
        dayIndex,
        startTime,
        endTime,
        teacherIds: 'inherit',
        roomId: 'inherit',
      });
    } else {
      addEvent({
        id: nanoid(),
        subjectId,
        groupId,
        dayIndex,
        startTime,
        endTime,
        teacherIds: 'inherit',
        roomId: 'inherit',
      });
    }
    placePending = null;
  }

  onMount(() => {
    calendar = new Calendar(calendarEl, {
      plugins: [resourceTimeGridPlugin, interactionPlugin, adaptivePlugin],
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
      // Shades 07:00–08:00 and 17:00–19:00 as the fringes of the training day
      businessHours: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '17:00' },
      slotMinTime: '07:00:00',
      slotMaxTime: '19:00:00',
      slotDuration: '00:15:00',
      snapDuration: '00:15:00',
      slotLabelInterval: '01:00:00',
      slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
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
        successCallback(buildFCEvents(getState(), filter, phase));
      },
      eventClick: handleEventClick,
      eventDrop: handleEventDrop,
      eventResize: handleEventResize,
      eventReceive: handleEventReceive,
      // FC pulls the event out of this view the moment it is dropped on another
      // phase. Re-reading the store puts back whatever is actually true, so a
      // drop the target refuses can't leave a hole here.
      eventLeave() { calendar.refetchEvents(); },
      dateClick: handleDateClick,
      datesSet: tagDayBoundaries,
      viewDidMount: tagDayBoundaries,
      eventContent(arg) {
        const teachers = arg.event.extendedProps['teachers'] as FCEventTeacher[] | undefined;
        const room = arg.event.extendedProps['room'] as FCEventRoom | null | undefined;
        const hasConflict = (arg.event.extendedProps['hasConflict'] as boolean | undefined) ?? false;

        // During sidebar drag, the mirror event only has { subjectId } — render title-only preview
        if (teachers === undefined) {
          return {
            html: `<div class="fc-event-body"><div class="fc-event-title-row"><div class="fc-event-title">${arg.event.title}</div></div></div>`,
          };
        }

        const conflictBadge = hasConflict
          ? '<span class="fc-conflict-badge" title="Conflict">!</span>'
          : '';

        const overrides = (arg.event.extendedProps['overrides'] as string[] | undefined) ?? [];
        const overrideBadge = overrides.length > 0
          ? `<span class="fc-override-badge" title="Differs from the subject default: ${overrides.join(', ')}">✎</span>`
          : '';

        const teacherHtml = teachers.length > 0
          ? `<div class="fc-event-teachers">${
              teachers.map(t =>
                `<span class="fc-teacher-av" style="background:${t.color};color:${getContrastColor(t.color)}" title="${t.name}">${t.shortName}</span>`
              ).join('')
            }</div>`
          : '';

        const roomHtml = room
          ? `<div class="fc-event-room"><span class="fc-room-tag" style="background:${room.color}"></span><span class="fc-room-name">${room.name}</span></div>`
          : '';

        return {
          html: `
            <div class="fc-event-body">
              <div class="fc-event-title-row">
                <div class="fc-event-title">${arg.event.title}</div>
                ${overrideBadge}
                ${conflictBadge}
              </div>
              ${teacherHtml}
              ${roomHtml}
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
    if (!calendar) return;
    calendar.setOption('duration', { days: phaseDayCount(phase) });
    calendar.refetchResources();
    // refetchEvents() re-calls the function event source above, which reads
    // getState() fresh — no source teardown/rebuild needed.
    calendar.refetchEvents();
    calendar.gotoDate(dayDate(s.wkStartDate, phase.startDay));
    // Columns are rebuilt synchronously by the refetch above, but the class tags
    // are re-applied after paint so enabling/disabling a group can't leave stale ones.
    requestAnimationFrame(tagDayBoundaries);
  });
</script>

<div class="calendar-wrap">
  <div bind:this={calendarEl} class="calendar-mount"></div>
</div>

{#if placePending}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="place-backdrop" onclick={() => placePending = null}></div>
  <div
    class="place-picker bg-base-100 border border-base-300 shadow-xl"
    style="left: {Math.min(placePending.x, window.innerWidth - 220)}px; top: {Math.min(placePending.y, window.innerHeight - 320)}px"
  >
    <div class="place-picker-header">Place lesson</div>
    {#each [{ isBreak: false, label: 'Lessons' }, { isBreak: true, label: 'Breaks' }] as group (group.label)}
      {@const items = getState().subjects.filter(s => s.isBreak === group.isBreak)}
      {#if items.length > 0}
        <div class="place-group-label">{group.label}</div>
        {#each items as s (s.id)}
          <button class="place-item hover:bg-base-200" onclick={() => placePendingSubject(s.id)}
            style="border-left: 3px solid {s.color}">
            <span class="place-dot" style="background:{s.color}"></span>
            {s.name}
            {#if s.isMultiGroup}<span style="opacity:0.4;font-size:0.7rem" title="All groups">⊞</span>{/if}
            <span class="place-dur">{s.defaultDurationMinutes}min</span>
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

  /* ── Event card body ─────────────────────────────────────────────────────── */
  :global(.fc-event-body) {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 3px 5px 3px;
    height: 100%;
    overflow: hidden;
    background: linear-gradient(150deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 60%);
  }

  :global(.fc-event-title-row) {
    display: flex;
    align-items: flex-start;
    gap: 3px;
  }

  /* Full title — wraps rather than truncates */
  :global(.fc-event-title) {
    font-weight: 700;
    font-size: 0.8em;
    line-height: 1.3;
    word-break: break-word;
    overflow-wrap: anywhere;
    flex: 1;
    min-width: 0;
  }

  :global(.fc-conflict-badge) {
    flex-shrink: 0;
    background: #e53e3e;
    color: #fff;
    font-size: 0.6em;
    font-weight: 900;
    border-radius: 3px;
    padding: 1px 3px;
    line-height: 1.4;
    margin-top: 1px;
  }

  :global(.fc-override-badge) {
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.28);
    color: #fff;
    font-size: 0.62em;
    border-radius: 3px;
    padding: 1px 3px;
    line-height: 1.4;
    margin-top: 1px;
  }

  :global(.fc-event-conflict) {
    border-width: 2px !important;
    box-shadow: inset 0 0 0 2px rgba(229, 62, 62, 0.35) !important;
  }

  /* ── Teacher avatars (circles = people) ──────────────────────────────────── */
  :global(.fc-event-teachers) {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
    align-items: center;
  }

  :global(.fc-teacher-av) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    font-size: 0.56em;
    font-weight: 800;
    letter-spacing: -0.01em;
    border: 1.5px solid rgba(255, 255, 255, 0.35);
    flex-shrink: 0;
    line-height: 1;
  }

  /* ── Room tag (rectangle = place) ────────────────────────────────────────── */
  :global(.fc-event-room) {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7em;
    opacity: 0.88;
    overflow: hidden;
  }

  :global(.fc-room-tag) {
    /* Rounded rectangle, not a circle — distinguishes places from people */
    width: 10px;
    height: 7px;
    border-radius: 2px;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  :global(.fc-room-name) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Resize handle ───────────────────────────────────────────────────────── */
  :global(.fc-timegrid-event .fc-event-resizer-end) {
    height: 8px;
    bottom: 0;
    cursor: ns-resize;
    display: flex !important;
    align-items: center;
    justify-content: center;
  }

  :global(.fc-timegrid-event .fc-event-resizer-end::after) {
    content: '';
    display: block;
    width: 20px;
    height: 2px;
    border-radius: 1px;
    background: rgba(255, 255, 255, 0.55);
  }

  /* ── Vertical separation: faint between groups, bold between days ──────────── */
  /* Group columns inside one day recede… */
  :global(.fc-timegrid-col.fc-resource),
  :global(.fc-col-header-cell.fc-resource) {
    border-left: 1px solid var(--wk-line-faint);
    border-right: 0;
  }
  /* …so the day boundary reads as the primary structure. `.wk-day-start` is
     applied from tagDayBoundaries() — FC gives resource header cells no
     fc-day-* class, so this boundary cannot be expressed in CSS alone. */
  :global(.fc-timegrid-col.wk-day-start),
  :global(.fc-col-header-cell.wk-day-start),
  :global(.fc-col-header-cell.fc-day + .fc-col-header-cell.fc-day) {
    border-left: 2px solid var(--wk-line-strong);
  }

  /* ── Horizontal time lines, three levels deep ──────────────────────────────── */
  /* FC zeroes the slot border-bottom and draws lines via each cell's border-top.
     Quarter hours keep FC's own faint dotted default; these two rules add the
     hour and half-hour emphasis on top of it. Both need two classes to outrank
     FC's `.fc-theme-standard td`. */
  :global(.fc-timegrid-slot-lane:not(.fc-timegrid-slot-minor)),
  :global(.fc-timegrid-slot-label:not(.fc-timegrid-slot-minor)) {
    border-top: 1px solid var(--wk-line-strong);
  }
  /* Every odd row is :00 or :30, since slotDuration is a fixed 15min and
     slotMinTime a whole hour. */
  :global(.fc-timegrid-slots tr:nth-child(odd) .fc-timegrid-slot-minor) {
    border-top: 1px solid var(--wk-line);
  }

  /* ── Drag mirror: ensure it renders above everything ─────────────────────── */
  :global(.fc-event-mirror) {
    z-index: 9999 !important;
    opacity: 0.85 !important;
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
    min-width: 200px;
    max-width: 240px;
    border-radius: 10px;
    padding: 6px 0 8px;
    display: flex;
    flex-direction: column;
    max-height: 320px;
    overflow-y: auto;
  }

  .place-picker-header {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: color-mix(in oklab, var(--color-base-content) 40%, transparent);
    padding: 2px 12px 6px;
    border-bottom: 1px solid var(--wk-line);
    margin-bottom: 4px;
  }

  .place-group-label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: color-mix(in oklab, var(--color-base-content) 35%, transparent);
    padding: 4px 12px 2px;
  }

  .place-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px;
    background: none;
    border: none;
    border-left: 3px solid transparent;
    cursor: pointer;
    font-size: 0.85rem;
    color: inherit;
    text-align: left;
    width: 100%;
    transition: background 0.1s;
  }

  .place-item:hover {
    background: var(--wk-surface-alt);
  }

  .place-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .place-dur {
    margin-left: auto;
    font-size: 0.72rem;
    opacity: 0.55;
    flex-shrink: 0;
  }
</style>
