<script lang="ts">
  import {
    getState,
    undo,
    redo,
    canUndo,
    canRedo,
    setWkStartDate,
  } from "../state/store.svelte";
  import { formatDate } from "../utils/timeUtils";
  import { detectConflicts } from "../conflicts/detector";
  import type { EventFilter } from "../types";

  interface Props {
    configOpen: boolean;
    reportOpen: boolean;
    filter: EventFilter | null;
  }

  let { configOpen = $bindable(), reportOpen = $bindable(), filter = $bindable() }: Props = $props();

  const appState = $derived(getState());
  const conflictCount = $derived(detectConflicts(appState).length);

  // "teacher:abc" ⇄ { kind, id }; "" means no filter
  const filterValue = $derived(filter ? `${filter.kind}:${filter.id}` : "");

  const filterLabel = $derived.by(() => {
    const f = filter;
    if (!f) return null;
    if (f.kind === 'teacher') return appState.teachers.find(t => t.id === f.id)?.name ?? null;
    if (f.kind === 'room') return appState.rooms.find(r => r.id === f.id)?.name ?? null;
    return appState.groups.find(g => g.id === f.id)?.label ?? null;
  });

  function applyFilter(raw: string): void {
    if (!raw) {
      filter = null;
      return;
    }
    const [kind, ...rest] = raw.split(':');
    filter = { kind: kind as EventFilter['kind'], id: rest.join(':') };
  }

  function shiftWeek(delta: number): void {
    // Parse as local date to avoid UTC-offset shifting the day
    const [y, m, day] = appState.wkStartDate.split('-').map(Number);
    const d = new Date(y!, m! - 1, day!);
    d.setDate(d.getDate() + delta * 7);
    setWkStartDate(formatDate(d));
  }

  // Ctrl+Z belongs to the focused field while text is being edited — taking it
  // for app-level undo there would revert the whole schedule instead of a typo.
  function isEditing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el?.tagName) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (isEditing(e.target)) return;
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if (e.key === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    }
    if (e.key === "y") {
      e.preventDefault();
      redo();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="navbar bg-base-100 min-h-12 px-3 gap-2">
  <div class="navbar-start gap-2 min-w-0 flex-1">
    <span class="badge badge-primary font-bold text-xs tracking-wider shrink-0">WK</span>

    <select
      class="select select-bordered select-sm text-xs max-w-44"
      value={filterValue}
      onchange={(e) => applyFilter((e.currentTarget as HTMLSelectElement).value)}
      title="Show only events involving…"
    >
      <option value="">All events</option>
      <optgroup label="Teachers">
        {#each appState.teachers as t (t.id)}
          <option value="teacher:{t.id}">{t.name}</option>
        {/each}
      </optgroup>
      <optgroup label="Rooms">
        {#each appState.rooms as r (r.id)}
          <option value="room:{r.id}">{r.name}</option>
        {/each}
      </optgroup>
      <optgroup label="Groups">
        {#each appState.groups.filter(g => g.enabled) as g (g.id)}
          <option value="group:{g.id}">{g.label}</option>
        {/each}
      </optgroup>
    </select>

    {#if filter && filterLabel}
      <button class="badge badge-warning gap-1 shrink-0" onclick={() => (filter = null)} title="Clear filter">
        {filterLabel} ✕
      </button>
    {/if}
  </div>

  <div class="navbar-center">
    <div class="flex items-center gap-1">
      <button class="btn btn-ghost btn-sm btn-square" onclick={() => shiftWeek(-1)} title="Previous week">‹</button>
      <label class="flex items-center gap-2">
        <span class="text-xs text-base-content/50 font-medium">Week</span>
        <input
          type="date"
          class="input input-bordered input-sm text-sm"
          value={appState.wkStartDate}
          onchange={(e) => setWkStartDate((e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <button class="btn btn-ghost btn-sm btn-square" onclick={() => shiftWeek(1)} title="Next week">›</button>
    </div>
  </div>

  <div class="navbar-end gap-1">
    <button
      class="btn btn-ghost btn-sm"
      disabled={!canUndo()}
      onclick={undo}
      title="Undo (Ctrl+Z)"
    >↩ Undo</button>
    <button
      class="btn btn-ghost btn-sm"
      disabled={!canRedo()}
      onclick={redo}
      title="Redo (Ctrl+Shift+Z)"
    >↪ Redo</button>

    {#if conflictCount > 0}
      <span class="badge badge-error gap-1">
        ⚠ {conflictCount} conflict{conflictCount !== 1 ? "s" : ""}
      </span>
    {/if}

    <button class="btn btn-ghost btn-sm" onclick={() => (reportOpen = true)} title="Coverage & teacher plans">
      ▤ Reports
    </button>
    <button class="btn btn-ghost btn-sm" onclick={() => window.print()} title="Print schedule">
      ⎙ Print
    </button>
    <button class="btn btn-primary btn-sm" onclick={() => (configOpen = true)}>
      ⚙ Config
    </button>
  </div>
</div>
