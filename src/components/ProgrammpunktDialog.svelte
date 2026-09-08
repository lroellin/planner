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
   * come from the cell; the rest is what the new definition needs.
   *
   * Ausbildner and Raum are here rather than left to the quick edit, because
   * they are the Programmpunkt's *defaults*, not this one card's override: set
   * here, placing Antreten again on Thursday already carries them. Setting them
   * afterwards in the quick edit writes an override onto a single card and
   * leaves the definition empty, so the second placement arrives bare.
   */
  import { getState, createProgrammpunkt } from '../state/store.svelte';
  import {
    DAY_NAMES, dayDateLabel, addMinutesToTime, phaseForDay, phaseGroups,
  } from '../utils/timeUtils';
  import { generateDistinctColor, getContrastColor } from '../utils/colorUtils';
  import { teacherShort } from '../utils/format';
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
  // What the user picked, for a definition that does not exist yet. Once the
  // name matches one that does, the definition's own values are shown instead
  // (see the deriveds below) — held apart rather than written over, so clearing
  // the name back out returns the user's own draft instead of leaving the
  // reused Programmpunkt's Ausbildner behind on a new one.
  let draftAllGroups = $state(false);
  let draftTeacherIds: ID[] = $state([]);
  let draftRoomId: ID | null = $state(null);
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

  /**
   * Reusing an existing Programmpunkt reuses its defaults too, so the fields
   * show what the placement will actually get instead of a picker that silently
   * does nothing. `isMultiGroup` belongs in that list: the store reads the lane
   * rule off the reused definition, so a «Alle Gruppen» left live here promised
   * something the placement would not deliver — and the header line above it
   * spelled that promise out lane by lane.
   */
  const teacherIds = $derived(reused ? reused.defaultTeacherIds : draftTeacherIds);
  const roomId = $derived(reused ? reused.defaultRoomId : draftRoomId);
  const allGroups = $derived(reused ? reused.isMultiGroup : draftAllGroups);

  function toggleTeacher(id: ID): void {
    draftTeacherIds = draftTeacherIds.includes(id)
      ? draftTeacherIds.filter(t => t !== id)
      : [...draftTeacherIds, id];
  }

  /**
   * How long it runs *this time* stays the user's, unlike the rest — the same
   * Antreten is 15 minutes on Wednesday and 30 on Thursday. The definition only
   * seeds the field, and only when a different one is matched.
   */
  let seededFrom: ID | null = null;
  $effect(() => {
    if (!reused || reused.id === seededFrom) return;
    seededFrom = reused.id;
    durationMinutes = reused.defaultDurationMinutes;
  });

  const SCOPE_OPTIONS = $derived([
    { value: false, icon: 'pin' as const, label: `Nur ${laneLabel}` },
    { value: true, icon: 'users' as const, label: 'Alle Gruppen' },
  ]);

  function submit(e?: Event): void {
    e?.preventDefault();
    if (!canCreate) return;
    const eventId = createProgrammpunkt(
      { name, color, durationMinutes, isMultiGroup: allGroups, teacherIds, roomId },
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

        {#if appState.teachers.length > 0}
          <div class="field field-top">
            <span class="field-name">Ausbildner</span>
            <div class="tgrid flex-1" role="group" aria-label="Ausbildner">
              {#each appState.teachers as t (t.id)}
                {@const on = teacherIds.includes(t.id)}
                <button
                  type="button"
                  class="tchip"
                  class:tchip-on={on}
                  style="--tc:{t.color}"
                  aria-pressed={on}
                  disabled={reused !== null}
                  onclick={() => toggleTeacher(t.id)}
                >
                  <span
                    class="av"
                    style="background:{on ? t.color : 'transparent'}; color:{on ? getContrastColor(t.color) : 'var(--wk-text-faint)'}; border-color:{t.color}"
                  >{teacherShort(t)}</span>
                  <span class="tchip-name">{t.name}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if appState.rooms.length > 0}
          <div class="field">
            <span class="field-name">Raum</span>
            <select
              class="select select-bordered select-sm flex-1"
              value={roomId ?? ''}
              disabled={reused !== null}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                draftRoomId = v === '' ? null : v;
              }}
            >
              <option value="">Kein Raum</option>
              {#each appState.rooms as r (r.id)}
                <option value={r.id}>{r.name}</option>
              {/each}
            </select>
          </div>
        {/if}

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
                disabled={reused !== null}
                onclick={() => (draftAllGroups = opt.value)}
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
            nicht ein zweites Mal angelegt. Farbe, Ausbildner, Raum und «für wen» kommen
            von dort; ändern lassen sie sich unter Konfiguration › Themen. Nur die Dauer
            gilt für diese Platzierung.
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
    width: 5.2rem;
    flex-shrink: 0;
    font-size: var(--wk-fs-sm);
    font-weight: 650;
  }

  .scope {
    display: flex;
    gap: 0.35rem;
  }

  /* Two per row, like the quick edit's Ausbildner picker: a full name is what
     tells Céline from Christoph, and initials alone do not. */
  .tgrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
  }

  .tchip {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.2rem 0.35rem 0.2rem 0.2rem;
    border: 1px solid var(--wk-line);
    border-radius: 999px;
    background: transparent;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-2xs);
    font-weight: 550;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, color 0.12s;
  }
  .tchip:hover:not(:disabled) { border-color: var(--tc); }
  .tchip:disabled { cursor: default; opacity: 0.7; }

  /* Same treatment as a locked Ausbildner chip: still readable, plainly not
     yours to change while the name names an existing Programmpunkt. */
  .scope-opt:disabled { cursor: default; opacity: 0.7; }
  .tchip-on {
    border-color: var(--tc);
    background: color-mix(in oklab, var(--tc) 12%, transparent);
    color: var(--wk-text);
    font-weight: 650;
  }

  .tchip-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .av {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1.5px solid var(--wk-line);
    background: transparent;
    font-size: var(--wk-fs-3xs);
    font-weight: 700;
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
    padding-left: 5.95rem;
  }

  .warn {
    font-size: var(--wk-fs-xs);
    color: color-mix(in oklab, var(--color-warning) 78%, var(--wk-text));
    padding-left: 5.95rem;
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
