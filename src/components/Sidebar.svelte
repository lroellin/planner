<script lang="ts">
  import { onMount } from 'svelte';
  import { Draggable } from '@fullcalendar/interaction';
  import { getState } from '../state/store.svelte';
  import { spotlightSubject, requestPlacement, requestConfig } from '../state/ui.svelte';
  import {
    coverageForSubject, missingLanesForSubject, missingLaneIdsForSubject, subjectPhases,
  } from '../reports/reports';
  import { sortSubjects } from '../utils/timeUtils';
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
  const lessons = $derived(sortSubjects(matching.filter(s => s.kind === 'lesson')));
  // Programmpunkte are created from a calendar cell, not here — but they stay
  // listed so the same Antreten can be placed again on the next day instead of
  // being retyped. No coverage badge: nobody owes them.
  const oneoffs = $derived(sortSubjects(matching.filter(s => s.kind === 'oneoff')));
  const breaks = $derived(sortSubjects(matching.filter(s => s.kind === 'break')));
  // A search box on six chips is clutter; on twenty it is the only way through.
  const showSearch = $derived(appState.subjects.length > 8);

  // Chips are buttons, so a subject can be placed from the keyboard: activating
  // one opens the placement dialog. Dragging stays the fast path for the mouse.
  let pressOrigin: { x: number; y: number } | null = null;

  /**
   * The first lane that still owes this Thema, so activating a chip opens the
   * placement dialog already pointed at the gap. The chip's badge says "2
   * fehlen" and the tooltip names which — and the dialog then used to open on
   * whatever lane happened to be first, making the user re-derive an answer the
   * app had just given them.
   */
  function firstMissingLane(subjectId: ID): ID | undefined {
    for (const phase of subjectPhases(appState, subjectId)) {
      const missing = missingLaneIdsForSubject(appState, subjectId, phase);
      if (missing.length > 0) return missing[0];
    }
    return undefined;
  }

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
    const groupId = firstMissingLane(subjectId);
    requestPlacement(subjectId, groupId !== undefined ? { groupId } : {});
  }

  /**
   * What the chip's badge says. The badge used to be a bare "3/4" whose whole
   * meaning was carried by its colour: green 3/3 (done), amber 3/3 (uneven) and
   * grey 3/4 (incomplete) were the same shape, and grey means "switched off"
   * everywhere else in this app. So each state gets a *form* too, and the three
   * that need work lead with what is missing rather than with a ratio you have
   * to subtract for yourself.
   */
  type ChipState =
    | { kind: 'complete' }
    | { kind: 'missing'; label: string }
    | { kind: 'short'; label: string }
    | { kind: 'over'; label: string }
    | { kind: 'uneven'; label: string };

  function chipState(subject: Subject): ChipState {
    const cov = coverageForSubject(appState, subject.id);
    const gaps = cov.total - cov.placed;
    if (gaps > 0) return { kind: 'missing', label: `fehlt ${gaps}×` };
    if (cov.short) return { kind: 'short', label: 'zu kurz' };
    // Over-planning: the report's own verdict, so the two cannot disagree.
    if (cov.over) return { kind: 'over', label: 'zu lang' };
    if (cov.uneven) return { kind: 'uneven', label: 'ungleich' };
    return { kind: 'complete' };
  }

  // Says *where* it is still missing — the question the counter only raises.
  // "Uneven" has no missing lane to name, so it gets its own sentence rather
  // than an empty list.
  function chipTitle(subject: Subject): string {
    if (subject.kind !== 'lesson') return `${subject.name} — auf den Kalender ziehen oder anklicken`;
    const cov = coverageForSubject(appState, subject.id);
    const missing = missingLanesForSubject(appState, subject.id);
    if (missing.length > 0) {
      return cov.short
        ? `${subject.name} — Zeit fehlt noch bei: ${missing.join(', ')}`
        : `${subject.name} — fehlt noch bei: ${missing.join(', ')}`;
    }
    if (cov.over) {
      return `${subject.name} — mindestens eine Gruppe hat mehr als die Dauer des Themas`;
    }
    if (cov.uneven) {
      return `${subject.name} — alle Gruppen haben die volle Dauer, aber unterschiedlich viel`;
    }
    return `${subject.name} — jede Gruppe hat die volle Dauer`;
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
      <input placeholder="Themen filtern" bind:value={query} />
      {#if query}
        <button class="search-clear" onclick={() => (query = '')} aria-label="Filter löschen">
          <Icon name="x" size={12} />
        </button>
      {/if}
    </label>
  {/if}

  <div bind:this={chipContainer} class="chips">
    {#each [
      { items: lessons, label: 'Themen', coverage: true },
      { items: oneoffs, label: 'Programmpunkte', coverage: false },
      { items: breaks, label: 'Pausen', coverage: false },
    ] as section (section.label)}
      <!-- Themen is drawn even when empty. Hiding the heading on a fresh plan
           meant the word never appeared anywhere, while the grid's empty state
           was telling the user to drag "ein Thema" out of this very panel. -->
      {#if section.items.length > 0 || (section.coverage && query.trim() === '')}
        <div class="section">
          <p class="wk-eyebrow section-label">{section.label}</p>
          <div class="section-items">
            {#each section.items as subject (subject.id)}
              <button
                type="button"
                class="subject-chip"
                class:chip-break={subject.kind === 'break'}
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
                <span class="chip-line">
                  <Icon name="grip" size={13} class="chip-grip" />
                  <span class="chip-name">{subject.name}</span>
                  {#if subject.isMultiGroup}
                    <Icon name="layers" size={12} class="chip-multi" />
                  {/if}
                  <!-- A green "3/3" while the coverage report calls the same row
                       uneven is the badge people look at all day being the one
                       that is wrong, so the chip carries the report's verdict. -->
                  {#if section.coverage && chipState(subject).kind === 'complete'}
                    <Icon name="check" size={12} class="chip-done" />
                  {/if}
                </span>
                {#if section.coverage}
                  {@const st = chipState(subject)}
                  {#if st.kind !== 'complete'}
                    <!-- Its own line: at 208px the badge and the name were
                         competing for the same run of pixels and the name lost —
                         "Persönliche Ausr…", "Schutzanlage Be…" — when the name
                         is the whole affordance. -->
                    <span class="chip-foot">
                      <span class="chip-flag chip-flag-{st.kind}">
                        {#if st.kind === 'missing'}<Icon name="alert" size={10} />{/if}
                        {st.label}
                      </span>
                    </span>
                  {/if}
                {/if}
              </button>
            {/each}

            {#if section.items.length === 0}
              <!-- The only way forward on a fresh plan. Both placement paths —
                   dragging a chip and clicking an empty cell — dead-ended here,
                   and nothing in the app linked to the screen where a Thema is
                   made. -->
              <p class="none">Noch keine Themen.</p>
              <button class="none-cta" onclick={() => requestConfig('subjects', { createSubject: true })}>
                <Icon name="plus" size={13} /> Erstes Thema anlegen
              </button>
            {/if}
          </div>
        </div>
      {/if}
    {/each}

    {#if matching.length === 0 && query.trim() !== ''}
      <p class="empty">Kein Thema passt zu «{query}».</p>
    {/if}
  </div>
</div>

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

  /* C3: the same two numbers the calendar card mixes from, so the chip really
     is a preview of the card rather than an 8%/22% lookalike. */
  .subject-chip {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.12rem;
    width: 100%;
    text-align: left;
    padding: 0.34rem 0.45rem 0.34rem 0.6rem;
    border-radius: var(--wk-r-sm);
    font-size: var(--wk-fs-sm);
    font-weight: 500;
    cursor: grab;
    user-select: none;
    color: var(--wk-text);
    background: color-mix(in oklab, var(--sc) var(--wk-tint), var(--wk-surface));
    border: 1px solid color-mix(in oklab, var(--sc) var(--wk-edge), var(--wk-surface));
    overflow: hidden;
    transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
  }

  .chip-line {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .chip-foot {
    display: flex;
    padding-left: 1.1rem;
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
    background: color-mix(in oklab, var(--sc) calc(var(--wk-tint) + 6%), var(--wk-surface));
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

  /* Hidden until asked for. Eleven permanent grips beside eleven spines was
     two vertical rules per row saying the same "you can drag this", and the
     chip is already `cursor: grab`. The name keeps its position either way —
     the grip reserves its width at rest. */
  .subject-chip :global(.chip-grip) {
    color: var(--wk-text-faint);
    opacity: 0;
    transition: opacity 0.12s;
  }
  .subject-chip:hover :global(.chip-grip),
  .subject-chip:focus-visible :global(.chip-grip) { opacity: 1; }

  .subject-chip :global(.chip-done) {
    color: var(--color-success);
    opacity: 0.75;
    flex-shrink: 0;
  }

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

  .chip-flag {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
    line-height: 1.3;
  }

  /* Not yet placed on every lane: the loudest of the three, and the only one
     with an icon — a filled shape the eye can find down a list of twenty. */
  .chip-flag-missing {
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-warning) 24%, transparent);
    color: color-mix(in oklab, var(--color-warning) 82%, var(--wk-text));
  }

  /* Placed everywhere, but not for long enough / not equally. Outlined rather
     than filled, so it reads as a lesser problem at a glance and never as the
     grey that means "disabled" elsewhere. */
  .chip-flag-short,
  .chip-flag-over,
  .chip-flag-uneven {
    padding: 0.02rem 0.36rem;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--color-warning) 45%, transparent);
    color: color-mix(in oklab, var(--color-warning) 75%, var(--wk-text));
    font-weight: 600;
  }

  .empty,
  .none {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    line-height: 1.5;
  }

  .empty { padding: 0 0.3rem; }
  .none { padding: 0 0.15rem 0.15rem; }

  .none-cta {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    padding: 0.4rem 0.5rem;
    border: 1px dashed var(--wk-line-strong);
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--color-primary);
    font-size: var(--wk-fs-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .none-cta:hover {
    background: color-mix(in oklab, var(--color-primary) 9%, transparent);
    border-style: solid;
  }
  .none-cta:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }
</style>
