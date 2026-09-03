<script lang="ts">
  import Icon from '../Icon.svelte';
  import { getContrastColor } from '../../utils/colorUtils';

  interface Props {
    value: string;
    onpick: (color: string) => void;
    /** Rendered inside the swatch — teacher initials, for instance. */
    initials?: string;
    size?: number;
  }

  let { value, onpick, initials = '', size = 36 }: Props = $props();

  /**
   * A curated ramp instead of the raw OS colour picker. Every entry sits in a
   * lightness band that survives being tinted onto a card in either theme —
   * left to their own devices people pick neon yellow, and then no text is
   * readable on it.
   */
  const PALETTE = [
    '#e11d48', '#f97316', '#f59e0b', '#ca8a04', '#65a30d', '#16a34a',
    '#059669', '#0d9488', '#0891b2', '#0284c7', '#2563eb', '#4f46e5',
    '#7c3aed', '#9333ea', '#c026d3', '#db2777', '#57534e', '#475569',
  ];

  let open = $state(false);

  function pick(color: string): void {
    onpick(color);
    open = false;
  }
</script>

<div class="picker">
  <!-- E6: a swatch in a frame with a caret. The palette icon drawn *over* the
       colour made this read as a primary button on Themen; the same control with
       initials in it read as the teacher's avatar on Ausbildner — one control
       with two identities, neither of which was "a colour you can change". The
       colour is now the thing shown, the frame and the caret are what say it
       opens. -->
  <button
    type="button"
    class="swatch-frame"
    class:swatch-frame-open={open}
    onclick={() => (open = !open)}
    title="Farbe ändern"
    aria-label="Farbe ändern"
    aria-expanded={open}
  >
    <span
      class="swatch"
      style="background:{value}; width:{size}px; height:{size}px; color:{getContrastColor(value)}"
    >
      {#if initials}<span class="swatch-initials">{initials}</span>{/if}
    </span>
    <Icon name="chevronDown" size={13} class="swatch-caret" />
  </button>

  {#if open}
    <button type="button" class="backdrop" aria-label="Farbwahl schliessen" onclick={() => (open = false)}></button>
    <div class="pop">
      <div class="grid">
        {#each PALETTE as color (color)}
          <button
            type="button"
            class="chip"
            class:chip-on={color.toLowerCase() === value.toLowerCase()}
            style="background:{color}"
            onclick={() => pick(color)}
            aria-label={color}
          >
            {#if color.toLowerCase() === value.toLowerCase()}
              <Icon name="check" size={12} class="chip-check" />
            {/if}
          </button>
        {/each}
      </div>
      <label class="custom">
        <span>Eigene</span>
        <input
          type="color"
          value={value}
          oninput={(e) => onpick((e.currentTarget as HTMLInputElement).value)}
        />
      </label>
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    flex-shrink: 0;
  }

  .swatch-frame {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 3px 3px 3px 4px;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: var(--wk-surface);
    color: var(--wk-text-faint);
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
  }
  .swatch-frame:hover {
    border-color: var(--wk-line-strong);
    background: var(--wk-surface-alt);
    color: var(--wk-text-mute);
  }
  .swatch-frame-open {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .swatch {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: calc(var(--wk-r-sm) - 3px);
    flex-shrink: 0;
  }

  /* Initials sit on the colour with a derived label colour, not white with a
     shadow propping it up. */
  .swatch-initials {
    font-size: var(--wk-fs-sm);
    font-weight: 700;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    border: none;
    background: transparent;
    cursor: default;
  }

  .pop {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 61;
    padding: 0.5rem;
    background: var(--wk-surface);
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(6, 22px);
    gap: 5px;
  }

  .chip {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    border: 1px solid color-mix(in oklab, var(--color-base-content) 15%, transparent);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }
  .chip:hover { transform: scale(1.12); }
  .chip-on { box-shadow: 0 0 0 2px var(--wk-surface), 0 0 0 3.5px var(--color-primary); }

  .custom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--wk-line);
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    cursor: pointer;
  }

  .custom input {
    width: 34px;
    height: 22px;
    border: 1px solid var(--wk-line);
    border-radius: 4px;
    background: none;
    cursor: pointer;
    padding: 0;
  }
</style>
