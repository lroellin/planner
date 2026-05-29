<script lang="ts">
  import {
    getState,
    addTeacher, updateTeacher, removeTeacher,
    addRoom, updateRoom, removeRoom,
    addSubject, updateSubject, removeSubject,
    addGroup, updateGroup, removeGroup,
  } from '../state/store.svelte';
  import { generateDistinctColor, generateInitials } from '../utils/colorUtils';
  import type { ID } from '../types';

  interface Props { onclose: () => void; }
  let { onclose }: Props = $props();

  type Tab = 'groups' | 'teachers' | 'rooms' | 'subjects';
  let activeTab: Tab = $state('groups');
  const state = $derived(getState());

  // ─── Next group label ─────────────────────────────────────────────────────────
  function nextGroupLabel(): string {
    const labels = state.groups.map(g => g.label);
    let i = 1;
    while (labels.includes(`G${i}`)) i++;
    return `G${i}`;
  }

  // ─── Groups ───────────────────────────────────────────────────────────────────
  let newGroupLabel = $state('');
  $effect(() => { if (activeTab === 'groups') newGroupLabel = nextGroupLabel(); });

  function submitGroup(e?: Event): void {
    e?.preventDefault();
    const label = newGroupLabel.trim();
    if (!label) return;
    addGroup(label);
    newGroupLabel = nextGroupLabel();
  }

  // ─── Teachers ─────────────────────────────────────────────────────────────────
  let newTeacherName = $state('');
  let newTeacherShortName = $state('');
  let newTeacherColor = $state('#4299e1');
  let shortNameManuallyEdited = $state(false);

  $effect(() => {
    if (activeTab === 'teachers')
      newTeacherColor = generateDistinctColor(state.teachers.map(t => t.color));
  });

  function onTeacherNameInput(name: string): void {
    newTeacherName = name;
    if (!shortNameManuallyEdited) newTeacherShortName = generateInitials(name);
  }

  function submitTeacher(e?: Event): void {
    e?.preventDefault();
    const name = newTeacherName.trim();
    if (!name) return;
    addTeacher(name, newTeacherShortName || generateInitials(name), newTeacherColor);
    newTeacherName = '';
    newTeacherShortName = '';
    shortNameManuallyEdited = false;
    newTeacherColor = generateDistinctColor(getState().teachers.map(t => t.color));
  }

  // ─── Rooms ────────────────────────────────────────────────────────────────────
  let newRoomName = $state('');
  let newRoomColor = $state('#48bb78');
  let newRoomExclude = $state(false);

  $effect(() => {
    if (activeTab === 'rooms')
      newRoomColor = generateDistinctColor(state.rooms.map(r => r.color));
  });

  function submitRoom(e?: Event): void {
    e?.preventDefault();
    const name = newRoomName.trim();
    if (!name) return;
    addRoom(name, newRoomColor, newRoomExclude);
    newRoomName = '';
    newRoomColor = generateDistinctColor(getState().rooms.map(r => r.color));
    newRoomExclude = false;
  }

  // ─── Subjects ─────────────────────────────────────────────────────────────────
  let newSubjectName = $state('');
  let newSubjectColor = $state('#9f7aea');
  let newSubjectDuration = $state(60);
  let newSubjectIsBreak = $state(false);
  let newSubjectTeacherIds: ID[] = $state([]);
  let newSubjectRoomId: ID | null = $state(null);
  // Track which existing subject rows are expanded to show teacher/room editor
  let expandedSubjectIds: Set<ID> = $state(new Set());

  $effect(() => {
    if (activeTab === 'subjects')
      newSubjectColor = generateDistinctColor(state.subjects.map(s => s.color));
  });

  function submitSubject(e?: Event): void {
    e?.preventDefault();
    const name = newSubjectName.trim();
    if (!name) return;
    addSubject({
      name, color: newSubjectColor,
      defaultTeacherIds: newSubjectTeacherIds,
      defaultRoomId: newSubjectRoomId,
      defaultDurationMinutes: newSubjectDuration,
      isBreak: newSubjectIsBreak,
    });
    newSubjectName = '';
    newSubjectColor = generateDistinctColor(getState().subjects.map(s => s.color));
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
  $effect(() => { if (dialogEl) dialogEl.showModal(); });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} onclose={onclose} onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}>
  <div class="panel">

    <div class="panel-header">
      <h4>Configuration</h4>
      <button class="close-btn" onclick={onclose} aria-label="Close">✕</button>
    </div>

    <nav class="tabs">
      {#each (['groups','teachers','rooms','subjects'] as Tab[]) as tab}
        <button class:active={activeTab === tab} onclick={() => activeTab = tab}>
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      {/each}
    </nav>

    <div class="body">

      <!-- ════ GROUPS ════════════════════════════════════════ -->
      {#if activeTab === 'groups'}

        {#if state.groups.length > 0}
          <section>
            <h5 class="section-title">Groups ({state.groups.length})</h5>
            <div class="group-list-header">
              <span class="col-active">Active</span>
              <span class="col-label">Label</span>
            </div>
            <ul class="item-list">
              {#each [...state.groups].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) as g (g.id)}
                <li class="row" class:row-muted={!g.enabled}>
                  <label class="toggle" title={g.enabled ? 'Shown on calendar — click to hide' : 'Hidden from calendar — click to show'}>
                    <input type="checkbox" checked={g.enabled}
                      onchange={(e) => updateGroup(g.id, { enabled: (e.currentTarget as HTMLInputElement).checked })}
                    />
                    <span class="toggle-track"></span>
                  </label>
                  <input class="field-input" type="text" value={g.label}
                    onchange={(e) => updateGroup(g.id, { label: (e.currentTarget as HTMLInputElement).value })}
                  />
                  <button class="btn-danger" onclick={() => removeGroup(g.id)} aria-label="Delete">✕</button>
                </li>
              {/each}
            </ul>
          </section>
          <hr class="divider" />
        {/if}

        <section>
          <h5 class="section-title">Add group</h5>
          <form class="add-form" onsubmit={submitGroup}>
            <input class="field-input field-short" type="text" bind:value={newGroupLabel}
              placeholder="G4" aria-label="Group label" />
            <button type="submit" class="btn-primary">Add group</button>
          </form>
        </section>

      <!-- ════ TEACHERS ════════════════════════════════════ -->
      {:else if activeTab === 'teachers'}

        {#if state.teachers.length > 0}
          <section>
            <h5 class="section-title">Teachers ({state.teachers.length})</h5>
            <ul class="item-list">
              {#each state.teachers as t (t.id)}
                <li class="row">
                  <label class="swatch" style="background:{t.color}" title="Change color">
                    <input type="color" value={t.color}
                      oninput={(e) => updateTeacher(t.id, { color: (e.currentTarget as HTMLInputElement).value })}
                      class="hidden-input"
                    />
                  </label>
                  <input class="field-input" type="text" value={t.name}
                    onchange={(e) => updateTeacher(t.id, { name: (e.currentTarget as HTMLInputElement).value })}
                    placeholder="Full name"
                  />
                  <input class="field-input field-short" type="text" value={t.shortName}
                    onchange={(e) => updateTeacher(t.id, { shortName: (e.currentTarget as HTMLInputElement).value })}
                    placeholder="Initials"
                    title="Short name shown on calendar"
                  />
                  <button class="btn-danger" onclick={() => removeTeacher(t.id)} aria-label="Delete">✕</button>
                </li>
              {/each}
            </ul>
          </section>
          <hr class="divider" />
        {/if}

        <section>
          <h5 class="section-title">Add teacher</h5>
          <form class="add-form add-form-col" onsubmit={submitTeacher}>
            <div class="add-row">
              <label class="swatch" style="background:{newTeacherColor}" title="Pick color">
                <input type="color" bind:value={newTeacherColor} class="hidden-input" />
              </label>
              <input class="field-input" type="text" value={newTeacherName}
                oninput={(e) => onTeacherNameInput((e.currentTarget as HTMLInputElement).value)}
                placeholder="Full name" aria-label="Name"
              />
              <input class="field-input field-short" type="text" bind:value={newTeacherShortName}
                oninput={() => shortNameManuallyEdited = true}
                placeholder="Initials" title="Short name (auto-generated from name)"
              />
            </div>
            <div class="add-actions">
              <button type="submit" class="btn-primary">Add teacher</button>
            </div>
          </form>
        </section>

      <!-- ════ ROOMS ══════════════════════════════════════ -->
      {:else if activeTab === 'rooms'}

        {#if state.rooms.length > 0}
          <section>
            <h5 class="section-title">Rooms ({state.rooms.length})</h5>
            <ul class="item-list">
              {#each state.rooms as r (r.id)}
                <li class="row">
                  <label class="swatch" style="background:{r.color}" title="Change color">
                    <input type="color" value={r.color}
                      oninput={(e) => updateRoom(r.id, { color: (e.currentTarget as HTMLInputElement).value })}
                      class="hidden-input"
                    />
                  </label>
                  <input class="field-input" type="text" value={r.name}
                    onchange={(e) => updateRoom(r.id, { name: (e.currentTarget as HTMLInputElement).value })}
                    placeholder="Name"
                  />
                  <label class="check-inline" title="Skip conflict detection for this room">
                    <input type="checkbox" checked={r.excludeFromConflictCheck}
                      onchange={(e) => updateRoom(r.id, { excludeFromConflictCheck: (e.currentTarget as HTMLInputElement).checked })}
                    />
                    No conflict
                  </label>
                  <button class="btn-danger" onclick={() => removeRoom(r.id)} aria-label="Delete">✕</button>
                </li>
              {/each}
            </ul>
          </section>
          <hr class="divider" />
        {/if}

        <section>
          <h5 class="section-title">Add room</h5>
          <form class="add-form" onsubmit={submitRoom}>
            <label class="swatch" style="background:{newRoomColor}" title="Pick color">
              <input type="color" bind:value={newRoomColor} class="hidden-input" />
            </label>
            <input class="field-input" type="text" bind:value={newRoomName}
              placeholder="Name" aria-label="Room name"
            />
            <label class="check-inline">
              <input type="checkbox" bind:checked={newRoomExclude} />
              No conflict
            </label>
            <button type="submit" class="btn-primary">Add room</button>
          </form>
        </section>

      <!-- ════ SUBJECTS ════════════════════════════════════ -->
      {:else if activeTab === 'subjects'}

        {#if state.subjects.length > 0}
          <section>
            <h5 class="section-title">Subjects ({state.subjects.length})</h5>
            <ul class="item-list">
              {#each state.subjects as s (s.id)}
                {@const expanded = expandedSubjectIds.has(s.id)}
                <li class="subject-item">
                  <div class="row">
                    <label class="swatch" style="background:{s.color}" title="Change color">
                      <input type="color" value={s.color}
                        oninput={(e) => updateSubject(s.id, { color: (e.currentTarget as HTMLInputElement).value })}
                        class="hidden-input"
                      />
                    </label>
                    <input class="field-input" type="text" value={s.name}
                      onchange={(e) => updateSubject(s.id, { name: (e.currentTarget as HTMLInputElement).value })}
                      placeholder="Name"
                    />
                    <input class="field-input field-num" type="number" value={s.defaultDurationMinutes}
                      min="15" step="15"
                      onchange={(e) => updateSubject(s.id, { defaultDurationMinutes: Number((e.currentTarget as HTMLInputElement).value) })}
                      title="Duration (minutes)"
                    />
                    <span class="unit">min</span>
                    <label class="check-inline" title="Mark as a break">
                      <input type="checkbox" checked={s.isBreak}
                        onchange={(e) => updateSubject(s.id, { isBreak: (e.currentTarget as HTMLInputElement).checked })}
                      />
                      Break
                    </label>
                    <button
                      class="expand-btn"
                      onclick={() => {
                        const next = new Set(expandedSubjectIds);
                        expanded ? next.delete(s.id) : next.add(s.id);
                        expandedSubjectIds = next;
                      }}
                      title={expanded ? 'Collapse' : 'Edit teachers & room'}
                    >{expanded ? '▲' : '▼'}</button>
                    <button class="btn-danger" onclick={() => removeSubject(s.id)} aria-label="Delete">✕</button>
                  </div>

                  {#if expanded}
                    <div class="subject-details">
                      {#if state.teachers.length > 0}
                        <div class="detail-row">
                          <span class="sub-label">Teachers:</span>
                          <div class="check-col">
                            {#each state.teachers as t (t.id)}
                              <label class="check-inline">
                                <input type="checkbox"
                                  checked={s.defaultTeacherIds.includes(t.id)}
                                  onchange={(e) => {
                                    const checked = (e.currentTarget as HTMLInputElement).checked;
                                    const ids = checked
                                      ? [...s.defaultTeacherIds, t.id]
                                      : s.defaultTeacherIds.filter(id => id !== t.id);
                                    updateSubject(s.id, { defaultTeacherIds: ids });
                                  }}
                                />
                                <span class="mini-swatch" style="background:{t.color}"></span>
                                {t.name}
                              </label>
                            {/each}
                          </div>
                        </div>
                      {/if}
                      {#if state.rooms.length > 0}
                        <div class="detail-row">
                          <span class="sub-label">Default room:</span>
                          <select class="field-select"
                            value={s.defaultRoomId ?? ''}
                            onchange={(e) => {
                              const v = (e.currentTarget as HTMLSelectElement).value;
                              updateSubject(s.id, { defaultRoomId: v === '' ? null : v });
                            }}
                          >
                            <option value="">None</option>
                            {#each state.rooms as r (r.id)}
                              <option value={r.id}>{r.name}</option>
                            {/each}
                          </select>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
          <hr class="divider" />
        {/if}

        <section>
          <h5 class="section-title">Add subject</h5>
          <form class="add-form add-form-col" onsubmit={submitSubject}>
            <div class="add-row">
              <label class="swatch" style="background:{newSubjectColor}" title="Pick color">
                <input type="color" bind:value={newSubjectColor} class="hidden-input" />
              </label>
              <input class="field-input" type="text" bind:value={newSubjectName}
                placeholder="Subject name" aria-label="Subject name"
              />
              <input class="field-input field-num" type="number" bind:value={newSubjectDuration}
                min="15" step="15" title="Duration (minutes)"
              />
              <span class="unit">min</span>
              <label class="check-inline">
                <input type="checkbox" bind:checked={newSubjectIsBreak} />
                Break
              </label>
            </div>
            {#if state.teachers.length > 0}
              <div class="sub-row">
                <span class="sub-label">Default teachers:</span>
                <div class="check-col">
                  {#each state.teachers as t (t.id)}
                    <label class="check-inline">
                      <input type="checkbox"
                        checked={newSubjectTeacherIds.includes(t.id)}
                        onchange={() => toggleNewSubjectTeacher(t.id)}
                      />
                      <span class="mini-swatch" style="background:{t.color}"></span>
                      {t.name}
                    </label>
                  {/each}
                </div>
              </div>
            {/if}
            {#if state.rooms.length > 0}
              <div class="sub-row">
                <span class="sub-label">Default room:</span>
                <select class="field-select" bind:value={newSubjectRoomId}>
                  <option value={null}>None</option>
                  {#each state.rooms as r (r.id)}
                    <option value={r.id}>{r.name}</option>
                  {/each}
                </select>
              </div>
            {/if}
            <div class="add-actions">
              <button type="submit" class="btn-primary">Add subject</button>
            </div>
          </form>
        </section>

      {/if}
    </div>

  </div>
</dialog>

<style>
  dialog {
    max-width: 560px;
    width: 95vw;
    border-radius: 10px;
    border: none;
    padding: 0;
    box-shadow: 0 8px 40px rgba(0,0,0,0.22);
    background: var(--pico-background-color, #fff);
    color: var(--pico-color, inherit);
  }

  dialog::backdrop { background: rgba(0,0,0,0.45); }

  .panel {
    display: flex;
    flex-direction: column;
    max-height: 82vh;
  }

  /* ── Header ─────────────────────────────────────────────── */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.85rem;
    border-bottom: 1px solid var(--pico-muted-border-color, #e2e8f0);
  }

  h4 { margin: 0; font-size: 1.05rem; font-weight: 700; }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    opacity: 0.35;
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    color: inherit;
    line-height: 1;
  }
  .close-btn:hover { opacity: 1; background: rgba(229,62,62,0.08); color: #e53e3e; }

  /* ── Tabs ───────────────────────────────────────────────── */
  .tabs {
    display: flex;
    padding: 0 1rem;
    border-bottom: 1px solid var(--pico-muted-border-color, #e2e8f0);
  }

  .tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.55rem 0.8rem;
    cursor: pointer;
    font-size: 0.84rem;
    color: inherit;
    opacity: 0.5;
    font-weight: 500;
    margin-bottom: -1px;
    transition: opacity 0.15s;
  }

  .tabs button:hover { opacity: 0.8; }
  .tabs button.active { border-bottom-color: #3182ce; opacity: 1; font-weight: 700; color: #3182ce; }

  /* ── Body ───────────────────────────────────────────────── */
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  section { display: flex; flex-direction: column; gap: 0.6rem; }

  .section-title {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--pico-muted-color, #718096);
  }

  .divider {
    border: none;
    border-top: 1px solid var(--pico-muted-border-color, #e2e8f0);
    margin: 1rem 0;
  }

  /* ── Item list ──────────────────────────────────────────── */
  .item-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.4rem;
    border-radius: 6px;
  }

  .row:hover { background: rgba(0,0,0,0.03); }
  .row-muted { opacity: 0.45; }

  /* ── Color swatch ───────────────────────────────────────── */
  .swatch {
    width: 26px;
    height: 26px;
    border-radius: 5px;
    flex-shrink: 0;
    cursor: pointer;
    border: 1px solid rgba(0,0,0,0.12);
    position: relative;
    display: flex;
  }

  .hidden-input {
    opacity: 0;
    position: absolute;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  /* ── Inputs ─────────────────────────────────────────────── */
  .field-input {
    flex: 1;
    min-width: 0;
    font-size: 0.88rem;
    padding: 0.28rem 0.55rem;
    border: 1px solid var(--pico-muted-border-color, #cbd5e0);
    border-radius: 5px;
    background: var(--pico-form-element-background-color, #fff);
    color: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .field-input:focus {
    outline: none;
    border-color: #3182ce;
    box-shadow: 0 0 0 2px rgba(49,130,206,0.18);
  }

  .field-short { max-width: 72px; flex: 0 0 72px; }
  .field-num   { max-width: 64px; flex: 0 0 64px; text-align: right; }

  .unit { font-size: 0.78rem; opacity: 0.5; flex-shrink: 0; }

  /* ── Checkboxes ─────────────────────────────────────────── */
  .check-inline {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.83rem;
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
  }

  .mini-swatch {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  /* ── Group list column headers ─────────────────────────────────────────────── */
  .group-list-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.4rem;
    margin-bottom: 2px;
  }

  .col-active {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--pico-muted-color, #718096);
    width: 40px;
    flex-shrink: 0;
    white-space: nowrap;
    text-align: center;
  }

  .col-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--pico-muted-color, #718096);
  }

  /* ── Toggle switch ──────────────────────────────────────── */
  .toggle { display: flex; align-items: center; cursor: pointer; flex-shrink: 0; }
  .toggle input { display: none; }

  .toggle-track {
    width: 32px;
    height: 17px;
    border-radius: 99px;
    background: #cbd5e0;
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .toggle-track::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 2px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: white;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }

  .toggle input:checked + .toggle-track { background: #3182ce; }
  .toggle input:checked + .toggle-track::after { transform: translateX(15px); }

  /* ── Delete button ──────────────────────────────────────── */
  .btn-danger {
    background: none;
    border: none;
    cursor: pointer;
    color: #fc8181;
    font-size: 0.8rem;
    padding: 0.2rem 0.35rem;
    border-radius: 4px;
    flex-shrink: 0;
    opacity: 0.5;
    line-height: 1;
    transition: opacity 0.15s, color 0.15s;
  }

  .btn-danger:hover { opacity: 1; color: #e53e3e; }

  /* ── Add form ───────────────────────────────────────────── */
  .add-form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .add-form-col {
    flex-direction: column;
    align-items: stretch;
  }

  .add-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .sub-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.84rem;
    padding-left: 0.25rem;
  }

  .sub-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--pico-muted-color, #718096);
    white-space: nowrap;
    padding-top: 0.2rem;
    min-width: 110px;
  }

  .check-col {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  /* subject expand/collapse */
  .subject-item {
    display: flex;
    flex-direction: column;
  }

  .expand-btn {
    background: none;
    border: 1px solid var(--pico-muted-border-color, #e2e8f0);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.65rem;
    padding: 0.15rem 0.35rem;
    color: inherit;
    opacity: 0.5;
    flex-shrink: 0;
    line-height: 1;
  }
  .expand-btn:hover { opacity: 1; }

  .subject-details {
    margin: 0 0 0.35rem 2.5rem;
    padding: 0.5rem 0.75rem;
    border-left: 2px solid var(--pico-muted-border-color, #e2e8f0);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.85rem;
  }

  .detail-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .detail-row .sub-label {
    min-width: 100px;
    padding-top: 0.15rem;
  }

  .add-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .field-select {
    font-size: 0.84rem;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--pico-muted-border-color, #cbd5e0);
    border-radius: 5px;
    background: var(--pico-form-element-background-color, #fff);
    color: inherit;
  }

  .btn-primary {
    background: #3182ce;
    color: white;
    border: none;
    border-radius: 5px;
    padding: 0.35rem 0.9rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .btn-primary:hover { background: #2b6cb0; }
</style>
