<script lang="ts">
  import { getState, getConflicts, getOrphans } from '../state/store.svelte';
  import { highlightEvents, clearHighlight, revealEvent } from '../state/ui.svelte';
  import { DAY_NAMES, eventGroupIds } from '../utils/timeUtils';
  import Icon from './Icon.svelte';
  import { isHardConflict } from '../types';
  import type { CalendarEvent, ConflictKind, ID } from '../types';

  interface Props {
    selectedEventId: string | null;
  }

  let { selectedEventId = $bindable() }: Props = $props();

  const appState = $derived(getState());
  const conflicts = $derived(getConflicts());
  const orphans = $derived(getOrphans());

  const KIND_LABEL: Record<ConflictKind, string> = {
    teacher: 'Teacher',
    room: 'Room',
    group: 'Group',
    'teacher-absent': 'Away',
    'room-blocked': 'Blocked',
  };

  interface ConflictGroup {
    key: string;
    kind: ConflictKind;
    resourceName: string;
    hard: boolean;
    clashes: number;
    eventIds: ID[];
    /** For availability cards: which window was booked into. */
    details: string[];
  }

  /**
   * One card per resource, not per pair. Three overlapping lessons produce three
   * reports naming the same teacher; the panel used to print that teacher's name
   * three times and push everything else off-screen.
   */
  const groups = $derived.by(() => {
    const byResource = new Map<string, ConflictGroup>();
    for (const report of conflicts) {
      const key = `${report.kind}:${report.resourceId}`;
      let group = byResource.get(key);
      if (!group) {
        group = {
          key,
          kind: report.kind,
          resourceName: report.resourceName,
          hard: isHardConflict(report.kind),
          clashes: 0,
          eventIds: [],
          details: [],
        };
        byResource.set(key, group);
      }
      group.clashes++;
      if (report.detail && !group.details.includes(report.detail)) {
        group.details.push(report.detail);
      }
      for (const id of report.involvedEventIds) {
        if (!group.eventIds.includes(id)) group.eventIds.push(id);
      }
    }
    // Hard problems first, then the resource with the most clashes.
    return [...byResource.values()].sort(
      (a, b) => Number(b.hard) - Number(a.hard) || b.clashes - a.clashes,
    );
  });

  const counts = $derived({
    teacher: conflicts.filter(c => c.kind === 'teacher').length,
    group: conflicts.filter(c => c.kind === 'group').length,
    room: conflicts.filter(c => c.kind === 'room').length,
    away: conflicts.filter(c => c.kind === 'teacher-absent' || c.kind === 'room-blocked').length,
  });

  function eventById(id: ID): CalendarEvent | undefined {
    return appState.events.find(ev => ev.id === id);
  }

  function groupLabels(ev: CalendarEvent): string {
    const labels = eventGroupIds(appState, ev)
      .map(id => appState.groups.find(g => g.id === id)?.label)
      .filter(Boolean);
    return labels.length > 0 ? labels.join(', ') : '—';
  }

  function sortByTime(ids: ID[]): CalendarEvent[] {
    return ids
      .map(eventById)
      .filter((ev): ev is CalendarEvent => ev !== undefined)
      .sort((a, b) => a.dayIndex - b.dayIndex || a.startTime.localeCompare(b.startTime));
  }
</script>

