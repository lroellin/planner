<script lang="ts">
  import { nanoid } from 'nanoid';
  import { getState, addEvent, updateEvent, removeEvent, setState } from '../state/store.svelte';
  import { snapToSlot, timeDiffMinutes, addMinutesToTime, DAY_NAMES, phaseGroups } from '../utils/timeUtils';
  import type { ID } from '../types';

  interface Props {
    eventId: ID;
    onclose: () => void;
  }

  let { eventId, onclose }: Props = $props();

  const appState = $derived(getState());
  const ev = $derived(appState.events.find(e => e.id === eventId));
  const subject = $derived(ev ? appState.subjects.find(s => s.id === ev.subjectId) : null);

  // Local editable copies. Times are not edited here — start/end are changed by
  // dragging and resizing the event directly on the calendar.
  let localTeacherIds: ID[] | 'inherit' = $state('inherit');
  let localRoomId: ID | null | 'inherit' = $state('inherit');
  let localDuration: number = $state(60);
  let showSplit: boolean = $state(false);
  let splitTime: string = $state('');
  // Day/lane are edited here rather than by dragging: each phase is its own
  // calendar instance, and FullCalendar cannot drag an event between two.
  let localDayIndex: number = $state(0);
  let localGroupId: ID = $state('');

  const isMultiGroup = $derived(ev ? Array.isArray(ev.groupId) : false);

  // The chosen day decides the phase, and the phase decides which lanes exist.
  // Offering all groups regardless of day is what let a move land the event
  // outside every phase, where no calendar draws it.
  const targetPhase = $derived(
    appState.phases.find(p => localDayIndex >= p.startDay && localDayIndex <= p.endDay) ?? null,
  );
  const laneOptions = $derived(targetPhase ? phaseGroups(appState, targetPhase) : []);
  // Falls back to the first lane of the new phase when the current one isn't in it.
  const targetGroupId = $derived(
    laneOptions.some(g => g.id === localGroupId) ? localGroupId : laneOptions[0]?.id ?? '',
  );

  $effect(() => {
    if (!ev) return;
    localTeacherIds = ev.teacherIds;
    localRoomId = ev.roomId;
    localDayIndex = ev.dayIndex;
    localGroupId = Array.isArray(ev.groupId) ? '' : ev.groupId;
    const totalMin = timeDiffMinutes(ev.startTime, ev.endTime);
    localDuration = totalMin;
    splitTime = snapToSlot(addMinutesToTime(ev.startTime, Math.round(totalMin / 2)));
  });

  const defaultDuration = $derived(subject?.defaultDurationMinutes ?? 60);
  const durationOverridden = $derived(localDuration !== defaultDuration);
  const previewEnd = $derived(ev ? addMinutesToTime(ev.startTime, Math.max(15, localDuration)) : '');

  function effectiveTeacherIds(): ID[] {
    if (localTeacherIds === 'inherit') return subject?.defaultTeacherIds ?? [];
    return localTeacherIds;
  }

  function effectiveRoomId(): ID | null {
    if (localRoomId === 'inherit') return subject?.defaultRoomId ?? null;
    return localRoomId;
  }

  function save(): void {
    if (!ev) return;
    // A multi-group event re-expands to whatever lanes the target phase draws,
    // otherwise moving it across phases would leave it on the old phase's lanes.
    const groupId = isMultiGroup
      ? (targetPhase ? laneOptions.map(g => g.id) : ev.groupId)
      : targetGroupId || ev.groupId;

    updateEvent(eventId, {
      teacherIds: localTeacherIds,
      roomId: localRoomId,
      endTime: addMinutesToTime(ev.startTime, Math.max(15, localDuration)),
      dayIndex: localDayIndex,
      groupId,
    });
    onclose();
  }

  function duplicateEvent(): void {
    if (!ev) return;
    const { conflicts: _, ...copy } = ev;
    addEvent({ ...copy, id: nanoid() });
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
      ...appState,
      events: appState.events
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

  function resetTeachers(): void { localTeacherIds = 'inherit'; }
  function resetRoom(): void { localRoomId = 'inherit'; }
  function resetDuration(): void { localDuration = defaultDuration; }

  let dialogEl: HTMLDialogElement;
  $effect(() => {
    if (dialogEl) dialogEl.showModal();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} onclose={onclose} onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}
  class="modal">
  <div class="modal-box max-w-md p-0 overflow-hidden">
    {#if ev && subject}
      <!-- Subject color accent bar -->
      <div style="height: 4px; background: {subject.color};"></div>
      <!-- Header -->
      <div class="flex items-start justify-between px-5 pt-4 pb-4 border-b border-base-200">
        <div>
          <h3 class="text-base font-bold">{subject.name}</h3>
          <p class="text-sm text-base-content/50 mt-0.5">{DAY_NAMES[ev.dayIndex] ?? ''} · {ev.startTime}–{ev.endTime}</p>
        </div>
        <button class="btn btn-ghost btn-sm btn-circle" onclick={onclose}>✕</button>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 flex flex-col gap-4">

        <!-- Placement -->
        <div class="flex gap-3">
          <span class="text-sm font-semibold w-16 shrink-0 pt-0.5">Placement</span>
          <div class="flex items-center gap-2 flex-1">
            <select class="select select-bordered select-sm flex-1" bind:value={localDayIndex}>
              {#each DAY_NAMES as name, i (name)}
                <option value={i}>{name}</option>
              {/each}
            </select>
            {#if isMultiGroup}
              <span class="text-sm text-base-content/50 flex-1">all lanes</span>
            {:else}
              <select
                class="select select-bordered select-sm flex-1"
                value={targetGroupId}
                disabled={laneOptions.length === 0}
                onchange={(e) => (localGroupId = (e.currentTarget as HTMLSelectElement).value)}
              >
                {#each laneOptions as g (g.id)}
                  <option value={g.id}>{g.label}</option>
                {/each}
              </select>
            {/if}
          </div>
        </div>

        {#if targetPhase === null}
          <p class="text-xs text-warning -mt-2 pl-[4.75rem]">
            No phase covers {DAY_NAMES[localDayIndex]} — the event would not appear on any calendar.
          </p>
        {:else if laneOptions.length === 0}
          <p class="text-xs text-warning -mt-2 pl-[4.75rem]">
            {targetPhase.label} has no active lanes — the event would not appear on any calendar.
          </p>
        {:else}
          <p class="text-xs text-base-content/40 -mt-2 pl-[4.75rem]">
            {targetPhase.label}{#if isMultiGroup} · {laneOptions.map(g => g.label).join(', ')}{/if}
          </p>
        {/if}

        <!-- Teachers -->
        <div class="flex gap-3">
          <span class="text-sm font-semibold w-16 shrink-0 pt-0.5">Teachers</span>
          <div class="flex flex-col gap-1.5 flex-1">
            <div class="flex flex-col gap-1">
              {#each appState.teachers as t (t.id)}
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-primary checkbox-sm"
                    checked={effectiveTeacherIds().includes(t.id)}
                    onchange={() => toggleTeacher(t.id)}
                  />
                  <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:{t.color}"></span>
                  <span class="text-sm">{t.name}</span>
                </label>
              {/each}
            </div>
            <div class="flex items-center gap-2">
              {#if localTeacherIds !== 'inherit'}
                <span class="badge badge-primary badge-sm badge-outline">overridden</span>
                <button class="btn btn-ghost btn-xs text-primary" onclick={resetTeachers}>↩ reset</button>
              {:else}
                <span class="text-xs text-base-content/40">default</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Room -->
        <div class="flex gap-3">
          <span class="text-sm font-semibold w-16 shrink-0 pt-1.5">Room</span>
          <div class="flex flex-col gap-1.5 flex-1">
            <select
              class="select select-bordered select-sm w-full"
              value={effectiveRoomId() ?? ''}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                localRoomId = v === '' ? null : v;
              }}
            >
              <option value="">None</option>
              {#each appState.rooms as r (r.id)}
                <option value={r.id}>{r.name}</option>
              {/each}
            </select>
            <div class="flex items-center gap-2">
              {#if localRoomId !== 'inherit'}
                <span class="badge badge-primary badge-sm badge-outline">overridden</span>
                <button class="btn btn-ghost btn-xs text-primary" onclick={resetRoom}>↩ reset</button>
              {:else}
                <span class="text-xs text-base-content/40">default</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Duration -->
        <div class="flex gap-3">
          <span class="text-sm font-semibold w-16 shrink-0 pt-1.5">Duration</span>
          <div class="flex flex-col gap-1.5 flex-1">
            <div class="flex items-center gap-2">
              <input
                type="number"
                min="15"
                step="15"
                class="input input-bordered input-sm w-24"
                value={localDuration}
                oninput={(e) => {
                  const n = Number((e.currentTarget as HTMLInputElement).value);
                  if (Number.isFinite(n) && n > 0) localDuration = n;
                }}
              />
              <span class="text-sm text-base-content/50">min · ends {previewEnd}</span>
            </div>
            <div class="flex items-center gap-2">
              {#if durationOverridden}
                <span class="badge badge-primary badge-sm badge-outline">overridden</span>
                <button class="btn btn-ghost btn-xs text-primary" onclick={resetDuration}>
                  ↩ reset to {defaultDuration} min
                </button>
              {:else}
                <span class="text-xs text-base-content/40">default</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Split -->
        {#if showSplit}
          <div class="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
            <span class="text-sm font-medium shrink-0">Split at:</span>
            <input type="time" bind:value={splitTime} step="900" class="input input-bordered input-sm flex-1" />
            <button class="btn btn-sm btn-primary" onclick={doSplit}>Confirm</button>
            <button class="btn btn-sm btn-ghost" onclick={() => showSplit = false}>Cancel</button>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between px-5 pb-5 border-t border-base-200 pt-4">
        <div class="flex gap-2">
          <button class="btn btn-error btn-sm" onclick={deleteEvent}>Delete</button>
          {#if !showSplit}
            <button class="btn btn-ghost btn-sm" onclick={() => showSplit = true}>Split</button>
            <button class="btn btn-ghost btn-sm" onclick={duplicateEvent}>Duplicate</button>
          {/if}
        </div>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" onclick={onclose}>Cancel</button>
          <button class="btn btn-primary btn-sm" onclick={save}>Save</button>
        </div>
      </div>
    {:else}
      <div class="p-6 text-sm text-base-content/50">Event not found.</div>
    {/if}
  </div>
</dialog>

<style>
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.4);
  }
</style>
