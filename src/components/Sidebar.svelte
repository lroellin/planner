<script lang="ts">
  import { onMount } from 'svelte';
  import { Draggable } from '@fullcalendar/interaction';
  import { getState } from '../state/store.svelte';
  import { spotlightSubject } from '../state/ui.svelte';
  import { coverageForSubject, missingLanesForSubject } from '../reports/reports';
  import { sortSubjects } from '../utils/timeUtils';
  import PlaceDialog from './PlaceDialog.svelte';
  import Icon from './Icon.svelte';
  import type { ID, Subject } from '../types';

  let chipContainer: HTMLDivElement;
  let draggable: Draggable;

  const appState = $derived(getState());
  let query = $state('');

  const matching = $derived(
    appState.subjects.filter(s =>
      query.trim() === '' || s.name.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );
  const lessons = $derived(sortSubjects(matching.filter(s => !s.isBreak)));
  const breaks = $derived(sortSubjects(matching.filter(s => s.isBreak)));
  // A search box on six chips is clutter; on twenty it is the only way through.
  const showSearch = $derived(appState.subjects.length > 8);

  // Chips are buttons, so a subject can be placed from the keyboard: activating
  // one opens the placement dialog. Dragging stays the fast path for the mouse.
  let placingSubjectId: ID | null = $state(null);
  let pressOrigin: { x: number; y: number } | null = null;

  function onChipPointerDown(e: PointerEvent): void {
    pressOrigin = { x: e.clientX, y: e.clientY };
  }

  // A click that travelled is the tail of a drag, not a request to open a dialog.
  // Keyboard activation reports (0, 0) with no preceding pointerdown, so it falls
  // through to the open below.
  function onChipClick(subjectId: ID, e: MouseEvent): void {
    const origin = pressOrigin;
    pressOrigin = null;
    if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 5) return;
    placingSubjectId = subjectId;
  }

  function chipTitle(subject: Subject): string {
    if (subject.isBreak) return `${subject.name} — drag onto the calendar, or click to place it`;
    const missing = missingLanesForSubject(appState, subject.id);
    return missing.length === 0
      ? `${subject.name} — every lane has it`
      : `${subject.name} — still missing: ${missing.join(', ')}`;
  }

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

<div class="sidebar">
  {#if showSearch}
    <label class="search">
      <Icon name="search" size={13} />
      <input placeholder="Filter subjects" bind:value={query} />
      {#if query}
        <button class="search-clear" onclick={() => (query = '')} aria-label="Clear filter">
          <Icon name="x" size={12} />
        </button>
      {/if}
    </label>
  {/if}

  <div bind:this={chipContainer} class="chips">
    {#each [{ items: lessons, label: 'Subjects', coverage: true }, { items: breaks, label: 'Breaks', coverage: false }] as section (section.label)}
      {#if section.items.length > 0}
        <div class="section">
          <p class="wk-eyebrow section-label">{section.label}</p>
          <div class="section-items">
            {#each section.items as subject (subject.id)}
              <button
                type="button"
                class="subject-chip"
                class:chip-break={subject.isBreak}
                data-subject-id={subject.id}
                style="--sc: {subject.color}"
                title={chipTitle(subject)}
                onpointerdown={onChipPointerDown}
                onclick={(e) => onChipClick(subject.id, e)}
                onmouseenter={() => spotlightSubject(subject.id)}
                onmouseleave={() => spotlightSubject(null)}
                onfocus={() => spotlightSubject(subject.id)}
                onblur={() => spotlightSubject(null)}
              >
                <span class="chip-spine"></span>
                <Icon name="grip" size={13} class="chip-grip" />
                <span class="chip-name">{subject.name}</span>
                {#if subject.isMultiGroup}
                  <Icon name="layers" size={12} class="chip-multi" />
                {/if}
                {#if section.coverage}
                  {@const cov = coverageForSubject(appState, subject.id)}
                  <span
                    class="chip-cov wk-num"
                    class:cov-done={cov.placed === cov.total && cov.total > 0}
                  >{cov.placed}/{cov.total}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    {#if matching.length === 0}
      <p class="empty">No subject matches “{query}”.</p>
    {/if}
  </div>

  <p class="hint">
    Drag onto the grid, or click a chip to place it by day and time.
  </p>
</div>

{#if placingSubjectId}
  <PlaceDialog subjectId={placingSubjectId} onclose={() => (placingSubjectId = null)} />
{/if}

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0.6rem 0.6rem 0.2rem;
    padding: 0 0.45rem;
    height: 28px;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    color: var(--wk-text-faint);
    flex-shrink: 0;
  }
  .search:focus-within { border-color: var(--color-primary); }

  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    outline: none;
    font-size: var(--wk-fs-xs);
    color: var(--wk-text);
  }

  .search-clear {
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    display: flex;
    padding: 2px;
  }

  .chips {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 0.7rem 0.6rem;
  }

  .section-label {
    margin: 0 0 0.4rem 0.15rem;
  }

  .section-items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .subject-chip {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    text-align: left;
    padding: 0.34rem 0.45rem 0.34rem 0.6rem;
    border-radius: var(--wk-r-sm);
    font-size: var(--wk-fs-sm);
    font-weight: 500;
    cursor: grab;
    user-select: none;
    color: var(--wk-text);
    background: color-mix(in oklab, var(--sc) 8%, var(--wk-surface));
    border: 1px solid color-mix(in oklab, var(--sc) 22%, var(--wk-line));
    overflow: hidden;
    transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
  }

  /* The chip previews the card it will become: same spine, same tint recipe. */
  .chip-spine {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--sc);
  }

  .subject-chip:hover {
    background: color-mix(in oklab, var(--sc) 15%, var(--wk-surface));
    box-shadow: var(--wk-shadow-1);
  }

  .subject-chip:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .subject-chip:active {
    cursor: grabbing;
  }

  .chip-break {
    background: var(--wk-surface-alt);
    border-color: var(--wk-line);
    color: var(--wk-text-mute);
  }
  .chip-break .chip-spine { background: var(--wk-line-strong); }
  .chip-break:hover { background: var(--wk-surface-alt); }

  .subject-chip :global(.chip-grip) {
    color: var(--wk-text-faint);
    opacity: 0.5;
    transition: opacity 0.12s;
  }
  .subject-chip:hover :global(.chip-grip) { opacity: 1; }

  .subject-chip :global(.chip-multi) {
    color: var(--wk-text-faint);
  }

  .chip-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
  }

  .chip-cov {
    flex-shrink: 0;
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
    padding: 0.05rem 0.3rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-base-content) 9%, transparent);
    color: var(--wk-text-mute);
  }

  .cov-done {
    background: color-mix(in oklab, var(--color-success) 18%, transparent);
    color: var(--color-success);
  }

  .empty,
  .hint {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    line-height: 1.5;
  }

  .empty { padding: 0 0.3rem; }

  .hint {
    flex-shrink: 0;
    padding: 0.5rem 0.7rem 0.6rem;
    border-top: 1px solid var(--wk-line);
  }
</style>
