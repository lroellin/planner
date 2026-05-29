<script lang="ts">
  import { nanoid } from 'nanoid';
  import { getState, updateEvent, removeEvent, setState } from '../state/store.svelte';
  import { snapToSlot, timeDiffMinutes, addMinutesToTime, DAY_NAMES } from '../utils/timeUtils';
  import type { ID } from '../types';

  interface Props {
    eventId: ID;
    onclose: () => void;
  }

  let { eventId, onclose }: Props = $props();

  const state = $derived(getState());
  const ev = $derived(state.events.find(e => e.id === eventId));
  const subject = $derived(ev ? state.subjects.find(s => s.id === ev.subjectId) : null);

  // Local editable copies
  let localTeacherIds: ID[] | null = $state(null);
  let localRoomId: ID | null | 'inherit' = $state('inherit');
  let localStartTime: string = $state('');
  let localEndTime: string = $state('');
  let showSplit: boolean = $state(false);
  let splitTime: string = $state('');

  // Initialize locals when modal opens
  $effect(() => {
    if (!ev) return;
    localTeacherIds = ev.teacherIds;
    localRoomId = ev.roomId === null ? 'inherit' : ev.roomId;
    localStartTime = ev.startTime;
    localEndTime = ev.endTime;
    // default split time to midpoint
    const totalMin = timeDiffMinutes(ev.startTime, ev.endTime);
    splitTime = snapToSlot(addMinutesToTime(ev.startTime, Math.round(totalMin / 2)));
  });

  function effectiveTeacherIds(): ID[] {
    return localTeacherIds ?? subject?.defaultTeacherIds ?? [];
  }

  function effectiveRoomId(): ID | null {
    if (localRoomId === 'inherit') return subject?.defaultRoomId ?? null;
    return localRoomId;
  }

  function save(): void {
    updateEvent(eventId, {
      teacherIds: localTeacherIds,
      roomId: localRoomId === 'inherit' ? null : localRoomId,
      startTime: localStartTime,
      endTime: localEndTime,
    });
    onclose();
  }

  function deleteEvent(): void {
    removeEvent(eventId);
    onclose();
  }

  function doSplit(): void {
    if (!ev) return;
    const snapped = snapToSlot(splitTime);
    if (snapped <= ev.startTime || snapped >= ev.endTime) return;

    const part1 = { ...ev, endTime: snapped, conflicts: undefined };
    const part2 = { ...ev, id: nanoid(), startTime: snapped, conflicts: undefined };

    setState({
      ...state,
      events: state.events
        .filter(e => e.id !== eventId)
        .concat([part1, part2]),
    });
    onclose();
  }

  function toggleTeacher(tid: ID): void {
    const current = effectiveTeacherIds();
    localTeacherIds = current.includes(tid)
      ? current.filter(id => id !== tid)
      : [...current, tid];
  }

  function resetTeachers(): void { localTeacherIds = null; }
  function resetRoom(): void { localRoomId = 'inherit'; }
  function resetTimes(): void {
    if (!ev) return;
    localStartTime = ev.startTime;
    localEndTime = ev.endTime;
  }

  let dialogEl: HTMLDialogElement;
  $effect(() => {
    if (dialogEl) dialogEl.showModal();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} onclose={onclose} onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}>
  <article>
    {#if ev && subject}
      <header>
        <h4 style="margin:0">{subject.name}</h4>
        <small>{DAY_NAMES[ev.dayIndex] ?? ''} · {ev.startTime}–{ev.endTime}</small>
      </header>

      <div class="form-section">
        <div class="field-row">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Teachers</label>
          <div class="field-controls">
            <div class="multi-check">
              {#each state.teachers as t (t.id)}
                <label class="check-label">
                  <input
                    type="checkbox"
                    checked={effectiveTeacherIds().includes(t.id)}
                    onchange={() => toggleTeacher(t.id)}
                  />
                  <span class="color-dot" style="background:{t.color}"></span>
                  {t.name}
                </label>
              {/each}
            </div>
            <div class="field-meta">
              {#if localTeacherIds !== null}
                <span class="override-badge">overridden</span>
                <button class="reset-btn" onclick={resetTeachers}>↩ reset</button>
              {:else}
                <span class="default-badge">default</span>
              {/if}
            </div>
          </div>
        </div>

        <div class="field-row">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Room</label>
          <div class="field-controls">
            <select
              value={effectiveRoomId() ?? ''}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                localRoomId = v === '' ? null : v;
              }}
            >
              <option value="">None</option>
              {#each state.rooms as r (r.id)}
                <option value={r.id}>{r.name}</option>
              {/each}
            </select>
            <div class="field-meta">
              {#if localRoomId !== 'inherit'}
                <span class="override-badge">overridden</span>
                <button class="reset-btn" onclick={resetRoom}>↩ reset</button>
              {:else}
                <span class="default-badge">default</span>
              {/if}
            </div>
          </div>
        </div>

        <div class="field-row">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Time</label>
          <div class="field-controls">
            <div class="time-row">
              <input type="time" bind:value={localStartTime} step="900" />
              <span>–</span>
              <input type="time" bind:value={localEndTime} step="900" />
            </div>
            <div class="field-meta">
              {#if localStartTime !== ev.startTime || localEndTime !== ev.endTime}
                <span class="override-badge">changed</span>
                <button class="reset-btn" onclick={resetTimes}>↩ reset</button>
              {/if}
            </div>
          </div>
        </div>
      </div>

      {#if showSplit}
        <div class="split-section">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Split at:</label>
          <input type="time" bind:value={splitTime} step="900" />
          <button onclick={doSplit}>Confirm split</button>
          <button class="secondary" onclick={() => showSplit = false}>Cancel</button>
        </div>
      {/if}

      <footer>
        <div class="footer-left">
          <button class="danger" onclick={deleteEvent}>Delete</button>
          {#if !showSplit}
            <button class="secondary" onclick={() => showSplit = true}>Split</button>
          {/if}
        </div>
        <div class="footer-right">
          <button class="secondary" onclick={onclose}>Cancel</button>
          <button onclick={save}>Save</button>
        </div>
      </footer>
    {:else}
      <p>Event not found.</p>
    {/if}
  </article>
</dialog>

<style>
  dialog {
    max-width: 480px;
    width: 90vw;
    border-radius: 8px;
    border: none;
    padding: 0;
  }

  dialog::backdrop {
    background: rgba(0,0,0,0.4);
  }

  article {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    border-bottom: 1px solid var(--pico-muted-border-color, #e0e0e0);
    padding-bottom: 0.75rem;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field-row {
    display: grid;
    grid-template-columns: 80px 1fr;
    gap: 0.5rem;
    align-items: start;
  }

  label {
    font-size: 0.85rem;
    font-weight: 600;
    padding-top: 0.2rem;
  }

  .field-controls {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
  }

  .override-badge {
    background: rgba(49, 130, 206, 0.12);
    color: #3182ce;
    padding: 0.1rem 0.4rem;
    border-radius: 99px;
    font-size: 0.7rem;
  }

  .default-badge {
    color: #aaa;
  }

  .reset-btn {
    background: none;
    border: none;
    color: #4299e1;
    cursor: pointer;
    padding: 0;
    font-size: 0.75rem;
    text-decoration: underline;
  }

  .multi-check {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .check-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: normal;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }

  .time-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  input[type="time"] {
    font-size: 0.85rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--pico-muted-border-color, #ccc);
    border-radius: 4px;
  }

  select {
    font-size: 0.85rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--pico-muted-border-color, #ccc);
    border-radius: 4px;
  }

  .split-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(246, 224, 94, 0.12);
    border: 1px solid rgba(246, 224, 94, 0.45);
    border-radius: 4px;
    padding: 0.5rem;
    font-size: 0.85rem;
  }

  footer {
    display: flex;
    justify-content: space-between;
    border-top: 1px solid var(--pico-muted-border-color, #e0e0e0);
    padding-top: 0.75rem;
  }

  .footer-left, .footer-right {
    display: flex;
    gap: 0.4rem;
  }

  button {
    font-size: 0.82rem;
    padding: 0.3rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid transparent;
    background: #3182ce;
    color: white;
  }

  button.secondary {
    background: transparent;
    border-color: var(--pico-muted-border-color, #ccc);
    color: inherit;
  }

  button.danger {
    background: #e53e3e;
  }
</style>
