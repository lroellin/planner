<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Calendar, type EventClickInfo, type EventDropInfo, type EventReceiveInfo,
    type DateClickInfo, type EventResizeDoneInfo,
  } from 'fullcalendar';
  import deLocale from 'fullcalendar/locales/de';
  import classicThemePlugin from 'fullcalendar/themes/classic';
  import resourceTimeGridPlugin from 'fullcalendar-scheduler/resource-timegrid';
  import interactionPlugin from 'fullcalendar/interaction';
  import { getState, updateEvent, updateEvents, placeSubject } from '../state/store.svelte';
  import {
    getSelectedEventId, getSelectedEventIds, selectEvent, toggleEventSelection, addToSelection,
    getHighlightedEventIds, getSpotlightSubjectId, getFlash, requestConfig, setSelection,
    openQuickEdit, closeQuickEdit, getReveal, slotHeight, consumeDateClickGuard,
    isPhaseCollapsed,
  } from '../state/ui.svelte';
  import { previewClashDetail } from '../conflicts/detector';
  import {
    groupsToResources, buildFCEvents, extractDayIndex, phaseDayCount, dayDate,
    formatTime, isMultiGroupEvent, addMinutesToTime, clampGroupDelta, DAY_NAMES,
    gridWindow, timeToMinutes, GRID_BUSINESS_START, GRID_BUSINESS_END,
    sortSubjects, eventInPhase, eventGroupIds, eventMatchesFilter,
    type FCEventTeacher, type FCEventRoom,
  } from '../utils/timeUtils';
  import { missingLaneIdsForSubject } from '../reports/reports';
  import { eventCard } from '../utils/eventCard';
  import Icon from './Icon.svelte';
  import ProgrammpunktDialog from './ProgrammpunktDialog.svelte';
  import {
    ALL_GROUPS, CONFLICT_KIND_LABELS,
    type CalendarEvent, type ConflictKind, type EventFilter, type ID, type Phase,
  } from '../types';

  interface Props {
    selectedEventId: string | null;
    phase: Phase;
    filter?: EventFilter | null;
  }

  let { selectedEventId = $bindable(), phase, filter = null }: Props = $props();

  let calendarEl: HTMLDivElement;
  let calendar: Calendar;

  // The hours the grid draws follow the plan (or the explicit setting) — see
  // `gridWindow`. The training day inside them is 08:00–17:00: the band a click
  // is pulled back into, and the one FC shades as business hours.
  const gridHours = $derived(gridWindow(getState()));
  const GRID_MIN_MIN = $derived(timeToMinutes(gridHours.start));
  const GRID_MAX_MIN = $derived(timeToMinutes(gridHours.end));
  // The training day, from the one place that defines it — `gridWindow` derives
  // its own bounds from these, FullCalendar shades them below, and a click is
  // pulled back into them. Three literal copies of 08:00/17:00 in this file was
  // three chances for the shading, the clamp and the derivation to disagree.
  const DAY_START_MIN = timeToMinutes(GRID_BUSINESS_START);
  const DAY_END_MIN = timeToMinutes(GRID_BUSINESS_END);

  // Subject-picker popup state (for dateClick on empty cells)
  interface PlacePending { date: Date; groupId: ID; x: number; y: number; }
  let placePending: PlacePending | null = $state(null);

  // Every lane header (G1/G2/G3) and body lane learns where its day begins and
  // whether its day is an odd one, which drives the alternating day band. The
  // classes come straight out of FC's `resourceDayHeaderClass` / `dayLaneClass`
  // hooks — so they are part of the render itself and cannot go stale when FC
  // re-creates a cell. With `datesAboveResources`, FC flags the first lane of
  // each date as `isMajor`.
  //
  // `wk-day-start` marks the first lane of every day but the first (there is no
  // rule to draw there); `wk-day-first` marks it on every day, which is what
  // lets a multi-group block print its title once per day instead of once per
  // lane.
  function dayBoundaryClasses(base: string, date: Date | undefined, first: boolean): string {
    if (!date) return base;
    const dayIdx = extractDayIndex(date) - phase.startDay;
    return [
      base,
      first && 'wk-day-first',
      first && dayIdx > 0 && 'wk-day-start',
      dayIdx % 2 === 1 && 'wk-day-alt',
    ].filter(Boolean).join(' ');
  }

  // ─── Selection / highlight / spotlight ──────────────────────────────────────
  // They change far more often than the event data, so they don't go through
  // the store and a refetch. Instead the class hooks read these snapshots and
  // `calendar.render()` re-runs the hooks without remounting a single card.
  //
  // Not painted onto the DOM by hand: v7 (Preact) rewrites an element's whole
  // `className` whenever its own classes change — a drag start, a resize —
  // which silently wiped anything added with `classList`.
  let paint = {
    selected: new Set<ID>(),
    highlighted: new Set<ID>(),
    spotlight: null as ID | null,
    owingLanes: new Set<ID>(),
  };

  function eventClasses(info: { isMirror: boolean; event: { extendedProps: Record<string, unknown> } }): string {
    const id = info.event.extendedProps['eventId'] as ID | undefined;
    const subjectId = info.event.extendedProps['subjectId'] as ID | undefined;
    return [
      'wk-fc-event',
      info.isMirror && 'wk-fc-mirror',
      id !== undefined && paint.selected.has(id) && 'wk-selected',
      id !== undefined && paint.highlighted.has(id) && 'wk-flash',
      paint.spotlight !== null && subjectId !== paint.spotlight && 'wk-dimmed',
    ].filter(Boolean).join(' ');
  }

  /**
   * The header tells you what a column or a row *is*, so it is also where you
   * grab everything in it. Three questions get asked of a timetable over and
   * over — "what is on Mittwoch", "what does G2 have that day", "what runs at
   * 10:00" — and each was a marquee drag down a column the user had to keep
   * inside. Modifiers match the cards: a plain click replaces the selection,
   * Ctrl/Cmd or Shift adds to it.
   */
  function selectIds(ids: ID[], additive: boolean): void {
    closeQuickEdit();
    if (additive) addToSelection(ids);
    else setSelection(ids);
  }

  /** FC writes the column's own date on the cell; the week gives its index. */
  function dayIndexOf(el: HTMLElement): number | null {
    const [y, m, d] = (el.getAttribute('data-date') ?? '').split('-').map(Number);
    if (!y || !m || !d) return null;
    return extractDayIndex(new Date(y, m - 1, d));
  }

  function handleHeaderClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const state = getState();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    // What this grid is actually drawing — a view filter narrows a header
    // selection exactly as it narrows Ctrl+A.
    const here = (ev: CalendarEvent): boolean =>
      eventInPhase(state, ev, phase) && eventMatchesFilter(ev, state, filter);

    const lane = target.closest<HTMLElement>('.wk-fc-lanehead');
    if (lane) {
      const dayIndex = dayIndexOf(lane);
      const groupId = lane.getAttribute('data-resource-id');
      if (dayIndex === null || groupId === null) return;
      e.preventDefault();
      // An «alle Gruppen» Mittagessen is in this lane on this day like anything
      // else drawn in it — the column is what was clicked, not the placement.
      selectIds(
        state.events
          .filter(ev => here(ev) && ev.dayIndex === dayIndex && eventGroupIds(state, ev).includes(groupId))
          .map(ev => ev.id),
        additive,
      );
      return;
    }

    const day = target.closest<HTMLElement>('.wk-fc-dayhead');
    if (day) {
      const dayIndex = dayIndexOf(day);
      if (dayIndex === null) return;
      e.preventDefault();
      selectIds(
        state.events.filter(ev => here(ev) && ev.dayIndex === dayIndex).map(ev => ev.id),
        additive,
      );
      return;
    }

    const slot = target.closest<HTMLElement>('.wk-fc-slothead');
    if (slot) {
      const time = slotHeadTime(slot);
      if (time === '') return;
      e.preventDefault();
      // The time gutter is drawn once for the *week*, not once per phase — only
      // the leftmost open calendar shows it — so an hour selects across every
      // phase on screen. Folding a phase away therefore also takes it out of
      // this selection, which is the same rule the marquee and Ctrl+A follow:
      // what is selected is what is drawn.
      selectIds(
        state.events.filter(ev => drawnSomewhere(state, ev) && ev.startTime <= time && time < ev.endTime)
          .map(ev => ev.id),
        additive,
      );
    }
  }

  /**
   * Right-click is the grid's own menu, not the browser's.
   *
   * A card carries four actions and three editable fields, and the panel that
   * holds them is one left click away — but the gesture everyone tries first on
   * a timetable block got Chrome's "Bild speichern unter …" instead, and the
   * grid is the one surface in this app where a stray right-click is likely.
   * So every part of it answers:
   *
   *   - a card       → select it and open the quick edit, the same panel a left
   *                    click opens. It *is* the context menu: Raum, Ausbildner,
   *                    Dauer, Platzierung, plus Teilen / Gruppen / Kopie /
   *                    Löschen in its footer.
   *   - empty space  → the placement picker, i.e. "hier etwas einsetzen", on the
   *                    slot under the pointer.
   *   - a header     → the same column / lane / hour selection a left click on
   *                    it makes, modifiers included.
   *
   * The one deliberate exception is a card inside a multi-card selection. A set
   * has no popover — its actions live in the selection bar at the bottom — so
   * right-clicking one of its members would have to collapse the selection to
   * open anything, which is the opposite of what the gesture means everywhere
   * else. It keeps the set and lets the bar be the menu.
   */
  function handleContextMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const card = target.closest<HTMLElement>('.wk-fc-event');
    if (card) {
      const id = card.dataset['wkEventId'];
      if (id === undefined) return;
      e.preventDefault();
      const selection = getSelectedEventIds();
      if (selection.length > 1 && selection.includes(id)) return;
      selectEvent(id);
      const rect = card.getBoundingClientRect();
      openQuickEdit(id, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      return;
    }

    if (target.closest('.wk-fc-lanehead, .wk-fc-dayhead, .wk-fc-slothead')) {
      e.preventDefault();
      handleHeaderClick(e);
      return;
    }

    // The lanes are drawn *over* the slot rows (which sit in a layer of their
    // own underneath), so empty grid under the pointer is inside a lane.
    const cell = target.closest<HTMLElement>('.wk-fc-lane');
    const groupId = cell?.getAttribute('data-resource-id') ?? null;
    if (!cell || groupId === null) return;
    const spot = cellSpot(cell, e.clientY);
    if (!spot) return;
    e.preventDefault();
    closeQuickEdit();
    selectEvent(null);
    placePending = { date: spot, groupId, x: e.clientX, y: e.clientY };
  }

  /**
   * The day and slot a point in a lane column falls on.
   *
   * FullCalendar resolves this itself for `dateClick`, but that only fires on a
   * left button, so a right-click has to ask the DOM. The slot rows are drawn
   * once across the whole grid, each carrying its own `data-time`, so the y hit
   * test is a walk over them; the lane carries the date.
   */
  function cellSpot(cell: HTMLElement, clientY: number): Date | null {
    const [y, m, d] = (cell.getAttribute('data-date') ?? '').split('-').map(Number);
    if (!y || !m || !d) return null;
    const slats = calendarEl.querySelectorAll<HTMLElement>('.wk-fc-slot[data-time]');
    for (const slat of slats) {
      const box = slat.getBoundingClientRect();
      if (clientY < box.top || clientY >= box.bottom) continue;
      const [hh, mm] = (slat.getAttribute('data-time') ?? '').split(':').map(Number);
      if (hh === undefined || mm === undefined) return null;
      return clampToDay(new Date(y, m - 1, d, hh, mm));
    }
    return null;
  }

  /**
   * "HH:MM" of a time-axis cell. v7 writes `data-time` only on the labelled
   * (major) cells; the minor ones are bare, and `slotHeaderDidMount` gets no
   * time for them either. Each view draws exactly one axis cell per slot row,
   * in the same order, and every row does carry its time — so a bare cell
   * borrows it from its row.
   */
  function slotHeadTime(head: HTMLElement): string {
    const own = head.getAttribute('data-time');
    if (own) return own.slice(0, 5);
    const view = head.closest('.wk-fc');
    if (!view) return '';
    const index = [...view.querySelectorAll('.wk-fc-slothead')].indexOf(head);
    const row = view.querySelectorAll('.wk-fc-slot')[index];
    return (row?.getAttribute('data-time') ?? '').slice(0, 5);
  }

  /**
   * A time label's tooltip, written the moment the pointer reaches it. The
   * minor cells cannot be labelled at mount (see `slotHeadTime`), and a pass
   * over every cell after each refetch was the thing this replaces.
   */
  function handleSlotHover(e: MouseEvent): void {
    const head = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('.wk-fc-slothead');
    if (!head || head.title) return;
    const time = slotHeadTime(head);
    if (time !== '') head.title = `Alle Lektionen um ${time} auswählen`;
  }

  function drawnSomewhere(state: ReturnType<typeof getState>, ev: CalendarEvent): boolean {
    if (!eventMatchesFilter(ev, state, filter)) return false;
    const owner = state.phases.find(p => eventInPhase(state, ev, p));
    return owner !== undefined && !isPhaseCollapsed(owner.id);
  }

  /** Snapshot the UI states the class hooks read, and have FC re-run them. */
  function paintStates(): void {
    if (!calendarEl || !calendar) return;
    const spotlight = getSpotlightSubjectId();
    // "Still owed" lane headers. Dimming can only show where a subject *is*;
    // the question the sidebar chip is hovered to answer is where it is not,
    // and there is no card there to highlight — so the header carries it.
    // `missingLaneIdsForSubject` is the same computation behind the chip's
    // tooltip and the report, resolved per phase.
    paint = {
      selected: new Set(getSelectedEventIds()),
      highlighted: new Set(getHighlightedEventIds()),
      spotlight,
      owingLanes: spotlight === null
        ? new Set<ID>()
        : new Set(missingLaneIdsForSubject(getState(), spotlight, phase)),
    };
    calendar.render();
    paintTabStop();
  }

  function paintTabStop(): void {
    if (!calendarEl) return;
    const primary = getSelectedEventId();

    /**
     * K2: the grid is **one** tab stop.
     *
     * FullCalendar gives every clickable event `tabindex="0"`, so a 56-Lektion
     * week put 56 stops between the phase labels and everything after them — a
     * keyboard user could not get past the grid without pressing Tab through all
     * of it. A roving tabindex leaves exactly one card tabbable: the selected one, or the
     * first card drawn when nothing is selected. Tab enters the grid once and
     * the next Tab leaves it.
     *
     * Arrow keys are deliberately *not* rebound to step between cards: in this
     * app they move the selected block by a slot or a day, which is the fastest
     * thing on the keyboard and is documented as such. Focusing a card selects
     * it (below), so those shortcuts apply to whatever Tab just landed on.
     */
    let roving: HTMLElement | null = null;
    const cards = calendarEl.querySelectorAll<HTMLElement>('.wk-fc-event');
    for (const el of cards) {
      const id = el.dataset['wkEventId'];
      el.tabIndex = -1;
      if (id !== undefined && id === primary) roving = el;
    }

    // There is one calendar per Phase and each paints itself, so "the first card
    // in *this* grid" would leave one tab stop per Phase. The stop belongs to
    // whichever calendar holds the selected card — or, with nothing selected, to
    // whichever holds the first card in the document. Decided from the store
    // rather than from painted classes, so it does not depend on which Phase
    // repaints first.
    if (!roving && primary === null) {
      const firstInDoc = document.querySelector<HTMLElement>('.wk-fc-event');
      if (firstInDoc && calendarEl.contains(firstInDoc)) roving = firstInDoc;
    }
    roving?.setAttribute('tabindex', '0');
  }

  function eventElement(id: ID): HTMLElement | null {
    return calendarEl?.querySelector<HTMLElement>(`.wk-fc-event[data-wk-event-id="${CSS.escape(id)}"]`) ?? null;
  }

  /** Tab landed on a card: select it, without opening the popover a click does. */
  function handleCardFocus(e: FocusEvent): void {
    const card = (e.target as HTMLElement | null)?.closest?.('.wk-fc-event') as HTMLElement | null;
    const id = card?.dataset['wkEventId'];
    if (!id || getSelectedEventId() === id) return;
    selectEvent(id);
  }

  function handleEventClick(info: EventClickInfo): void {
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

    // E1: one editor. A double click used to open a full-screen modal holding
    // the same fields as the popover a single click opens — the same edit, the
    // same autosave, chosen by how many times the user clicked. The popover now
    // carries the placement too, so both counts open it and the modal is left
    // to the Lektionen that have no card to anchor it to.
    selectEvent(id);
    const rect = info.el.getBoundingClientRect();
    openQuickEdit(id, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }

  function handleEventDrop(info: EventDropInfo): void {
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
        moving.flatMap(ev => [timeToMinutes(ev.startTime), timeToMinutes(ev.endTime)]),
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

  function handleEventResize(info: EventResizeDoneInfo): void {
    const eventId = info.event.extendedProps['eventId'] as ID;
    const newStart = info.event.start!;
    const newEnd = info.event.end!;

    updateEvent(eventId, {
      dayIndex: extractDayIndex(newStart),
      startTime: formatTime(newStart),
      endTime: formatTime(newEnd),
    }, `Dauer von ${info.event.title} ändern`);
  }

  function handleEventReceive(info: EventReceiveInfo): void {
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

  function handleDateClick(info: DateClickInfo): void {
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
    for (const el of calendarEl.querySelectorAll<HTMLElement>('.wk-fc-event')) {
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
      // No adaptive plugin: its print mode flattens the time grid into a list
      // of cards — no axis, no hour lines, no proportional times — which is the
      // opposite of what a timetable on paper is for. Printing goes through the
      // PDF (`calendarPdf.ts`), which draws the grid itself.
      plugins: [classicThemePlugin, resourceTimeGridPlugin, interactionPlugin],
      // v7 Premium is AGPLv3 for open-source use, frontend and backend alike —
      // the app is AGPL-3.0-or-later.
      schedulerLicenseKey: 'AGPL-My-Frontend-And-Backend-Are-Open-Source',
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
      businessHours: {
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: GRID_BUSINESS_START,
        endTime: GRID_BUSINESS_END,
      },
      // Starting the grid on the hour is what makes the labels read 08:00, 09:00
      // rather than 07:30, 08:30 — slotHeaderInterval counts from slotMinTime.
      slotMinTime: `${gridHours.start}:00`,
      slotMaxTime: `${gridHours.end}:00`,
      slotDuration: '00:15:00',
      snapDuration: '00:15:00',
      slotHeaderInterval: '01:00:00',
      slotHeaderFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      // v7's German default drops the month ("Mi. 21"); a WK can cross a month
      // boundary, so the header keeps it ("Mi. 21.10.") as it did under v6.
      dayHeaderFormat: { weekday: 'short', day: 'numeric', month: 'numeric', omitCommas: true },
      editable: true,
      droppable: true,
      headerToolbar: false,
      initialDate: dayDate(getState().wkStartDate, phase.startDay),
      // Natural height: the phases share one scroller in App.svelte, which keeps
      // their time rows locked together without syncing two scroll positions.
      height: 'auto',
      tableHeaderSticky: true,
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
      // v7 renders hashed class names (`fc-Sd`, `fc-classic-vQz`) that change
      // between releases, so nothing of ours may select on FC's own classes.
      // These hooks put a stable `wk-fc-*` name on every part the CSS and the
      // DOM code here reach for; `data-date`, `data-resource-id` and
      // `data-time` are still FC's and still dependable.
      viewClass: 'wk-fc',
      dayHeaderClass: 'wk-fc-dayhead',
      dayHeaderInnerClass: 'wk-fc-head-inner',
      resourceDayHeaderClass: (info) => [
        dayBoundaryClasses('wk-fc-lanehead', info.date, info.isMajor),
        paint.owingLanes.has(info.resource.id) && 'wk-lane-owes',
      ].filter(Boolean).join(' '),
      resourceDayHeaderInnerClass: 'wk-fc-head-inner',
      dayLaneClass: (info) => dayBoundaryClasses('wk-fc-lane', info.date, info.isMajor),
      slotHeaderClass: (info) => (info.isMinor ? 'wk-fc-slothead wk-fc-minor' : 'wk-fc-slothead'),
      slotHeaderInnerClass: 'wk-fc-slothead-inner',
      slotLaneClass: (info) => (info.isMinor ? 'wk-fc-slot wk-fc-minor' : 'wk-fc-slot'),
      // The 1px rule beside the time gutter; a phase without a gutter hides it.
      slotHeaderDividerClass: 'wk-fc-axis-divider',
      tableHeaderClass: 'wk-fc-thead',
      eventClass: eventClasses,
      eventInnerClass: 'wk-fc-event-inner',
      // Say out loud what a header click does, on the header it does it from.
      // Set at mount: FC remounts a cell whenever it rebuilds it, and leaves
      // attributes it does not own alone in between. Time labels: see
      // `handleSlotHover`.
      dayHeaderDidMount({ el, text }) {
        el.title = `Alle Lektionen am ${text} auswählen`;
      },
      resourceDayHeaderDidMount({ el, resource }) {
        el.title = `Alle Lektionen von ${resource.title} an diesem Tag auswählen`;
      },
      eventDidMount(arg) {
        const id = arg.event.extendedProps['eventId'] as ID | undefined;
        if (id) arg.el.dataset['wkEventId'] = id;
        const subjectId = arg.event.extendedProps['subjectId'] as ID | undefined;
        if (subjectId) arg.el.dataset['wkSubjectId'] = subjectId;

        // v7 dropped `defaultRangeSeparator`, so FC's own `timeText` no longer
        // reads 08:00–09:00; the range is built from our own props instead.
        const start = arg.event.extendedProps['startTime'] as string | undefined;
        const end = arg.event.extendedProps['endTime'] as string | undefined;
        const timeText = start && end ? `${start}–${end}` : arg.timeText;

        // A clamped title still has to be readable in full somewhere.
        const teachers = (arg.event.extendedProps['teachers'] as FCEventTeacher[] | undefined) ?? [];
        const room = arg.event.extendedProps['room'] as FCEventRoom | null | undefined;
        const kinds = (arg.event.extendedProps['conflictKinds'] as ConflictKind[] | undefined) ?? [];
        const conflictNote = kinds.length > 0
          ? `⚠ Konflikt: ${kinds.map(k => CONFLICT_KIND_LABELS[k]).join(' + ')}`
          : null;
        arg.el.title = [
          arg.event.title,
          timeText,
          teachers.map(t => t.name).join(', '),
          room?.name,
          conflictNote,
        ].filter(Boolean).join(' · ');

        // K1: the same sentence, as the card's *accessible name*.
        //
        // FullCalendar renders a clickable event as a `<div role="button"
        // tabindex="0">`, so it is focusable and announced as interactive — but
        // with nothing to say, and everything the card means — the time, the
        // lane, and above all whether it is in a Konflikt — is carried by colour
        // and geometry alone. A card in a hard conflict produced the same node as
        // a clean one. The string was already being built here for the tooltip.
        const dayIndex = arg.event.extendedProps['dayIndex'] as number | undefined;
        const laneLabels = (arg.event.extendedProps['laneLabels'] as string[] | undefined) ?? [];
        arg.el.setAttribute('aria-label', [
          arg.event.title,
          dayIndex !== undefined ? `${DAY_NAMES[dayIndex]} ${timeText}` : timeText,
          laneLabels.length > 0 ? laneLabels.join(', ') : null,
          teachers.map(t => t.name).join(', '),
          room?.name,
          conflictNote,
        ].filter(Boolean).join(' · '));
      },
      eventContent(arg) {
        const props = arg.event.extendedProps;
        return eventCard({
          title: arg.event.title,
          teachers: props['teachers'] as FCEventTeacher[] | undefined,
          room: props['room'] as FCEventRoom | null | undefined,
          shortName: props['shortName'] as string | undefined,
          startTime: props['startTime'] as string | undefined,
          endTime: props['endTime'] as string | undefined,
          hardConflict: props['hardConflict'] as boolean | undefined,
          hasConflict: props['hasConflict'] as boolean | undefined,
          overrides: props['overrides'] as string[] | undefined,
        });
      },
    });
    calendar.render();

    // Delegated, because FC rebuilds its header on every refetch: a listener on
    // the cells themselves would have to be re-attached each time.
    calendarEl.addEventListener('click', handleHeaderClick);
    calendarEl.addEventListener('contextmenu', handleContextMenu);
    calendarEl.addEventListener('mouseover', handleSlotHover);

    // K2: focus and selection agree. Tabbing into the grid lands on a card and
    // selects it, so ↑↓ / ←→ / Enter / Ctrl+D / Delete act on the thing that is
    // visibly focused rather than on whatever was last clicked.
    calendarEl.addEventListener('focusin', handleCardFocus);

    return () => {
      calendarEl.removeEventListener('click', handleHeaderClick);
      calendarEl.removeEventListener('contextmenu', handleContextMenu);
      calendarEl.removeEventListener('mouseover', handleSlotHover);
      calendarEl.removeEventListener('focusin', handleCardFocus);
      calendar.destroy();
    };
  });

  /**
   * The drawn hours follow the plan, so they change while the app is open — the
   * first Lektion of the day moved to 07:45 widens the window, and clearing the
   * explicit setting narrows it back. `setOption` rather than a re-mount: this
   * fires on ordinary edits, and rebuilding both calendars mid-drag-drop would
   * be far more disruptive than the row-height case that keys them on density.
   */
  $effect(() => {
    const { start, end } = gridHours;
    if (!calendar) return;
    calendar.setOption('slotMinTime', `${start}:00`);
    calendar.setOption('slotMaxTime', `${end}:00`);
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
    // Every card is remounted by the refetch above with FC's own
    // `tabindex="0"`, so the single tab stop is re-applied after paint. Not in
    // `eventDidMount`: a tabindex written there makes FC replace the card on
    // its next render, which throws away keyboard focus on the card being
    // selected. State classes and header tooltips need nothing: hooks set them.
    requestAnimationFrame(paintTabStop);
  });

  // Selection and hover states repaint on their own, without a refetch.
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
