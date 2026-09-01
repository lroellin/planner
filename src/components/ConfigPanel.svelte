<script lang="ts">
  import {
    getState,
    addTeacher, updateTeacher, removeTeacher,
    addRoom, updateRoom, removeRoom,
    addSubject, updateSubject, removeSubject,
    addGroup, updateGroup, removeGroup,
    addPhase, updatePhase, removePhase,
    resetToDefaults,
  } from '../state/store.svelte';
  import { generateDistinctColor, generateInitials } from '../utils/colorUtils';
  import { DAY_NAMES } from '../utils/timeUtils';
  import type { ID } from '../types';

  interface Props { onclose: () => void; }
  let { onclose }: Props = $props();

  type Tab = 'groups' | 'phases' | 'teachers' | 'rooms' | 'subjects';
  let activeTab: Tab = $state('groups');
  const appState = $derived(getState());

  const TAB_INTRO: Record<Tab, string> = {
    groups: 'Groups are the columns of the timetable — every group has to attend every subject. Inactive groups keep their data but are hidden from the calendar and skipped by conflict checks.',
    phases: 'Phases split the week into stretches with their own lanes — a Kader planning course needs only one, the group rotation needs all of them. Each phase is drawn as its own calendar, so narrow phases stop wasting space.',
    teachers: 'Teachers are checked for hard conflicts: the same teacher cannot be booked for two lessons at the same time. The short name and colour are what you see on the calendar cards.',
    rooms: 'Rooms are checked for soft conflicts. Turn off conflict checking for shared spaces such as "outside", where two groups can be at the same place without a problem.',
    subjects: 'Subjects are the blocks you drag onto the calendar. Their defaults — teachers, room, duration — are copied to each placed event, where you can still override them individually.',
  };

  const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

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

  // ─── Teachers ─────────────────────────────────────────────────────────────
  let newTeacherName = $state('');
  let newTeacherShortName = $state('');
  let newTeacherColor = $state('#4299e1');
  let teacherShortManual = $state(false);

  function startAddTeacher(): void {
    addingTeacher = true;
    selectedTeacherId = null;
    newTeacherName = '';
    newTeacherShortName = '';
    teacherShortManual = false;
    newTeacherColor = generateDistinctColor(appState.teachers.map(t => t.color));
  }

  function onNewTeacherNameInput(value: string): void {
    newTeacherName = value;
    if (!teacherShortManual) newTeacherShortName = generateInitials(value);
  }

  function confirmAddTeacher(e?: Event): void {
    e?.preventDefault();
    if (!newTeacherName.trim()) return;
    addTeacher(newTeacherName.trim(), newTeacherShortName || generateInitials(newTeacherName), newTeacherColor);
    addingTeacher = false;
    selectedTeacherId = getState().teachers.at(-1)?.id ?? null;
    newTeacherName = ''; newTeacherShortName = ''; teacherShortManual = false;
  }

  function cancelAddTeacher(): void {
    addingTeacher = false;
    selectedTeacherId = appState.teachers[0]?.id ?? null;
  }

  function deleteTeacher(): void {
    if (!selectedTeacherId || !selectedTeacher) return;
    if (!window.confirm(`Delete "${selectedTeacher.name}"?\nThey will be removed from all events.`)) return;
    const idx = appState.teachers.findIndex(t => t.id === selectedTeacherId);
    removeTeacher(selectedTeacherId);
    const rem = getState().teachers;
    selectedTeacherId = rem[idx]?.id ?? rem.at(-1)?.id ?? null;
  }

  // ─── Rooms ────────────────────────────────────────────────────────────────
  let newRoomName = $state('');
  let newRoomColor = $state('#48bb78');
  let newRoomExclude = $state(false);

  function startAddRoom(): void {
    addingRoom = true;
    selectedRoomId = null;
    newRoomName = '';
    newRoomExclude = false;
    newRoomColor = generateDistinctColor(appState.rooms.map(r => r.color));
  }

  function confirmAddRoom(e?: Event): void {
    e?.preventDefault();
    if (!newRoomName.trim()) return;
    addRoom(newRoomName.trim(), newRoomColor, newRoomExclude);
    addingRoom = false;
    selectedRoomId = getState().rooms.at(-1)?.id ?? null;
    newRoomName = ''; newRoomExclude = false;
  }

  function cancelAddRoom(): void {
    addingRoom = false;
    selectedRoomId = appState.rooms[0]?.id ?? null;
  }

  function deleteRoom(): void {
    if (!selectedRoomId || !selectedRoom) return;
    if (!window.confirm(`Delete "${selectedRoom.name}"?\nEvents will lose their room assignment.`)) return;
    const idx = appState.rooms.findIndex(r => r.id === selectedRoomId);
    removeRoom(selectedRoomId);
    const rem = getState().rooms;
    selectedRoomId = rem[idx]?.id ?? rem.at(-1)?.id ?? null;
  }

  // ─── Subjects ─────────────────────────────────────────────────────────────
  let newSubjectName = $state('');
  let newSubjectColor = $state('#9f7aea');
  let newSubjectDuration = $state(60);
  let newSubjectIsBreak = $state(false);
  let newSubjectIsMultiGroup = $state(false);
  let newSubjectTeacherIds: ID[] = $state([]);
  let newSubjectRoomId: ID | null = $state(null);

  function startAddSubject(): void {
    addingSubject = true;
    selectedSubjectId = null;
    newSubjectName = '';
    newSubjectColor = generateDistinctColor(appState.subjects.map(s => s.color));
    newSubjectDuration = 60;
    newSubjectIsBreak = false;
    newSubjectIsMultiGroup = false;
    newSubjectTeacherIds = [];
    newSubjectRoomId = null;
  }

  function confirmAddSubject(e?: Event): void {
    e?.preventDefault();
    if (!newSubjectName.trim()) return;
    addSubject({
      name: newSubjectName.trim(), color: newSubjectColor,
      defaultTeacherIds: newSubjectTeacherIds,
      defaultRoomId: newSubjectRoomId,
      defaultDurationMinutes: newSubjectDuration,
      isBreak: newSubjectIsBreak,
      isMultiGroup: newSubjectIsMultiGroup,
    });
    addingSubject = false;
    selectedSubjectId = getState().subjects.at(-1)?.id ?? null;
    newSubjectName = '';
  }

  function cancelAddSubject(): void {
    addingSubject = false;
    selectedSubjectId = appState.subjects[0]?.id ?? null;
  }

  function deleteSubject(): void {
    if (!selectedSubjectId || !selectedSubject) return;
    if (!window.confirm(`Delete "${selectedSubject.name}"?\nAll placed events will be removed.`)) return;
    const idx = appState.subjects.findIndex(s => s.id === selectedSubjectId);
    removeSubject(selectedSubjectId);
    const rem = getState().subjects;
    selectedSubjectId = rem[idx]?.id ?? rem.at(-1)?.id ?? null;
  }

  function toggleNewSubjectTeacher(tid: ID): void {
    newSubjectTeacherIds = newSubjectTeacherIds.includes(tid)
      ? newSubjectTeacherIds.filter(id => id !== tid) : [...newSubjectTeacherIds, tid];
  }

  function toggleSubjectTeacher(subjectId: ID, teacherId: ID, currentIds: ID[]): void {
    const next = currentIds.includes(teacherId)
      ? currentIds.filter(id => id !== teacherId) : [...currentIds, teacherId];
    updateSubject(subjectId, { defaultTeacherIds: next });
  }

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
  <div class="modal-box config-panel p-0 flex flex-col overflow-hidden">

    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-base-200 shrink-0">
      <h3 class="text-lg font-bold">Configuration</h3>
      <button class="btn btn-ghost btn-sm btn-circle opacity-40 hover:opacity-100" onclick={onclose}>✕</button>
    </div>

    <!-- Tabs -->
    <div role="tablist" class="tabs tabs-bordered px-5 shrink-0 border-b border-base-200">
      {#each (['groups', 'phases', 'teachers', 'rooms', 'subjects'] as Tab[]) as tab}
        <button role="tab" class="tab font-medium capitalize"
          class:tab-active={activeTab === tab}
          onclick={() => activeTab = tab}>{tab}</button>
      {/each}
    </div>

    <!-- Explanatory copy gets its own band so it never competes with the controls -->
    <div class="intro-band"><p>{TAB_INTRO[activeTab]}</p></div>

    <!-- Content (flex-1, overflow hidden so inner scroll works) -->
    <div class="flex flex-1 min-h-0 overflow-hidden">

      <!-- ════ GROUPS (single column) ════════════════════════════════════════ -->
      {#if activeTab === 'groups'}
        <div class="flex flex-col w-full overflow-hidden">
          <div class="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
            {#if appState.groups.length > 0}
              <div class="border border-base-200 rounded-xl overflow-hidden max-w-2xl">
                <div class="grid grid-cols-[2.5rem_1fr_auto] items-center px-4 py-2 bg-base-200/60 text-[0.7rem] font-semibold uppercase tracking-wider text-base-content/40 border-b border-base-200">
                  <span class="text-center">On</span>
                  <span class="px-2">Label</span>
                  <span></span>
                </div>
                {#each [...appState.groups].sort((a, b) => a.order - b.order) as g (g.id)}
                  <div class="grid grid-cols-[2.5rem_1fr_auto] items-center px-4 py-2.5 border-b border-base-200 last:border-0 hover:bg-base-200/30 transition-colors"
                    class:opacity-40={!g.enabled}>
                    <div class="flex justify-center">
                      <input type="checkbox" class="toggle toggle-primary toggle-sm"
                        checked={g.enabled}
                        onchange={(e) => updateGroup(g.id, { enabled: (e.currentTarget as HTMLInputElement).checked })}
                      />
                    </div>
                    <input class="input input-bordered input-sm mx-2 w-28" type="text" value={g.label}
                      onchange={(e) => updateGroup(g.id, { label: (e.currentTarget as HTMLInputElement).value })}
                    />
                    <button class="btn btn-ghost btn-xs text-error opacity-60 hover:opacity-100 hover:bg-error/15 transition"
                      onclick={() => removeGroup(g.id)} aria-label="Delete group">✕</button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-sm text-base-content/30 text-center py-4">No groups yet. Add one below.</p>
            {/if}
          </div>

          <!-- Add group row -->
          <div class="px-10 pb-6 pt-4 border-t border-base-200 shrink-0">
            <p class="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-2">Add group</p>
            <form class="flex items-center gap-2" onsubmit={submitGroup}>
              <input class="input input-bordered input-sm w-28" type="text" bind:value={newGroupLabel}
                placeholder="G4" aria-label="Group label" />
              <button type="submit" class="btn btn-primary btn-sm">Add group</button>
            </form>
          </div>
        </div>

      <!-- ════ PHASES (single column) ════════════════════════════════════════ -->
      {:else if activeTab === 'phases'}
        <div class="flex flex-col w-full overflow-hidden">
          <div class="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
            {#if appState.phases.length > 0}
              <div class="border border-base-200 rounded-xl overflow-hidden max-w-3xl">
                <div class="grid grid-cols-[1fr_auto_auto_1fr] items-center gap-3 px-4 py-2 bg-base-200/60 text-[0.7rem] font-semibold uppercase tracking-wider text-base-content/40 border-b border-base-200">
                  <span>Label</span>
                  <span>From</span>
                  <span>To</span>
                  <span>Lanes</span>
                </div>
                {#each appState.phases as p (p.id)}
                  <div class="grid grid-cols-[1fr_auto_auto_1fr] items-center gap-3 px-4 py-2.5 border-b border-base-200 last:border-0 hover:bg-base-200/30 transition-colors">
                    <input class="input input-bordered input-sm w-full" type="text" value={p.label}
                      onchange={(e) => updatePhase(p.id, { label: (e.currentTarget as HTMLInputElement).value })}
                    />
                    <select class="select select-bordered select-sm" value={p.startDay}
                      onchange={(e) => setPhaseStart(p.id, Number((e.currentTarget as HTMLSelectElement).value), p.endDay)}>
                      {#each DAY_NAMES as name, i (name)}
                        <option value={i}>{name}</option>
                      {/each}
                    </select>
                    <select class="select select-bordered select-sm" value={p.endDay}
                      onchange={(e) => setPhaseEnd(p.id, Number((e.currentTarget as HTMLSelectElement).value), p.startDay)}>
                      {#each DAY_NAMES as name, i (name)}
                        <option value={i}>{name}</option>
                      {/each}
                    </select>
                    <div class="flex items-center gap-2 flex-wrap">
                      {#each [...appState.groups].sort((a, b) => a.order - b.order) as g (g.id)}
                        <label class="flex items-center gap-1 cursor-pointer text-sm">
                          <input type="checkbox" class="checkbox checkbox-primary checkbox-xs"
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
                      <button class="btn btn-ghost btn-xs text-error opacity-60 hover:opacity-100 hover:bg-error/15 transition ml-auto"
                        onclick={() => removePhase(p.id)} aria-label="Delete phase">✕</button>
                    </div>
                  </div>
                {/each}
              </div>

              {#if phaseWarning}
                <p class="text-sm text-warning max-w-3xl">{phaseWarning}</p>
              {/if}
            {:else}
              <p class="text-sm text-base-content/30 text-center py-4">No phases yet. Add one below.</p>
            {/if}
          </div>

          <!-- Add phase row -->
          <div class="px-10 pb-6 pt-4 border-t border-base-200 shrink-0">
            <p class="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-2">Add phase</p>
            <form class="flex items-center gap-2" onsubmit={submitPhase}>
              <input class="input input-bordered input-sm w-48" type="text" bind:value={newPhaseLabel}
                placeholder="Phase name" aria-label="Phase label" />
              <button type="submit" class="btn btn-primary btn-sm">Add phase</button>
            </form>
          </div>
        </div>

      <!-- ════ TEACHERS (master-detail) ══════════════════════════════════════ -->
      {:else if activeTab === 'teachers'}
        <!-- Left: list -->
        <div class="list-panel">
          <div class="flex-1 overflow-y-auto py-1">
            {#each appState.teachers as t (t.id)}
              <button class="list-item" class:list-item-active={t.id === selectedTeacherId && !addingTeacher}
                onclick={() => { selectedTeacherId = t.id; addingTeacher = false; }}>
                <span class="list-avatar" style="background:{t.color}">
                  {t.shortName || t.name.slice(0, 2).toUpperCase()}
                </span>
                <span class="truncate min-w-0 flex-1 text-sm">{t.name}</span>
              </button>
            {/each}
            {#if appState.teachers.length === 0}
              <p class="text-sm text-base-content/30 text-center px-4 py-6">No teachers yet</p>
            {/if}
          </div>
          <div class="list-add-row">
            <button class="btn btn-sm btn-ghost w-full justify-start gap-2 font-medium"
              class:btn-primary={addingTeacher} class:btn-ghost={!addingTeacher}
              onclick={startAddTeacher}>+ Add teacher</button>
          </div>
        </div>

        <!-- Right: detail -->
        <div class="detail-panel">
          {#if addingTeacher}
            <form class="detail-form" onsubmit={confirmAddTeacher}>
              <div class="detail-header">
                <span class="detail-title">New teacher</span>
              </div>
              <div class="flex items-start gap-5 pt-1">
                <label class="teacher-avatar-lg shrink-0" style="background:{newTeacherColor}" title="Click to pick colour">
                  <span class="teacher-initials-lg">{newTeacherShortName || '?'}</span>
                  <input type="color" bind:value={newTeacherColor} class="sr-only" />
                </label>
                <div class="flex flex-col gap-2.5 flex-1 min-w-0">
                  <div class="form-field">
                    <span class="field-label">Full name</span>
                    <input class="input input-bordered input-sm w-full" type="text" value={newTeacherName}
                      placeholder="e.g. Anna Müller" autofocus
                      oninput={(e) => onNewTeacherNameInput((e.currentTarget as HTMLInputElement).value)}
                    />
                  </div>
                  <div class="form-field">
                    <span class="field-label">Short name <span class="text-base-content/30 font-normal">(shown on cards)</span></span>
                    <input class="input input-bordered input-sm w-28" type="text" bind:value={newTeacherShortName}
                      placeholder="AM"
                      oninput={() => teacherShortManual = true}
                    />
                  </div>
                </div>
              </div>
              <div class="detail-footer">
                <button type="button" class="btn btn-ghost btn-sm" onclick={cancelAddTeacher}>Cancel</button>
                <button type="submit" class="btn btn-primary btn-sm" disabled={!newTeacherName.trim()}>Create teacher</button>
              </div>
            </form>

          {:else if selectedTeacher}
            <div class="detail-form">
              <div class="detail-header">
                <span class="detail-title">{selectedTeacher.name}</span>
                <span class="autosave-pill">✓ Autosaved</span>
              </div>
              <div class="flex items-start gap-5 pt-1">
                <label class="teacher-avatar-lg shrink-0" style="background:{selectedTeacher.color}" title="Click to change colour">
                  <span class="teacher-initials-lg">{selectedTeacher.shortName || selectedTeacher.name.slice(0, 2).toUpperCase()}</span>
                  <input type="color" value={selectedTeacher.color}
                    oninput={(e) => updateTeacher(selectedTeacherId!, { color: (e.currentTarget as HTMLInputElement).value })}
                    class="sr-only"
                  />
                </label>
                <div class="flex flex-col gap-2.5 flex-1 min-w-0">
                  <div class="form-field">
                    <span class="field-label">Full name</span>
                    <input class="input input-bordered input-sm w-full" type="text" value={selectedTeacher.name}
                      onchange={(e) => updateTeacher(selectedTeacherId!, { name: (e.currentTarget as HTMLInputElement).value })}
                    />
                  </div>
                  <div class="form-field">
                    <span class="field-label">Short name <span class="text-base-content/30 font-normal">(shown on cards)</span></span>
                    <input class="input input-bordered input-sm w-28" type="text" value={selectedTeacher.shortName}
                      onchange={(e) => updateTeacher(selectedTeacherId!, { shortName: (e.currentTarget as HTMLInputElement).value })}
                    />
                  </div>
                </div>
              </div>
              <div class="detail-footer">
                <button class="btn btn-ghost btn-sm text-error" onclick={deleteTeacher}>Delete teacher</button>
              </div>
            </div>

          {:else}
            <div class="empty-detail">
              <span class="text-2xl opacity-20">👤</span>
              <span>Select a teacher to edit, or add a new one.</span>
            </div>
          {/if}
        </div>

      <!-- ════ ROOMS (master-detail) ═════════════════════════════════════════ -->
      {:else if activeTab === 'rooms'}
        <!-- Left: list -->
        <div class="list-panel">
          <div class="flex-1 overflow-y-auto py-1">
            {#each appState.rooms as r (r.id)}
              <button class="list-item" class:list-item-active={r.id === selectedRoomId && !addingRoom}
                onclick={() => { selectedRoomId = r.id; addingRoom = false; }}>
                <span class="w-2.5 h-full min-h-[1.5rem] rounded-sm shrink-0 self-stretch" style="background:{r.color}"></span>
                <span class="truncate min-w-0 flex-1 text-sm">{r.name}</span>
                {#if r.excludeFromConflictCheck}
                  <span class="text-[0.65rem] text-base-content/30 shrink-0">no conflicts</span>
                {/if}
              </button>
            {/each}
            {#if appState.rooms.length === 0}
              <p class="text-sm text-base-content/30 text-center px-4 py-6">No rooms yet</p>
            {/if}
          </div>
          <div class="list-add-row">
            <button class="btn btn-sm btn-ghost w-full justify-start gap-2 font-medium"
              class:btn-primary={addingRoom} class:btn-ghost={!addingRoom}
              onclick={startAddRoom}>+ Add room</button>
          </div>
        </div>

        <!-- Right: detail -->
        <div class="detail-panel">
          {#if addingRoom}
            <form class="detail-form" onsubmit={confirmAddRoom}>
              <div class="detail-header">
                <span class="detail-title">New room</span>
              </div>
              <div class="flex flex-col gap-4 pt-1">
                <div class="form-field">
                  <span class="field-label">Room name</span>
                  <div class="flex items-center gap-3 max-w-md">
                    <label class="color-swatch-lg shrink-0" style="background:{newRoomColor}" title="Click to pick colour">
                      <input type="color" bind:value={newRoomColor} class="sr-only" />
                    </label>
                    <input class="input input-bordered input-sm flex-1" type="text" bind:value={newRoomName}
                      placeholder="e.g. Seminarraum 1" autofocus />
                  </div>
                </div>
                <label class="option-row">
                  <span class="option-text">
                    <span class="option-title">Ignore conflicts</span>
                    <span class="option-desc">Two groups may be booked here at the same time without being flagged. Use this for shared spaces such as "outside".</span>
                  </span>
                  <input type="checkbox" class="toggle toggle-warning toggle-sm" bind:checked={newRoomExclude} />
                </label>
              </div>
              <div class="detail-footer">
                <button type="button" class="btn btn-ghost btn-sm" onclick={cancelAddRoom}>Cancel</button>
                <button type="submit" class="btn btn-primary btn-sm" disabled={!newRoomName.trim()}>Create room</button>
              </div>
            </form>

          {:else if selectedRoom}
            <div class="detail-form">
              <div class="detail-header">
                <span class="detail-title">{selectedRoom.name}</span>
                <span class="autosave-pill">✓ Autosaved</span>
              </div>
              <div class="flex flex-col gap-4 pt-1">
                <div class="form-field">
                  <span class="field-label">Room name</span>
                  <div class="flex items-center gap-3 max-w-md">
                    <label class="color-swatch-lg shrink-0" style="background:{selectedRoom.color}" title="Click to change colour">
                      <input type="color" value={selectedRoom.color}
                        oninput={(e) => updateRoom(selectedRoomId!, { color: (e.currentTarget as HTMLInputElement).value })}
                        class="sr-only"
                      />
                    </label>
                    <input class="input input-bordered input-sm flex-1" type="text" value={selectedRoom.name}
                      onchange={(e) => updateRoom(selectedRoomId!, { name: (e.currentTarget as HTMLInputElement).value })}
                    />
                  </div>
                </div>
                <label class="option-row">
                  <span class="option-text">
                    <span class="option-title">Ignore conflicts</span>
                    <span class="option-desc">Two groups may be booked here at the same time without being flagged. Use this for shared spaces such as "outside".</span>
                  </span>
                  <input type="checkbox" class="toggle toggle-warning toggle-sm"
                    checked={selectedRoom.excludeFromConflictCheck}
                    onchange={(e) => updateRoom(selectedRoomId!, { excludeFromConflictCheck: (e.currentTarget as HTMLInputElement).checked })}
                  />
                </label>
              </div>
              <div class="detail-footer">
                <button class="btn btn-ghost btn-sm text-error" onclick={deleteRoom}>Delete room</button>
              </div>
            </div>

          {:else}
            <div class="empty-detail">
              <span class="text-2xl opacity-20">🚪</span>
              <span>Select a room to edit, or add a new one.</span>
            </div>
          {/if}
        </div>

      <!-- ════ SUBJECTS (master-detail) ══════════════════════════════════════ -->
      {:else if activeTab === 'subjects'}
        <!-- Left: list -->
        <div class="list-panel">
          <div class="flex-1 overflow-y-auto py-1">
            {#each appState.subjects as s (s.id)}
              <button class="list-item" class:list-item-active={s.id === selectedSubjectId && !addingSubject}
                onclick={() => { selectedSubjectId = s.id; addingSubject = false; }}>
                <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{s.color}"></span>
                <span class="truncate min-w-0 flex-1 text-sm">{s.name}</span>
                {#if s.isBreak}
                  <span class="text-[0.65rem] text-base-content/30 shrink-0">break</span>
                {/if}
              </button>
            {/each}
            {#if appState.subjects.length === 0}
              <p class="text-sm text-base-content/30 text-center px-4 py-6">No subjects yet</p>
            {/if}
          </div>
          <div class="list-add-row">
            <button class="btn btn-sm btn-ghost w-full justify-start gap-2 font-medium"
              class:btn-primary={addingSubject} class:btn-ghost={!addingSubject}
              onclick={startAddSubject}>+ Add subject</button>
          </div>
        </div>

        <!-- Right: detail -->
        <div class="detail-panel">
          {#if addingSubject}
            <form class="detail-form overflow-y-auto" onsubmit={confirmAddSubject}>
              <div class="detail-header">
                <span class="detail-title">New subject</span>
              </div>
              <div class="flex flex-col gap-5 pt-1">

                <section class="section">
                  <h4 class="section-title">Identity</h4>
                  <div class="form-field">
                    <span class="field-label">Name</span>
                    <div class="flex items-center gap-3 max-w-md">
                      <label class="color-swatch-lg shrink-0" style="background:{newSubjectColor}" title="Pick colour">
                        <input type="color" bind:value={newSubjectColor} class="sr-only" />
                      </label>
                      <input class="input input-bordered input-sm flex-1" type="text" bind:value={newSubjectName}
                        placeholder="e.g. Karteneröffnung" autofocus />
                    </div>
                  </div>
                </section>

                <section class="section">
                  <h4 class="section-title">Duration</h4>
                  <div class="flex items-center gap-2 flex-wrap">
                    {#each DURATION_PRESETS as preset}
                      <button type="button" class="preset-chip" class:preset-chip-on={newSubjectDuration === preset}
                        onclick={() => newSubjectDuration = preset}>
                        {preset < 60 ? `${preset} min` : `${preset / 60} h`}
                      </button>
                    {/each}
                    <div class="flex items-center gap-1.5 ml-2">
                      <input class="input input-bordered input-sm w-20 text-right" type="number"
                        bind:value={newSubjectDuration} min="15" step="15" />
                      <span class="text-sm text-base-content/50">min</span>
                    </div>
                  </div>
                </section>

                <section class="section">
                  <h4 class="section-title">Behaviour</h4>
                  <label class="option-row">
                    <span class="option-text">
                      <span class="option-title">Break</span>
                      <span class="option-desc">Shown as a break rather than a lesson, and never counted as a teacher or room conflict.</span>
                    </span>
                    <input type="checkbox" class="toggle toggle-primary toggle-sm" bind:checked={newSubjectIsBreak} />
                  </label>
                  <label class="option-row">
                    <span class="option-text">
                      <span class="option-title">All groups at once</span>
                      <span class="option-desc">Placing this schedules it for every active group simultaneously, instead of one group at a time.</span>
                    </span>
                    <input type="checkbox" class="toggle toggle-secondary toggle-sm" bind:checked={newSubjectIsMultiGroup} />
                  </label>
                </section>

                <section class="section">
                  <h4 class="section-title">Defaults</h4>

                  {#if appState.teachers.length > 0}
                    <div class="form-field">
                      <div class="flex items-center gap-2">
                        <span class="field-label">Default teachers</span>
                        <span class="count-pill" class:count-pill-empty={newSubjectTeacherIds.length === 0}>
                          {newSubjectTeacherIds.length} of {appState.teachers.length} selected
                        </span>
                      </div>
                      <p class="field-hint">Click a teacher to select them. Nothing is selected until you do.</p>
                      <div class="picker-grid">
                        {#each appState.teachers as t (t.id)}
                          {@const selected = newSubjectTeacherIds.includes(t.id)}
                          <button type="button" class="picker-chip" class:picker-chip-on={selected}
                            style={selected ? `--tc:${t.color}` : ''}
                            aria-pressed={selected}
                            onclick={() => toggleNewSubjectTeacher(t.id)}>
                            <span class="picker-box">{selected ? '✓' : ''}</span>
                            <span class="teacher-dot" style="background:{t.color}"></span>
                            <span class="truncate">{t.name}</span>
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if appState.rooms.length > 0}
                    <div class="form-field">
                      <span class="field-label">Default room</span>
                      <select class="select select-bordered select-sm w-56"
                        onchange={(e) => {
                          const v = (e.currentTarget as HTMLSelectElement).value;
                          newSubjectRoomId = v === '' ? null : v;
                        }}>
                        <option value="">No default</option>
                        {#each appState.rooms as r (r.id)}
                          <option value={r.id} selected={newSubjectRoomId === r.id}>{r.name}</option>
                        {/each}
                      </select>
                    </div>
                  {/if}
                </section>
              </div>

              <div class="detail-footer">
                <button type="button" class="btn btn-ghost btn-sm" onclick={cancelAddSubject}>Cancel</button>
                <button type="submit" class="btn btn-primary btn-sm" disabled={!newSubjectName.trim()}>Create subject</button>
              </div>
            </form>

          {:else if selectedSubject}
            <div class="detail-form overflow-y-auto">
              <div class="detail-header">
                <span class="detail-title">{selectedSubject.name}</span>
                <span class="autosave-pill">✓ Autosaved</span>
              </div>
              <div class="flex flex-col gap-5 pt-1">

                <section class="section">
                  <h4 class="section-title">Identity</h4>
                  <div class="form-field">
                    <span class="field-label">Name</span>
                    <div class="flex items-center gap-3 max-w-md">
                      <label class="color-swatch-lg shrink-0" style="background:{selectedSubject.color}" title="Click to change colour">
                        <input type="color" value={selectedSubject.color}
                          oninput={(e) => updateSubject(selectedSubjectId!, { color: (e.currentTarget as HTMLInputElement).value })}
                          class="sr-only"
                        />
                      </label>
                      <input class="input input-bordered input-sm flex-1" type="text" value={selectedSubject.name}
                        onchange={(e) => updateSubject(selectedSubjectId!, { name: (e.currentTarget as HTMLInputElement).value })}
                      />
                    </div>
                  </div>
                </section>

                <section class="section">
                  <h4 class="section-title">Duration</h4>
                  <div class="flex items-center gap-2 flex-wrap">
                    {#each DURATION_PRESETS as preset}
                      <button type="button" class="preset-chip"
                        class:preset-chip-on={selectedSubject.defaultDurationMinutes === preset}
                        onclick={() => updateSubject(selectedSubjectId!, { defaultDurationMinutes: preset })}>
                        {preset < 60 ? `${preset} min` : `${preset / 60} h`}
                      </button>
                    {/each}
                    <div class="flex items-center gap-1.5 ml-2">
                      <input class="input input-bordered input-sm w-20 text-right" type="number"
                        value={selectedSubject.defaultDurationMinutes} min="15" step="15"
                        onchange={(e) => updateSubject(selectedSubjectId!, { defaultDurationMinutes: Number((e.currentTarget as HTMLInputElement).value) })}
                      />
                      <span class="text-sm text-base-content/50">min</span>
                    </div>
                  </div>
                </section>

                <section class="section">
                  <h4 class="section-title">Behaviour</h4>
                  <label class="option-row">
                    <span class="option-text">
                      <span class="option-title">Break</span>
                      <span class="option-desc">Shown as a break rather than a lesson, and never counted as a teacher or room conflict.</span>
                    </span>
                    <input type="checkbox" class="toggle toggle-primary toggle-sm"
                      checked={selectedSubject.isBreak}
                      onchange={(e) => updateSubject(selectedSubjectId!, { isBreak: (e.currentTarget as HTMLInputElement).checked })}
                    />
                  </label>
                  <label class="option-row">
                    <span class="option-text">
                      <span class="option-title">All groups at once</span>
                      <span class="option-desc">Placing this schedules it for every active group simultaneously, instead of one group at a time.</span>
                    </span>
                    <input type="checkbox" class="toggle toggle-secondary toggle-sm"
                      checked={selectedSubject.isMultiGroup ?? false}
                      onchange={(e) => updateSubject(selectedSubjectId!, { isMultiGroup: (e.currentTarget as HTMLInputElement).checked })}
                    />
                  </label>
                </section>

                <section class="section">
                  <h4 class="section-title">Defaults</h4>

                  {#if appState.teachers.length > 0}
                    <div class="form-field">
                      <div class="flex items-center gap-2">
                        <span class="field-label">Default teachers</span>
                        <span class="count-pill" class:count-pill-empty={selectedSubject.defaultTeacherIds.length === 0}>
                          {selectedSubject.defaultTeacherIds.length} of {appState.teachers.length} selected
                        </span>
                      </div>
                      <p class="field-hint">Click a teacher to select them. Nothing is selected until you do.</p>
                      <div class="picker-grid">
                        {#each appState.teachers as t (t.id)}
                          {@const selected = selectedSubject.defaultTeacherIds.includes(t.id)}
                          <button type="button" class="picker-chip" class:picker-chip-on={selected}
                            style={selected ? `--tc:${t.color}` : ''}
                            aria-pressed={selected}
                            onclick={() => toggleSubjectTeacher(selectedSubjectId!, t.id, selectedSubject.defaultTeacherIds)}>
                            <span class="picker-box">{selected ? '✓' : ''}</span>
                            <span class="teacher-dot" style="background:{t.color}"></span>
                            <span class="truncate">{t.name}</span>
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if appState.rooms.length > 0}
                    <div class="form-field">
                      <span class="field-label">Default room</span>
                      <select class="select select-bordered select-sm w-56"
                        value={selectedSubject.defaultRoomId ?? ''}
                        onchange={(e) => {
                          const v = (e.currentTarget as HTMLSelectElement).value;
                          updateSubject(selectedSubjectId!, { defaultRoomId: v === '' ? null : v });
                        }}>
                        <option value="">No default</option>
                        {#each appState.rooms as r (r.id)}
                          <option value={r.id}>{r.name}</option>
                        {/each}
                      </select>
                    </div>
                  {/if}
                </section>
              </div>

              <div class="detail-footer">
                <button class="btn btn-ghost btn-sm text-error" onclick={deleteSubject}>Delete subject</button>
              </div>
            </div>

          {:else}
            <div class="empty-detail">
              <span class="text-2xl opacity-20">📚</span>
              <span>Select a subject to edit, or add a new one.</span>
            </div>
          {/if}
        </div>
      {/if}

    </div>

    <!-- Footer: danger zone -->
    <div class="shrink-0 border-t border-base-200 px-5 py-3 flex items-center gap-3">
      <button class="btn btn-ghost btn-xs text-error" onclick={handleClearAll}>⚠ Reset all data</button>
      <span class="text-xs text-base-content/25">Removes all events, groups, teachers, rooms, and subjects</span>
    </div>

  </div>
</dialog>

<style>
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }

  .config-panel {
    width: min(1000px, 92vw);
    max-width: none;
    /* Grow to fit the tab, but never past the viewport — short tabs (Rooms)
       shouldn't leave a tall empty region below the form. */
    height: auto;
    min-height: 480px;
    max-height: 86vh;
  }

  .intro-band {
    flex-shrink: 0;
    padding: 0.6rem 1.25rem;
    background: var(--wk-surface-alt);
    border-bottom: 1px solid var(--wk-line);
  }

  .intro-band p {
    margin: 0;
    max-width: 82ch;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--wk-text-mute);
  }

  /* ── Shared list panel ───────────────────────────────────────────────────── */
  .list-panel {
    width: 230px;
    flex-shrink: 0;
    border-right: 1px solid var(--wk-line);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .list-add-row {
    padding: 0.5rem;
    border-top: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-left: 3px solid transparent;
    cursor: pointer;
    transition: background 0.1s;
    min-width: 0;
  }

  .list-item:hover { background: var(--wk-surface-alt); }

  .list-item-active {
    background: color-mix(in oklab, var(--color-primary) 8%, transparent);
    border-left-color: var(--color-primary);
  }

  .list-item-active :global(span:last-child) { font-weight: 600; }

  /* ── Detail panel ────────────────────────────────────────────────────────── */
  .detail-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-form {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.1rem 1.5rem 1.25rem;
    height: 100%;
    overflow-y: auto;
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .detail-title {
    font-size: 1rem;
    font-weight: 700;
  }

  .autosave-pill {
    font-size: 0.7rem;
    color: var(--color-success);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .detail-footer {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid var(--wk-line);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .empty-detail {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
    color: color-mix(in oklab, var(--color-base-content) 30%, transparent);
    font-size: 0.85rem;
    padding: 2rem;
    text-align: center;
  }

  /* ── Form fields ─────────────────────────────────────────────────────────── */
  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: color-mix(in oklab, var(--color-base-content) 50%, transparent);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ── Teacher avatar (large, in detail panel) ─────────────────────────────── */
  .teacher-avatar-lg {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: 2.5px solid rgba(255,255,255,0.3);
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    transition: transform 0.15s, box-shadow 0.15s;
    flex-shrink: 0;
  }
  .teacher-avatar-lg:hover {
    transform: scale(1.06);
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  }
  .teacher-initials-lg {
    font-size: 1.1rem;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 3px rgba(0,0,0,0.3);
    pointer-events: none;
    letter-spacing: 0.02em;
  }

  /* ── List avatar (small circle in list item) ─────────────────────────────── */
  .list-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6rem;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.25);
    flex-shrink: 0;
    border: 1.5px solid rgba(255,255,255,0.2);
  }

  /* ── Color swatch (clickable color picker in detail panel) ───────────────── */
  .color-swatch-lg {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    cursor: pointer;
    border: 1.5px solid rgba(0,0,0,0.15);
    flex-shrink: 0;
    transition: transform 0.15s;
  }
  .color-swatch-lg:hover { transform: scale(1.08); }

  /* ── Sections ────────────────────────────────────────────────────────────── */
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--wk-text-faint);
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--wk-line);
  }

  /* ── Full-width option rows (replaces inline checkbox clusters) ──────────── */
  .option-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--wk-line);
    border-radius: 0.6rem;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }
  .option-row:hover {
    background: var(--wk-surface-alt);
    border-color: var(--wk-line-strong);
  }

  .option-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .option-title {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .option-desc {
    font-size: 0.75rem;
    line-height: 1.45;
    color: var(--wk-text-faint);
    max-width: 58ch;
  }

  /* ── Duration presets ────────────────────────────────────────────────────── */
  .preset-chip {
    padding: 0.3rem 0.7rem;
    border-radius: 0.45rem;
    border: 1px solid var(--wk-line);
    background: transparent;
    color: var(--wk-text-mute);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
  }
  .preset-chip:hover {
    border-color: var(--wk-line-strong);
    background: var(--wk-surface-alt);
  }
  .preset-chip-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
    font-weight: 700;
  }

  /* ── Teacher picker ──────────────────────────────────────────────────────── */
  .field-hint {
    font-size: 0.72rem;
    color: var(--wk-text-faint);
  }

  .count-pill {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
  }
  .count-pill-empty {
    background: color-mix(in oklab, var(--color-base-content) 8%, transparent);
    color: var(--wk-text-faint);
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 0.5rem;
    max-width: 46rem;
  }

  .picker-chip {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.5rem 0.7rem;
    border-radius: 0.5rem;
    border: 1px solid var(--wk-line);
    background: transparent;
    color: var(--wk-text-mute);
    font-size: 0.82rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.12s;
    min-width: 0;
  }
  .picker-chip:hover {
    border-color: var(--wk-line-strong);
    background: var(--wk-surface-alt);
    color: var(--wk-text);
  }
  .picker-chip-on {
    border-color: var(--tc);
    background: color-mix(in srgb, var(--tc) 12%, transparent);
    color: var(--wk-text);
    font-weight: 600;
  }

  /* An explicit empty square, so an unselected teacher reads as "not yet chosen"
     rather than as a chip that happens to be styled quietly. */
  .picker-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1.5px solid var(--wk-line-strong);
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 1;
    color: white;
    flex-shrink: 0;
  }
  .picker-chip-on .picker-box {
    background: var(--tc);
    border-color: var(--tc);
  }

  .teacher-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
