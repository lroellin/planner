<script lang="ts">
  /**
   * A 24-hour time picker.
   *
   * `<input type="time">` renders in the *browser's* locale, so an en-US Chrome
   * shows an AM/PM spinner however Swiss the app is. A select also enforces the
   * 15-minute grid the whole app already snaps to, and keeps type-ahead ("0830"
   * jumps straight to 08:30).
   */
  import { minutesToTime as toLabel, timeToMinutes as toMinutes } from '../utils/timeUtils';

  interface Props {
    value: string;
    /**
     * Range of offered slots. Anything picking a time *on the grid* has to pass
     * `gridWindow(state)`: this default is a plain fallback, and left to itself
     * it offered 07:00 on an 08:00 raster — a placement no calendar then drew
     * and no panel listed — while refusing 06:00 on a raster that started there.
     */
    from?: string;
    to?: string;
    stepMinutes?: number;
    class?: string;
    /** The two sizes the app has — matches `DurationField`: `xs` in the card
        popover, `sm` in the dialogs. */
    size?: 'xs' | 'sm';
    disabled?: boolean;
    ariaLabel?: string;
    /**
     * Offer an "unset" entry. The grid window uses it: an empty start or end
     * means *derive it from the plan*, which is a real answer and not a missing
     * one, so it belongs in the list rather than beside it as a checkbox.
     */
    allowEmpty?: boolean;
    emptyLabel?: string;
    /** For callers that hold the value in the store rather than in a local. */
    onpick?: (value: string) => void;
  }

  let {
    value = $bindable(),
    from = '07:00',
    to = '19:00',
    stepMinutes = 15,
    class: klass = 'w-28',
    size = 'sm',
    disabled = false,
    ariaLabel,
    allowEmpty = false,
    emptyLabel = '—',
    onpick,
  }: Props = $props();


  // A stored value outside the range still has to be selectable, or opening the
  // editor on an odd event would silently rewrite its time to the first slot.
  const options = $derived.by(() => {
    const start = toMinutes(from);
    const end = toMinutes(to);
    const out: string[] = [];
    for (let t = start; t <= end; t += stepMinutes) out.push(toLabel(t));
    if (value && !out.includes(value)) {
      out.push(value);
      out.sort();
    }
    return out;
  });
</script>

<select
  class="select select-bordered wk-num {size === 'xs' ? 'select-xs' : 'select-sm'} {klass}"
  bind:value
  onchange={(e) => onpick?.((e.currentTarget as HTMLSelectElement).value)}
  {disabled}
  aria-label={ariaLabel}
>
  {#if allowEmpty}
    <option value="">{emptyLabel}</option>
  {/if}
  {#each options as t (t)}
    <option value={t}>{t}</option>
  {/each}
</select>
