<script lang="ts">
  import Sidebar from './Sidebar.svelte';
  import ConflictPanel from './ConflictPanel.svelte';

  /**
   * The one side panel.
   *
   * There used to be two: Themen on the left, taking 240px out of the flex row,
   * and Probleme on the right, floating *over* the grid because docking it in
   * flow cost another 268px. The float was the lesser of two bad options and
   * still the wrong one — the panel that names a conflict was drawn on top of
   * the Friday lanes the conflict is in, so "show me" pointed underneath it.
   *
   * Both panels are read against the grid, neither is read against the other,
   * and only one of them is ever the job at hand: you place Themen, or you clear
   * Probleme. So they share one dock and one width, the grid is never covered,
   * and the chrome bill drops from 240 + 40 + an overlay to a single 248px.
   *
   * Both panes stay mounted and are hidden with CSS rather than swapped with
   * `{#if}`: the Themen pane owns a FullCalendar `Draggable` and a search box,
   * and re-mounting it on every tab switch would rebuild the one and clear the
   * other.
   */
  type DockTab = 'subjects' | 'problems';

  interface Props {
    open: boolean;
    tab: DockTab;
    issueCount: number;
    selectedEventId: string | null;
  }

  let {
    open = $bindable(), tab = $bindable(), issueCount, selectedEventId = $bindable(),
  }: Props = $props();

  function show(next: DockTab): void {
    tab = next;
    open = true;
  }

  const TAB_ORDER: DockTab[] = ['subjects', 'problems'];

  /** ← → (and Home/End) move between tabs, as a tablist is expected to. */
  function onTabKey(e: KeyboardEvent): void {
    const i = TAB_ORDER.indexOf(tab);
    let next: DockTab | undefined;
    if (e.key === 'ArrowRight') next = TAB_ORDER[(i + 1) % TAB_ORDER.length];
    else if (e.key === 'ArrowLeft') next = TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length];
    else if (e.key === 'Home') next = TAB_ORDER[0];
    else if (e.key === 'End') next = TAB_ORDER[TAB_ORDER.length - 1];
    if (!next) return;
    e.preventDefault();
    tab = next;
    // Focus follows selection in a two-tab strip: there is nothing to preview.
    (e.currentTarget as HTMLElement)
      .closest('.wkdock-tablist')
      ?.querySelector<HTMLElement>(`#wkdock-tab-${next}`)
      ?.focus();
  }
</script>

