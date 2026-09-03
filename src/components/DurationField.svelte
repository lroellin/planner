<script lang="ts">
  /**
   * How long something runs — the one control, used everywhere one is asked for.
   *
   * There were three. The quick-edit popover offered seven preset chips and no
   * way to type 75; the full editor offered a bare number spinner and no way to
   * say "an hour" without counting; Konfiguration offered both but in its own
   * third arrangement. Same question, same answer shape, three different motor
   * actions — and the two that were reachable from the same card disagreed about
   * whether 180 minutes was even offerable.
   *
   * Presets carry the common answers, and the field beside them is the escape
   * hatch. The presets are a radio set, so the one in force always reads as
   * chosen rather than as "the last button pressed".
   */
  import { formatDuration } from '../utils/timeUtils';

  interface Props {
    value: number;
    onchange: (minutes: number) => void;
    /** The two sizes the app has: `xs` in the card popover, `sm` in the dialogs. */
    size?: 'xs' | 'sm';
    presets?: number[];
    /** Labels the numeric field for screen readers when no visible label sits beside it. */
    ariaLabel?: string;
  }

  const DEFAULT_PRESETS = [15, 30, 45, 60, 90, 120, 180];

  let {
    value, onchange, size = 'sm', presets = DEFAULT_PRESETS, ariaLabel = 'Dauer in Minuten',
  }: Props = $props();

  // "45′", "1h", "1h30" — short enough to sit in a 7-chip row inside a popover.
  function chipLabel(minutes: number): string {
    if (minutes < 60) return `${minutes}′`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h${m}`;
  }

  function commit(raw: string): void {
    const n = Number(raw);
    // A quarter-hour grid everywhere else in the app; anything else would land
    // between slots and could not be drawn where it says it is.
    if (!Number.isFinite(n) || n < 15) return;
    const snapped = Math.round(n / 15) * 15;
    if (snapped !== value) onchange(snapped);
  }
</script>

<div class="dur-field" class:dur-field-xs={size === 'xs'}>
  <div class="dur-presets" role="group" aria-label="Dauer">
    {#each presets as preset (preset)}
      <button
        type="button"
        class="dur-chip"
        class:dur-chip-on={value === preset}
        aria-pressed={value === preset}
        title={formatDuration(preset)}
        onclick={() => onchange(preset)}
      >{chipLabel(preset)}</button>
    {/each}
  </div>

  <label class="dur-custom">
    <input
      class="dur-input wk-num"
      type="number"
      min="15"
      step="15"
      aria-label={ariaLabel}
      {value}
      onchange={(e) => commit((e.currentTarget as HTMLInputElement).value)}
    />
    <span class="dur-unit">min</span>
  </label>
</div>

<style>
  .dur-field {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem 0.5rem;
    min-width: 0;
  }

  .dur-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    min-width: 0;
  }

  .dur-chip {
    padding: 0.24rem 0.55rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: transparent;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-sm);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, color 0.12s;
  }
  .dur-chip:hover {
    border-color: var(--wk-line-strong);
    background: var(--wk-surface-alt);
    color: var(--wk-text);
  }
  .dur-chip-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
    font-weight: 700;
  }

  /* The escape hatch reads as one control with its unit, not as a stray
     spinner: 75 minutes is a real answer and has to be typeable. */
  .dur-custom {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0 0.45rem 0 0;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: var(--wk-surface);
  }
  .dur-custom:focus-within {
    border-color: var(--color-primary);
  }

  .dur-input {
    width: 3.4rem;
    padding: 0.24rem 0 0.24rem 0.45rem;
    border: none;
    background: none;
    outline: none;
    color: var(--wk-text);
    font-size: var(--wk-fs-sm);
    text-align: right;
  }

  .dur-unit {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
  }

  /* Popover scale: the same control, one notch down. */
  .dur-field-xs .dur-chip {
    padding: 0.15rem 0.42rem;
    font-size: var(--wk-fs-2xs);
  }
  .dur-field-xs .dur-input {
    width: 2.8rem;
    padding: 0.15rem 0 0.15rem 0.35rem;
    font-size: var(--wk-fs-2xs);
  }
  .dur-field-xs .dur-unit {
    font-size: 0.625rem;
  }
</style>