<div class="panel">
  <header class="panel-head">
    <span class="wk-eyebrow flex-1">Conflicts</span>
    {#if conflicts.length + orphans.length > 0}
      <span class="head-count">{conflicts.length + orphans.length}</span>
    {/if}
  </header>

  {#if conflicts.length > 0}
    <div class="summary">
      {#if counts.teacher > 0}<span class="sum sum-hard">{counts.teacher} teacher</span>{/if}
      {#if counts.group > 0}<span class="sum sum-hard">{counts.group} group</span>{/if}
      {#if counts.room > 0}<span class="sum sum-soft">{counts.room} room</span>{/if}
      {#if counts.away > 0}<span class="sum sum-hard">{counts.away} unavailable</span>{/if}
    </div>
  {/if}

  <div class="panel-body">
    {#if orphans.length > 0}
      <!-- These fall outside every phase's days or lanes, so no calendar draws
           them — without this they would just disappear. -->
      <section class="card card-hard">
        <header class="card-head">
          <Icon name="alert" size={13} />
          <span class="card-title">Not on any calendar</span>
          <span class="card-count">{orphans.length}</span>
        </header>
        <p class="card-note">
          {orphans.length === 1 ? 'One event sits' : 'These events sit'} outside every phase. Open
          one to move it back.
        </p>
        <div class="rows">
          {#each orphans as ev (ev.id)}
            {@const subject = appState.subjects.find(s => s.id === ev.subjectId)}
            <button class="row" onclick={() => (selectedEventId = ev.id)}>
              <span class="row-dot" style="background:{subject?.color ?? '#888'}"></span>
              <span class="row-name">{subject?.name ?? '?'}</span>
              <span class="row-when wk-num">
                {groupLabels(ev)} · {DAY_NAMES[ev.dayIndex] ?? ''} {ev.startTime}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if conflicts.length === 0 && orphans.length === 0}
      <div class="all-clear">
        <Icon name="check" size={15} />
        <div>
          <div class="all-clear-title">No conflicts</div>
          <div class="all-clear-note">No group, teacher or room is double-booked.</div>
        </div>
      </div>
    {/if}

    {#each groups as group (group.key)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <section
        class="card"
        class:card-hard={group.hard}
        class:card-soft={!group.hard}
        onmouseenter={() => highlightEvents(group.eventIds)}
        onmouseleave={clearHighlight}
      >
        <header class="card-head">
          <span class="card-kind">{KIND_LABEL[group.kind]}</span>
          <span class="card-title">{group.resourceName}</span>
          <span class="card-count">{group.clashes}×</span>
        </header>
        {#if group.details.length > 0}
          <p class="card-note">{group.details.join(' · ')}</p>
        {/if}
        <div class="rows">
          {#each sortByTime(group.eventIds) as ev (ev.id)}
            {@const subject = appState.subjects.find(s => s.id === ev.subjectId)}
            <button
              class="row"
              onmouseenter={() => highlightEvents([ev.id])}
              onmouseleave={() => highlightEvents(group.eventIds)}
              onclick={() => revealEvent(ev.id)}
              title="Show this on the grid"
            >
              <span class="row-dot" style="background:{subject?.color ?? '#888'}"></span>
              <span class="row-name">{subject?.name ?? '?'}</span>
              <span class="row-when wk-num">
                {groupLabels(ev)} · {DAY_NAMES[ev.dayIndex] ?? ''} {ev.startTime}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {/each}

    {#if conflicts.length > 0}
      <p class="foot-note">
        Hover a card to find it on the grid. Room clashes are advisory; teacher, group
        and "away" clashes are not.
      </p>
    {/if}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .panel-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .head-count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 19px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--color-error);
    color: var(--color-error-content);
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.5rem 0.75rem 0;
    flex-shrink: 0;
  }

  .sum {
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
  }
  .sum-hard {
    background: color-mix(in oklab, var(--color-error) 13%, transparent);
    color: var(--color-error);
  }
  .sum-soft {
    background: color-mix(in oklab, var(--color-warning) 16%, transparent);
    color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text));
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.6rem 0.7rem 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* ── Conflict cards ─────────────────────────────────────────────────────── */
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    border-left: 3px solid transparent;
    border-radius: 0 var(--wk-r-sm) var(--wk-r-sm) 0;
    padding: 0.45rem 0.5rem 0.5rem;
    transition: background 0.12s;
  }

  .card-hard {
    border-left-color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 9%, transparent);
  }

  .card-soft {
    border-left-color: var(--color-warning);
    background: color-mix(in oklab, var(--color-warning) 11%, transparent);
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .card-kind {
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.75;
  }
  .card-hard .card-kind { color: var(--color-error); }
  .card-soft .card-kind { color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text)); }

  .card-title {
    flex: 1;
    min-width: 0;
    font-size: var(--wk-fs-xs);
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-count {
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--wk-text-faint);
  }

  .card-note {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-mute);
    line-height: 1.45;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    padding: 0.18rem 0.25rem;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-2xs);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }

  .row:hover {
    background: color-mix(in oklab, var(--color-base-content) 9%, transparent);
    color: var(--wk-text);
  }

  .row-dot {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .row-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-when {
    flex-shrink: 0;
    opacity: 0.75;
    white-space: nowrap;
  }

  /* ── All clear ──────────────────────────────────────────────────────────── */
  .all-clear {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.7rem 0.75rem;
    border-radius: var(--wk-r-sm);
    border: 1px solid color-mix(in oklab, var(--color-success) 35%, transparent);
    background: color-mix(in oklab, var(--color-success) 10%, transparent);
    color: var(--color-success);
  }

  .all-clear-title {
    font-size: var(--wk-fs-sm);
    font-weight: 650;
  }

  .all-clear-note {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
  }

  .foot-note {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    line-height: 1.5;
    padding: 0.2rem 0.2rem 0;
  }
</style>
