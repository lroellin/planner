<script lang="ts">
  import { addRoom, updateRoom, removeRoom, getState } from '../../state/store.svelte';
  import { effectiveRoomId, timeDiffMinutes, formatDuration } from '../../utils/timeUtils';
  import ColorPicker from './ColorPicker.svelte';
  import Icon from '../Icon.svelte';
  import type { Room } from '../../types';

  interface Props {
    /** null = the create form; an entity = the autosaving edit form. */
    room: Room | null;
    draftColor: string;
    oncreated: (id: string) => void;
    oncancel: () => void;
    ondeleted: (index: number) => void;
  }

  let { room, draftColor, oncreated, oncancel, ondeleted }: Props = $props();

  // Seeded once — see TeacherDetail.
  // svelte-ignore state_referenced_locally
  let draft = $state({ name: '', color: draftColor, excludeFromConflictCheck: false });

  const appState = $derived(getState());
  const view = $derived(room ?? draft);
  const isNew = $derived(room === null);

  /** Bookings and the subjects that default here — the room's side of the plan. */
  const usage = $derived.by(() => {
    if (!room) return null;
    const events = appState.events.filter(ev => {
      const subject = appState.subjects.find(s => s.id === ev.subjectId);
      return effectiveRoomId(ev, subject) === room.id;
    });
    return {
      count: events.length,
      minutes: events.reduce((n, ev) => n + timeDiffMinutes(ev.startTime, ev.endTime), 0),
      subjects: appState.subjects.filter(s => s.defaultRoomId === room.id),
    };
  });

  function set(patch: Partial<Omit<Room, 'id'>>, coalesceKey?: string): void {
    if (room) updateRoom(room.id, patch, coalesceKey ? { coalesceKey } : {});
    else draft = { ...draft, ...patch };
  }

  function create(e?: Event): void {
    e?.preventDefault();
    if (!draft.name.trim()) return;
    addRoom(draft.name.trim(), draft.color, draft.excludeFromConflictCheck);
    oncreated(getState().rooms.at(-1)?.id ?? '');
  }

  function remove(): void {
    if (!room) return;
    if (!window.confirm(`Delete "${room.name}"?\nEvents will lose their room assignment.`)) return;
    const index = getState().rooms.findIndex(r => r.id === room.id);
    removeRoom(room.id);
    ondeleted(index);
  }
</script>

<form class="detail-form" onsubmit={create}>
  <div class="detail-header">
    <span class="detail-title">{isNew ? 'New room' : view.name}</span>
    {#if !isNew}
      <span class="autosave-pill"><Icon name="check" size={12} /> Autosaved</span>
    {/if}
  </div>

  <div class="flex flex-col gap-4 pt-1">
    <div class="form-field">
      <span class="field-label">Room name</span>
      <div class="flex items-center gap-3 max-w-md">
        <ColorPicker
          value={view.color}
          onpick={(color) => set({ color }, `room-color:${room?.id ?? 'new'}`)}
        />
        <input
          class="input input-bordered input-sm flex-1"
          type="text"
          value={view.name}
          placeholder="e.g. Seminarraum 1"
          oninput={isNew ? (e) => set({ name: (e.currentTarget as HTMLInputElement).value }) : undefined}
          onchange={isNew ? undefined : (e) => set({ name: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>
    </div>

    <label class="option-row">
      <span class="option-text">
        <span class="option-title">Ignore conflicts</span>
        <span class="option-desc">
          Two groups may be booked here at the same time without being flagged. Use this for shared
          spaces such as "outside".
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

  {#if usage}
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
  {/if}

  <div class="detail-footer">
    {#if isNew}
      <button type="button" class="btn btn-ghost btn-sm" onclick={oncancel}>Cancel</button>
      <button type="submit" class="btn btn-primary btn-sm" disabled={!draft.name.trim()}>Create room</button>
    {:else}
      <button type="button" class="btn btn-ghost btn-sm text-error gap-1.5" onclick={remove}>
        <Icon name="trash" size={13} /> Delete room
      </button>
    {/if}
  </div>
</form>
