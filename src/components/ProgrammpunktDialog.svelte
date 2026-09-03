<script lang="ts">
  /**
   * Make a *Programmpunkt* in the cell that was clicked.
   *
   * The rotation is planned from the sidebar: a Thema exists first, then gets
   * placed once per group. The fixed points of a WK day are the other way round
   * — Begrüssung happens at 08:00 on Wednesday, for everyone, and that is the
   * whole of it. Asking for those through Konfiguration meant leaving the grid,
   * inventing a Thema nobody owes, coming back, and then living with a sidebar
   * chip that reads «3 fehlen» forever.
   *
   * So this dialog asks only what the click could not answer. Day, time and lane
   * come from the cell; name, length, colour and "one lane or all of them" are
   * the four things left. Ausbildner and Raum are deliberately *not* here:
   * the quick edit opens on the new card the moment this closes, and that is
   * where those two are set everywhere else in the app.
   */
  import { getState, createProgrammpunkt } from '../state/store.svelte';
  import {
    DAY_NAMES, dayDateLabel, addMinutesToTime, phaseForDay, phaseGroups,
  } from '../utils/timeUtils';
  import { generateDistinctColor } from '../utils/colorUtils';
  import Icon from './Icon.svelte';
  import DurationField from './DurationField.svelte';
  import ColorPicker from './config/ColorPicker.svelte';
  import { ALL_GROUPS, type ID } from '../types';

  interface Props {
    dayIndex: number;
    startTime: string;
    /** The lane that was clicked — what «Nur G2» means. */
    groupId: ID;
    /** Hands the new card to the quick edit. */
    oncreated: (eventId: ID) => void;
    onclose: () => void;
  }

  let { dayIndex, startTime, groupId, oncreated, onclose }: Props = $props();

  const appState = $derived(getState());

  let name = $state('');
  // Half an hour: Begrüssung, Antreten and Rapport are all shorter than a
  // lesson, and 30 is the length the preset row starts from.
  let durationMinutes = $state(30);
  let allGroups = $state(false);
  // svelte-ignore state_referenced_locally
  let color = $state(generateDistinctColor(getState().subjects.map(s => s.color)));

  const phase = $derived(phaseForDay(appState, dayIndex));
  const laneOptions = $derived(phase ? phaseGroups(appState, phase) : []);
  const laneLabel = $derived(
    appState.groups.find(g => g.id === groupId)?.label ?? '?',
  );
  const endTime = $derived(addMinutesToTime(startTime, durationMinutes));

  /**
   * Typing a name a Programmpunkt already has reuses that definition rather than
   * making a second one — so this says so before the click, instead of letting
   * the colour picker look like it did nothing.
   */
  const reused = $derived(
    appState.subjects.find(
      s => s.kind === 'oneoff' && s.name.toLowerCase() === name.trim().toLowerCase(),
    ) ?? null,
  );

  const canCreate = $derived(name.trim() !== '');

  const SCOPE_OPTIONS = $derived([
    { value: false, icon: 'pin' as const, label: `Nur ${laneLabel}` },
    { value: true, icon: 'users' as const, label: 'Alle Gruppen' },
  ]);

  function submit(e?: Event): void {
    e?.preventDefault();
    if (!canCreate) return;
    const eventId = createProgrammpunkt(
      { name, color, durationMinutes, isMultiGroup: allGroups },
      dayIndex,
      startTime,
      allGroups ? ALL_GROUPS : groupId,
    );
    oncreated(eventId);
  }

  /**
   * Z2: focus the dialog itself, not its close button — then hand focus to the
   * name field, which is the one thing this dialog is actually for.
   */
  let dialogEl: HTMLDialogElement;
  let nameEl: HTMLInputElement | undefined = $state();
  $effect(() => {
    if (!dialogEl) return;
    dialogEl.showModal();
    nameEl?.focus();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} onclose={onclose} onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}
  class="modal">
  <div class="sheet" style="--ev-color: {reused?.color ?? color}">
    <form onsubmit={submit}>
      <header class="sheet-head">
        <span class="sheet-spine"></span>
        <div class="min-w-0 flex-1">
          <h3 class="sheet-title">Neuer Programmpunkt</h3>
          <!-- The cell that was clicked, spelled back: this dialog never asks
               for a placement, so it has to show the one it was given. -->
          <p class="sheet-when wk-num">
            {DAY_NAMES[dayIndex]} {dayDateLabel(appState.wkStartDate, dayIndex)}
            · {startTime}–{endTime}
            · {allGroups ? laneOptions.map(g => g.label).join(', ') || '—' : laneLabel}
          </p>
        </div>
        <button type="button" class="sheet-x" onclick={onclose} aria-label="Schliessen">
          <Icon name="x" size={16} />
        </button>
      </header>

      <div class="sheet-body">
        <div class="field">
          <span class="field-name">Name</span>
          <input
            bind:this={nameEl}
            bind:value={name}
            class="input input-bordered input-sm flex-1"
            placeholder="Begrüssung, Antreten, Rapport …"
            aria-label="Name des Programmpunkts"
          />
        </div>

        <div class="field field-top">
          <span class="field-name">Dauer</span>
          <div class="flex-1">
            <DurationField value={durationMinutes} onchange={(m) => (durationMinutes = m)} />
          </div>
        </div>

        <div class="field">
          <span class="field-name">Für</span>
          <div class="scope flex-1" role="radiogroup" aria-label="Für welche Gruppen">
            {#each SCOPE_OPTIONS as opt (opt.value)}
              <button
                type="button"
                class="scope-opt"
                class:scope-opt-on={allGroups === opt.value}
                role="radio"
                aria-checked={allGroups === opt.value}
                onclick={() => (allGroups = opt.value)}
              >
                <Icon name={opt.icon} size={13} /> {opt.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="field">
          <span class="field-name">Farbe</span>
          <div class="flex-1">
            {#if reused}
              <span class="hint">Übernimmt die Farbe von «{reused.name}».</span>
            {:else}
              <ColorPicker value={color} onpick={(c) => (color = c)} size={30} />
            {/if}
          </div>
        </div>

        {#if reused}
          <p class="hint note">
            «{reused.name}» gibt es schon — dieser Programmpunkt wird noch einmal platziert,
            nicht ein zweites Mal angelegt.
          </p>
        {:else}
          <p class="hint note">
            Zählt nicht zur Abdeckung: Ein Programmpunkt findet einmal statt, nicht
            einmal pro Gruppe.
          </p>
        {/if}

        {#if phase === null}
          <p class="warn">
            Keine Phase deckt {DAY_NAMES[dayIndex]} ab — der Programmpunkt läge ausserhalb
            jeder Phase und würde nicht angezeigt.
          </p>
        {/if}
      </div>

      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost btn-sm" onclick={onclose}>Abbrechen</button>
        <button type="submit" class="btn btn-primary btn-sm" disabled={!canCreate}>
          Anlegen und platzieren
        </button>
      </footer>
    </form>
  </div>
</dialog>

<style>
  dialog::backdrop {
    background: color-mix(in oklab, black 45%, transparent);
  }

  .sheet {
    width: min(420px, 94vw);
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
    transition: background 0.15s;
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

  /* The duration control is two rows tall, so its label sits at the top of it
     rather than floating in the middle of a preset grid. */
  .field-top { align-items: flex-start; }
  .field-top .field-name { padding-top: 0.35rem; }

  .field-name {
    width: 3.4rem;
    flex-shrink: 0;
    font-size: var(--wk-fs-sm);
    font-weight: 650;
  }

  .scope {
    display: flex;
    gap: 0.35rem;
  }

  .scope-opt {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: var(--wk-surface);
    color: var(--wk-text-faint);
    font-size: var(--wk-fs-sm);
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .scope-opt:hover { background: var(--wk-surface-alt); color: var(--wk-text); }

  .scope-opt-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 12%, transparent);
    color: var(--wk-text);
    font-weight: 650;
  }

  .hint {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-faint);
  }

  .note {
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
