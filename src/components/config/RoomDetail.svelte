<script lang="ts">
  import { updateRoom, removeRoom, setRoomUnavailable, getState } from '../../state/store.svelte';
  import {
    effectiveRoomId, timeDiffMinutes, formatDuration, sortSubjects,
  } from '../../utils/timeUtils';
  import ColorPicker from './ColorPicker.svelte';
  import AvailabilityEditor from './AvailabilityEditor.svelte';
  import Icon from '../Icon.svelte';
  import type { Room, TimeWindow } from '../../types';

  interface Props {
    /** Always an existing room: creation happens in the list's quick-add. */
    room: Room;
    ondeleted: (index: number) => void;
  }

  let { room, ondeleted }: Props = $props();

  const appState = $derived(getState());
  const view = $derived(room);

  /** Bookings and the subjects that default here — the room's side of the plan. */
  const usage = $derived.by(() => {
    const events = appState.events.filter(ev => {
      const subject = appState.subjects.find(s => s.id === ev.subjectId);
      return effectiveRoomId(ev, subject) === room.id;
    });
    return {
      count: events.length,
      minutes: events.reduce((n, ev) => n + timeDiffMinutes(ev.startTime, ev.endTime), 0),
      subjects: sortSubjects(appState.subjects.filter(s => s.defaultRoomId === room.id)),
    };
  });

  function set(patch: Partial<Omit<Room, 'id'>>, coalesceKey?: string): void {
    updateRoom(room.id, patch, coalesceKey ? { coalesceKey } : {});
  }

  function setWindows(unavailable: TimeWindow[]): void {
    setRoomUnavailable(room.id, unavailable);
  }

  function remove(): void {
    if (!window.confirm(`Delete "${room.name}"?\nEvents will lose their room assignment.`)) return;
    const index = getState().rooms.findIndex(r => r.id === room.id);
    removeRoom(room.id);
    ondeleted(index);
  }
</script>

<div class="detail-form">
  <div class="detail-header">
    <span class="detail-title">{view.name}</span>
    <span class="autosave-pill"><Icon name="check" size={12} /> Autosaved</span>
  </div>

  <div class="flex flex-col gap-4 pt-1">
    <div class="form-field">
      <span class="field-label">Room name</span>
      <div class="flex items-center gap-3 max-w-md">
        <ColorPicker
          value={view.color}
          onpick={(color) => set({ color }, `room-color:${room.id}`)}
        />
        <input
          class="input input-bordered input-sm flex-1"
          type="text"
          value={view.name}
          placeholder="e.g. Seminarraum 1"
          onchange={(e) => set({ name: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>
    </div>

    <label class="option-row">
      <span class="option-text">
        <span class="option-title">Ignore conflicts</span>
        <span class="option-desc">
          Two groups may be booked here at the same time without being flagged. Use this for shared
          spaces such as "outside". Blocked times below still apply.
        </span>
      </span>
      <input
        type="checkbox"
        class="toggle toggle-primary toggle-sm"
        checked={view.excludeFromConflictCheck}
        onchange={(e) => set({ excludeFromConflictCheck: (e.currentTarget as HTMLInputElement).checked })}
      />
    </label>
  </div>

  <AvailabilityEditor
    windows={view.unavailable}
    onchange={setWindows}
    title="Blocked"
    emptyText="Free the whole week. Add a day below if that is not true."
    hint="Booking a lesson into a blocked time is flagged as a soft conflict, like a double booking."
    notePlaceholder="Why (optional) — e.g. belegt durch Feuerwehr"
  />

  <section class="usage">
    <h4 class="section-title">Occupancy this week</h4>
    <div class="wk-stat-row">
      <div class="wk-stat">
        <span class="wk-stat-value wk-num">{usage.count}</span>
        <span class="wk-stat-label">booking{usage.count === 1 ? '' : 's'}</span>
      </div>
      <div class="wk-stat">
        <span class="wk-stat-value wk-num">{formatDuration(usage.minutes)}</span>
        <span class="wk-stat-label">in use</span>
      </div>
    </div>
    {#if usage.subjects.length > 0}
      <p class="usage-note">
        Default room for
        {#each usage.subjects as s, i (s.id)}<span class="usage-subject"><span
          class="usage-dot" style="background:{s.color}"></span>{s.name}</span>{i < usage.subjects.length - 1 ? ', ' : ''}{/each}
      </p>
    {:else}
      <p class="usage-note">No subject uses this room by default.</p>
    {/if}
  </section>

  <div class="detail-footer">
    <button type="button" class="btn btn-ghost btn-sm text-error gap-1.5" onclick={remove}>
      <Icon name="trash" size={13} /> Delete room
    </button>
  </div>
</div>
