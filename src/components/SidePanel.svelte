<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    side: 'left' | 'right';
    open: boolean;
    label: string;
    width?: string;
    badge?: number;
    children: Snippet;
  }

  let { side, open = $bindable(), label, width = '220px', badge, children }: Props = $props();

  // The chevron points the way the panel is about to move, so it reads the same
  // whether it sits on the left or the right edge.
  const chevron = $derived((side === 'left') === open ? '‹' : '›');
</script>

<aside class="side-panel" class:collapsed={!open} class:side-right={side === 'right'} style="--panel-w:{width}">
  {#if open}
    <div class="panel-body">{@render children()}</div>
  {:else}
    <button class="panel-rail" onclick={() => (open = true)} title="Expand {label}">
      {#if badge !== undefined && badge > 0}
        <span class="rail-badge">{badge}</span>
      {/if}
      <span class="rail-label">{label}</span>
    </button>
  {/if}

  <button
    class="panel-toggle"
    onclick={() => (open = !open)}
    aria-expanded={open}
    title="{open ? 'Collapse' : 'Expand'} {label}"
  >
    <span class="toggle-chevron">{chevron}</span>
    {#if open}<span class="toggle-text">Collapse</span>{/if}
  </button>
</aside>

<style>
  .side-panel {
    width: var(--panel-w);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--wk-line);
    transition: width 0.15s ease;
  }

  .side-right {
    border-right: 0;
    border-left: 1px solid var(--wk-line);
  }

  .collapsed {
    width: 40px;
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* ── Collapsed rail ────────────────────────────────────────────────────────── */
  .panel-rail {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--wk-text-mute);
  }

  .panel-rail:hover {
    background: var(--wk-surface-alt);
    color: var(--wk-text);
  }

  .rail-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 700;
    background: var(--color-error);
    color: white;
    flex-shrink: 0;
  }

  .rail-label {
    writing-mode: vertical-rl;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  /* ── Bottom toggle bar ─────────────────────────────────────────────────────── */
  .panel-toggle {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    height: 34px;
    padding: 0 0.6rem;
    background: transparent;
    border: none;
    border-top: 1px solid var(--wk-line);
    color: var(--wk-text-faint);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .side-right .panel-toggle {
    flex-direction: row-reverse;
  }

  .collapsed .panel-toggle {
    justify-content: center;
    padding: 0;
  }

  .panel-toggle:hover {
    background: var(--wk-surface-alt);
    color: var(--wk-text);
  }

  .toggle-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid var(--wk-line);
    font-size: 0.9rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .panel-toggle:hover .toggle-chevron {
    border-color: var(--wk-line-strong);
    background: var(--wk-surface);
  }

  @media print {
    .side-panel {
      display: none !important;
    }
  }
</style>
