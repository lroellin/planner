<script lang="ts">
  import Toolbar from './components/Toolbar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Calendar from './components/Calendar.svelte';
  import ConflictPanel from './components/ConflictPanel.svelte';
  import EventModal from './components/EventModal.svelte';
  import ConfigPanel from './components/ConfigPanel.svelte';

  let configOpen = $state(false);
  let selectedEventId = $state<string | null>(null);
</script>

<div class="app-layout">
  <div class="pico toolbar-wrapper">
    <Toolbar bind:configOpen />
  </div>

  <div class="main-area">
    <aside class="pico sidebar-wrapper">
      <Sidebar />
    </aside>

    <div class="calendar-wrapper">
      <Calendar bind:selectedEventId />
    </div>

    <aside class="pico conflict-wrapper">
      <ConflictPanel />
    </aside>
  </div>
</div>

{#if selectedEventId}
  <EventModal eventId={selectedEventId} onclose={() => (selectedEventId = null)} />
{/if}

{#if configOpen}
  <ConfigPanel onclose={() => (configOpen = false)} />
{/if}

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    height: 100vh;
  }

  :global(#app) {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .app-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .toolbar-wrapper {
    flex-shrink: 0;
    border-bottom: 1px solid var(--pico-muted-border-color, #e0e0e0);
    padding: 0.4rem 1rem;
  }

  .main-area {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .sidebar-wrapper {
    width: 200px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--pico-muted-border-color, #e0e0e0);
    padding: 0.75rem;
  }

  .calendar-wrapper {
    flex: 1;
    overflow: hidden;
    min-width: 0;
  }

  .conflict-wrapper {
    width: 240px;
    flex-shrink: 0;
    overflow-y: auto;
    border-left: 1px solid var(--pico-muted-border-color, #e0e0e0);
    padding: 0.75rem;
  }

  /* Prevent Pico from styling FullCalendar internals */
  :global(.calendar-wrapper *) {
    box-sizing: border-box;
  }

  :global(.fc) {
    height: 100%;
    font-family: inherit;
  }
</style>
