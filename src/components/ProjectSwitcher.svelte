<script lang="ts">
  import {
    getProjects, getCurrentProjectId, switchProject,
    createNewProject, renameCurrentProject, deleteProjectById,
  } from '../state/store.svelte';

  let open = $state(false);
  let renaming = $state(false);
  let newName = $state('');
  let creatingNew = $state(false);
  let newProjectName = $state('');

  const projects = $derived(getProjects());
  const activeId = $derived(getCurrentProjectId());
  const activeProject = $derived(projects.find(p => p.id === activeId));

  function startRename(): void {
    newName = activeProject?.name ?? '';
    renaming = true;
    open = false;
  }

  function confirmRename(): void {
    if (newName.trim()) renameCurrentProject(newName.trim());
    renaming = false;
  }

  function startCreate(): void {
    newProjectName = `WK ${new Date().getFullYear() + 1}`;
    creatingNew = true;
    open = false;
  }

  function confirmCreate(): void {
    if (newProjectName.trim()) createNewProject(newProjectName.trim());
    creatingNew = false;
  }

  function handleDelete(id: string): void {
    if (projects.length <= 1) return;
    if (!confirm(`Delete project "${projects.find(p => p.id === id)?.name}"? This cannot be undone.`)) return;
    deleteProjectById(id);
    open = false;
  }
</script>

<div class="project-switcher">
  {#if renaming}
    <input
      class="rename-input"
      bind:value={newName}
      onkeydown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') renaming = false; }}
      onblur={confirmRename}
    />
  {:else if creatingNew}
    <input
      class="rename-input"
      placeholder="Project name"
      bind:value={newProjectName}
      onkeydown={(e) => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') creatingNew = false; }}
      onblur={confirmCreate}
    />
  {:else}
    <button class="project-btn" onclick={() => open = !open}>
      <span class="project-name">{activeProject?.name ?? 'Loading…'}</span>
      <span class="chevron">{open ? '▲' : '▼'}</span>
    </button>
  {/if}

  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={() => open = false}></div>
    <div class="dropdown">
      <div class="dropdown-section">
        {#each projects as p (p.id)}
          <div class="dropdown-item" class:active={p.id === activeId}>
            <button
              class="item-name"
              onclick={() => { switchProject(p.id); open = false; }}
            >{p.name}</button>
            {#if p.id === activeId}
              <button class="item-action" onclick={startRename} title="Rename">✎</button>
            {/if}
            {#if projects.length > 1}
              <button class="item-action danger" onclick={() => handleDelete(p.id)} title="Delete">✕</button>
            {/if}
          </div>
        {/each}
      </div>
      <div class="dropdown-footer">
        <button onclick={startCreate}>+ New project</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .project-switcher {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .project-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: transparent;
    border: 1px solid var(--pico-muted-border-color, #ccc);
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font-size: 0.88rem;
    font-weight: 600;
    color: inherit;
    flex: 1;
    min-width: 0;
    max-width: 400px;
  }

  .project-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chevron {
    font-size: 0.65em;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .rename-input {
    font-size: 0.88rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border: 1px solid #3182ce;
    border-radius: 6px;
    min-width: 220px;
    max-width: 340px;
    width: 30vw;
    outline: none;
    background: var(--pico-background-color, #fff);
    color: inherit;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 200px;
    background: var(--pico-background-color, white);
    border: 1px solid var(--pico-muted-border-color, #ddd);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    z-index: 100;
    overflow: hidden;
  }

  .dropdown-section {
    padding: 0.4rem 0;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    padding: 0 0.5rem;
  }

  .dropdown-item.active {
    background: rgba(49, 130, 206, 0.08);
  }

  .item-name {
    flex: 1;
    background: none;
    border: none;
    padding: 0.4rem 0.5rem;
    cursor: pointer;
    text-align: left;
    font-size: 0.85rem;
    color: inherit;
    font-weight: inherit;
    border-radius: 4px;
  }

  .dropdown-item.active .item-name {
    font-weight: 600;
    color: #3182ce;
  }

  .item-action {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.2rem 0.3rem;
    font-size: 0.8rem;
    opacity: 0.5;
    border-radius: 4px;
    color: inherit;
  }

  .item-action:hover { opacity: 1; }
  .item-action.danger:hover { color: #e53e3e; }

  .dropdown-footer {
    border-top: 1px solid var(--pico-muted-border-color, #eee);
    padding: 0.4rem 0.5rem;
  }

  .dropdown-footer button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.82rem;
    color: #3182ce;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    width: 100%;
    text-align: left;
  }

  .dropdown-footer button:hover {
    background: rgba(49, 130, 206, 0.08);
  }
</style>
