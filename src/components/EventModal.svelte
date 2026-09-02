<script lang="ts">
  import { nanoid } from 'nanoid';
  import {
    getState, addEvent, updateEvent, removeEvent, splitEvent, copyEventToLanes, lanesWithoutEvent,
  } from '../state/store.svelte';
  import { selectEvent } from '../state/ui.svelte';
  import {
    snapToSlot, timeDiffMinutes, addMinutesToTime, DAY_NAMES, phaseGroups,
    resolveTeacherIds, resolveRoomId, isMultiGroupEvent, dayDateLabel,
  } from '../utils/timeUtils';
  import { getContrastColor } from '../utils/colorUtils';
  import { teacherShort } from '../utils/format';
  import Icon from './Icon.svelte';
  import TimeField from './TimeField.svelte';
  import { ALL_GROUPS, isHardConflict, type ConflictKind, type ID } from '../types';

  interface Props {
    eventId: ID;
    onclose: () => void;
  }

  let { eventId, onclose }: Props = $props();

  const appState = $derived(getState());
  const ev = $derived(appState.events.find(e => e.id === eventId));
  const subject = $derived(ev ? appState.subjects.find(s => s.id === ev.subjectId) : null);

  // Local editable copies. Dragging and resizing on the grid stays the fast path;
  // the start time is editable here too, because an event that no phase draws
  // (an orphan) is on no calendar to drag.
  let localTeacherIds: ID[] | 'inherit' = $state('inherit');
  let localRoomId: ID | null | 'inherit' = $state('inherit');
  let localDuration: number = $state(60);
  let localStartTime: string = $state('08:00');
  let showSplit: boolean = $state(false);
  let splitTime: string = $state('');
  let showCopy: boolean = $state(false);
  let copyLanes: ID[] = $state([]);
  // Day/lane are edited here rather than by dragging: each phase is its own
  // calendar instance, and FullCalendar cannot drag an event between two.
  let localDayIndex: number = $state(0);
  let localGroupId: ID = $state('');

  const isMultiGroup = $derived(ev ? isMultiGroupEvent(ev) : false);

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

  const spareLanes = $derived(ev ? lanesWithoutEvent(ev.id) : []);

  const KIND_LABEL: Record<ConflictKind, string> = {
    teacher: 'Teacher',
    room: 'Room',
    group: 'Group',
    'teacher-absent': 'Away:',
    'room-blocked': 'Blocked:',
  };

  /** Named clashes, so the editor says what it is you came here to fix. */
  const conflictNotes = $derived.by(() => {
    if (!ev?.conflicts) return [];
    return ev.conflicts.map(c => {
      const name =
        c.kind === 'teacher' || c.kind === 'teacher-absent'
          ? appState.teachers.find(t => t.id === c.resourceId)?.name
        : c.kind === 'room' || c.kind === 'room-blocked'
          ? appState.rooms.find(r => r.id === c.resourceId)?.name
        : appState.groups.find(g => g.id === c.resourceId)?.label;
      return { kind: c.kind, name: name ?? c.resourceId, hard: isHardConflict(c.kind) };
    });
  });

  // Reloads the form whenever a different event is opened. Keyed on the id, not
  // the event object, so an unrelated store update can't clobber a pending edit.
  $effect(() => {
    const current = getState().events.find(e => e.id === eventId);
    if (!current) return;
    localTeacherIds = current.teacherIds;
    localRoomId = current.roomId;
    localDayIndex = current.dayIndex;
    localStartTime = current.startTime;
    localGroupId = isMultiGroupEvent(current) ? '' : current.groupId;
    const totalMin = timeDiffMinutes(current.startTime, current.endTime);
    localDuration = totalMin;
    splitTime = snapToSlot(addMinutesToTime(current.startTime, Math.round(totalMin / 2)));
  });

  const defaultDuration = $derived(subject?.defaultDurationMinutes ?? 60);
  const durationOverridden = $derived(localDuration !== defaultDuration);
  const startTimeMoved = $derived(ev ? snapToSlot(localStartTime) !== ev.startTime : false);
  const previewEnd = $derived(
    addMinutesToTime(snapToSlot(localStartTime), Math.max(15, localDuration)),
  );

  const effectiveTeacherIds = $derived(resolveTeacherIds(localTeacherIds, subject));
  const effectiveRoomId = $derived(resolveRoomId(localRoomId, subject));

  function save(): void {
    if (!ev) return;
    // A multi-group event keeps the ALL_GROUPS sentinel: it follows the lanes of
    // whichever phase covers its day, so a cross-phase move needs no re-mapping.
    const groupId = isMultiGroup ? ALL_GROUPS : targetGroupId || ev.groupId;
    const startTime = snapToSlot(localStartTime);

    updateEvent(eventId, {
      teacherIds: localTeacherIds,
      roomId: localRoomId,
      startTime,
      endTime: addMinutesToTime(startTime, Math.max(15, localDuration)),
      dayIndex: localDayIndex,
      groupId,
    }, `editing ${subject?.name ?? 'event'}`);
    onclose();
  }

  function duplicateEvent(): void {
    if (!ev) return;
    const { conflicts: _, ...copy } = ev;
    addEvent({ ...copy, id: nanoid() }, `duplicating ${subject?.name ?? 'event'}`);
    onclose();
  }

  function deleteEvent(): void {
    removeEvent(eventId);
    selectEvent(null);
    onclose();
  }

  function doSplit(): void {
    splitEvent(eventId, splitTime);
    onclose();
  }

  function doCopy(): void {
    copyEventToLanes(eventId, copyLanes);
    onclose();
  }

  function toggleTeacher(tid: ID): void {
    const current = effectiveTeacherIds;
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
  <div class="sheet" style="--ev-color: {subject?.color ?? 'gray'}">
    {#if ev && subject}
      <header class="sheet-head">
        <span class="sheet-spine"></span>
        <div class="min-w-0 flex-1">
          <h3 class="sheet-title">{subject.name}</h3>
          <p class="sheet-when wk-num">
            {DAY_NAMES[ev.dayIndex] ?? ''} {dayDateLabel(appState.wkStartDate, ev.dayIndex)}
            · {ev.startTime}–{ev.endTime}
          </p>
        </div>
        <button class="sheet-x" onclick={onclose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </header>

      {#if conflictNotes.length > 0}
        <div class="clashes">
          {#each conflictNotes as note (note.kind + note.name)}
            <span class="clash" class:clash-hard={note.hard}>
              <Icon name="alert" size={11} />
              {KIND_LABEL[note.kind]} {note.name}
            </span>
          {/each}
        </div>
      {/if}

      <div class="sheet-body">
        <!-- Placement -->
        <div class="field">
          <span class="field-name">Placement</span>
          <div class="field-control">
            <div class="row-2">
              <select class="select select-bordered select-sm flex-1" bind:value={localDayIndex}>
                {#each DAY_NAMES as name, i (name)}
                  <option value={i}>{name}</option>
                {/each}
              </select>
              {#if isMultiGroup}
                <span class="inline-note flex-1">all lanes</span>
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
            {#if targetPhase === null}
              <p class="warn">
                No phase covers {DAY_NAMES[localDayIndex]} — the event would not appear on any calendar.
              </p>
            {:else if laneOptions.length === 0}
              <p class="warn">
                {targetPhase.label} has no active lanes — the event would not appear on any calendar.
              </p>
            {:else}
              <p class="hint">
                {targetPhase.label}{#if isMultiGroup} · {laneOptions.map(g => g.label).join(', ')}{/if}
              </p>
            {/if}
          </div>
        </div>

        <!-- Teachers -->
        <div class="field">
          <span class="field-name">Teachers</span>
          <div class="field-control">
            <div class="teacher-grid">
              {#each appState.teachers as t (t.id)}
                {@const on = effectiveTeacherIds.includes(t.id)}
                <button
                  class="teacher-chip"
                  class:teacher-chip-on={on}
                  style="--tc:{t.color}"
                  aria-pressed={on}
                  onclick={() => toggleTeacher(t.id)}
                >
                  <span
                    class="teacher-av"
                    style="background:{on ? t.color : 'transparent'}; color:{on ? getContrastColor(t.color) : 'var(--wk-text-faint)'}; border-color:{t.color}"
                  >{teacherShort(t)}</span>
                  <span class="truncate">{t.name}</span>
                </button>
              {/each}
              {#if appState.teachers.length === 0}
                <span class="hint">No teachers configured.</span>
              {/if}
            </div>
            {#if localTeacherIds !== 'inherit'}
              <button class="reset" onclick={resetTeachers}>
                <Icon name="reset" size={11} /> back to subject default
              </button>
            {:else}
              <span class="hint">from the subject default</span>
            {/if}
          </div>
        </div>

        <!-- Room -->
        <div class="field">
          <span class="field-name">Room</span>
          <div class="field-control">
            <select
              class="select select-bordered select-sm w-full"
              value={effectiveRoomId ?? ''}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                localRoomId = v === '' ? null : v;
              }}
            >
              <option value="">No room</option>
              {#each appState.rooms as r (r.id)}
                <option value={r.id}>{r.name}</option>
              {/each}
            </select>
            {#if localRoomId !== 'inherit'}
              <button class="reset" onclick={resetRoom}>
                <Icon name="reset" size={11} /> back to subject default
              </button>
            {:else}
              <span class="hint">from the subject default</span>
            {/if}
          </div>
        </div>

        <!-- Time + duration -->
        <div class="field">
          <span class="field-name">Time</span>
          <div class="field-control">
            <div class="row-2">
              <TimeField bind:value={localStartTime} ariaLabel="Start time" />
              <input
                type="number"
                min="15"
                step="15"
                class="input input-bordered input-sm w-20"
                value={localDuration}
                oninput={(e) => {
                  const n = Number((e.currentTarget as HTMLInputElement).value);
                  if (Number.isFinite(n) && n > 0) localDuration = n;
                }}
              />
              <span class="inline-note wk-num">min · ends {previewEnd}</span>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
              {#if startTimeMoved}
                <span class="hint wk-num">moved from {ev.startTime}</span>
              {/if}
              {#if durationOverridden}
                <button class="reset" onclick={resetDuration}>
                  <Icon name="reset" size={11} /> back to {defaultDuration} min
                </button>
              {:else}
                <span class="hint">duration from the subject default</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Split -->
        {#if showSplit}
          <div class="inset">
            <span class="inset-label">Split at</span>
            <TimeField bind:value={splitTime} class="flex-1" ariaLabel="Split at" />
            <button class="btn btn-sm btn-primary" onclick={doSplit}>Split</button>
            <button class="btn btn-sm btn-ghost" onclick={() => showSplit = false}>Cancel</button>
          </div>
        {/if}

        <!-- Copy to lanes -->
        {#if showCopy}
          <div class="inset inset-col">
            <div class="flex items-center gap-2 w-full">
              <span class="inset-label">Copy to</span>
              {#if spareLanes.length === 0}
                <span class="hint">Every other lane already has this at this time.</span>
              {:else}
                <div class="flex gap-1.5 flex-wrap flex-1">
                  {#each spareLanes as g (g.id)}
                    <label class="lane" class:lane-on={copyLanes.includes(g.id)}>
                      <input
                        type="checkbox"
                        checked={copyLanes.includes(g.id)}
                        onchange={(e) => {
                          const on = (e.currentTarget as HTMLInputElement).checked;
                          copyLanes = on ? [...copyLanes, g.id] : copyLanes.filter(id => id !== g.id);
                        }}
                      />
                      {g.label}
                    </label>
                  {/each}
                </div>
              {/if}
              <button class="btn btn-sm btn-primary" disabled={copyLanes.length === 0} onclick={doCopy}>
                Copy
              </button>
              <button class="btn btn-sm btn-ghost" onclick={() => (showCopy = false)}>Cancel</button>
            </div>
            <p class="hint">
              Same day and time on each chosen lane. Clashes are reported, never blocked.
            </p>
          </div>
        {/if}
      </div>

      <!-- Five labelled buttons plus Cancel/Save never fit the sheet, and the
           overflow clipped Save right off the end. The secondary actions are the
           same four the quick popover offers, so they take the same icon-button
           vocabulary here and leave the room to the two that decide the edit. -->
      <footer class="sheet-foot">
        <div class="foot-actions">
          <button
            class="act act-danger"
            onclick={deleteEvent}
            title="Delete this event"
            aria-label="Delete this event"
          >
            <Icon name="trash" size={15} />
          </button>
          {#if !showSplit && !showCopy}
            <span class="act-sep"></span>
            <button
              class="act"
              onclick={() => (showSplit = true)}
              title="Split into two events"
              aria-label="Split into two events"
            >
              <Icon name="scissors" size={15} />
            </button>
            <button
              class="act"
              onclick={duplicateEvent}
              title="Duplicate"
              aria-label="Duplicate"
            >
              <Icon name="copy" size={15} />
            </button>
            {#if !isMultiGroup}
              <button
                class="act"
                disabled={spareLanes.length === 0}
                onclick={() => { showCopy = true; copyLanes = spareLanes.map(g => g.id); }}
                title="Copy to the other lanes"
                aria-label="Copy to the other lanes"
              >
                <Icon name="layers" size={15} />
              </button>
            {/if}
          {/if}
        </div>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" onclick={onclose}>Cancel</button>
          <button class="btn btn-primary btn-sm" onclick={save}>Save</button>
        </div>
      </footer>
    {:else}
      <div class="p-6 text-sm">Event not found.</div>
    {/if}
  </div>
</dialog>

<style>
  dialog::backdrop {
    background: color-mix(in oklab, black 45%, transparent);
  }

  .sheet {
    width: min(460px, 94vw);
    background: var(--wk-surface);
    color: var(--wk-text);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 88vh;
  }

  .sheet-head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.85rem 0.85rem 0.85rem 0;
    border-bottom: 1px solid var(--wk-line);
  }

  .sheet-spine {
    width: 4px;
    align-self: stretch;
    background: var(--ev-color);
  }

  .sheet-title {
    font-size: var(--wk-fs-lg);
    font-weight: 700;
    margin: 0;
    line-height: 1.25;
  }

  .sheet-when {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-faint);
  }

  .sheet-x {
    display: flex;
    padding: 0.3rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .sheet-x:hover { background: var(--wk-surface-alt); color: var(--wk-text); }

  .clashes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.55rem 0.9rem;
    border-bottom: 1px solid var(--wk-line);
    background: var(--wk-surface-alt);
  }

  .clash {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    background: color-mix(in oklab, var(--color-warning) 16%, transparent);
    color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text));
  }

  .clash-hard {
    background: color-mix(in oklab, var(--color-error) 13%, transparent);
    color: var(--color-error);
  }

  .sheet-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .field {
    display: flex;
    gap: 0.75rem;
  }

  .field-name {
    width: 5rem;
    flex-shrink: 0;
    padding-top: 0.4rem;
    font-size: var(--wk-fs-sm);
    font-weight: 650;
  }

  .field-control {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .row-2 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .inline-note,
  .hint {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-faint);
  }

  .warn {
    font-size: var(--wk-fs-xs);
    color: color-mix(in oklab, var(--color-warning) 78%, var(--wk-text));
  }

  .reset {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    font-size: var(--wk-fs-xs);
    color: var(--color-primary);
    cursor: pointer;
  }
  .reset:hover { text-decoration: underline; }

  .teacher-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.3rem;
  }

  .teacher-chip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-xs);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .teacher-chip:hover { border-color: var(--tc); color: var(--wk-text); }
  .teacher-chip-on {
    border-color: var(--tc);
    background: color-mix(in oklab, var(--tc) 10%, transparent);
    color: var(--wk-text);
    font-weight: 600;
  }

  .teacher-av {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1.5px solid;
    font-size: 9px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .inset {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: var(--wk-surface-alt);
  }

  .inset-col {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
  }

  .inset-label {
    font-size: var(--wk-fs-sm);
    font-weight: 650;
    flex-shrink: 0;
  }

  .lane {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: var(--wk-surface);
    font-size: var(--wk-fs-xs);
    cursor: pointer;
  }
  .lane-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
  }
  .lane input { accent-color: var(--color-primary); }

  .sheet-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-top: 1px solid var(--wk-line);
    background: var(--wk-surface-alt);
  }

  .foot-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  .act {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: var(--wk-r-sm);
    background: transparent;
    color: var(--wk-text-mute);
    cursor: pointer;
  }
  .act:hover:not(:disabled) { background: var(--wk-surface); color: var(--wk-text); }
  .act:disabled { opacity: 0.35; cursor: default; }
  .act-danger:hover:not(:disabled) {
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 12%, transparent);
  }

  .act-sep {
    width: 1px;
    height: 18px;
    margin: 0 0.25rem;
    background: var(--wk-line);
  }
</style>
