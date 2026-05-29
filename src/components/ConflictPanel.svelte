<script lang="ts">
  import { getState } from '../state/store.svelte';
  import { detectConflicts } from '../conflicts/detector';

  const state = $derived(getState());
  const conflicts = $derived(detectConflicts(state));
</script>

<div class="conflict-panel">
  <h6>Conflicts</h6>

  {#if conflicts.length === 0}
    <p class="no-conflicts">No conflicts</p>
  {:else}
    <ul class="conflict-list">
      {#each conflicts as conflict (conflict.kind + conflict.resourceId + conflict.involvedEventIds.join(','))}
        {@const events = conflict.involvedEventIds.map(id => state.events.find(ev => ev.id === id)).filter(Boolean)}
        {@const subjects = events.map(ev => state.subjects.find(s => s.id === ev!.subjectId))}
        <li class="conflict-item {conflict.kind}">
          <span class="conflict-type">{conflict.kind === 'teacher' ? '⚠ Teacher' : '⚑ Room'}</span>
          <span class="conflict-resource">{conflict.resourceName}</span>
          <div class="conflict-events">
            {#each events as ev, i}
              {#if ev}
                <span>{subjects[i]?.name ?? '?'} ({state.groups.find(g => g.id === ev.groupId)?.label ?? '?'} {['Mon','Tue','Wed','Thu','Fri'][ev.dayIndex] ?? ''} {ev.startTime})</span>
              {/if}
            {/each}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .conflict-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  h6 {
    margin: 0 0 0.25rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
  }

  .no-conflicts {
    font-size: 0.82rem;
    opacity: 0.5;
    margin: 0;
  }

  .conflict-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .conflict-item {
    font-size: 0.78rem;
    border-left: 3px solid #e53e3e;
    padding: 0.3rem 0.5rem;
    background: rgba(229, 62, 62, 0.05);
    border-radius: 0 4px 4px 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .conflict-type {
    font-weight: 700;
    color: #e53e3e;
  }

  .conflict-resource {
    font-weight: 600;
  }

  .conflict-events {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    opacity: 0.75;
  }
</style>
