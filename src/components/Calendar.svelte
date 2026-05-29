<script lang="ts">
  import { onMount } from 'svelte';
  import { Calendar, type EventClickArg, type EventDropArg } from '@fullcalendar/core';
  import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
  import interactionPlugin, { Draggable, type EventReceiveArg } from '@fullcalendar/interaction';
  import type { EventResizeDoneArg } from '@fullcalendar/interaction';
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

  onMount(() => {
    calendar = new Calendar(calendarEl, {
      plugins: [resourceTimeGridPlugin, interactionPlugin],
      schedulerLicenseKey: 'GPL-My-Project-Is-Open-Source',
      initialView: 'resourceTimeGridWeek',
      datesAboveResources: true,
      firstDay: 1,
      weekends: false,
      slotMinTime: '07:30:00',
      slotMaxTime: '19:00:00',
      slotDuration: '00:15:00',
      snapDuration: '00:15:00',
      slotLabelInterval: '01:00:00',
      editable: true,
      droppable: true,
      headerToolbar: false,
      initialDate: getState().wkStartDate,
      height: '100%',
      resources: groupsToResources(getState().groups),
      events: buildFCEvents(getState()),
      eventClick: handleEventClick,
      eventDrop: handleEventDrop,
      eventResize: handleEventResize,
      eventReceive: handleEventReceive,
      eventContent(arg) {
        const state = getState();
        const eventId = arg.event.extendedProps['eventId'] as ID;
        const ev = state.events.find(e => e.id === eventId);
        const subject = ev ? state.subjects.find(s => s.id === ev.subjectId) : null;

        const effectiveTeacherIds = ev?.teacherIds ?? subject?.defaultTeacherIds ?? [];
        const effectiveRoomId = ev?.roomId ?? subject?.defaultRoomId ?? null;

        const teachers = effectiveTeacherIds
          .map(tid => state.teachers.find(t => t.id === tid))
          .filter(Boolean);
        const room = effectiveRoomId
          ? state.rooms.find(r => r.id === effectiveRoomId)
          : null;

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
              <div class="fc-event-title">${arg.event.title}</div>
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
    calendar.setOption('resources', groupsToResources(s.groups));
    calendar.removeAllEvents();
    calendar.addEventSource(buildFCEvents(s));
    calendar.gotoDate(s.wkStartDate);
  });
</script>

<div bind:this={calendarEl} class="calendar-mount"></div>

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

  :global(.fc-event-title) {
    font-weight: 600;
    font-size: 0.8em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
</style>
