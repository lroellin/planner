<script lang="ts">
  import { getState, placeSubject } from '../state/store.svelte';
  import {
    DAY_NAMES, phaseForDay, phaseGroups, lanesForMultiGroup, snapToSlot, addMinutesToTime, dayDateLabel,
  } from '../utils/timeUtils';
  import Icon from './Icon.svelte';
  import TimeField from './TimeField.svelte';
  import { ALL_GROUPS, type ID } from '../types';

  interface Props {
    subjectId: ID;
    /**
     * Open pointed at a particular lane. A gap is always named as a pair —
     * "ABC-Schutz, G1" — and the dialog used to drop the lane half of it on the
     * floor, making the user re-derive an answer the report had just given them.
     */
    groupId?: ID | undefined;
    dayIndex?: number | undefined;
    onclose: () => void;
  }

  let { subjectId, groupId: initialGroupId, dayIndex: initialDayIndex, onclose }: Props = $props();

  const appState = $derived(getState());
  const subject = $derived(appState.subjects.find(s => s.id === subjectId) ?? null);

  let dayIndex = $state(0);
  let startTime = $state('08:00');
  let groupId: ID = $state('');

  // The day decides the phase and the phase decides which lanes exist — the same
  // rule the event modal uses, so a placement can't land where nothing draws it.
  const targetPhase = $derived(phaseForDay(appState, dayIndex));
  const laneOptions = $derived(targetPhase ? phaseGroups(appState, targetPhase) : []);
  const targetGroupId = $derived(
    laneOptions.some(g => g.id === groupId) ? groupId : laneOptions[0]?.id ?? '',
  );
  const isMultiGroup = $derived(subject?.isMultiGroup ?? false);
  // Which lanes «alle Gruppen» actually reaches for *this* subject: a Thema
  // skips the group on its own programme, a Pause or Programmpunkt does not.
  // Naming the lanes and then not placing on all of them is a promise broken
  // between the dialog and the grid.
  const sharedLanes = $derived(
    targetPhase ? lanesForMultiGroup(appState, targetPhase, subject) : [],
  );
  const canPlace = $derived(laneOptions.length > 0);
  const previewEnd = $derived(
    addMinutesToTime(snapToSlot(startTime), subject?.defaultDurationMinutes ?? 60),
  );

  /**
   * Seed the selects once, on open. The dialog is mounted fresh per request, so
   * this runs exactly once and the user's edits are never overwritten.
   *
   * Priority: an explicit day, then the phase that draws an explicitly requested
   * lane — landing on day 0 with a lane no phase there draws would silently
   * discard the lane — then the subject's own pinned phase.
   */
  let seeded = false;
  $effect(() => {
    if (seeded) return;
    seeded = true;

    if (initialGroupId !== undefined) groupId = initialGroupId;

    if (initialDayIndex !== undefined) {
      dayIndex = initialDayIndex;
      return;
    }
    if (initialGroupId !== undefined) {
      const owning = appState.phases.find(p => p.groupIds.includes(initialGroupId));
      if (owning) { dayIndex = owning.startDay; return; }
    }
    const pinned = subject?.phaseId
      ? appState.phases.find(p => p.id === subject.phaseId)
      : null;
    if (pinned) dayIndex = pinned.startDay;
  });

  function submit(e?: Event): void {
    e?.preventDefault();
    if (!canPlace) return;
    placeSubject(
      subjectId,
      dayIndex,
      snapToSlot(startTime),
      isMultiGroup ? ALL_GROUPS : targetGroupId,
    );
    onclose();
  }

  /**
   * Z2: focus the dialog itself, not its close button.
   *
   * `showModal()` hands focus to the first focusable descendant, which in every
   * one of these is the ✕ — so a keyboard user opened the dialog already on
   * "leave", and their first Tab went out of the content rather than into it.
   * The panel takes `tabindex="-1"` so it can hold focus without joining the tab
   * order; the first Tab then lands on the first real control.
   */
  let dialogEl: HTMLDialogElement;
  let sheetEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (!dialogEl) return;
    dialogEl.showModal();
    sheetEl?.focus();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} onclose={onclose} onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}
  class="modal">
  <div bind:this={sheetEl} class="sheet" tabindex="-1" style="--ev-color: {subject?.color ?? 'gray'}">
    {#if subject}
      <form onsubmit={submit}>
        <header class="sheet-head">
          <span class="sheet-spine"></span>
          <div class="min-w-0 flex-1">
            <h3 class="sheet-title">{subject.name} platzieren</h3>
            <p class="sheet-when wk-num">
              {subject.defaultDurationMinutes} min{#if isMultiGroup} · alle Gruppen{/if}
            </p>
          </div>
          <button type="button" class="sheet-x" onclick={onclose} aria-label="Schliessen">
            <Icon name="x" size={16} />
          </button>
        </header>

        <div class="sheet-body">
          <div class="field">
            <span class="field-name">Tag</span>
            <select class="select select-bordered select-sm flex-1" bind:value={dayIndex}>
              {#each DAY_NAMES as name, i (name)}
                <option value={i}>{name} {dayDateLabel(appState.wkStartDate, i)}</option>
              {/each}
            </select>
          </div>

          <div class="field">
            <span class="field-name">Gruppe</span>
            {#if isMultiGroup}
              <span class="hint flex-1">
                Alle Gruppen von {targetPhase?.label ?? 'der Phase'}
                {#if sharedLanes.length > 0}({sharedLanes.map(g => g.label).join(', ')}){/if}
              </span>
            {:else}
              <select
                class="select select-bordered select-sm flex-1"
                value={targetGroupId}
                disabled={laneOptions.length === 0}
                onchange={(e) => (groupId = (e.currentTarget as HTMLSelectElement).value)}
              >
                {#each laneOptions as g (g.id)}
                  <option value={g.id}>{g.label}</option>
                {/each}
              </select>
            {/if}
          </div>

          <div class="field">
            <span class="field-name">Start</span>
            <div class="flex items-center gap-2 flex-1">
              <TimeField bind:value={startTime} ariaLabel="Startzeit" />
              <span class="hint wk-num">endet {previewEnd}</span>
            </div>
          </div>

          {#if targetPhase === null}
            <p class="warn">Keine Phase deckt {DAY_NAMES[dayIndex]} ab — anderen Tag wählen.</p>
          {:else if laneOptions.length === 0}
            <p class="warn">{targetPhase.label} hat keine aktiven Gruppen — anderen Tag wählen.</p>
          {:else}
            <p class="hint phase-note">Phase: {targetPhase.label}</p>
          {/if}
        </div>

        <footer class="sheet-foot">
          <button type="button" class="btn btn-ghost btn-sm" onclick={onclose}>Abbrechen</button>
          <button type="submit" class="btn btn-primary btn-sm" disabled={!canPlace}>Platzieren</button>
        </footer>
      </form>
    {:else}
      <div class="p-6 text-sm">Thema nicht gefunden.</div>
    {/if}
  </div>
</dialog>

<style>
  dialog::backdrop {
    background: color-mix(in oklab, black 45%, transparent);
  }

  .sheet {
    width: min(400px, 94vw);
    background: var(--wk-surface);
    color: var(--wk-text);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
    overflow: hidden;
  }

  .sheet-head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.8rem 0.8rem 0.8rem 0;
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

  .sheet-body {
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .field-name {
    width: 3.4rem;
    flex-shrink: 0;
    font-size: var(--wk-fs-sm);
    font-weight: 650;
  }

  .hint {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-faint);
  }

  .phase-note {
    padding-left: 4.15rem;
  }

  .warn {
    font-size: var(--wk-fs-xs);
    color: color-mix(in oklab, var(--color-warning) 78%, var(--wk-text));
    padding-left: 4.15rem;
  }

  .sheet-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border-top: 1px solid var(--wk-line);
    background: var(--wk-surface-alt);
  }
</style>