<aside class="wkdock" class:collapsed={!open}>
  {#if open}
    <!-- The tab strip is also where the panel is folded away. The toggle used to
         be a 34px bar pinned to the bottom edge — a full row of chrome spent on
         one chevron, in the app's scarcest dimension. -->
    <!-- K3: a real tab widget. The strip declared `role="tablist"` with no
         `aria-controls`, the panes had no `role="tabpanel"`, and the fold
         button sat *inside* the tablist — part of a widget it is not part of,
         and a stop the arrow keys would land on. Arrow keys move between the
         two tabs; only the selected one is a tab stop, so Tab goes from the
         strip straight into the pane. -->
    <div class="wkdock-tabs">
      <div class="wkdock-tablist" role="tablist" aria-label="Seitenleiste">
        <button
          role="tab"
          id="wkdock-tab-subjects"
          aria-controls="wkdock-pane-subjects"
          class="wkdock-tab"
          class:wkdock-tab-on={tab === 'subjects'}
          aria-selected={tab === 'subjects'}
          tabindex={tab === 'subjects' ? 0 : -1}
          onkeydown={onTabKey}
          onclick={() => (tab = 'subjects')}
        >Themen</button>
        <button
          role="tab"
          id="wkdock-tab-problems"
          aria-controls="wkdock-pane-problems"
          class="wkdock-tab"
          class:wkdock-tab-on={tab === 'problems'}
          aria-selected={tab === 'problems'}
          tabindex={tab === 'problems' ? 0 : -1}
          onkeydown={onTabKey}
          onclick={() => (tab = 'problems')}
        >
          Probleme
          {#if issueCount > 0}<span class="tab-count">{issueCount}</span>{/if}
        </button>
      </div>
      <button
        class="wkdock-fold"
        onclick={() => (open = false)}
        title="Seitenleiste einklappen"
        aria-label="Seitenleiste einklappen"
      >‹</button>
    </div>
  {/if}

  <div class="wkdock-panes" class:hidden={!open}>
    <div
      class="wkdock-pane"
      class:wkdock-pane-on={tab === 'subjects'}
      role="tabpanel"
      id="wkdock-pane-subjects"
      aria-labelledby="wkdock-tab-subjects"
      hidden={open && tab !== 'subjects'}
    >
      <Sidebar />
    </div>
    <div
      class="wkdock-pane"
      class:wkdock-pane-on={tab === 'problems'}
      role="tabpanel"
      id="wkdock-pane-problems"
      aria-labelledby="wkdock-tab-problems"
      hidden={open && tab !== 'problems'}
    >
      <ConflictPanel bind:selectedEventId />
    </div>
  </div>

  {#if !open}
    <!-- Folded, the dock still has to say what is behind it *and* keep the
         problem count in view: it is the badge people watch while dragging. -->
    <div class="wkdock-rail">
      <button class="rail-item" onclick={() => show('subjects')} title="Themen ausklappen">
        <span class="rail-label">Themen</span>
      </button>
      <button class="rail-item" onclick={() => show('problems')} title="Probleme ausklappen">
        {#if issueCount > 0}<span class="rail-badge">{issueCount}</span>{/if}
        <span class="rail-label">Probleme</span>
      </button>
    </div>
  {/if}
</aside>

<style>
  /* `wkdock`, not `dock`: daisyUI 5 ships a `.dock` component of its own — a
     fixed bottom navigation bar — and the bare name silently made this panel
     `position: fixed`. */
  .wkdock {
    width: var(--wk-dock-w);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--wk-line);
    /* No width transition: the calendars inside re-lay out in a single frame,
       so half of any slide would show eleven lanes snapping to new widths. */
  }

  .collapsed {
    width: 34px;
  }

  /* ── Tabs ─────────────────────────────────────────────────────────────────── */
  .wkdock-tabs {
    display: flex;
    align-items: stretch;
    gap: 2px;
    flex-shrink: 0;
    /* Sits on exactly the phase strip's baseline: the two are one band across
       the top of the work area, not two rows of chrome. */
    height: 23px;
    padding: 0 0.2rem;
    border-bottom: 1px solid var(--wk-line);
    background: var(--wk-surface-alt);
  }

  /* The tablist proper — the fold button is a sibling, not a member. */
  .wkdock-tablist {
    display: flex;
    align-items: stretch;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .wkdock-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    flex: 1;
    min-width: 0;
    padding: 0 0.3rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--wk-text-faint);
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
  }

  .wkdock-tab:hover { color: var(--wk-text); }

  .wkdock-tab-on {
    color: var(--wk-text);
    border-bottom-color: var(--color-primary);
  }

  /* The count rides on the tab, so it is legible from the grid without opening
     the pane — the same job the old collapsed rail's badge did. */
  .tab-count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 17px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--color-error);
    color: var(--color-error-content);
    font-size: var(--wk-fs-3xs);
    font-weight: 700;
    letter-spacing: 0;
  }

  .wkdock-fold {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    flex-shrink: 0;
    border: none;
    background: none;
    color: var(--wk-text-faint);
    font-size: 0.95rem;
    line-height: 1;
    cursor: pointer;
  }
  .wkdock-fold:hover { color: var(--wk-text); }

  /* ── Panes ────────────────────────────────────────────────────────────────── */
  .wkdock-panes {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .wkdock-panes.hidden { display: none; }

  .wkdock-pane {
    display: none;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .wkdock-pane-on { display: flex; flex-direction: column; }

  /* ── Folded rail ──────────────────────────────────────────────────────────── */
  .wkdock-rail {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .rail-item {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    padding: 0.7rem 0;
    border: none;
    background: transparent;
    color: var(--wk-text-mute);
    cursor: pointer;
  }

  /* Two zones, each half the rail; without the rule the second label simply
     starts at mid-height for no visible reason. */
  .rail-item + .rail-item {
    border-top: 1px solid var(--wk-line);
  }

  .rail-item:hover {
    background: var(--wk-surface-alt);
    color: var(--wk-text);
  }

  .rail-label {
    writing-mode: vertical-rl;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
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
    color: var(--color-error-content);
    flex-shrink: 0;
  }

  @media print {
    .wkdock { display: none !important; }
  }
</style>
