<script lang="ts">
  import { onMount } from 'svelte';
  import { Draggable } from '@fullcalendar/interaction';
  import { getState } from '../state/store.svelte';
  import { getContrastColor } from '../utils/colorUtils';

  let chipContainer: HTMLDivElement;
  let draggable: Draggable;

  const state = $derived(getState());

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
          // No `create: false` — we need eventReceive to fire so Calendar.svelte
          // can remove the temp FC event and add to the store instead.
        };
      },
    });

    return () => draggable.destroy();
  });
</script>

<!-- chipContainer wraps ALL chips so the Draggable covers both subjects and breaks -->
<div bind:this={chipContainer} class="sidebar-content">
  <h6>Subjects</h6>
  <div class="chip-list">
    {#each state.subjects.filter(s => !s.isBreak) as subject (subject.id)}
      <div
        class="subject-chip"
        data-subject-id={subject.id}
        style="background:{subject.color}; color:{getContrastColor(subject.color)}"
      >
        {subject.name}
      </div>
    {/each}
  </div>

  {#if state.subjects.some(s => s.isBreak)}
    <h6 class="section-heading">Breaks</h6>
    <div class="chip-list">
      {#each state.subjects.filter(s => s.isBreak) as subject (subject.id)}
        <div
          class="subject-chip"
          data-subject-id={subject.id}
          style="background:{subject.color}; color:{getContrastColor(subject.color)}"
        >
          {subject.name}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sidebar-content {
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

  .section-heading {
    margin-top: 0.75rem;
  }

  .chip-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .subject-chip {
    padding: 0.35rem 0.6rem;
    border-radius: 4px;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: grab;
    user-select: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    transition: box-shadow 0.15s;
  }

  .subject-chip:hover {
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
  }

  .subject-chip:active {
    cursor: grabbing;
  }
</style>
