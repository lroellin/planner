<script lang="ts">
  import { onMount } from 'svelte';
  import { Calendar, type EventClickArg, type EventDropArg } from '@fullcalendar/core';
  import deLocale from '@fullcalendar/core/locales/de';
  import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
  import interactionPlugin, { Draggable, type EventReceiveArg, type DateClickArg } from '@fullcalendar/interaction';
  import type { EventResizeDoneArg } from '@fullcalendar/interaction';
  import adaptivePlugin from '@fullcalendar/adaptive';
  import { nanoid } from 'nanoid';
  import { getState, addEvent, updateEvent } from '../state/store.svelte';
  import { groupsToResources, buildFCEvents } from '../utils/timeUtils';
  import { pad, extractDayIndex } from '../utils/timeUtils';
  import { getContrastColor } from '../utils/colorUtils';
  import type { ID } from '../types';

  interface Props {
    selectedEventId: string | null;
  }

  let { selectedEventId = $bindable() }: Props = $props();

  let calendarEl: HTMLDivElement;
  let calendar: Calendar;

  // Subject-picker popup state (for dateClick on empty cells)
  interface PlacePending { date: Date; groupId: ID; x: number; y: number; }
  let placePending: PlacePending | null = $state(null);

  function handleEventClick(info: EventClickArg): void {
    selectedEventId = info.event.extendedProps['eventId'] as ID;
  }

  function handleEventDrop(info: EventDropArg): void {
    const eventId = info.event.extendedProps['eventId'] as ID;
    const newStart = info.event.start!;
    const newEnd = info.event.end!;
    const resource = info.event.getResources()[0];

    updateEvent(eventId, {
      dayIndex: extractDayIndex(newStart),
      startTime: `${pad(newStart.getHours())}:${pad(newStart.getMinutes())}`,
      endTime: `${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`,
      ...(resource ? { groupId: resource.id } : {}),
    });
  }

  function handleEventResize(info: EventResizeDoneArg): void {
    const eventId = info.event.extendedProps['eventId'] as ID;
    const newStart = info.event.start!;
    const newEnd = info.event.end!;

    updateEvent(eventId, {
      dayIndex: extractDayIndex(newStart),
      startTime: `${pad(newStart.getHours())}:${pad(newStart.getMinutes())}`,
      endTime: `${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`,
    });
  }

  function handleEventReceive(info: EventReceiveArg): void {
    const subjectId = info.event.extendedProps['subjectId'] as ID | undefined;
    const resource = info.event.getResources()[0];

    // Always remove FC's auto-created event — we manage events via store
    info.event.remove();

    if (!subjectId || !resource) return;

    const state = getState();
    const subject = state.subjects.find(s => s.id === subjectId);
    if (!subject) return;

    const start = info.event.start!;
    const endMs = start.getTime() + subject.defaultDurationMinutes * 60_000;
    const end = new Date(endMs);

    addEvent({
      id: nanoid(),
      subjectId,
      groupId: resource.id,
      dayIndex: extractDayIndex(start),
      startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      teacherIds: null,
      roomId: null,
    });
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
    const end = new Date(endMs);

    addEvent({
      id: nanoid(),
      subjectId,
      groupId,
      dayIndex: extractDayIndex(date),
      startTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
      endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      teacherIds: null,
      roomId: null,
    });
    placePending = null;
  }

  onMount(() => {
    calendar = new Calendar(calendarEl, {
      plugins: [resourceTimeGridPlugin, interactionPlugin, adaptivePlugin],
      schedulerLicenseKey: 'GPL-My-Project-Is-Open-Source',
      initialView: 'resourceTimeGridWeek',
      datesAboveResources: true,
      firstDay: 1,
      weekends: false,
      locale: deLocale,
      allDaySlot: false,
      nowIndicator: true,
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
      initialDate: getState().wkStartDate,
      height: '100%',
      resources: (_fetchInfo: unknown, successCallback: (r: unknown[]) => void) => {
        successCallback(groupsToResources(getState().groups));
      },
      events: buildFCEvents(getState()),
      eventClick: handleEventClick,
      eventDrop: handleEventDrop,
      eventResize: handleEventResize,
      eventReceive: handleEventReceive,
      dateClick: handleDateClick,
      eventContent(arg) {
        const state = getState();
        const eventId = arg.event.extendedProps['eventId'] as ID;
        const ev = state.events.find(e => e.id === eventId);
        const subject = ev ? state.subjects.find(s => s.id === ev.subjectId) : null;

        const hasConflict = (ev?.conflicts?.length ?? 0) > 0;
        const effectiveTeacherIds = ev?.teacherIds ?? subject?.defaultTeacherIds ?? [];
        const effectiveRoomId = ev?.roomId ?? subject?.defaultRoomId ?? null;

        const teachers = effectiveTeacherIds
          .map(tid => state.teachers.find(t => t.id === tid))
          .filter(Boolean);
        const room = effectiveRoomId
          ? state.rooms.find(r => r.id === effectiveRoomId)
          : null;

        const conflictBadge = hasConflict
          ? '<span class="fc-conflict-badge" title="Conflict">!</span>'
          : '';

        const teacherHtml = teachers.length > 0
          ? `<div class="fc-event-teacher">${
              teachers.map(t =>
                `<span class="teacher-chip" style="background:${t!.color};color:${getContrastColor(t!.color)}">${t!.shortName || t!.name.slice(0, 3)}</span>`
              ).join('')
            }</div>`
          : '';

        const roomHtml = room
          ? `<div class="fc-event-room"><span class="room-dot" style="background:${room.color}"></span>${room.name}</div>`
          : '';

        return {
          html: `
            <div class="fc-event-main-inner">
              <div class="fc-event-title-row">
                <span class="fc-event-title">${arg.event.title}</span>
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

    return () => calendar.destroy();
  });

  // Reactively push state changes into FC
  $effect(() => {
    const s = getState();
    if (!calendar) return;
    calendar.refetchResources();
    calendar.removeAllEvents();
    calendar.addEventSource(buildFCEvents(s));
    calendar.gotoDate(s.wkStartDate);
  });
</script>

<div bind:this={calendarEl} class="calendar-mount"></div>

{#if placePending}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="place-backdrop" onclick={() => placePending = null}></div>
  <div
    class="place-picker"
    style="left: {Math.min(placePending.x, window.innerWidth - 220)}px; top: {Math.min(placePending.y, window.innerHeight - 320)}px"
  >
    <div class="place-picker-header">Place lesson</div>
    {#if getState().subjects.some(s => !s.isBreak)}
      <div class="place-group-label">Lessons</div>
      {#each getState().subjects.filter(s => !s.isBreak) as s (s.id)}
        <button class="place-item" onclick={() => placePendingSubject(s.id)}
          style="border-left: 3px solid {s.color}">
          <span class="place-dot" style="background:{s.color}"></span>
          {s.name}
          <span class="place-dur">{s.defaultDurationMinutes}min</span>
        </button>
      {/each}
    {/if}
    {#if getState().subjects.some(s => s.isBreak)}
      <div class="place-group-label">Breaks</div>
      {#each getState().subjects.filter(s => s.isBreak) as s (s.id)}
        <button class="place-item" onclick={() => placePendingSubject(s.id)}
          style="border-left: 3px solid {s.color}">
          <span class="place-dot" style="background:{s.color}"></span>
          {s.name}
          <span class="place-dur">{s.defaultDurationMinutes}min</span>
        </button>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .calendar-mount {
    width: 100%;
    height: 100%;
  }

  :global(.fc-event-main-inner) {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px 4px;
    overflow: hidden;
    height: 100%;
  }

  :global(.fc-event-title-row) {
    display: flex;
    align-items: flex-start;
    gap: 3px;
    min-width: 0;
  }

  :global(.fc-event-title) {
    font-weight: 600;
    font-size: 0.8em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  :global(.fc-conflict-badge) {
    flex-shrink: 0;
    background: #e53e3e;
    color: #fff;
    font-size: 0.65em;
    font-weight: 900;
    border-radius: 3px;
    padding: 0 3px;
    line-height: 1.5;
    letter-spacing: 0;
  }

  :global(.fc-event-conflict) {
    border-width: 2px !important;
    box-shadow: inset 0 0 0 2px rgba(229, 62, 62, 0.35) !important;
  }

  :global(.fc-event-teacher) {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-top: 1px;
    flex-wrap: wrap;
  }

  :global(.teacher-chip) {
    display: inline-flex;
    align-items: center;
    padding: 0 3px;
    border-radius: 3px;
    font-size: 0.68em;
    font-weight: 700;
    letter-spacing: 0.03em;
    line-height: 1.5;
    flex-shrink: 0;
    border: 1px solid rgba(255,255,255,0.25);
  }

  :global(.fc-event-room) {
    font-size: 0.68em;
    opacity: 0.85;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 3px;
    margin-top: 1px;
  }

  :global(.room-dot) {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
    border: 1px solid rgba(255,255,255,0.4);
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

  /* ── Day alternation: Tuesday and Thursday ────────────────────────────────── */
  :global([data-theme="light"] .fc-col-header-cell.fc-day-tue),
  :global([data-theme="light"] .fc-col-header-cell.fc-day-thu) {
    background: rgba(0, 0, 0, 0.04) !important;
  }
  :global([data-theme="light"] .fc-timegrid-col.fc-day-tue),
  :global([data-theme="light"] .fc-timegrid-col.fc-day-thu) {
    background: rgba(0, 0, 0, 0.025) !important;
  }
  :global([data-theme="dark"] .fc-col-header-cell.fc-day-tue),
  :global([data-theme="dark"] .fc-col-header-cell.fc-day-thu) {
    background: rgba(255, 255, 255, 0.07) !important;
  }
  :global([data-theme="dark"] .fc-timegrid-col.fc-day-tue),
  :global([data-theme="dark"] .fc-timegrid-col.fc-day-thu) {
    background: rgba(255, 255, 255, 0.04) !important;
  }

  /* Day boundary left border */
  :global(.fc-col-header-cell.fc-day-mon),
  :global(.fc-col-header-cell.fc-day-tue),
  :global(.fc-col-header-cell.fc-day-wed),
  :global(.fc-col-header-cell.fc-day-thu),
  :global(.fc-col-header-cell.fc-day-fri) {
    border-left: 2px solid var(--fc-border-color, #ddd) !important;
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
    background: var(--pico-background-color, #fff);
    border: 1px solid var(--pico-muted-border-color, #ddd);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
    padding: 6px 0 8px;
    display: flex;
    flex-direction: column;
    max-height: 320px;
    overflow-y: auto;
  }

  .place-picker-header {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--pico-muted-color, #718096);
    padding: 2px 12px 6px;
    border-bottom: 1px solid var(--pico-muted-border-color, #eee);
    margin-bottom: 4px;
  }

  .place-group-label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--pico-muted-color, #aaa);
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
    background: rgba(0, 0, 0, 0.06);
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
