<script lang="ts">
  import { getState } from '../state/store.svelte';
  import { detectConflicts } from '../conflicts/detector';
  import { DAY_NAMES, orphanEvents } from '../utils/timeUtils';
  import type { CalendarEvent, ID } from '../types';

  interface Props {
    selectedEventId: string | null;
  }

  let { selectedEventId = $bindable() }: Props = $props();

  const appState = $derived(getState());
  const conflicts = $derived(detectConflicts(appState));
  const teacherCount = $derived(conflicts.filter(c => c.kind === 'teacher').length);
  const groupCount = $derived(conflicts.filter(c => c.kind === 'group').length);
  const roomCount = $derived(conflicts.filter(c => c.kind === 'room').length);
  const orphans = $derived(orphanEvents(appState));

  const KIND_LABEL = { teacher: 'Teacher', room: 'Room', group: 'Group' } as const;

  // groupId is an ID for a normal event and an ID[] for a multi-group one
  function groupLabels(ev: CalendarEvent): string {
    const ids: ID[] = Array.isArray(ev.groupId) ? ev.groupId : [ev.groupId];
    const labels = ids
      .map(id => appState.groups.find(g => g.id === id)?.label)
      .filter(Boolean);
    return labels.length > 0 ? labels.join(', ') : '—';
  }
</script>

<div class="flex flex-col h-full">
    <div class="flex items-center gap-2 px-3 py-2.5 border-b border-base-300 shrink-0">
      <span class="text-[0.68rem] font-semibold uppercase tracking-widest text-base-content/50 flex-1">
        Conflicts
      </span>
      {#if conflicts.length > 0}
        <span class="badge badge-error badge-sm font-semibold">{conflicts.length}</span>
      {/if}
    </div>

    <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
      {#if orphans.length > 0}
        <!-- These fall outside every phase's days or lanes, so no calendar draws
             them — without this they would just disappear. -->
        <div class="conflict-card conflict-hard">
          <span class="conflict-kind">Not on any calendar</span>
          <span class="text-xs text-base-content/60">
            {orphans.length} event{orphans.length === 1 ? '' : 's'} sit outside every phase. Open one to move it.
          </span>
          <div class="flex flex-col gap-1 mt-1">
            {#each orphans as ev (ev.id)}
              {@const subject = appState.subjects.find(s => s.id === ev.subjectId)}
              <button class="conflict-event" onclick={() => (selectedEventId = ev.id)}>
                <span class="conflict-dot" style="background:{subject?.color ?? '#888'}"></span>
                <span class="truncate">{subject?.name ?? '?'}</span>
                <span class="conflict-when">
                  {groupLabels(ev)} · {DAY_NAMES[ev.dayIndex] ?? ''} {ev.startTime}
                </span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if conflicts.length === 0 && orphans.length === 0}
        <div class="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/10 px-3 py-3">
          <span class="text-success text-base leading-none mt-0.5">✓</span>
          <div class="flex flex-col gap-0.5">
            <span class="text-sm font-semibold text-success">No conflicts</span>
            <span class="text-xs text-base-content/50">No group, teacher or room is double-booked.</span>
          </div>
        </div>
      {:else if conflicts.length > 0}
        <p class="text-xs text-base-content/50 px-0.5">
          {teacherCount} teacher · {groupCount} group · {roomCount} room
        </p>

        {#each conflicts as conflict (conflict.kind + conflict.resourceId + conflict.involvedEventIds.join(','))}
          {@const hard = conflict.kind !== 'room'}
          {@const events = conflict.involvedEventIds
            .map(id => appState.events.find(ev => ev.id === id))
            .filter(Boolean)}
          <div class="conflict-card" class:conflict-hard={hard} class:conflict-soft={!hard}>
            <div class="flex items-center gap-1.5">
              <span class="conflict-kind">{KIND_LABEL[conflict.kind]}</span>
              <span class="conflict-severity">{hard ? 'hard' : 'soft'}</span>
            </div>
            <span class="text-xs font-semibold">{conflict.resourceName}</span>
            <div class="flex flex-col gap-1 mt-1">
              {#each events as ev (ev!.id)}
                {@const subject = appState.subjects.find(s => s.id === ev!.subjectId)}
                <button class="conflict-event" onclick={() => (selectedEventId = ev!.id)}>
                  <span class="conflict-dot" style="background:{subject?.color ?? '#888'}"></span>
                  <span class="truncate">{subject?.name ?? '?'}</span>
                  <span class="conflict-when">
                    {groupLabels(ev!)} · {DAY_NAMES[ev!.dayIndex] ?? ''} {ev!.startTime}
                  </span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>
</div>

<style>
  /* ── Conflict cards ────────────────────────────────────────────────────────── */
  .conflict-card {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border-left-width: 3px;
    border-left-style: solid;
    border-radius: 0 0.5rem 0.5rem 0;
    padding: 0.5rem 0.6rem;
  }

  .conflict-hard {
    border-left-color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 10%, transparent);
  }

  .conflict-soft {
    border-left-color: var(--color-warning);
    background: color-mix(in oklab, var(--color-warning) 10%, transparent);
  }

  .conflict-kind {
    font-size: 0.72rem;
    font-weight: 700;
  }

  .conflict-hard .conflict-kind { color: var(--color-error); }
  .conflict-soft .conflict-kind { color: var(--color-warning); }

  .conflict-severity {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.5;
  }

  .conflict-event {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    padding: 0.15rem 0.25rem;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--wk-text-mute);
    font-size: 0.72rem;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }

  .conflict-event:hover {
    background: color-mix(in oklab, var(--color-base-content) 8%, transparent);
    color: var(--wk-text);
  }

  .conflict-dot {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .conflict-when {
    margin-left: auto;
    padding-left: 0.4rem;
    opacity: 0.7;
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
