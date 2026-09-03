<script lang="ts">
  import {
    getState, duplicateEvents, updateEvent, updateSubject, removeEvent, splitEvent,
    copyEventToLanes, lanesWithoutEvent,
  } from '../state/store.svelte';
  import { selectEvent } from '../state/ui.svelte';
  import {
    snapToSlot, timeDiffMinutes, addMinutesToTime, splitRange, DAY_NAMES, phaseGroups,
    resolveTeacherIds, resolveRoomId, isMultiGroupEvent, dayDateLabel,
  } from '../utils/timeUtils';
  import { getContrastColor } from '../utils/colorUtils';
  import { teacherShort } from '../utils/format';
  import Icon from './Icon.svelte';
  import TimeField from './TimeField.svelte';
  import DurationField from './DurationField.svelte';
  import { ALL_GROUPS, CONFLICT_KIND_LABELS, isHardConflict, type ID } from '../types';

  interface Props {
    eventId: ID;
    onclose: () => void;
  }

  let { eventId, onclose }: Props = $props();

  const appState = $derived(getState());
  const ev = $derived(appState.events.find(e => e.id === eventId));
  const subject = $derived(ev ? appState.subjects.find(s => s.id === ev.subjectId) : null);

  // Local editable copies. Dragging and resizing on the grid stays the fast path;
  // the start time is editable here too, because an event that no phase draws
  // (an orphan) is on no calendar to drag.
  let localTeacherIds: ID[] | 'inherit' = $state('inherit');
  let localRoomId: ID | null | 'inherit' = $state('inherit');
  let localDuration: number = $state(60);
  let localStartTime: string = $state('08:00');
  let showSplit: boolean = $state(false);
  let splitTime: string = $state('');
  let showCopy: boolean = $state(false);
  let copyLanes: ID[] = $state([]);
  // Day/lane are edited here rather than by dragging: each phase is its own
  // calendar instance, and FullCalendar cannot drag an event between two.
  let localDayIndex: number = $state(0);
  let localGroupId: ID = $state('');

  const isMultiGroup = $derived(ev ? isMultiGroupEvent(ev) : false);

  // The chosen day decides the phase, and the phase decides which lanes exist.
  // Offering all groups regardless of day is what let a move land the event
  // outside every phase, where no calendar draws it.
  const targetPhase = $derived(
    appState.phases.find(p => localDayIndex >= p.startDay && localDayIndex <= p.endDay) ?? null,
  );
  const laneOptions = $derived(targetPhase ? phaseGroups(appState, targetPhase) : []);
  // Falls back to the first lane of the new phase when the current one isn't in it.
  const targetGroupId = $derived(
    laneOptions.some(g => g.id === localGroupId) ? localGroupId : laneOptions[0]?.id ?? '',
  );

  const spareLanes = $derived(ev ? lanesWithoutEvent(ev.id) : []);

  /** Named clashes, so the editor says what it is you came here to fix. */
  const conflictNotes = $derived.by(() => {
    if (!ev?.conflicts) return [];
    return ev.conflicts.map(c => {
      const name =
        c.kind === 'teacher' || c.kind === 'teacher-absent'
          ? appState.teachers.find(t => t.id === c.resourceId)?.name
        : c.kind === 'room' || c.kind === 'room-blocked'
          ? appState.rooms.find(r => r.id === c.resourceId)?.name
        : appState.groups.find(g => g.id === c.resourceId)?.label;
      return { kind: c.kind, name: name ?? c.resourceId, hard: isHardConflict(c.kind) };
    });
  });

  // Seeds the form from the event, once per event id. It used to re-seed on
  // every store change, which was harmless only while the form was a buffer;
  // now that edits are written straight through, re-seeding would fight them.
  let seededId: ID | null = null;
  $effect(() => {
    if (seededId === eventId) return;
    const current = getState().events.find(e => e.id === eventId);
    if (!current) return;
    seededId = eventId;
    localTeacherIds = current.teacherIds;
    localRoomId = current.roomId;
    localDayIndex = current.dayIndex;
    localStartTime = current.startTime;
    localGroupId = isMultiGroupEvent(current) ? '' : current.groupId;
    const totalMin = timeDiffMinutes(current.startTime, current.endTime);
    localDuration = totalMin;
    splitTime = snapToSlot(addMinutesToTime(current.startTime, Math.round(totalMin / 2)));
  });

  /**
   * Write every change straight through.
   *
   * The app had three answers to "did that save?": the quick-edit popover wrote
   * immediately, Konfiguration autosaved and said so, and this dialog buffered
   * behind a Speichern button and threw the edit away on Escape or a backdrop
   * click — with no dirty guard. Escape is safe everywhere else here, which is
   * exactly what made it dangerous in the one place it was not.
   *
   * Self-limiting rather than event-driven: after a commit the store matches the
   * locals, so the comparison below finds nothing to do and the effect settles.
   * That also means it does not care *which* control changed, which is what let
   * `bind:value` fields join in without an onchange each.
   */
  $effect(() => {
    if (seededId !== eventId) return;
    const current = getState().events.find(e => e.id === eventId);
    if (!current) return;

    const startTime = snapToSlot(localStartTime);
    const next = {
      teacherIds: localTeacherIds,
      roomId: localRoomId,
      startTime,
      endTime: addMinutesToTime(startTime, Math.max(15, localDuration)),
      dayIndex: localDayIndex,
      // A multi-group event keeps the ALL_GROUPS sentinel: it follows the lanes
      // of whichever phase covers its day, so a cross-phase move needs no
      // re-mapping.
      groupId: isMultiGroupEvent(current) ? ALL_GROUPS : targetGroupId || current.groupId,
    };

    const same =
      JSON.stringify(next.teacherIds) === JSON.stringify(current.teacherIds) &&
      next.roomId === current.roomId &&
      next.startTime === current.startTime &&
      next.endTime === current.endTime &&
      next.dayIndex === current.dayIndex &&
      next.groupId === current.groupId;
    if (same) return;

    // Coalesced: the duration field is a number input, so a typed "120" would
    // otherwise push three undo entries and evict the real history.
    updateEvent(eventId, next, `${subject?.name ?? 'Lektion'} bearbeiten`, {
      coalesceKey: `modal:${eventId}`,
    });
  });

  // The split picker offers only the slots that actually cut the event in two,
  // so there is no invalid choice to warn about afterwards. An event of one slot
  // has none, which is why Split is hidden for it.
  const split = $derived(
    ev ? splitRange(ev.startTime, ev.endTime) : { from: '00:00', to: '00:00', canSplit: false },
  );

  const defaultDuration = $derived(subject?.defaultDurationMinutes ?? 60);
  const durationOverridden = $derived(localDuration !== defaultDuration);
  const startTimeMoved = $derived(ev ? snapToSlot(localStartTime) !== ev.startTime : false);
  const previewEnd = $derived(
    addMinutesToTime(snapToSlot(localStartTime), Math.max(15, localDuration)),
  );

  const effectiveTeacherIds = $derived(resolveTeacherIds(localTeacherIds, subject));
  const effectiveRoomId = $derived(resolveRoomId(localRoomId, subject));

  function duplicateEvent(): void {
    if (!ev) return;
    const { conflicts: _, ...copy } = ev;
    duplicateEvents([ev.id]);
    onclose();
  }

  function deleteEvent(): void {
    removeEvent(eventId);
    selectEvent(null);
    onclose();
  }

  function doSplit(): void {
    splitEvent(eventId, splitTime);
    onclose();
  }

  function doCopy(): void {
    copyEventToLanes(eventId, copyLanes);
    onclose();
  }

  function toggleTeacher(tid: ID): void {
    const current = effectiveTeacherIds;
    localTeacherIds = current.includes(tid)
      ? current.filter(id => id !== tid)
      : [...current, tid];
  }

  /**
   * Coalesced under one key, like the write-through effect above: typing a name
   * is one action, not one per keystroke. An empty field is not committed —
   * a nameless card is unfindable on the grid and in every report.
   */
  function renameSubject(next: string): void {
    if (!ev || next.trim() === '') return;
    updateSubject(ev.subjectId, { name: next }, {
      label: 'Programmpunkt umbenennen',
      coalesceKey: `modal:name:${ev.subjectId}`,
    });
  }

  function resetTeachers(): void { localTeacherIds = 'inherit'; }
  function resetRoom(): void { localRoomId = 'inherit'; }
  function resetDuration(): void { localDuration = defaultDuration; }

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
    {#if ev && subject}
      <header class="sheet-head">
        <span class="sheet-spine"></span>
        <div class="min-w-0 flex-1">
          <!-- A Programmpunkt *is* its one card: the definition has no other
               placement to speak for, so the name is edited here rather than
               through a detour into Konfiguration and back. Every other kind
               has a library entry that several cards share, and renaming one of
               those from a single card would be a surprise. -->
          {#if subject.kind === 'oneoff'}
            <input
              class="sheet-title sheet-title-input"
              value={subject.name}
              aria-label="Name des Programmpunkts"
              oninput={(e) => renameSubject((e.currentTarget as HTMLInputElement).value)}
            />
          {:else}
            <h3 class="sheet-title">{subject.name}</h3>
          {/if}
          <p class="sheet-when wk-num">
            {DAY_NAMES[ev.dayIndex] ?? ''} {dayDateLabel(appState.wkStartDate, ev.dayIndex)}
            · {ev.startTime}–{ev.endTime}
          </p>
        </div>
        <button class="sheet-x" onclick={onclose} aria-label="Schliessen">
          <Icon name="x" size={16} />
        </button>
      </header>

      {#if conflictNotes.length > 0}
        <div class="clashes">
          {#each conflictNotes as note (note.kind + note.name)}
            <span class="clash" class:clash-hard={note.hard}>
              <Icon name="alert" size={11} />
              {CONFLICT_KIND_LABELS[note.kind]} {note.name}
            </span>
          {/each}
        </div>
      {/if}

      <div class="sheet-body">
        <!-- Placement -->
        <div class="field">
          <span class="field-name">Platzierung</span>
          <div class="field-control">
            <div class="row-2">
              <select class="select select-bordered select-sm flex-1" bind:value={localDayIndex}>
                {#each DAY_NAMES as name, i (name)}
                  <option value={i}>{name}</option>
                {/each}
              </select>
              {#if isMultiGroup}
                <span class="inline-note flex-1">alle Gruppen</span>
              {:else}
                <select
                  class="select select-bordered select-sm flex-1"
                  value={targetGroupId}
                  disabled={laneOptions.length === 0}
                  onchange={(e) => (localGroupId = (e.currentTarget as HTMLSelectElement).value)}
                >
                  {#each laneOptions as g (g.id)}
                    <option value={g.id}>{g.label}</option>
                  {/each}
                </select>
              {/if}
            </div>
            {#if targetPhase === null}
              <p class="warn">
                Keine Phase deckt {DAY_NAMES[localDayIndex]} ab — die Lektion läge ausserhalb jeder Phase und würde nicht angezeigt.
              </p>
            {:else if laneOptions.length === 0}
              <p class="warn">
                {targetPhase.label} hat keine aktiven Gruppen — die Lektion würde nicht angezeigt.
              </p>
            {:else}
              <p class="hint">
                {targetPhase.label}{#if isMultiGroup} · {laneOptions.map(g => g.label).join(', ')}{/if}
              </p>
            {/if}
          </div>
        </div>

        <!-- Teachers -->
        <div class="field">
          <span class="field-name">Ausbildner</span>
          <div class="field-control">
            <div class="teacher-grid">
              {#each appState.teachers as t (t.id)}
                {@const on = effectiveTeacherIds.includes(t.id)}
                <button
                  class="teacher-chip"
                  class:teacher-chip-on={on}
                  style="--tc:{t.color}"
                  aria-pressed={on}
                  onclick={() => toggleTeacher(t.id)}
                >
                  <span
                    class="teacher-av"
                    style="background:{on ? t.color : 'transparent'}; color:{on ? getContrastColor(t.color) : 'var(--wk-text-faint)'}; border-color:{t.color}"
                  >{teacherShort(t)}</span>
                  <span class="truncate">{t.name}</span>
                </button>
              {/each}
              {#if appState.teachers.length === 0}
                <span class="hint">Keine Ausbildner erfasst.</span>
              {/if}
            </div>
            {#if localTeacherIds !== 'inherit'}
              <button class="reset" onclick={resetTeachers} title="Zurück zur Themenvorgabe">
                <Icon name="reset" size={11} /> zurücksetzen
              </button>
            {:else}
              <span class="tag-inherit">Vorgabe</span>
            {/if}
          </div>
        </div>

        <!-- Room -->
        <div class="field">
          <span class="field-name">Raum</span>
          <div class="field-control">
            <select
              class="select select-bordered select-sm w-full"
              value={effectiveRoomId ?? ''}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                localRoomId = v === '' ? null : v;
              }}
            >
              <option value="">Kein Raum</option>
              {#each appState.rooms as r (r.id)}
                <option value={r.id}>{r.name}</option>
              {/each}
            </select>
            {#if localRoomId !== 'inherit'}
              <button class="reset" onclick={resetRoom} title="Zurück zur Themenvorgabe">
                <Icon name="reset" size={11} /> zurücksetzen
              </button>
            {:else}
              <span class="tag-inherit">Vorgabe</span>
            {/if}
          </div>
        </div>

        <!-- Time + duration -->
        <div class="field">
          <span class="field-name">Zeit</span>
          <div class="field-control">
            <div class="row-2">
              <TimeField bind:value={localStartTime} ariaLabel="Startzeit" />
              <span class="inline-note wk-num">endet {previewEnd}</span>
            </div>
            <DurationField value={localDuration} onchange={(m) => (localDuration = m)} />
            <div class="flex items-center gap-3 flex-wrap">
              {#if startTimeMoved}
                <span class="hint wk-num">verschoben von {ev.startTime}</span>
              {/if}
              {#if durationOverridden}
                <button class="reset" onclick={resetDuration} title="Zurück auf {defaultDuration} min">
                  <Icon name="reset" size={11} /> zurücksetzen
                </button>
              {:else}
                <span class="tag-inherit">Vorgabe</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Split -->
        {#if showSplit}
          <div class="inset">
            <span class="inset-label">Teilen um</span>
            <TimeField
              bind:value={splitTime}
              from={split.from}
              to={split.to}
              class="flex-1"
              ariaLabel="Teilen um"
            />
            <button class="btn btn-sm btn-primary" onclick={doSplit}>Teilen</button>
            <button class="btn btn-sm btn-ghost" onclick={() => showSplit = false}>Abbrechen</button>
          </div>
        {/if}

        <!-- Copy to lanes -->
        {#if showCopy}
          <div class="inset inset-col">
            <div class="flex items-center gap-2 w-full">
              <span class="inset-label">Kopieren auf</span>
              {#if spareLanes.length === 0}
                <span class="hint">Alle anderen Gruppen haben diese Lektion zu dieser Zeit schon.</span>
              {:else}
                <div class="flex gap-1.5 flex-wrap flex-1">
                  {#each spareLanes as g (g.id)}
                    <label class="lane" class:lane-on={copyLanes.includes(g.id)}>
                      <input
                        type="checkbox"
                        checked={copyLanes.includes(g.id)}
                        onchange={(e) => {
                          const on = (e.currentTarget as HTMLInputElement).checked;
                          copyLanes = on ? [...copyLanes, g.id] : copyLanes.filter(id => id !== g.id);
                        }}
                      />
                      {g.label}
                    </label>
                  {/each}
                </div>
              {/if}
              <button class="btn btn-sm btn-primary" disabled={copyLanes.length === 0} onclick={doCopy}>
                Kopieren
              </button>
              <button class="btn btn-sm btn-ghost" onclick={() => (showCopy = false)}>Abbrechen</button>
            </div>
            <p class="hint">
              Gleicher Tag und gleiche Zeit auf jeder gewählten Gruppe. Konflikte werden gemeldet, nie blockiert.
            </p>
          </div>
        {/if}
      </div>

      <!-- Labelled. As four identical 30px grey glyphs these were a guessing
           game — scissors and layers in particular say nothing about "teilen"
           and "auf andere Gruppen kopieren" until you have been told once. The
           sheet is wider to pay for it. Löschen keeps its own end of the row,
           its separator and its error-coloured hover: it is the one action here
           that cannot be undone by pressing the button again. -->
      <footer class="sheet-foot">
        <div class="foot-actions">
          <button
            class="act act-danger"
            onclick={deleteEvent}
            title="Diese Lektion löschen"
            aria-label="Diese Lektion löschen"
          >
            <Icon name="trash" size={15} /> Löschen
          </button>
          {#if !showSplit && !showCopy}
            <span class="act-sep"></span>
            <button
              class="act"
              onclick={() => (showSplit = true)}
              disabled={!split.canSplit}
              title={split.canSplit ? 'In zwei Lektionen teilen' : 'Zu kurz zum Teilen — jede Hälfte braucht mindestens 15 Minuten'}
              aria-label="In zwei Lektionen teilen"
            >
              <Icon name="scissors" size={15} /> Teilen
            </button>
            <button
              class="act"
              onclick={duplicateEvent}
              title="Duplizieren"
              aria-label="Duplizieren"
            >
              <Icon name="copy" size={15} /> Duplizieren
            </button>
            {#if !isMultiGroup}
              <button
                class="act"
                disabled={spareLanes.length === 0}
                onclick={() => { showCopy = true; copyLanes = spareLanes.map(g => g.id); }}
                title={spareLanes.length > 0
                  ? 'Auf die anderen Gruppen kopieren'
                  : laneOptions.length <= 1
                    ? `${targetPhase?.label ?? 'Diese Phase'} hat nur eine Gruppe`
                    : 'Jede andere Gruppe hat diese Lektion zu dieser Zeit schon'}
                aria-label="Auf die anderen Gruppen kopieren"
              >
                <Icon name="layers" size={15} /> Alle Gruppen
              </button>
            {/if}
          {/if}
        </div>
        <!-- No Speichern, and no Abbrechen to imply there is something to
             cancel: the fields write through, exactly as the quick-edit popover
             and Konfiguration do. Ctrl+Z is the way back, everywhere. -->
        <div class="saved">
          <Icon name="check" size={13} /> Automatisch gespeichert
        </div>
      </footer>
    {:else}
      <div class="p-6 text-sm">Lektion nicht gefunden.</div>
    {/if}
  </div>
</dialog>

<style>
  dialog::backdrop {
    background: var(--wk-scrim);
  }

  .sheet {
    width: min(620px, 94vw);
    background: var(--wk-surface);
    color: var(--wk-text);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 88vh;
  }

  .sheet-head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.85rem 0.85rem 0.85rem 0;
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
    line-height: 1.25;
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

  .clashes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.55rem 0.9rem;
    border-bottom: 1px solid var(--wk-line);
    background: var(--wk-surface-alt);
  }

  .clash {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    background: color-mix(in oklab, var(--color-warning) 16%, transparent);
    color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text));
  }

  .clash-hard {
    background: color-mix(in oklab, var(--color-error) 13%, transparent);
    color: var(--color-error);
  }

  /* One grid for every row, so the label column is exactly as wide as the
     longest label and no wider. It used to be a fixed 5rem per row: "Zeit" got
     55px of slack it had no use for and "Ausbildner", which needs 95px, ran
     15px past its box and straight into the first teacher chip — the one label
     the width was supposed to be chosen for. `max-content` measures instead of
     guessing, and every row shares the measurement because they share the grid.
     `.field` is display: contents so its two halves land in that grid directly. */
  .sheet-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.9rem;
    display: grid;
    grid-template-columns: max-content 1fr;
    align-content: start;
    gap: 0.85rem 0.85rem;
  }

  /* Anything that is not a label/control pair spans the pair. */
  .sheet-body > :not(.field) {
    grid-column: 1 / -1;
  }

  .field {
    display: contents;
  }

  .field-name {
    padding-top: 0.4rem;
    font-size: var(--wk-fs-sm);
    font-weight: 650;
  }

  .field-control {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .row-2 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .inline-note,
  .hint {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-faint);
  }

  .warn {
    font-size: var(--wk-fs-xs);
    color: color-mix(in oklab, var(--color-warning) 78%, var(--wk-text));
  }

  .reset {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    font-size: var(--wk-fs-xs);
    color: var(--color-primary);
    cursor: pointer;
  }
  .reset:hover { text-decoration: underline; }

  .teacher-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.3rem;
  }

  .teacher-chip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-xs);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .teacher-chip:hover { border-color: var(--tc); color: var(--wk-text); }
  .teacher-chip-on {
    border-color: var(--tc);
    background: color-mix(in oklab, var(--tc) 10%, transparent);
    color: var(--wk-text);
    font-weight: 600;
  }

  .teacher-av {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1.5px solid;
    font-size: 9px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .inset {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: var(--wk-surface-alt);
  }

  .inset-col {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
  }

  .inset-label {
    font-size: var(--wk-fs-sm);
    font-weight: 650;
    flex-shrink: 0;
  }

  .lane {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: var(--wk-surface);
    font-size: var(--wk-fs-xs);
    cursor: pointer;
  }
  .lane-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
  }
  .lane input { accent-color: var(--color-primary); }

  /* Wraps rather than clips. The labels this footer now carries are what the
     original icon-only row was avoiding, and the failure it was avoiding was
     Save being pushed off the end of the sheet — so the sheet is wide enough for
     both rows, and if a longer translation ever changes that, the actions drop
     to their own line instead of taking Save with them. */
  .sheet-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    padding: 0.6rem 0.75rem;
    border-top: 1px solid var(--wk-line);
    background: var(--wk-surface-alt);
  }

  /* One word, in the row it belongs to. "aus der Themenvorgabe" set as body
     text under three separate fields was the same sentence three times, and it
     read as prose rather than as this row's state. */
  .tag-inherit {
    align-self: flex-start;
    padding: 0.02rem 0.36rem;
    border: 1px solid var(--wk-line);
    border-radius: 999px;
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    color: var(--wk-text-faint);
  }

  .foot-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  .act {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    height: 30px;
    padding: 0 0.5rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: transparent;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .act:hover:not(:disabled) { background: var(--wk-surface); color: var(--wk-text); }
  .act:disabled { opacity: 0.35; cursor: default; }
  .saved {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: var(--wk-fs-xs);
    color: var(--color-success);
    font-weight: 600;
  }

  .act-danger:hover:not(:disabled) {
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 12%, transparent);
  }

  .act-sep {
    width: 1px;
    height: 18px;
    margin: 0 0.25rem;
    background: var(--wk-line);
  }
</style>
