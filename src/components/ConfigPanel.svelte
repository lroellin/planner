<script lang="ts">
  import {
    getState,
    addGroup, updateGroup, removeGroup, moveGroupUp, moveGroupDown, moveGroupToIndex,
    eventCountForGroup,
    addPhase, updatePhase, removePhase, eventCountForPhase,
    resetToDefaults,
  } from '../state/store.svelte';
  import { generateDistinctColor } from '../utils/colorUtils';
  import { teacherShort } from '../utils/format';
  import { DAY_NAMES } from '../utils/timeUtils';
  import MasterDetail from './config/MasterDetail.svelte';
  import TeacherDetail from './config/TeacherDetail.svelte';
  import RoomDetail from './config/RoomDetail.svelte';
  import SubjectDetail from './config/SubjectDetail.svelte';
  import Icon from './Icon.svelte';
  import type { ID } from '../types';

  interface Props { onclose: () => void; }
  let { onclose }: Props = $props();

  type Tab = 'groups' | 'phases' | 'teachers' | 'rooms' | 'subjects';
  const TABS: { key: Tab; label: string }[] = [
    { key: 'groups', label: 'Groups' },
    { key: 'phases', label: 'Phases' },
    { key: 'teachers', label: 'Teachers' },
    { key: 'rooms', label: 'Rooms' },
    { key: 'subjects', label: 'Subjects' },
  ];
  let activeTab: Tab = $state('groups');

  const appState = $derived(getState());
  const sortedGroups = $derived([...appState.groups].sort((a, b) => a.order - b.order));
  const orderedPhases = $derived([...appState.phases].sort((a, b) => a.startDay - b.startDay));

  // One line, not a paragraph: the full explanation lives behind the ⓘ so it
  // isn't re-read on every visit to the tab.
  const TAB_INTRO: Record<Tab, { short: string; long: string }> = {
    groups: {
      short: 'Groups are the columns of the timetable.',
      long: 'Every group has to attend every subject. Inactive groups keep their data but are hidden from the calendar and skipped by conflict checks.',
    },
    phases: {
      short: 'Phases split the week into stretches with their own lanes.',
      long: 'A Kader planning course needs only one lane, the group rotation needs all of them. Each phase is drawn as its own calendar, so narrow phases stop wasting space.',
    },
    teachers: {
      short: 'The same teacher cannot be booked twice at the same time.',
      long: 'Teacher clashes are hard conflicts. The short name and colour are what you see on the calendar cards.',
    },
    rooms: {
      short: 'Rooms are checked for soft conflicts.',
      long: 'Turn off conflict checking for shared spaces such as "outside", where two groups can be at the same place without a problem.',
    },
    subjects: {
      short: 'Subjects are the blocks you drag onto the calendar.',
      long: 'Their defaults — teachers, room, duration — are copied to each placed event, where you can still override them individually.',
    },
  };

  let introOpen = $state(false);
  let dangerOpen = $state(false);

  // ─── Master-detail selection ──────────────────────────────────────────────
  let selectedTeacherId: ID | null = $state(getState().teachers[0]?.id ?? null);
  let addingTeacher = $state(false);
  let selectedRoomId: ID | null = $state(getState().rooms[0]?.id ?? null);
  let addingRoom = $state(false);
  let selectedSubjectId: ID | null = $state(getState().subjects[0]?.id ?? null);
  let addingSubject = $state(false);

  const selectedTeacher = $derived(appState.teachers.find(t => t.id === selectedTeacherId) ?? null);
  const selectedRoom    = $derived(appState.rooms.find(r => r.id === selectedRoomId) ?? null);
  const selectedSubject = $derived(appState.subjects.find(s => s.id === selectedSubjectId) ?? null);

  // A fresh entity opens on a colour that is far from the ones already in use.
  const nextTeacherColor = $derived(generateDistinctColor(appState.teachers.map(t => t.color)));
  const nextRoomColor    = $derived(generateDistinctColor(appState.rooms.map(r => r.color)));
  const nextSubjectColor = $derived(generateDistinctColor(appState.subjects.map(s => s.color)));

  /** After a delete, land on the entity that slid into the removed one's place. */
  function neighbourId(list: { id: ID }[], index: number): ID | null {
    return list[index]?.id ?? list.at(-1)?.id ?? null;
  }

  // ─── Groups ───────────────────────────────────────────────────────────────
  function nextGroupLabel(): string {
    let i = 1;
    while (appState.groups.some(g => g.label === `G${i}`)) i++;
    return `G${i}`;
  }
  let newGroupLabel = $state(nextGroupLabel());

  function submitGroup(e?: Event): void {
    e?.preventDefault();
    const label = newGroupLabel.trim();
    if (!label) return;
    addGroup(label);
    newGroupLabel = nextGroupLabel();
  }

  // Deleting a lane takes its events with it, so say how many before doing it.
  function confirmRemoveGroup(id: ID, label: string): void {
    const count = eventCountForGroup(id);
    const detail = count === 0
      ? 'It has no events of its own.'
      : `${count} event${count === 1 ? '' : 's'} placed on this lane will be deleted.`;
    if (!window.confirm(`Delete group "${label}"?\n${detail}`)) return;
    removeGroup(id);
  }

  // Drag to reorder: the rows *are* the columns of the timetable, so dragging
  // them is the gesture that matches. The ▲▼ buttons stay for the keyboard.
  let dragId: ID | null = $state(null);

  function onDrop(targetId: ID): void {
    const dragged = dragId;
    const to = sortedGroups.findIndex(g => g.id === targetId);
    dragId = null;
    if (dragged === null || to < 0) return;
    moveGroupToIndex(dragged, to);
  }

  // ─── Phases ───────────────────────────────────────────────────────────────
  let newPhaseLabel = $state('');

  function submitPhase(e?: Event): void {
    e?.preventDefault();
    const label = newPhaseLabel.trim();
    if (!label) return;
    const lastDay = appState.phases.reduce((m, p) => Math.max(m, p.endDay), -1);
    const start = Math.min(lastDay + 1, DAY_NAMES.length - 1);
    addPhase(label, start, DAY_NAMES.length - 1, appState.groups.filter(g => g.enabled).map(g => g.id));
    newPhaseLabel = '';
  }

  // Moving one end past the other drags the other end along, so a phase can
  // never end before it starts.
  function setPhaseStart(id: ID, startDay: number, endDay: number): void {
    updatePhase(id, startDay > endDay ? { startDay, endDay: startDay } : { startDay });
  }

  function setPhaseEnd(id: ID, endDay: number, startDay: number): void {
    updatePhase(id, endDay < startDay ? { endDay, startDay: endDay } : { endDay });
  }

  // Removing a phase keeps its events but leaves them on no calendar at all.
  function confirmRemovePhase(id: ID, label: string): void {
    const count = eventCountForPhase(id);
    const detail = count === 0
      ? 'It covers no events.'
      : `${count} event${count === 1 ? '' : 's'} on those days will no longer be drawn anywhere — ` +
        `they show up under "Not on any calendar" until you move them.`;
    if (!window.confirm(`Delete phase "${label}"?\n${detail}`)) return;
    removePhase(id);
  }

  /** Colour a phase gets in the week strip — position, not identity. */
  const PHASE_HUES = ['var(--color-primary)', 'var(--color-accent)', 'var(--color-info)', 'var(--color-success)'];

  // Phases are drawn independently, so a bad day range silently hides events
  // rather than erroring — surface the common mistakes instead.
  const phaseWarning = $derived.by(() => {
    const problems: string[] = [];
    if (appState.phases.some(p => p.endDay < p.startDay)) {
      problems.push('a phase ends before it starts');
    }
    if (appState.phases.some(p => p.groupIds.length === 0)) {
      problems.push('a phase has no lanes');
    }
    const covered = new Set<number>();
    let overlaps = false;
    for (const p of appState.phases) {
      for (let d = p.startDay; d <= p.endDay; d++) {
        if (covered.has(d)) overlaps = true;
        covered.add(d);
      }
    }
    if (overlaps) problems.push('two phases cover the same day');
    const uncovered = DAY_NAMES.filter((_, i) => !covered.has(i));
    if (uncovered.length > 0) problems.push(`${uncovered.join(', ')} not covered by any phase`);
    return problems.length > 0 ? `Check your phases: ${problems.join('; ')}.` : null;
  });

  /** Which phase owns each weekday — drives the strip above the phase table. */
  const weekStrip = $derived(
    DAY_NAMES.map((name, day) => {
      const index = orderedPhases.findIndex(p => day >= p.startDay && day <= p.endDay);
      return {
        name,
        phase: index >= 0 ? orderedPhases[index]! : null,
        hue: index >= 0 ? PHASE_HUES[index % PHASE_HUES.length]! : null,
      };
    }),
  );

  // ─── Danger zone ──────────────────────────────────────────────────────────
  function handleClearAll(): void {
    if (!window.confirm(
      'Clear ALL data?\n\nThis permanently removes every event, group, teacher, room, and subject and resets to defaults.\n\nThis cannot be undone.'
    )) return;
    resetToDefaults();
    onclose();
  }

  let dialogEl: HTMLDialogElement;
  $effect(() => { if (dialogEl) dialogEl.showModal(); });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} onclose={onclose} onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}
  class="modal">
  <div class="config-panel">

    <!-- Header -->
    <header class="cfg-head">
      <h3 class="cfg-title">Configuration</h3>
      <button class="cfg-x" onclick={onclose} aria-label="Close">
        <Icon name="x" size={16} />
      </button>
    </header>

    <!-- Tabs -->
    <div role="tablist" class="cfg-tabs">
      {#each TABS as tab (tab.key)}
        <button
          role="tab"
          class="cfg-tab"
          class:cfg-tab-on={activeTab === tab.key}
          aria-selected={activeTab === tab.key}
          onclick={() => { activeTab = tab.key; introOpen = false; }}
        >{tab.label}</button>
      {/each}
    </div>

    <!-- One-line intro; the rest is behind the ⓘ -->
    <div class="intro-band">
      <p>{TAB_INTRO[activeTab].short}</p>
      <button class="intro-more" onclick={() => (introOpen = !introOpen)}>
        <Icon name="info" size={13} />
        {introOpen ? 'less' : 'more'}
      </button>
    </div>
    {#if introOpen}
      <p class="intro-long">{TAB_INTRO[activeTab].long}</p>
    {/if}

    <!-- Content -->
    <div class="cfg-body">

      <!-- ════ GROUPS ════════════════════════════════════════════════════════ -->
      {#if activeTab === 'groups'}
        <div class="pane">
          <div class="pane-scroll">
            {#if appState.groups.length > 0}
              <div class="table">
                <div class="table-head grid-groups">
                  <span></span>
                  <span class="text-center">On</span>
                  <span>Label</span>
                  <span class="text-center">Order</span>
                  <span></span>
                </div>
                {#each sortedGroups as g, i (g.id)}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="table-row grid-groups"
                    class:row-off={!g.enabled}
                    class:row-dragging={dragId === g.id}
                    draggable="true"
                    ondragstart={() => (dragId = g.id)}
                    ondragover={(e) => e.preventDefault()}
                    ondrop={(e) => { e.preventDefault(); onDrop(g.id); }}
                    ondragend={() => (dragId = null)}
                  >
                    <span class="drag-handle" title="Drag to reorder the columns">
                      <Icon name="grip" size={14} />
                    </span>
                    <div class="flex justify-center">
                      <input type="checkbox" class="toggle toggle-primary toggle-sm"
                        checked={g.enabled}
                        aria-label="Group active"
                        onchange={(e) => updateGroup(g.id, { enabled: (e.currentTarget as HTMLInputElement).checked })}
                      />
                    </div>
                    <input class="input input-bordered input-sm w-28" type="text" value={g.label}
                      aria-label="Group label"
                      onchange={(e) => updateGroup(g.id, { label: (e.currentTarget as HTMLInputElement).value })}
                    />
                    <div class="order-btns">
                      <button class="mini" disabled={i === 0}
                        onclick={() => moveGroupUp(g.id)} aria-label="Move up">
                        <Icon name="chevronUp" size={12} />
                      </button>
                      <button class="mini" disabled={i === sortedGroups.length - 1}
                        onclick={() => moveGroupDown(g.id)} aria-label="Move down">
                        <Icon name="chevronDown" size={12} />
                      </button>
                    </div>
                    <button class="mini mini-danger"
                      onclick={() => confirmRemoveGroup(g.id, g.label)} aria-label="Delete group">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                {/each}
              </div>
              <p class="field-hint mt-3">
                Switching a group off keeps its events; they are simply not drawn and stop
                raising conflicts.
              </p>
            {:else}
              <p class="pane-empty">No groups yet. Add one below.</p>
            {/if}
          </div>

          <form class="pane-add" onsubmit={submitGroup}>
            <span class="field-label">Add group</span>
            <input class="input input-bordered input-sm w-28" type="text" bind:value={newGroupLabel}
              placeholder="G4" aria-label="Group label" />
            <button type="submit" class="btn btn-primary btn-sm gap-1.5">
              <Icon name="plus" size={13} /> Add group
            </button>
          </form>
        </div>

      <!-- ════ PHASES ════════════════════════════════════════════════════════ -->
      {:else if activeTab === 'phases'}
        <div class="pane">
          <div class="pane-scroll">
            <!-- The week at a glance: the one picture that explains the model. -->
            <div class="week-strip">
              {#each weekStrip as day (day.name)}
                <div class="strip-day" style={day.hue ? `--ph:${day.hue}` : ''} class:strip-gap={!day.phase}>
                  <span class="strip-name">{day.name}</span>
                  <span class="strip-phase">{day.phase?.label ?? 'no phase'}</span>
                </div>
              {/each}
            </div>

            {#if phaseWarning}
              <p class="warn-banner">
                <Icon name="alert" size={14} /> {phaseWarning}
              </p>
            {/if}

            {#if appState.phases.length > 0}
              <div class="table">
                <div class="table-head grid-phases">
                  <span>Label</span>
                  <span>From</span>
                  <span>To</span>
                  <span>Lanes</span>
                  <span></span>
                </div>
                {#each orderedPhases as p, i (p.id)}
                  <div class="table-row grid-phases">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="phase-swatch" style="background:{PHASE_HUES[i % PHASE_HUES.length]}"></span>
                      <input class="input input-bordered input-sm w-full" type="text" value={p.label}
                        aria-label="Phase label"
                        onchange={(e) => updatePhase(p.id, { label: (e.currentTarget as HTMLInputElement).value })}
                      />
                    </div>
                    <select class="select select-bordered select-sm" value={p.startDay}
                      aria-label="First day"
                      onchange={(e) => setPhaseStart(p.id, Number((e.currentTarget as HTMLSelectElement).value), p.endDay)}>
                      {#each DAY_NAMES as name, d (name)}
                        <option value={d}>{name}</option>
                      {/each}
                    </select>
                    <select class="select select-bordered select-sm" value={p.endDay}
                      aria-label="Last day"
                      onchange={(e) => setPhaseEnd(p.id, Number((e.currentTarget as HTMLSelectElement).value), p.startDay)}>
                      {#each DAY_NAMES as name, d (name)}
                        <option value={d}>{name}</option>
                      {/each}
                    </select>
                    <div class="lane-picks">
                      {#each sortedGroups as g (g.id)}
                        <label class="lane-pick" class:lane-pick-on={p.groupIds.includes(g.id)}>
                          <input type="checkbox"
                            checked={p.groupIds.includes(g.id)}
                            onchange={(e) => updatePhase(p.id, {
                              groupIds: (e.currentTarget as HTMLInputElement).checked
                                ? [...p.groupIds, g.id]
                                : p.groupIds.filter(id => id !== g.id),
                            })}
                          />
                          {g.label}
                        </label>
                      {/each}
                    </div>
                    <button class="mini mini-danger"
                      onclick={() => confirmRemovePhase(p.id, p.label)} aria-label="Delete phase">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="pane-empty">No phases yet. Add one below.</p>
            {/if}
          </div>

          <form class="pane-add" onsubmit={submitPhase}>
            <span class="field-label">Add phase</span>
            <input class="input input-bordered input-sm w-48" type="text" bind:value={newPhaseLabel}
              placeholder="Phase name" aria-label="Phase label" />
            <button type="submit" class="btn btn-primary btn-sm gap-1.5">
              <Icon name="plus" size={13} /> Add phase
            </button>
          </form>
        </div>

      <!-- ════ TEACHERS ══════════════════════════════════════════════════════ -->
      {:else if activeTab === 'teachers'}
        <MasterDetail
          items={appState.teachers}
          selectedId={selectedTeacherId}
          adding={addingTeacher}
          addLabel="Add teacher"
          emptyListText="No teachers yet"
          onselect={(id) => { selectedTeacherId = id; addingTeacher = false; }}
          onadd={() => { addingTeacher = true; selectedTeacherId = null; }}
        >
          {#snippet row(t)}
            <span class="list-avatar" style="background:{t.color}">{teacherShort(t)}</span>
            <span class="truncate min-w-0 flex-1">{t.name}</span>
          {/snippet}
          {#snippet detail()}
            {#if addingTeacher || selectedTeacher}
              {#key selectedTeacher?.id ?? 'new'}
                <TeacherDetail
                  teacher={addingTeacher ? null : selectedTeacher}
                  draftColor={nextTeacherColor}
                  oncreated={(id) => { addingTeacher = false; selectedTeacherId = id; }}
                  oncancel={() => { addingTeacher = false; selectedTeacherId = appState.teachers[0]?.id ?? null; }}
                  ondeleted={(i) => (selectedTeacherId = neighbourId(getState().teachers, i))}
                />
              {/key}
            {:else}
              <div class="empty-detail">
                <Icon name="users" size={26} />
                <span>Select a teacher to edit, or add a new one.</span>
              </div>
            {/if}
          {/snippet}
        </MasterDetail>

      <!-- ════ ROOMS ═════════════════════════════════════════════════════════ -->
      {:else if activeTab === 'rooms'}
        <MasterDetail
          items={appState.rooms}
          selectedId={selectedRoomId}
          adding={addingRoom}
          addLabel="Add room"
          emptyListText="No rooms yet"
          onselect={(id) => { selectedRoomId = id; addingRoom = false; }}
          onadd={() => { addingRoom = true; selectedRoomId = null; }}
        >
          {#snippet row(r)}
            <span class="w-2.5 h-full min-h-[1.4rem] rounded-sm shrink-0 self-stretch" style="background:{r.color}"></span>
            <span class="truncate min-w-0 flex-1">{r.name}</span>
            {#if r.excludeFromConflictCheck}
              <span class="row-tag">shared</span>
            {/if}
          {/snippet}
          {#snippet detail()}
            {#if addingRoom || selectedRoom}
              {#key selectedRoom?.id ?? 'new'}
                <RoomDetail
                  room={addingRoom ? null : selectedRoom}
                  draftColor={nextRoomColor}
                  oncreated={(id) => { addingRoom = false; selectedRoomId = id; }}
                  oncancel={() => { addingRoom = false; selectedRoomId = appState.rooms[0]?.id ?? null; }}
                  ondeleted={(i) => (selectedRoomId = neighbourId(getState().rooms, i))}
                />
              {/key}
            {:else}
              <div class="empty-detail">
                <Icon name="pin" size={26} />
                <span>Select a room to edit, or add a new one.</span>
              </div>
            {/if}
          {/snippet}
        </MasterDetail>

      <!-- ════ SUBJECTS ══════════════════════════════════════════════════════ -->
      {:else if activeTab === 'subjects'}
        <MasterDetail
          items={appState.subjects}
          selectedId={selectedSubjectId}
          adding={addingSubject}
          addLabel="Add subject"
          emptyListText="No subjects yet"
          onselect={(id) => { selectedSubjectId = id; addingSubject = false; }}
          onadd={() => { addingSubject = true; selectedSubjectId = null; }}
        >
          {#snippet row(s)}
            <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{s.color}"></span>
            <span class="truncate min-w-0 flex-1">{s.name}</span>
            {#if s.isBreak}
              <span class="row-tag">break</span>
            {/if}
          {/snippet}
          {#snippet detail()}
            {#if addingSubject || selectedSubject}
              {#key selectedSubject?.id ?? 'new'}
                <SubjectDetail
                  subject={addingSubject ? null : selectedSubject}
                  draftColor={nextSubjectColor}
                  oncreated={(id) => { addingSubject = false; selectedSubjectId = id; }}
                  oncancel={() => { addingSubject = false; selectedSubjectId = appState.subjects[0]?.id ?? null; }}
                  ondeleted={(i) => (selectedSubjectId = neighbourId(getState().subjects, i))}
                />
              {/key}
            {:else}
              <div class="empty-detail">
                <Icon name="calendar" size={26} />
                <span>Select a subject to edit, or add a new one.</span>
              </div>
            {/if}
          {/snippet}
        </MasterDetail>
      {/if}

    </div>

    <!-- Footer: the destructive action lives behind a disclosure, not one
         mis-click away from Save. -->
    <footer class="cfg-foot">
      <button class="danger-toggle" onclick={() => (dangerOpen = !dangerOpen)}>
        <Icon name={dangerOpen ? 'chevronDown' : 'chevronRight'} size={12} />
        Danger zone
      </button>
      {#if dangerOpen}
        <div class="danger-body">
          <span class="danger-note">Removes all events, groups, teachers, rooms and subjects.</span>
          <button class="btn btn-sm btn-error gap-1.5" onclick={handleClearAll}>
            <Icon name="trash" size={13} /> Reset all data
          </button>
        </div>
      {/if}
    </footer>

  </div>
</dialog>

<style>
  dialog::backdrop {
    background: color-mix(in oklab, black 45%, transparent);
  }

  .config-panel {
    display: flex;
    flex-direction: column;
    width: min(1000px, 92vw);
    /* Fixed: a short tab used to shrink the dialog and move the tab strip out
       from under the pointer mid-click. */
    height: 82vh;
    background: var(--wk-surface);
    color: var(--wk-text);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
    overflow: hidden;
  }

  .cfg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .cfg-title {
    font-size: var(--wk-fs-lg);
    font-weight: 700;
    margin: 0;
  }

  .cfg-x {
    display: flex;
    padding: 0.3rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .cfg-x:hover { background: var(--wk-surface-alt); color: var(--wk-text); }

  .cfg-tabs {
    display: flex;
    gap: 0.15rem;
    padding: 0 1.25rem;
    border-bottom: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .cfg-tab {
    padding: 0.6rem 0.7rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-sm);
    font-weight: 550;
    cursor: pointer;
  }
  .cfg-tab:hover { color: var(--wk-text); }
  .cfg-tab-on {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
    font-weight: 650;
  }

  .intro-band {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-shrink: 0;
    padding: 0.45rem 1.25rem;
    background: var(--wk-surface-alt);
    border-bottom: 1px solid var(--wk-line);
  }

  .intro-band p {
    margin: 0;
    flex: 1;
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
  }

  .intro-more {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    border: none;
    background: none;
    color: var(--color-primary);
    font-size: var(--wk-fs-2xs);
    cursor: pointer;
  }
  .intro-more:hover { text-decoration: underline; }

  .intro-long {
    flex-shrink: 0;
    margin: 0;
    padding: 0.55rem 1.25rem;
    font-size: var(--wk-fs-xs);
    line-height: 1.55;
    color: var(--wk-text-mute);
    background: var(--wk-surface-alt);
    border-bottom: 1px solid var(--wk-line);
  }

  .cfg-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    overflow: hidden;
  }

  .pane-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.4rem;
  }

  .pane-empty {
    font-size: var(--wk-fs-sm);
    color: var(--wk-text-faint);
    text-align: center;
    padding: 1.5rem 0;
  }

  .pane-add {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-shrink: 0;
    padding: 0.75rem 1.4rem;
    border-top: 1px solid var(--wk-line);
    background: var(--wk-surface-alt);
  }

  /* ── Tables ─────────────────────────────────────────────────────────────── */
  .table {
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-md);
    overflow: hidden;
    max-width: 46rem;
  }

  .table-head {
    align-items: center;
    padding: 0.4rem 0.85rem;
    background: var(--wk-surface-alt);
    border-bottom: 1px solid var(--wk-line);
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--wk-text-faint);
  }

  .table-row {
    align-items: center;
    padding: 0.4rem 0.85rem;
    border-bottom: 1px solid var(--wk-line);
    transition: background 0.1s;
  }
  .table-row:last-child { border-bottom: 0; }
  .table-row:hover { background: color-mix(in oklab, var(--color-base-content) 3%, transparent); }

  .row-off { opacity: 0.45; }
  .row-dragging { opacity: 0.4; background: color-mix(in oklab, var(--color-primary) 10%, transparent); }

  .grid-groups {
    display: grid;
    grid-template-columns: 1.4rem 3rem 1fr 2.6rem 2rem;
    gap: 0.6rem;
  }

  .grid-phases {
    display: grid;
    grid-template-columns: minmax(9rem, 1fr) 5.5rem 5.5rem minmax(10rem, 1.2fr) 2rem;
    gap: 0.6rem;
  }

  .drag-handle {
    display: flex;
    color: var(--wk-text-faint);
    cursor: grab;
  }
  .drag-handle:active { cursor: grabbing; }

  .order-btns {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .mini {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 18px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .mini:hover:not(:disabled) { background: var(--wk-surface-alt); color: var(--wk-text); }
  .mini:disabled { opacity: 0.25; cursor: default; }

  .mini-danger { height: 24px; }
  .mini-danger:hover {
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 12%, transparent);
  }

  .row-tag {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    flex-shrink: 0;
  }

  /* ── Phases: the week strip ─────────────────────────────────────────────── */
  .week-strip {
    display: flex;
    gap: 3px;
    margin-bottom: 1rem;
    max-width: 46rem;
  }

  .strip-day {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.45rem 0.55rem;
    border-radius: var(--wk-r-sm);
    border-top: 3px solid var(--ph, var(--wk-line-strong));
    background: color-mix(in oklab, var(--ph, gray) 9%, var(--wk-surface-alt));
    min-width: 0;
  }

  .strip-gap {
    background: repeating-linear-gradient(
      135deg,
      transparent 0 5px,
      color-mix(in oklab, var(--color-error) 12%, transparent) 5px 10px
    );
    border-top-color: var(--color-error);
  }

  .strip-name {
    font-size: var(--wk-fs-xs);
    font-weight: 700;
  }

  .strip-phase {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-mute);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .phase-swatch {
    width: 8px;
    height: 22px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .lane-picks {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .lane-pick {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    font-size: var(--wk-fs-xs);
    cursor: pointer;
  }
  .lane-pick-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
    font-weight: 600;
  }
  .lane-pick input { accent-color: var(--color-primary); }

  .warn-banner {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 46rem;
    margin-bottom: 0.9rem;
    padding: 0.5rem 0.7rem;
    border-radius: var(--wk-r-sm);
    font-size: var(--wk-fs-xs);
    background: color-mix(in oklab, var(--color-warning) 13%, transparent);
    color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text));
  }

  /* ── Footer ─────────────────────────────────────────────────────────────── */
  .cfg-foot {
    flex-shrink: 0;
    padding: 0.5rem 1.25rem;
    border-top: 1px solid var(--wk-line);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .danger-toggle {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    align-self: flex-start;
    border: none;
    background: none;
    padding: 0;
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .danger-toggle:hover { color: var(--color-error); }

  .danger-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid color-mix(in oklab, var(--color-error) 35%, transparent);
    border-radius: var(--wk-r-sm);
    background: color-mix(in oklab, var(--color-error) 7%, transparent);
  }

  .danger-note {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
  }
</style>
