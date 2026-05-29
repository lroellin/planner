<script lang="ts">
  import { getState, undo, redo, canUndo, canRedo, setWkStartDate } from '../state/store.svelte';
  import ProjectSwitcher from './ProjectSwitcher.svelte';

  interface Props {
    configOpen: boolean;
  }

  let { configOpen = $bindable() }: Props = $props();

  const state = $derived(getState());
  const conflictCount = $derived(
    new Set(
      state.events
        .filter(ev => (ev.conflicts?.length ?? 0) > 0)
        .flatMap(ev => ev.conflicts!.map(c => c.collidingEventIds.concat(ev.id).sort().join('|')))
    ).size
  );

  function handleKeydown(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (e.key === 'z' && e.shiftKey)  { e.preventDefault(); redo(); }
    if (e.key === 'y')                 { e.preventDefault(); redo(); }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="toolbar">
  <div class="toolbar-left">
    <span class="app-logo">WK</span>
    <ProjectSwitcher />
  </div>

  <div class="toolbar-center">
    <label for="wk-date" class="date-label">Week:</label>
    <input
      id="wk-date"
      type="date"
      value={state.wkStartDate}
      oninput={(e) => setWkStartDate((e.currentTarget as HTMLInputElement).value)}
    />
  </div>

  <div class="toolbar-right">
    <button
      class="icon-btn"
      disabled={!canUndo()}
      onclick={undo}
      title="Undo (Ctrl+Z)"
    >↩ Undo</button>
    <button
      class="icon-btn"
      disabled={!canRedo()}
      onclick={redo}
      title="Redo (Ctrl+Shift+Z)"
    >↪ Redo</button>

    {#if conflictCount > 0}
      <span class="conflict-badge">{conflictCount} conflict{conflictCount !== 1 ? 's' : ''}</span>
    {/if}
    <button class="config-btn" onclick={() => (configOpen = true)}>⚙ Config</button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 0 0 auto;
  }

  .toolbar-center {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    justify-content: center;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 0 0 auto;
  }

  .app-logo {
    font-weight: 800;
    font-size: 1rem;
    letter-spacing: 0.05em;
    color: #3182ce;
  }

  .date-label {
    font-size: 0.82rem;
    opacity: 0.6;
    margin: 0;
    white-space: nowrap;
  }

  input[type="date"] {
    font-size: 0.85rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--pico-muted-border-color, #ccc);
    border-radius: 4px;
    height: auto;
    background: inherit;
    color: inherit;
  }

  button {
    font-size: 0.82rem;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    border-radius: 4px;
  }

  .icon-btn {
    background: transparent;
    border: 1px solid var(--pico-muted-border-color, #ccc);
    color: inherit;
  }

  .icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .config-btn {
    background: #3182ce;
    border: 1px solid transparent;
    color: white;
  }

  .conflict-badge {
    background: #e53e3e;
    color: white;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 99px;
    font-weight: 600;
    white-space: nowrap;
  }
</style>
