<script lang="ts">
  import { onMount } from 'svelte';
  import { Draggable } from '@fullcalendar/interaction';
  import { getState } from '../state/store.svelte';
  import { coverageForSubject } from '../reports/reports';

  let chipContainer: HTMLDivElement;
  let draggable: Draggable;

  const appState = $derived(getState());

  onMount(() => {
    draggable = new Draggable(chipContainer, {
      itemSelector: '.subject-chip',
      eventData(chipEl: HTMLElement) {
        const subjectId = chipEl.dataset['subjectId']!;
        const subject = getState().subjects.find(s => s.id === subjectId);
        return {
          title: subject?.name ?? '',
          duration: { minutes: subject?.defaultDurationMinutes ?? 60 },
          backgroundColor: subject?.color ?? '#888',
          borderColor: subject?.color ?? '#888',
          extendedProps: { subjectId },
        };
      },
    });

    return () => draggable.destroy();
  });
</script>

<div bind:this={chipContainer} class="flex flex-col gap-3 p-3">
  <div>
    <p class="text-[0.68rem] font-semibold uppercase tracking-widest text-base-content/40 mb-2 px-1">Subjects</p>
    <div class="flex flex-col gap-1.5">
      {#each appState.subjects.filter(s => !s.isBreak) as subject (subject.id)}
        {@const cov = coverageForSubject(appState, subject.id)}
        <div
          class="subject-chip"
          data-subject-id={subject.id}
          style="border-left-color: {subject.color}"
          title={subject.isMultiGroup ? 'Multi-group: drops onto all groups at once' : subject.name}
        >
          <span class="drag-handle">⠿</span>
          <span class="chip-name">{subject.name}</span>
          {#if subject.isMultiGroup}<span class="chip-all-badge" title="All groups">⊞</span>{/if}
          <span
            class="chip-cov"
            class:cov-done={cov.placed === cov.total && cov.total > 0}
            title="{cov.placed} of {cov.total} groups have this subject placed"
          >{cov.placed}/{cov.total}</span>
        </div>
      {/each}
    </div>
  </div>

  {#if appState.subjects.some(s => s.isBreak)}
    <div>
      <p class="text-[0.68rem] font-semibold uppercase tracking-widest text-base-content/40 mb-2 px-1">Breaks</p>
      <div class="flex flex-col gap-1.5">
        {#each appState.subjects.filter(s => s.isBreak) as subject (subject.id)}
          <div
            class="subject-chip"
            data-subject-id={subject.id}
            style="border-left-color: {subject.color}"
            title={subject.isMultiGroup ? 'Multi-group: drops onto all groups at once' : subject.name}
          >
            <span class="drag-handle">⠿</span>
            <span class="chip-name">{subject.name}</span>
            {#if subject.isMultiGroup}<span class="chip-all-badge" title="All groups">⊞</span>{/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .subject-chip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.32rem 0.5rem 0.32rem 0.4rem;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: grab;
    user-select: none;
    background: var(--wk-surface-alt);
    color: var(--wk-text);
    border: 1px solid var(--wk-line);
    border-left: 4px solid transparent;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    transition: box-shadow 0.15s, background 0.1s;
  }

  .subject-chip:hover {
    background: var(--wk-surface);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  .subject-chip:active {
    cursor: grabbing;
  }

  .drag-handle {
    font-size: 0.85rem;
    color: color-mix(in oklab, var(--color-base-content) 20%, transparent);
    flex-shrink: 0;
    line-height: 1;
    transition: color 0.15s;
  }

  .subject-chip:hover .drag-handle {
    color: color-mix(in oklab, var(--color-base-content) 50%, transparent);
  }

  .chip-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
  }

  .chip-all-badge {
    font-size: 0.75rem;
    opacity: 0.45;
    flex-shrink: 0;
  }

  .chip-cov {
    flex-shrink: 0;
    font-size: 0.62rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 0.05rem 0.28rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-base-content) 10%, transparent);
    color: var(--wk-text-mute);
  }

  .cov-done {
    background: color-mix(in oklab, var(--color-success) 18%, transparent);
    color: var(--color-success);
  }
</style>
