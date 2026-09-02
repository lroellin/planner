<script lang="ts">
  import { ICON_PATHS, type IconName } from '../utils/icons';

  interface Props {
    name: IconName;
    size?: number;
    /** Stroke weight — 2 reads well at 14–18px, 1.75 for larger glyphs. */
    stroke?: number;
    class?: string;
  }

  let { name, size = 15, stroke = 2, class: klass = '' }: Props = $props();
</script>

<svg
  class="wk-icon {klass}"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags — geometry is a static literal -->
  {@html ICON_PATHS[name]}
</svg>

<style>
  .wk-icon {
    flex-shrink: 0;
    display: block;
  }
</style>
