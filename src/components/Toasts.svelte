<script lang="ts">
  import { getToasts, dismissToast } from '../state/ui.svelte';
  import Icon from './Icon.svelte';

  const toasts = $derived(getToasts());
</script>

<div class="toast-stack" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast-item">
      <span class="toast-msg">{t.message}</span>
      {#if t.action}
        <button
          class="toast-action"
          onclick={() => { t.action?.run(); dismissToast(t.id); }}
        >{t.action.label}</button>
      {/if}
      <button class="toast-x" onclick={() => dismissToast(t.id)} aria-label="Schliessen">
        <Icon name="x" size={12} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    left: 50%;
    bottom: 1.1rem;
    transform: translateX(-50%);
    z-index: 120;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    pointer-events: none;
  }

  .toast-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.5rem 0.45rem 0.85rem;
    border-radius: var(--wk-r-md);
    background: var(--color-neutral);
    color: var(--color-neutral-content);
    box-shadow: var(--wk-shadow-2);
    font-size: var(--wk-fs-sm);
    pointer-events: auto;
    animation: toast-in 0.16s ease-out;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: none; }
  }

  .toast-msg {
    white-space: nowrap;
  }

  .toast-action {
    background: none;
    border: none;
    padding: 0.1rem 0.35rem;
    border-radius: var(--wk-r-sm);
    color: inherit;
    font-size: var(--wk-fs-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    opacity: 0.85;
  }
  .toast-action:hover {
    opacity: 1;
    background: color-mix(in oklab, var(--color-neutral-content) 18%, transparent);
  }

  .toast-x {
    display: flex;
    background: none;
    border: none;
    color: inherit;
    opacity: 0.5;
    cursor: pointer;
    padding: 0.2rem;
  }
  .toast-x:hover { opacity: 1; }

  @media print {
    .toast-stack { display: none !important; }
  }
</style>
