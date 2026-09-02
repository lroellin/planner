<script lang="ts" generics="T extends { id: string }">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';

  interface Props {
    items: T[];
    selectedId: string | null;
    adding: boolean;
    addLabel: string;
    emptyListText: string;
    onselect: (id: string) => void;
    onadd: () => void;
    /** One row of the list — the caller decides what an entity looks like. */
    row: Snippet<[T]>;
    /** The right-hand pane: an add form, an edit form, or the empty state. */
    detail: Snippet;
  }

  let {
    items, selectedId, adding, addLabel, emptyListText, onselect, onadd, row, detail,
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
  <div class="list-add-row">
    <button
      class="btn btn-sm w-full justify-start gap-1.5 font-medium"
      class:btn-primary={adding}
      class:btn-ghost={!adding}
      onclick={onadd}
    >
      <Icon name="plus" size={13} />
      {addLabel}
    </button>
  </div>
</div>

<div class="detail-panel">
  {@render detail()}
</div>
