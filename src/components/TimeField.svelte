<script lang="ts">
  /**
   * A 24-hour time picker.
   *
   * `<input type="time">` renders in the *browser's* locale, so an en-US Chrome
   * shows an AM/PM spinner however Swiss the app is. A select also enforces the
   * 15-minute grid the whole app already snaps to, and keeps type-ahead ("0830"
   * jumps straight to 08:30).
   */
  import { pad } from '../utils/timeUtils';

  interface Props {
    value: string;
    /** Range of offered slots — defaults to the calendar's own day. */
    from?: string;
    to?: string;
    stepMinutes?: number;
    class?: string;
    disabled?: boolean;
    ariaLabel?: string;
    /** For callers that hold the value in the store rather than in a local. */
    onpick?: (value: string) => void;
  }

  let {
    value = $bindable(),
    from = '07:00',
    to = '19:00',
    stepMinutes = 15,
    class: klass = 'w-28',
    disabled = false,
    ariaLabel,
    onpick,
  }: Props = $props();

  function toMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  }

  function toLabel(total: number): string {
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

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
  class="select select-bordered select-sm wk-num {klass}"
  bind:value
  onchange={(e) => onpick?.((e.currentTarget as HTMLSelectElement).value)}
  {disabled}
  aria-label={ariaLabel}
>
  {#each options as t (t)}
    <option value={t}>{t}</option>
  {/each}
</select>
