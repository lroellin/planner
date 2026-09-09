<script lang="ts">
  import {
    getState, updateEvent, removeEvent, duplicateEvents, splitEvent, copyEventToLanes, lanesWithoutEvent,
  } from '../state/store.svelte';
  import {
    closeQuickEdit, selectEvent, revealEvent, highlightEvents, clearHighlight, type QuickEdit,
  } from '../state/ui.svelte';
  import {
    DAY_NAMES, addMinutesToTime, timeDiffMinutes, effectiveTeacherIds, effectiveRoomId,
    snapToSlot, splitRange,
  } from '../utils/timeUtils';
  import { getContrastColor } from '../utils/colorUtils';
  import { teacherShort } from '../utils/format';
  import Icon from './Icon.svelte';
  import DurationField from './DurationField.svelte';
  import TimeField from './TimeField.svelte';
  import { conflictNote, isHardConflict, type ID } from '../types';

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
  /**
   * Which of the three fields departs from the Thema's default, and so needs its
   * "zurück" link. Asked of the event directly rather than through
   * `eventOverrides`, whose answers are the *German labels* the card's tooltip
   * prints ("Ausbildner", "Raum", "Dauer") — this matched them against
   * 'teachers' / 'room' / 'duration', so no reset link had ever appeared.
   */
  const overrides = $derived({
    teachers: ev !== null && ev.teacherIds !== 'inherit',
    room: ev !== null && ev.roomId !== 'inherit',
    duration:
      ev !== null && subject !== null && minutes !== subject.defaultDurationMinutes,
  });
  const spareLanes = $derived(ev ? lanesWithoutEvent(ev.id) : []);

  /**
   * What is wrong with *this* card, named.
   *
   * The grid draws a red edge and the conflict rail lists every clash in the
   * week, but the popover — the panel you open by clicking the card the edge is
   * on — said nothing at all, so the one question it was opened to answer had to
   * be taken to a different panel and matched up by eye. The full modal has
   * carried this strip all along; it is the same data, one click earlier.
   *
   * Each chip carries the cards it collides with, so it can point at them:
   * hovering pulses them on the grid, clicking scrolls to the first. An
   * availability clash has no counterpart — being booked while away involves one
   * card — so those are inert, and say so by not being buttons.
   */
  const clashes = $derived.by(() => {
    if (!ev?.conflicts) return [];
    return ev.conflicts.map(c => {
      const name =
        c.kind === 'teacher' || c.kind === 'teacher-absent'
          ? appState.teachers.find(t => t.id === c.resourceId)?.name
        : c.kind === 'room' || c.kind === 'room-blocked'
          ? appState.rooms.find(r => r.id === c.resourceId)?.name
        : appState.groups.find(g => g.id === c.resourceId)?.label;
      return {
        kind: c.kind,
        name: name ?? c.resourceId,
        hard: isHardConflict(c.kind),
        others: c.collidingEventIds,
      };
    });
  });

  function goToClash(eventIds: ID[]): void {
    const target = eventIds[0];
    if (target === undefined) return;
    clearHighlight();
    closeQuickEdit();
    revealEvent(target);
  }


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
  /**
   * The measured height of the popover, once it exists.
   *
   * The clamp below used to run against a guess per mode (300 / 230 / 340), and
   * the guess was short: opened on a card in the lower half of the window the
   * popover ran past the bottom edge and the viewport cut its action row — which
   * is where "Bearbeiten …", the way to the full editor, lives. A guess cannot
   * be right for a panel whose height depends on how many Ausbildner there
   * are, so it is measured instead.
   */
  let measuredHeight = $state(0);

  $effect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => {
      measuredHeight = el?.getBoundingClientRect().height ?? 0;
    });
    ro.observe(el);
    measuredHeight = el.getBoundingClientRect().height;
    return () => ro.disconnect();
  });

  const pos = $derived.by(() => {
    const width = 268;
    // Falls back to the tallest mode until the first measurement lands, so the
    // very first frame errs towards being too high rather than clipped.
    const height = measuredHeight > 0 ? measuredHeight : 360;
    const margin = 8;
    const gap = 10;

    const right = quick.anchor.x + quick.anchor.width + gap;
    const left = right + width > window.innerWidth - margin
      ? Math.max(margin, quick.anchor.x - width - gap)
      : right;

    // Prefer aligning with the card's top edge; slide up only as far as needed,
    // and never past the top of the window.
    const preferred = quick.anchor.y - margin;
    const lowest = window.innerHeight - height - margin;
    const top = Math.max(margin, Math.min(preferred, lowest));

    return { left, top, width };
  });

  function toggleTeacher(id: ID): void {
    if (!ev) return;
    const next = teacherIds.includes(id)
      ? teacherIds.filter(t => t !== id)
      : [...teacherIds, id];
    updateEvent(ev.id, { teacherIds: next }, `${subject?.name ?? 'Lektion'}: Ausbildner ändern`);
  }

  function setRoom(value: string): void {
    if (!ev) return;
    updateEvent(ev.id, { roomId: value === '' ? null : value }, `${subject?.name ?? 'Lektion'}: Raum ändern`);
  }

  function setDuration(min: number): void {
    if (!ev) return;
    updateEvent(
      ev.id,
      { endTime: addMinutesToTime(ev.startTime, min) },
      `Dauer von ${subject?.name ?? 'Lektion'} ändern`,
    );
  }

  function resetField(field: 'teachers' | 'room' | 'duration'): void {
    if (!ev || !subject) return;
    if (field === 'teachers') updateEvent(ev.id, { teacherIds: 'inherit' }, 'Ausbildner zurücksetzen');
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

    {#if clashes.length > 0 && mode === 'main'}
      <div class="clashes">
        {#each clashes as c (c.kind + c.name)}
          {#if c.others.length > 0}
            <button
              type="button"
              class="clash clash-go"
              class:clash-hard={c.hard}
              title="Zur überschneidenden Lektion springen"
              onmouseenter={() => highlightEvents(c.others)}
              onmouseleave={clearHighlight}
              onclick={() => goToClash(c.others)}
            >
              <Icon name="alert" size={10} />
              {conflictNote(c.kind, c.name)}
            </button>
          {:else}
            <span class="clash" class:clash-hard={c.hard}>
              <Icon name="alert" size={10} />
              {conflictNote(c.kind, c.name)}
            </span>
          {/if}
        {/each}
      </div>
    {/if}

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
          Teilen
        </button>
      </footer>
    {:else if mode === 'copy'}
      <div class="quick-body">
        <div class="quick-label">
          <span class="wk-eyebrow">Auf Gruppen kopieren</span>
        </div>
        {#if spareLanes.length === 0}
          <p class="quick-empty">Alle anderen Gruppen haben diese Lektion zu dieser Zeit schon.</p>
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
        >Auf {chosenLanes.length} {chosenLanes.length === 1 ? 'Gruppe' : 'Gruppen'} kopieren</button>
      </footer>
    {:else}
      <div class="quick-body">
        <!-- Teachers -->
        <div class="quick-row">
          <div class="quick-label">
            <span class="wk-eyebrow">Ausbildner</span>
            {#if overrides.teachers}
              <button class="quick-reset" onclick={() => resetField('teachers')} title="Zurück zur Themenvorgabe">
                <Icon name="reset" size={11} /> Vorgabe
              </button>
            {/if}
          </div>
        <!-- Named, not just initialled. Five bare discs asked the user to have
             memorised which of them is Céline; the modal, editing the very same
             field, has always spelled them out. -->
          <div class="av-row">
            {#each appState.teachers as t (t.id)}
              {@const on = teacherIds.includes(t.id)}
              <button
                class="tchip"
                class:tchip-on={on}
                style="--tc:{t.color}"
                title={t.name}
                aria-pressed={on}
                onclick={() => toggleTeacher(t.id)}
              >
                <span
                  class="av"
                  style="background:{on ? t.color : 'transparent'}; color:{on ? getContrastColor(t.color) : 'var(--wk-text-faint)'}; border-color:{t.color}"
                >{teacherShort(t)}</span>
                <span class="tchip-name">{t.name}</span>
              </button>
            {/each}
            {#if appState.teachers.length === 0}
              <span class="quick-empty">Keine Ausbildner erfasst.</span>
            {/if}
          </div>
        </div>

        <!-- Room -->
        <div class="quick-row">
          <div class="quick-label">
            <span class="wk-eyebrow">Raum</span>
            {#if overrides.room}
              <button class="quick-reset" onclick={() => resetField('room')} title="Zurück zur Themenvorgabe">
                <Icon name="reset" size={11} /> Vorgabe
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
            {#if overrides.duration}
              <button class="quick-reset" onclick={() => resetField('duration')} title="Zurück zur Themenvorgabe">
                <Icon name="reset" size={11} /> Vorgabe
              </button>
            {/if}
          </div>
          <DurationField size="xs" value={minutes} onchange={setDuration} />
        </div>
      </div>

      <!-- Labelled, like the modal's footer. Scissors and layers say nothing
           about "teilen" and "auf andere Gruppen kopieren" until someone has
           been told once, and the same four actions were already spelled out
           one double-click away. -->
      <footer class="quick-foot quick-foot-acts">
        <button
          class="act"
          title={split.canSplit ? 'In zwei Lektionen teilen' : 'Zu kurz zum Teilen — jede Hälfte braucht mindestens 15 Minuten'}
          onclick={startSplit}
          disabled={!split.canSplit}
        >
          <Icon name="scissors" size={13} /> Teilen
        </button>
        <button
          class="act"
          title={spareLanes.length > 0
            ? 'Auf die anderen Gruppen kopieren'
            : 'Keine andere Gruppe frei für diese Zeit'}
          onclick={startCopy}
          disabled={spareLanes.length === 0}
        >
          <Icon name="layers" size={13} /> Gruppen
        </button>
        <button class="act" title="Duplizieren" onclick={duplicate}>
          <Icon name="copy" size={13} /> Kopie
        </button>
        <button class="act act-danger" title="Diese Lektion löschen" onclick={remove}>
          <Icon name="trash" size={13} /> Löschen
        </button>
        <button class="act act-edit" onclick={() => onedit(ev.id)}>
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
    /* Card-anchored: the grid stays lit behind it, because the card this points
       at is what you are reading it against. The edge and the shadow do the
       separating that a scrim would otherwise do. */
    border: 1px solid var(--wk-pop-line);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-pop-shadow);
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

  /* Between the header and the body, where the modal puts the same strip: it is
     about the whole card, not about any one field below it. */
  .clashes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.4rem 0.55rem;
    border-bottom: 1px solid var(--wk-line);
    background: color-mix(in oklab, var(--color-warning) 8%, var(--wk-surface));
  }

  .clash {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid color-mix(in oklab, var(--color-warning) 45%, transparent);
    border-radius: 999px;
    background: none;
    font-size: var(--wk-fs-3xs);
    font-weight: 650;
    color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text));
  }

  /* Hard clashes are the ones that cannot stand, so they are filled rather than
     outlined — the same two weights the grid draws the cards in. */
  .clash-hard {
    border-color: color-mix(in oklab, var(--color-error) 45%, transparent);
    background: color-mix(in oklab, var(--color-error) 13%, transparent);
    color: color-mix(in oklab, var(--color-error) 85%, var(--wk-text));
  }

  .clash-go { cursor: pointer; }
  .clash-go:hover { background: color-mix(in oklab, var(--color-warning) 22%, transparent); }
  .clash-hard.clash-go:hover { background: color-mix(in oklab, var(--color-error) 24%, transparent); }

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
  .lane-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  /* Two per row at 268px: enough for a full name without truncating the ones
     that matter, and still a grid rather than a list. */
  .av-row {
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
  .tchip:hover { border-color: var(--tc); }
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

  /* Five labelled actions in a 268px footer: a two-row grid, with Bearbeiten
     spanning the bottom because it is the one that leaves the popover. */
  .quick-foot-acts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.2rem;
  }

  .act {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.25rem 0.15rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-3xs);
    font-weight: 600;
    cursor: pointer;
    min-width: 0;
  }
  .act:hover:not(:disabled) { background: var(--wk-surface); color: var(--wk-text); }
  .act:disabled { opacity: 0.4; cursor: default; }

  .act-danger:hover:not(:disabled) {
    background: color-mix(in oklab, var(--color-error) 13%, transparent);
    color: var(--color-error);
  }

  .act-edit {
    grid-column: 1 / -1;
    border-top: 1px solid var(--wk-line);
    padding-top: 0.35rem;
    color: var(--color-primary);
    font-size: var(--wk-fs-2xs);
  }
  .act-edit:hover { background: color-mix(in oklab, var(--color-primary) 10%, transparent); }

</style>
