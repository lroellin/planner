<script lang="ts">
  import { nanoid } from 'nanoid';
  import {
    getState,
    addTeacher, updateTeacher, removeTeacher,
    addRoom, updateRoom, removeRoom,
    addSubject, updateSubject, removeSubject,
    addGroup, updateGroup, removeGroup,
  } from '../state/store.svelte';
  import type { ID } from '../types';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  type Tab = 'groups' | 'teachers' | 'rooms' | 'subjects';
  let activeTab = $state<Tab>('groups');

  const state = $derived(getState());

  // ─── Groups ──────────────────────────────────────────────────────────────────
  let newGroupLabel = $state('');

  function addNewGroup(): void {
    const label = newGroupLabel.trim();
    if (!label) return;
    addGroup(label);
    newGroupLabel = '';
  }

  // ─── Teachers ────────────────────────────────────────────────────────────────
  let newTeacherName = $state('');
  let newTeacherColor = $state('#4299e1');

  function addNewTeacher(): void {
    const name = newTeacherName.trim();
    if (!name) return;
    addTeacher(name, newTeacherColor);
    newTeacherName = '';
    newTeacherColor = '#4299e1';
  }

  // ─── Rooms ───────────────────────────────────────────────────────────────────
  let newRoomName = $state('');
  let newRoomColor = $state('#48bb78');
  let newRoomExclude = $state(false);

  function addNewRoom(): void {
    const name = newRoomName.trim();
    if (!name) return;
    addRoom(name, newRoomColor, newRoomExclude);
    newRoomName = '';
    newRoomColor = '#48bb78';
    newRoomExclude = false;
  }

  // ─── Subjects ────────────────────────────────────────────────────────────────
  let newSubjectName = $state('');
  let newSubjectColor = $state('#9f7aea');
  let newSubjectDuration = $state(60);
  let newSubjectIsBreak = $state(false);
  let newSubjectTeacherIds = $state<ID[]>([]);
  let newSubjectRoomId = $state<ID | null>(null);

  function addNewSubject(): void {
    const name = newSubjectName.trim();
    if (!name) return;
    addSubject({
      name,
      color: newSubjectColor,
      defaultTeacherIds: newSubjectTeacherIds,
      defaultRoomId: newSubjectRoomId,
      defaultDurationMinutes: newSubjectDuration,
      isBreak: newSubjectIsBreak,
    });
    newSubjectName = '';
    newSubjectColor = '#9f7aea';
    newSubjectDuration = 60;
    newSubjectIsBreak = false;
    newSubjectTeacherIds = [];
    newSubjectRoomId = null;
  }

  function toggleNewSubjectTeacher(tid: ID): void {
    newSubjectTeacherIds = newSubjectTeacherIds.includes(tid)
      ? newSubjectTeacherIds.filter(id => id !== tid)
      : [...newSubjectTeacherIds, tid];
  }

  let dialogEl: HTMLDialogElement;
  $effect(() => {
    if (dialogEl) dialogEl.showModal();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} onclose={onclose} onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}>
  <article class="config-article">
    <header>
      <h4 style="margin:0">Configuration</h4>
    </header>

    <nav class="tab-nav">
      {#each (['groups', 'teachers', 'rooms', 'subjects'] as Tab[]) as tab}
        <button
          class:active={activeTab === tab}
          onclick={() => activeTab = tab}
        >{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
      {/each}
    </nav>

    <div class="tab-content">
      {#if activeTab === 'groups'}
        <table class="config-table">
          <thead><tr><th>Label</th><th>Enabled</th><th></th></tr></thead>
          <tbody>
            {#each [...state.groups].sort((a, b) => a.label.localeCompare(b.label)) as group (group.id)}
              <tr class:disabled={!group.enabled}>
                <td>
                  <input
                    type="text"
                    value={group.label}
                    onchange={(e) => updateGroup(group.id, { label: (e.currentTarget as HTMLInputElement).value })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={group.enabled}
                    onchange={(e) => updateGroup(group.id, { enabled: (e.currentTarget as HTMLInputElement).checked })}
                  />
                </td>
                <td>
                  <button class="danger-sm" onclick={() => removeGroup(group.id)}>✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="add-row">
          <input type="text" placeholder="G4" bind:value={newGroupLabel} />
          <button onclick={addNewGroup}>Add group</button>
        </div>

      {:else if activeTab === 'teachers'}
        <table class="config-table">
          <thead><tr><th>Name</th><th>Color</th><th></th></tr></thead>
          <tbody>
            {#each state.teachers as teacher (teacher.id)}
              <tr>
                <td>
                  <input
                    type="text"
                    value={teacher.name}
                    onchange={(e) => updateTeacher(teacher.id, { name: (e.currentTarget as HTMLInputElement).value })}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    value={teacher.color}
                    oninput={(e) => updateTeacher(teacher.id, { color: (e.currentTarget as HTMLInputElement).value })}
                  />
                </td>
                <td>
                  <button class="danger-sm" onclick={() => removeTeacher(teacher.id)}>✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="add-row">
          <input type="text" placeholder="Teacher name" bind:value={newTeacherName} />
          <input type="color" bind:value={newTeacherColor} />
          <button onclick={addNewTeacher}>Add teacher</button>
        </div>

      {:else if activeTab === 'rooms'}
        <table class="config-table">
          <thead><tr><th>Name</th><th>Color</th><th>Excl. conflicts</th><th></th></tr></thead>
          <tbody>
            {#each state.rooms as room (room.id)}
              <tr>
                <td>
                  <input
                    type="text"
                    value={room.name}
                    onchange={(e) => updateRoom(room.id, { name: (e.currentTarget as HTMLInputElement).value })}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    value={room.color}
                    oninput={(e) => updateRoom(room.id, { color: (e.currentTarget as HTMLInputElement).value })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={room.excludeFromConflictCheck}
                    onchange={(e) => updateRoom(room.id, { excludeFromConflictCheck: (e.currentTarget as HTMLInputElement).checked })}
                  />
                </td>
                <td>
                  <button class="danger-sm" onclick={() => removeRoom(room.id)}>✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="add-row">
          <input type="text" placeholder="Room name" bind:value={newRoomName} />
          <input type="color" bind:value={newRoomColor} />
          <label class="inline-check"><input type="checkbox" bind:checked={newRoomExclude} /> Excl.</label>
          <button onclick={addNewRoom}>Add room</button>
        </div>

      {:else if activeTab === 'subjects'}
        <table class="config-table">
          <thead><tr><th>Name</th><th>Color</th><th>Duration</th><th>Break?</th><th></th></tr></thead>
          <tbody>
            {#each state.subjects as subject (subject.id)}
              <tr>
                <td>
                  <input
                    type="text"
                    value={subject.name}
                    onchange={(e) => updateSubject(subject.id, { name: (e.currentTarget as HTMLInputElement).value })}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    value={subject.color}
                    oninput={(e) => updateSubject(subject.id, { color: (e.currentTarget as HTMLInputElement).value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={subject.defaultDurationMinutes}
                    min="15"
                    step="15"
                    style="width:70px"
                    onchange={(e) => updateSubject(subject.id, { defaultDurationMinutes: Number((e.currentTarget as HTMLInputElement).value) })}
                  />min
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={subject.isBreak}
                    onchange={(e) => updateSubject(subject.id, { isBreak: (e.currentTarget as HTMLInputElement).checked })}
                  />
                </td>
                <td>
                  <button class="danger-sm" onclick={() => removeSubject(subject.id)}>✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="add-row">
          <input type="text" placeholder="Subject name" bind:value={newSubjectName} />
          <input type="color" bind:value={newSubjectColor} />
          <input type="number" bind:value={newSubjectDuration} min="15" step="15" style="width:70px" />min
          <label class="inline-check"><input type="checkbox" bind:checked={newSubjectIsBreak} /> Break</label>
          <button onclick={addNewSubject}>Add</button>
        </div>
      {/if}
    </div>

    <footer>
      <button onclick={onclose}>Close</button>
    </footer>
  </article>
</dialog>

<style>
  dialog {
    max-width: 640px;
    width: 95vw;
    border-radius: 8px;
    border: none;
    padding: 0;
  }

  dialog::backdrop {
    background: rgba(0,0,0,0.4);
  }

  .config-article {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 80vh;
  }

  header {
    border-bottom: 1px solid var(--pico-muted-border-color, #e0e0e0);
    padding-bottom: 0.75rem;
  }

  .tab-nav {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--pico-muted-border-color, #e0e0e0);
    padding-bottom: 0;
  }

  .tab-nav button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.3rem 0.75rem;
    cursor: pointer;
    font-size: 0.85rem;
    color: inherit;
    opacity: 0.6;
    margin-bottom: -1px;
  }

  .tab-nav button.active {
    border-bottom-color: #3182ce;
    opacity: 1;
    font-weight: 600;
    color: #3182ce;
  }

  .tab-content {
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .config-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .config-table th {
    text-align: left;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    opacity: 0.6;
    border-bottom: 1px solid var(--pico-muted-border-color, #e0e0e0);
  }

  .config-table td {
    padding: 0.25rem 0.5rem;
    vertical-align: middle;
  }

  .config-table tr.disabled {
    opacity: 0.4;
  }

  .config-table input[type="text"],
  .config-table input[type="number"] {
    font-size: 0.85rem;
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--pico-muted-border-color, #ccc);
    border-radius: 4px;
    width: 100%;
  }

  .add-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.5rem;
    background: rgba(0,0,0,0.02);
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .add-row input[type="text"],
  .add-row input[type="number"] {
    flex: 1;
    min-width: 100px;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--pico-muted-border-color, #ccc);
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .inline-check {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.82rem;
    cursor: pointer;
  }

  button {
    font-size: 0.82rem;
    padding: 0.3rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid transparent;
    background: #3182ce;
    color: white;
  }

  button.danger-sm {
    background: transparent;
    color: #e53e3e;
    border-color: #e53e3e;
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
  }

  footer {
    border-top: 1px solid var(--pico-muted-border-color, #e0e0e0);
    padding-top: 0.75rem;
    display: flex;
    justify-content: flex-end;
  }
</style>
