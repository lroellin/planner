<script lang="ts">
  /**
   * The one way to add something in the config panel: an eyebrow label, a name
   * field and a primary button that names the action. Enter in the field does
   * the same thing as the button — it is a form, so that comes for free.
   *
   * Narrow columns (the master-detail list) pass `stacked`, which wraps the same
   * three parts instead of shrinking the button into an unlabelled icon.
   */
  import Icon from '../Icon.svelte';

  interface Props {
    /** "Add teacher" — used for the eyebrow and the button both. */
    label: string;
    placeholder?: string;
    onadd?: (name: string) => void;
    /**
     * Button-only: for Themen, where a name is not enough to create with and the
     * button opens a form instead. Same button, no field — this is what stops
     * that tab from growing an add control of its own.
     */
    onactivate?: () => void;
    /** Highlights the button while the form it opened is on screen. */
    active?: boolean;
    stacked?: boolean;
    inputClass?: string;
    /**
     * Seeds the field, and re-seeds it after each add. Group labels run G1, G2,
     * G3…, so offering the next one means the whole interaction is Enter.
     * A function, because the next value depends on what was just added.
     */
    nextValue?: () => string;
  }

  let {
    label, placeholder = 'Name', onadd, onactivate, active = false,
    stacked = false, inputClass = 'w-48', nextValue,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let draft = $state(nextValue ? nextValue() : '');
  let inputEl: HTMLInputElement | undefined = $state();

  function submit(e: Event): void {
    e.preventDefault();
    const name = draft.trim();
    // Not `disabled` on the button: with no `nextValue` the field starts empty,
    // so the primary action on four of the five tabs was permanently greyed —
    // three visibly different "add" buttons for one thing. It stays live and
    // sends you to the field that is missing.
    if (!name) {
      inputEl?.focus();
      return;
    }
    onadd?.(name);
    draft = nextValue ? nextValue() : '';
  }
</script>

{#if onactivate}
  <div class="pane-add" class:pane-add-stacked={stacked}>
    <button
      type="button"
      class="btn btn-primary btn-sm gap-1.5"
      class:w-full={stacked}
      class:btn-active={active}
      onclick={onactivate}
    >
      <Icon name="plus" size={13} /> {label}
    </button>
  </div>
{:else}
  <form class="pane-add" class:pane-add-stacked={stacked} onsubmit={submit}>
    <span class="field-label">{label}</span>
    <input
      bind:this={inputEl}
      class="input input-bordered input-sm {stacked ? 'w-full' : inputClass}"
      type="text"
      bind:value={draft}
      {placeholder}
      aria-label={label}
    />
    <button type="submit" class="btn btn-primary btn-sm gap-1.5" class:w-full={stacked}>
      <Icon name="plus" size={13} /> {label}
    </button>
  </form>
{/if}
