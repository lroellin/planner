<script lang="ts">
  import {
    getState, getConflicts, getOrphans, getAffectedEventCount, updateEvent,
  } from '../state/store.svelte';
  import { highlightEvents, clearHighlight, revealEvent } from '../state/ui.svelte';
  import { DAY_NAMES, eventGroupIds, addMinutesToTime } from '../utils/timeUtils';
  import Icon from './Icon.svelte';
  import { CONFLICT_KIND_LABELS, isHardConflict } from '../types';
  import type { CalendarEvent, ConflictKind, ID } from '../types';

  interface Props {
    selectedEventId: string | null;
  }

  let { selectedEventId = $bindable() }: Props = $props();

  const appState = $derived(getState());
  const conflicts = $derived(getConflicts());
  const orphans = $derived(getOrphans());

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

  const issueCount = $derived(conflicts.length + orphans.length);
  const affected = $derived(getAffectedEventCount());

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

  /**
   * Move a Lektion clear of the one before it.
   *
   * The panel was diagnosis-only: every row a fact plus "show me", with the
   * commonest resolution — push the later of the pair down until it no longer
   * overlaps — living two clicks away in a popover the panel does not open.
   * The nudge is quantised to the grid's own 15-minute slot, and the offer is
   * only made where it would actually help: on the *later* event of a pair, by
   * exactly the gap that clears it.
   */
  function clearingNudge(group: ConflictGroup, ev: CalendarEvent): number | null {
    // Availability clashes involve no second event — there is nothing to clear.
    if (group.kind === 'teacher-absent' || group.kind === 'room-blocked') return null;
    let needed = 0;
    for (const other of sortByTime(group.eventIds)) {
      if (other.id === ev.id) continue;
      if (other.dayIndex !== ev.dayIndex) continue;
      // Only the later of the pair moves: nudging the earlier one down pushes it
      // further into the other, which is the wrong direction.
      if (other.startTime > ev.startTime) continue;
      if (!(ev.startTime < other.endTime && other.startTime < ev.endTime)) continue;
      const minutes = minutesBetween(ev.startTime, other.endTime);
      if (minutes > needed) needed = minutes;
    }
    if (needed <= 0) return null;
    return Math.ceil(needed / 15) * 15;
  }

  function minutesBetween(from: string, to: string): number {
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    return (th! * 60 + tm!) - (fh! * 60 + fm!);
  }

  function nudge(ev: CalendarEvent, minutes: number): void {
    const subject = appState.subjects.find(s => s.id === ev.subjectId)?.name ?? 'Lektion';
    updateEvent(ev.id, {
      startTime: addMinutesToTime(ev.startTime, minutes),
      endTime: addMinutesToTime(ev.endTime, minutes),
    }, `${subject} verschieben`);
  }
</script>

