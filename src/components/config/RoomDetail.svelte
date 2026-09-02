<script lang="ts">
  import { updateRoom, removeRoom, setRoomUnavailable, getState } from '../../state/store.svelte';
  import { formatDuration } from '../../utils/timeUtils';
  import { roomLoad } from '../../reports/reports';
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
  const usage = $derived(roomLoad(appState, room.id));

  function set(patch: Partial<Omit<Room, 'id'>>, coalesceKey?: string): void {
    updateRoom(room.id, patch, coalesceKey ? { coalesceKey } : {});
  }

  function setWindows(unavailable: TimeWindow[]): void {
    setRoomUnavailable(room.id, unavailable);
  }

  function remove(): void {
    if (!window.confirm(`«${room.name}» löschen?\nLektionen verlieren ihre Raumzuteilung.`)) return;
    const index = getState().rooms.findIndex(r => r.id === room.id);
    removeRoom(room.id);
    ondeleted(index);
  }
</script>

<div class="detail-form">
  <div class="detail-header">
    <span class="detail-title">{view.name}</span>
    <span class="autosave-pill"><Icon name="check" size={12} /> Automatisch gespeichert</span>
  </div>

  <div class="flex flex-col gap-4 pt-1">
    <div class="form-field">
      <span class="field-label">Raumname</span>
      <div class="flex items-center gap-3 max-w-md">
        <ColorPicker
          value={view.color}
          onpick={(color) => set({ color }, `room-color:${room.id}`)}
        />
        <input
          class="input input-bordered input-sm flex-1"
          type="text"
          value={view.name}
          placeholder="z. B. Seminarraum 1"
          onchange={(e) => set({ name: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>
    </div>

    <label class="option-row">
      <span class="option-text">
        <span class="option-title">Konflikte ignorieren</span>
        <span class="option-desc">
          Zwei Gruppen dürfen hier gleichzeitig gebucht sein, ohne gemeldet zu werden. Für geteilte
          Flächen wie «draussen». Die Sperrzeiten unten gelten trotzdem.
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
    title="Gesperrt"
    emptyText="Die ganze Woche frei. Unten einen Tag hinzufügen, wenn das nicht stimmt."
    hint="Eine Lektion in einer Sperrzeit wird als weicher Konflikt gemeldet, wie eine Doppelbelegung."
    notePlaceholder="Grund (optional) — z. B. belegt durch Feuerwehr"
  />

  <section class="usage">
    <h4 class="section-title">Belegung diese Woche</h4>
    <div class="wk-stat-row">
      <div class="wk-stat">
        <span class="wk-stat-value wk-num">{usage.count}</span>
        <span class="wk-stat-label">{usage.count === 1 ? 'Belegung' : 'Belegungen'}</span>
      </div>
      <div class="wk-stat">
        <span class="wk-stat-value wk-num">{formatDuration(usage.minutes)}</span>
        <span class="wk-stat-label">in Gebrauch</span>
      </div>
    </div>
    {#if usage.subjects.length > 0}
      <p class="usage-note">
        Vorgegebener Raum für
        {#each usage.subjects as s, i (s.id)}<span class="usage-subject"><span
          class="usage-dot" style="background:{s.color}"></span>{s.name}</span>{i < usage.subjects.length - 1 ? ', ' : ''}{/each}
      </p>
    {:else}
      <p class="usage-note">Kein Thema nutzt diesen Raum als Vorgabe.</p>
    {/if}
  </section>

  <div class="detail-footer">
    <button type="button" class="btn btn-ghost btn-sm text-error gap-1.5" onclick={remove}>
      <Icon name="trash" size={13} /> Raum löschen
    </button>
  </div>
</div>
