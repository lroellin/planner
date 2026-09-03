<script lang="ts" generics="T extends { id: string }">
  import type { Snippet } from 'svelte';
  import AddRow from './AddRow.svelte';

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
  <!-- Both paths are the same component. The ghost button that used to live
       here was the third "add" treatment in a panel with one add action. -->
  {#if onquickadd}
    <AddRow label={addLabel} {placeholder} onadd={onquickadd} stacked />
  {:else}
    <AddRow label={addLabel} onactivate={() => onadd?.()} active={adding} stacked />
  {/if}
</div>

<div class="detail-panel">
  {@render detail()}
</div>