<div class="panel">
  <header class="panel-head">
    <span class="wk-eyebrow flex-1">Konflikte</span>
    {#if issueCount > 0}
      <span class="head-count">{issueCount}</span>
    {/if}
  </header>

  {#if issueCount > 0}
    <!-- The headline number counts clash *relations*: one badly placed Lektion
         overlapping two others on an Ausbildner and a Raum raises four, and
         then appears under both an Ausbildner card and a Raum card. That is
         the right thing to group by and the wrong thing to hand someone as "how
         much is left", so the unit the work is actually done in is named too. -->
    <p class="scale">
      {issueCount === 1 ? 'ein Problem' : `${issueCount} Probleme`} ·
      <strong>{affected === 1 ? 'eine Lektion' : `${affected} Lektionen`}</strong> betroffen
    </p>
  {/if}

  {#if conflicts.length > 0}
    <div class="summary">
      {#if counts.teacher > 0}<span class="sum sum-hard">{counts.teacher}× Ausbildner</span>{/if}
      {#if counts.group > 0}<span class="sum sum-hard">{counts.group}× Gruppe</span>{/if}
      {#if counts.room > 0}<span class="sum sum-soft">{counts.room}× Raum</span>{/if}
      {#if counts.away > 0}<span class="sum sum-hard">{counts.away}× Abwesenheit</span>{/if}
    </div>
  {/if}

  <div class="panel-body">
    {#if orphans.length > 0}
      <!-- These fall outside every phase's days or lanes, so no calendar draws
           them — without this they would just disappear. -->
      <section class="card card-hard">
        <header class="card-head">
          <Icon name="alert" size={13} />
          <span class="card-title">Ausserhalb der Phasen</span>
          <span class="card-count">{orphans.length}</span>
        </header>
        <p class="card-note">
          {orphans.length === 1 ? 'Eine Lektion liegt' : 'Diese Lektionen liegen'} ausserhalb jeder
          Phase und wird nicht angezeigt. Eine öffnen, um sie zurückzuholen.
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
          <div class="all-clear-title">Keine Konflikte</div>
          <div class="all-clear-note">Niemand und nichts ist doppelt eingeteilt.</div>
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
          <span class="card-kind">{CONFLICT_KIND_LABELS[group.kind]}</span>
          <span class="card-title">{group.resourceName}</span>
          <span class="card-count">{group.clashes}×</span>
        </header>
        {#if group.details.length > 0}
          <p class="card-note">{group.details.join(' · ')}</p>
        {/if}
        <div class="rows">
          {#each sortByTime(group.eventIds) as ev (ev.id)}
            {@const subject = appState.subjects.find(s => s.id === ev.subjectId)}
            {@const shift = clearingNudge(group, ev)}
            <div
              class="row-wrap"
              role="group"
              onmouseenter={() => highlightEvents([ev.id])}
              onmouseleave={() => highlightEvents(group.eventIds)}
            >
              <button class="row" onclick={() => revealEvent(ev.id)} title="Im Kalender zeigen">
                <span class="row-dot" style="background:{subject?.color ?? '#888'}"></span>
                <span class="row-name">{subject?.name ?? '?'}</span>
                <span class="row-when wk-num">
                  {groupLabels(ev)} · {DAY_NAMES[ev.dayIndex] ?? ''} {ev.startTime}
                </span>
              </button>
              {#if shift !== null}
                <button
                  class="row-fix wk-num"
                  onclick={() => nudge(ev, shift)}
                  title="Auf {addMinutesToTime(ev.startTime, shift)} verschieben — dann überschneidet sie sich nicht mehr"
                >+{shift}′</button>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}

    {#if conflicts.length > 0}
      <p class="foot-note">
        Mit der Maus über eine Zeile fahren zeigt die Lektion im Kalender. «+15′» verschiebt die
        spätere Lektion so, dass sie sich nicht mehr überschneidet; ob dort etwas anderes liegt,
        meldet die Liste danach. Raumkonflikte sind nur ein Hinweis, alle anderen nicht.
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

  /* Sits above the per-kind chips: the scale of the job before its breakdown. */
  .scale {
    padding: 0.45rem 0.75rem 0;
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    flex-shrink: 0;
  }
  .scale strong { color: var(--wk-text-mute); font-weight: 700; }

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

  .row-wrap {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    border-radius: 4px;
    min-width: 0;
  }

  .row-wrap:hover {
    background: color-mix(in oklab, var(--color-base-content) 9%, transparent);
  }

  .row-wrap:hover .row { color: var(--wk-text); }

  /* The fix, offered where the fix is: move the later of the pair down by the
     gap that clears it, rounded to the grid's own 15-minute slot. */
  .row-fix {
    flex-shrink: 0;
    padding: 0.1rem 0.35rem;
    border: 1px solid var(--wk-line-strong);
    border-radius: 999px;
    background: var(--wk-surface);
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
    cursor: pointer;
    opacity: 0;
  }

  .row-wrap:hover .row-fix,
  .row-fix:focus-visible { opacity: 1; }

  .row-fix:hover {
    border-color: var(--color-success);
    color: var(--color-success);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
    padding: 0.18rem 0.25rem;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-2xs);
    text-align: left;
    cursor: pointer;
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
