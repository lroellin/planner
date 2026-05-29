<script lang="ts">
  import { getState, undo, redo, canUndo, canRedo, setWkStartDate } from '../state/store.svelte';

  interface Props {
    configOpen: boolean;
  }

  let { configOpen = $bindable() }: Props = $props();

  const state = $derived(getState());
  const conflictCount = $derived(
    state.events.filter(ev => (ev.conflicts?.length ?? 0) > 0).length,
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
  <span class="app-title">WK Planner</span>

  <div class="toolbar-group">
    <label for="wk-date" class="date-label">WK start:</label>
    <input
      id="wk-date"
      type="date"
      value={state.wkStartDate}
      oninput={(e) => setWkStartDate((e.currentTarget as HTMLInputElement).value)}
    />
  </div>

  <div class="toolbar-group">
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
  </div>

  <div class="toolbar-group">
    {#if conflictCount > 0}
      <span class="conflict-badge">{conflictCount} conflict{conflictCount !== 1 ? 's' : ''}</span>
    {/if}
    <button onclick={() => (configOpen = true)}>⚙ Config</button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .app-title {
    font-weight: 700;
    font-size: 1rem;
    margin-right: auto;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .date-label {
    font-size: 0.85rem;
    margin: 0;
  }

  input[type="date"] {
    font-size: 0.85rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--pico-muted-border-color, #ccc);
    border-radius: 4px;
    height: auto;
  }

  button {
    font-size: 0.82rem;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
  }

  .icon-btn {
    background: transparent;
    border: 1px solid var(--pico-muted-border-color, #ccc);
    border-radius: 4px;
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .conflict-badge {
    background: #e53e3e;
    color: white;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 99px;
    font-weight: 600;
  }
</style>
