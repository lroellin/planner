<script lang="ts" generics="T extends { id: string }">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';

  interface Props {
    items: T[];
    selectedId: string | null;
    addLabel: string;
    emptyListText: string;
    onselect: (id: string) => void;
    /**
     * Quick add: a name is all it takes. Everything else (colour, short name,
     * conflict handling) starts on a default and is edited in the detail pane —
     * a create form asking for those up front made adding six teachers a chore.
     * When absent, the add row is a plain button (`onadd`) opening a full form.
     */
    onquickadd?: (name: string) => void;
    onadd?: () => void;
    adding?: boolean;
    placeholder?: string;
    /** One row of the list — the caller decides what an entity looks like. */
    row: Snippet<[T]>;
    /** The right-hand pane: an add form, an edit form, or the empty state. */
    detail: Snippet;
  }

  let {
    items, selectedId, addLabel, emptyListText, onselect,
    onquickadd, onadd, adding = false, placeholder = 'Name', row, detail,
  }: Props = $props();

  let draftName = $state('');

  function submit(e: Event): void {
    e.preventDefault();
    const name = draftName.trim();
    if (!name || !onquickadd) return;
    onquickadd(name);
    draftName = '';
  }
</script>

<div class="list-panel">
  <div class="flex-1 overflow-y-auto py-1">
    {#each items as item (item.id)}
      <button
        class="list-item"
        class:list-item-active={item.id === selectedId && !adding}
        onclick={() => onselect(item.id)}
      >
        {@render row(item)}
      </button>
    {/each}
    {#if items.length === 0}
      <p class="text-center px-4 py-6" style="font-size: var(--wk-fs-sm); color: var(--wk-text-faint)">
        {emptyListText}
      </p>
    {/if}
  </div>
  <div class="list-add-row">
    {#if onquickadd}
      <form class="quick-add" onsubmit={submit}>
        <input
          class="input input-bordered input-sm flex-1 min-w-0"
          type="text"
          bind:value={draftName}
          {placeholder}
          aria-label={addLabel}
        />
        <button type="submit" class="btn btn-sm btn-primary px-2" disabled={!draftName.trim()} title={addLabel}>
          <Icon name="plus" size={14} />
        </button>
      </form>
    {:else}
      <button
        class="btn btn-sm w-full justify-start gap-1.5 font-medium"
        class:btn-primary={adding}
        class:btn-ghost={!adding}
        onclick={onadd}
      >
        <Icon name="plus" size={13} />
        {addLabel}
      </button>
    {/if}
  </div>
</div>

<div class="detail-panel">
  {@render detail()}
</div>

<style>
  .quick-add {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
</style>
