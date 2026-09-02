<script lang="ts">
  import {
    getState, updateEvent, removeEvent, duplicateEvents, splitEvent, copyEventToLanes, lanesWithoutEvent,
  } from '../state/store.svelte';
  import { closeQuickEdit, selectEvent, type QuickEdit } from '../state/ui.svelte';
  import {
    DAY_NAMES, addMinutesToTime, timeDiffMinutes, effectiveTeacherIds, effectiveRoomId,
    eventOverrides, snapToSlot, splitRange,
  } from '../utils/timeUtils';
  import { getContrastColor } from '../utils/colorUtils';
  import { teacherShort } from '../utils/format';
  import Icon from './Icon.svelte';
  import TimeField from './TimeField.svelte';
  import type { ID } from '../types';

  interface Props {
    quick: QuickEdit;
    /** Hands the event over to the full modal. */
    onedit: (id: ID) => void;
  }

  let { quick, onedit }: Props = $props();

  const appState = $derived(getState());
  const ev = $derived(appState.events.find(e => e.id === quick.eventId) ?? null);
  const subject = $derived(ev ? appState.subjects.find(s => s.id === ev.subjectId) ?? null : null);
  const teacherIds = $derived(ev ? effectiveTeacherIds(ev, subject) : []);
  const roomId = $derived(ev ? effectiveRoomId(ev, subject) : null);
  const minutes = $derived(ev ? timeDiffMinutes(ev.startTime, ev.endTime) : 60);
  const overrides = $derived(ev && subject ? eventOverrides(ev, subject) : []);
  const spareLanes = $derived(ev ? lanesWithoutEvent(ev.id) : []);

  const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

  let el: HTMLDivElement | undefined = $state();
  /** The popover is one panel deep: an action swaps the body, never a new window. */
  let mode = $state<'main' | 'copy' | 'split'>('main');
  let chosenLanes: ID[] = $state([]);
  let splitTime = $state('');

  // Both halves have to be at least one slot long, so the picker only offers the
  // slots strictly inside the event and Split is hidden when there are none.
  const split = $derived(
    ev ? splitRange(ev.startTime, ev.endTime) : { from: '00:00', to: '00:00', canSplit: false },
  );

  // Sit beside the card, flipping to its left when the right edge is close, and
  // never running off the bottom.
  const pos = $derived.by(() => {
    const width = 268;
    const height = mode === 'copy' ? 340 : mode === 'split' ? 230 : 300;
    const gap = 10;
    const right = quick.anchor.x + quick.anchor.width + gap;
    const left = right + width > window.innerWidth - 8
      ? Math.max(8, quick.anchor.x - width - gap)
      : right;
    const top = Math.min(
      Math.max(8, quick.anchor.y - 8),
      Math.max(8, window.innerHeight - height - 8),
    );
    return { left, top, width };
  });

  function toggleTeacher(id: ID): void {
    if (!ev) return;
    const next = teacherIds.includes(id)
      ? teacherIds.filter(t => t !== id)
      : [...teacherIds, id];
    updateEvent(ev.id, { teacherIds: next }, `reassigning ${subject?.name ?? 'event'}`);
  }

  function setRoom(value: string): void {
    if (!ev) return;
    updateEvent(ev.id, { roomId: value === '' ? null : value }, `re-rooming ${subject?.name ?? 'event'}`);
  }

  function setDuration(min: number): void {
    if (!ev) return;
    updateEvent(
      ev.id,
      { endTime: addMinutesToTime(ev.startTime, min) },
      `${subject?.name ?? 'Lektion'} in der Dauer ändern`,
    );
  }

  function resetField(field: 'teachers' | 'room' | 'duration'): void {
    if (!ev || !subject) return;
    if (field === 'teachers') updateEvent(ev.id, { teacherIds: 'inherit' }, 'Gruppenführer zurücksetzen');
    else if (field === 'room') updateEvent(ev.id, { roomId: 'inherit' }, 'Raum zurücksetzen');
    else {
      updateEvent(
        ev.id,
        { endTime: addMinutesToTime(ev.startTime, subject.defaultDurationMinutes) },
        'Dauer zurücksetzen',
      );
    }
  }

  function duplicate(): void {
    if (!ev) return;
    duplicateEvents([ev.id]);
    closeQuickEdit();
  }

  function remove(): void {
    if (!ev) return;
    removeEvent(ev.id);
    selectEvent(null);
    closeQuickEdit();
  }

  function startCopy(): void {
    mode = 'copy';
    chosenLanes = spareLanes.map(g => g.id);
  }

  function confirmCopy(): void {
    if (!ev) return;
    copyEventToLanes(ev.id, chosenLanes);
    mode = 'main';
    closeQuickEdit();
  }

  function startSplit(): void {
    if (!ev) return;
    // The midpoint is the useful guess; the reason to split is usually a break,
    // and the break's edge is a slot or two away from it either way.
    mode = 'split';
    splitTime = snapToSlot(addMinutesToTime(ev.startTime, Math.round(minutes / 2)));
  }

  const splitValid = $derived.by(() => {
    if (!ev || !splitTime) return false;
    const at = snapToSlot(splitTime);
    return at > ev.startTime && at < ev.endTime;
  });

  function confirmSplit(): void {
    if (!ev || !splitValid) return;
    splitEvent(ev.id, splitTime);
    mode = 'main';
    closeQuickEdit();
  }

  function onWindowPointerDown(e: PointerEvent): void {
    const target = e.target as Node | null;
    if (el && target && !el.contains(target)) {
      // A click on another card re-opens the popover for that one, so only close
      // when the click landed outside both this popover and the grid's events.
      const onCard = (target as HTMLElement).closest?.('.fc-event');
      if (!onCard) closeQuickEdit();
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeQuickEdit();
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onKey} />

{#if ev && subject}
  <div
    bind:this={el}
    class="quick"
    style="left:{pos.left}px; top:{pos.top}px; width:{pos.width}px; --ev-color:{subject.color}"
    role="dialog"
    aria-label="Schnellbearbeitung"
  >
    <header class="quick-head">
      <span class="quick-spine"></span>
      <div class="min-w-0 flex-1">
        <div class="quick-title">{subject.name}</div>
        <div class="quick-when wk-num">
          {DAY_NAMES[ev.dayIndex]} · {ev.startTime}–{ev.endTime}
        </div>
      </div>
      <button class="quick-x" onclick={closeQuickEdit} aria-label="Schliessen">
        <Icon name="x" size={14} />
      </button>
    </header>

    {#if mode === 'split'}
      <div class="quick-body">
        <div class="quick-row">
          <div class="quick-label">
            <span class="wk-eyebrow">Teilen um</span>
          </div>
          <TimeField
            bind:value={splitTime}
            from={split.from}
            to={split.to}
            class="w-full"
            ariaLabel="Teilen um"
          />
          {#if splitValid}
            <p class="quick-hint wk-num">
              {ev.startTime}–{snapToSlot(splitTime)} · {snapToSlot(splitTime)}–{ev.endTime}
            </p>
          {/if}
        </div>
      </div>
      <footer class="quick-foot">
        <button class="btn btn-ghost btn-xs" onclick={() => (mode = 'main')}>Zurück</button>
        <button class="btn btn-primary btn-xs" disabled={!splitValid} onclick={confirmSplit}>
          Split
        </button>
      </footer>
    {:else if mode === 'copy'}
      <div class="quick-body">
        <div class="quick-label">
          <span class="wk-eyebrow">Auf Gruppen kopieren</span>
        </div>
        {#if spareLanes.length === 0}
          <p class="quick-empty">Alle anderen Gruppen haben das zu dieser Zeit bereits.</p>
        {:else}
          <div class="lane-grid">
            {#each spareLanes as g (g.id)}
              <label class="lane-chip" class:lane-chip-on={chosenLanes.includes(g.id)}>
                <input
                  type="checkbox"
                  checked={chosenLanes.includes(g.id)}
                  onchange={(e) => {
                    const on = (e.currentTarget as HTMLInputElement).checked;
                    chosenLanes = on
                      ? [...chosenLanes, g.id]
                      : chosenLanes.filter(id => id !== g.id);
                  }}
                />
                {g.label}
              </label>
            {/each}
          </div>
          <p class="quick-hint">
            Gleicher Tag, gleiche Zeit. Konflikte werden gemeldet, nie blockiert.
          </p>
        {/if}
      </div>
      <footer class="quick-foot">
        <button class="btn btn-ghost btn-xs" onclick={() => (mode = 'main')}>Zurück</button>
        <button
          class="btn btn-primary btn-xs"
          disabled={chosenLanes.length === 0}
          onclick={confirmCopy}
        >Auf {chosenLanes.length} kopieren</button>
      </footer>
    {:else}
      <div class="quick-body">
        <!-- Teachers -->
        <div class="quick-row">
          <div class="quick-label">
            <span class="wk-eyebrow">Gruppenführer</span>
            {#if overrides.includes('teachers')}
              <button class="quick-reset" onclick={() => resetField('teachers')} title="Zurück zur Themenvorgabe">
                <Icon name="reset" size={11} /> zurück
              </button>
            {/if}
          </div>
          <div class="av-row">
            {#each appState.teachers as t (t.id)}
              {@const on = teacherIds.includes(t.id)}
              <button
                class="av"
                class:av-on={on}
                style="--tc:{t.color}; color:{on ? getContrastColor(t.color) : 'var(--wk-text-mute)'}"
                title={t.name}
                aria-pressed={on}
                onclick={() => toggleTeacher(t.id)}
              >{teacherShort(t)}</button>
            {/each}
            {#if appState.teachers.length === 0}
              <span class="quick-empty">Keine Gruppenführer erfasst.</span>
            {/if}
          </div>
        </div>

        <!-- Room -->
        <div class="quick-row">
          <div class="quick-label">
            <span class="wk-eyebrow">Raum</span>
            {#if overrides.includes('room')}
              <button class="quick-reset" onclick={() => resetField('room')} title="Zurück zur Themenvorgabe">
                <Icon name="reset" size={11} /> zurück
              </button>
            {/if}
          </div>
          <select
            class="select select-bordered select-xs w-full"
            value={roomId ?? ''}
            onchange={(e) => setRoom((e.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">Kein Raum</option>
            {#each appState.rooms as r (r.id)}
              <option value={r.id}>{r.name}</option>
            {/each}
          </select>
        </div>

        <!-- Duration -->
        <div class="quick-row">
          <div class="quick-label">
            <span class="wk-eyebrow">Dauer</span>
            {#if overrides.includes('duration')}
              <button class="quick-reset" onclick={() => resetField('duration')} title="Zurück zur Themenvorgabe">
                <Icon name="reset" size={11} /> zurück
              </button>
            {/if}
          </div>
          <div class="dur-row">
            {#each DURATIONS as d (d)}
              <button
                class="dur"
                class:dur-on={minutes === d}
                onclick={() => setDuration(d)}
              >{d < 60 ? `${d}′` : d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h${d % 60}`}</button>
            {/each}
          </div>
        </div>
      </div>

      <footer class="quick-foot">
        <div class="flex items-center gap-1">
          <button
            class="icon-btn"
            title={split.canSplit ? 'In zwei Lektionen teilen' : 'Zu kurz zum Teilen'}
            aria-label="In zwei Lektionen teilen"
            onclick={startSplit}
            disabled={!split.canSplit}
          >
            <Icon name="scissors" size={14} />
          </button>
          <button class="icon-btn" title="Auf andere Gruppen kopieren" onclick={startCopy} disabled={spareLanes.length === 0}>
            <Icon name="layers" size={14} />
          </button>
          <button class="icon-btn" title="Duplizieren" onclick={duplicate}>
            <Icon name="copy" size={14} />
          </button>
          <button class="icon-btn icon-btn-danger" title="Löschen" onclick={remove}>
            <Icon name="trash" size={14} />
          </button>
        </div>
        <button class="btn btn-ghost btn-xs gap-1" onclick={() => onedit(ev.id)}>
          <Icon name="pencil" size={12} /> Bearbeiten …
        </button>
      </footer>
    {/if}
  </div>
{/if}

<style>
  .quick {
    position: fixed;
    z-index: 90;
    background: var(--wk-surface);
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .quick-head {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.55rem 0.55rem 0.55rem 0;
    border-bottom: 1px solid var(--wk-line);
  }

  .quick-spine {
    width: 3px;
    align-self: stretch;
    background: var(--ev-color);
    border-radius: 0 2px 2px 0;
    flex-shrink: 0;
  }

  .quick-title {
    font-size: var(--wk-fs-md);
    font-weight: 650;
    line-height: 1.25;
  }

  .quick-when {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
  }

  .quick-x {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--wk-text-faint);
    padding: 2px;
    border-radius: 4px;
  }
  .quick-x:hover { color: var(--wk-text); background: var(--wk-surface-alt); }

  .quick-body {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.7rem 0.75rem;
  }

  .quick-row {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .quick-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .quick-reset {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-size: var(--wk-fs-2xs);
    color: var(--color-primary);
  }
  .quick-reset:hover { text-decoration: underline; }

  .quick-empty,
  .quick-hint {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
  }

  .av-row,
  .dur-row,
  .lane-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .av {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1.5px solid var(--wk-line);
    background: transparent;
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
    cursor: pointer;
    transition: all 0.12s;
  }
  .av:hover { border-color: var(--tc); }
  .av-on {
    background: var(--tc);
    border-color: var(--tc);
  }

  .dur {
    padding: 0.15rem 0.42rem;
    border-radius: var(--wk-r-sm);
    border: 1px solid var(--wk-line);
    background: transparent;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-2xs);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .dur:hover { border-color: var(--wk-line-strong); color: var(--wk-text); }
  .dur-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
    font-weight: 700;
  }

  .lane-chip {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    font-size: var(--wk-fs-xs);
    cursor: pointer;
  }
  .lane-chip-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
  }
  .lane-chip input { accent-color: var(--color-primary); }

  .quick-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-top: 1px solid var(--wk-line);
    background: var(--wk-surface-alt);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--wk-r-sm);
    border: none;
    background: transparent;
    color: var(--wk-text-mute);
    cursor: pointer;
  }
  .icon-btn:hover:not(:disabled) { background: var(--wk-surface); color: var(--wk-text); }
  .icon-btn:disabled { opacity: 0.35; cursor: default; }
  .icon-btn-danger:hover:not(:disabled) {
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 12%, transparent);
  }
</style>
