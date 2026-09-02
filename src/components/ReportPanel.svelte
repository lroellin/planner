<script lang="ts">
  import { onMount } from 'svelte';
  import { getState } from '../state/store.svelte';
  import {
    buildCoverage, buildTeacherPlans, buildGroupPlans, buildRoomPlans,
    type ScheduleEntry,
  } from '../reports/reports';
  import { DAY_NAMES, dayDateLabel, formatDuration } from '../utils/timeUtils';
  import { teacherShort } from '../utils/format';
  import Icon from './Icon.svelte';
  import type { ID, ReportTab } from '../types';

  interface Props {
    tab?: ReportTab;
    onclose: () => void;
  }

  let { tab = 'coverage', onclose }: Props = $props();

  // The prop only seeds the initial tab; the panel owns it from then on.
  // svelte-ignore state_referenced_locally
  let activeTab: ReportTab = $state(tab);
  let teacherFilter: ID | 'all' = $state('all');

  const TABS: { key: ReportTab; label: string }[] = [
    { key: 'coverage', label: 'Coverage' },
    { key: 'groups', label: 'Group plans' },
    { key: 'teachers', label: 'Teacher plans' },
    { key: 'rooms', label: 'Room plans' },
  ];

  const TITLES: Record<ReportTab, string> = {
    coverage: 'Coverage — every group must attend every subject',
    groups: 'Group plans',
    teachers: 'Teacher plans',
    rooms: 'Room occupancy',
  };

  const appState = $derived(getState());
  const coverage = $derived(buildCoverage(appState));
  const totalMissing = $derived(coverage.reduce((n, s) => n + s.totalMissing, 0));
  const totalUneven = $derived(
    coverage.reduce((n, s) => n + s.rows.filter(r => r.uneven).length, 0),
  );
  const plans = $derived(buildTeacherPlans(appState));
  const shownPlans = $derived(
    teacherFilter === 'all' ? plans : plans.filter(p => p.teacher.id === teacherFilter),
  );
  const groupPlans = $derived(buildGroupPlans(appState));
  const roomPlans = $derived(buildRoomPlans(appState));

  const groupLabel = (id: ID): string => appState.groups.find(g => g.id === id)?.label ?? '?';

  function when(dayIndex: number, startTime: string, endTime: string): string {
    return `${DAY_NAMES[dayIndex] ?? ''} ${dayDateLabel(appState.wkStartDate, dayIndex)} ${startTime}–${endTime}`;
  }

  /** Plans read as a week, so entries are shown under their day. */
  function byDay(entries: ScheduleEntry[]): { dayIndex: number; entries: ScheduleEntry[] }[] {
    const days = new Map<number, ScheduleEntry[]>();
    for (const e of entries) {
      if (!days.has(e.dayIndex)) days.set(e.dayIndex, []);
      days.get(e.dayIndex)!.push(e);
    }
    return [...days.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([dayIndex, list]) => ({ dayIndex, entries: list }));
  }

  // Print rules key off the body class so the calendar behind can be hidden.
  onMount(() => {
    document.body.classList.add('wk-report-open');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onclose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('wk-report-open');
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="report-overlay">
  <div class="report-sheet">

    <div class="report-chrome shrink-0">
      <div class="sheet-head">
        <h3 class="sheet-title">Reports</h3>
        <button class="sheet-x" onclick={onclose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="sheet-tabs">
        <div role="tablist" class="tabs-row">
          {#each TABS as t (t.key)}
            <button
              role="tab"
              class="tab-btn"
              class:tab-btn-on={activeTab === t.key}
              aria-selected={activeTab === t.key}
              onclick={() => (activeTab = t.key)}
            >{t.label}</button>
          {/each}
        </div>
        {#if activeTab === 'teachers'}
          <select class="select select-bordered select-sm w-48" bind:value={teacherFilter}>
            <option value="all">All teachers</option>
            {#each appState.teachers as t (t.id)}
              <option value={t.id}>{t.name}</option>
            {/each}
          </select>
        {/if}
        <button class="print-btn" onclick={() => window.print()}>
          <Icon name="printer" size={14} /> Print
        </button>
      </div>
    </div>

    <div class="report-body">
      <div class="print-title">{TITLES[activeTab]} — {appState.name}</div>

      <!-- ══ COVERAGE ═══════════════════════════════════════════════════════ -->
      {#if activeTab === 'coverage'}
        {#if totalMissing === 0 && totalUneven === 0}
          <div class="banner banner-ok">
            <Icon name="check" size={15} />
            Every active group has each subject placed the same number of times.
          </div>
        {:else}
          <div class="banner banner-warn">
            <Icon name="alert" size={15} />
            {#if totalMissing > 0}
              {totalMissing} group/subject combination{totalMissing === 1 ? '' : 's'} still unplanned.
            {/if}
            {#if totalUneven > 0}
              {totalUneven} subject{totalUneven === 1 ? ' is' : 's are'} placed unevenly across the lanes.
            {/if}
          </div>
        {/if}

        {#each coverage as section (section.phase.id)}
          <div class="section-head wk-eyebrow">{section.phase.label}</div>

          {#if section.rows.length === 0 || section.groupIds.length === 0}
            <p class="empty-note">No subjects planned in this phase yet.</p>
          {:else}
            <table class="cov-table">
              <thead>
                <tr>
                  <th class="cov-subject-head">Subject</th>
                  {#each section.groupIds as gid (gid)}
                    <th>{groupLabel(gid)}</th>
                  {/each}
                  <th class="cov-status-head">Status</th>
                </tr>
              </thead>
              <tbody>
                {#each section.rows as row (row.subject.id)}
                  <tr>
                    <td class="cov-subject">
                      <span class="dot" style="background:{row.subject.color}"></span>
                      {row.subject.name}
                    </td>
                    {#each section.groupIds as gid (gid)}
                      {@const n = row.counts.get(gid) ?? 0}
                      <td class="cov-cell" class:cov-missing={n === 0}>
                        {n === 0 ? '—' : n}
                      </td>
                    {/each}
                    <td class="cov-status">
                      {#if row.missing > 0}
                        <span class="pill pill-warn">{row.missing} missing</span>
                      {:else if row.uneven}
                        <span class="pill pill-note">uneven</span>
                      {:else}
                        <span class="pill pill-ok">complete</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        {/each}

        <p class="foot-note">
          Each cell counts placed instances of that subject for that group, within its
          phase. Breaks are excluded.
        </p>

      <!-- ══ GROUP PLANS ════════════════════════════════════════════════════ -->
      {:else if activeTab === 'groups'}
        {#each groupPlans as plan (plan.group.id)}
          <section class="plan">
            <header class="plan-head">
              <span class="plan-badge">{plan.group.label}</span>
              <div class="min-w-0">
                <div class="plan-name">Group {plan.group.label}</div>
                <div class="plan-summary">
                  {plan.lessonCount} lesson{plan.lessonCount === 1 ? '' : 's'}
                  · {formatDuration(plan.lessonMinutes)} of instruction
                </div>
              </div>
            </header>

            {#if plan.entries.length === 0}
              <p class="plan-empty">Nothing scheduled.</p>
            {:else}
              {#each byDay(plan.entries) as day (day.dayIndex)}
                <div class="day-block">
                  <div class="day-head">
                    {DAY_NAMES[day.dayIndex]} {dayDateLabel(appState.wkStartDate, day.dayIndex)}
                  </div>
                  <ul class="rows">
                    {#each day.entries as e (e.eventId)}
                      <li class="row" class:row-break={e.subject.isBreak}>
                        <span class="cell-time wk-num">{e.startTime}–{e.endTime}</span>
                        <span class="cell-subject">
                          <span class="dot" style="background:{e.subject.color}"></span>
                          {e.subject.name}
                        </span>
                        <span class="cell-people">{e.teachers.map(t => t.name).join(', ')}</span>
                        <span class="cell-room">{e.roomName ?? '—'}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/each}
            {/if}
          </section>
        {:else}
          <p class="empty-note">No active groups.</p>
        {/each}

      <!-- ══ TEACHER PLANS ══════════════════════════════════════════════════ -->
      {:else if activeTab === 'teachers'}
        {#if shownPlans.length === 0}
          <p class="empty-note">No teachers configured yet.</p>
        {/if}

        {#each shownPlans as plan (plan.teacher.id)}
          <section class="plan">
            <header class="plan-head">
              <span class="plan-avatar" style="background:{plan.teacher.color}">
                {teacherShort(plan.teacher)}
              </span>
              <div class="min-w-0">
                <div class="plan-name">{plan.teacher.name}</div>
                <div class="plan-summary">
                  {plan.teachingCount + plan.coveringCount} lesson{plan.teachingCount + plan.coveringCount === 1 ? '' : 's'}
                  · {formatDuration(plan.totalMinutes)}
                  {#if plan.coveringCount > 0}· {plan.coveringCount} as stand-in{/if}
                  {#if plan.handedOverCount > 0}· {plan.handedOverCount} handed over{/if}
                </div>
              </div>
            </header>

            {#if plan.blocks.length === 0}
              <p class="plan-empty">Nothing scheduled.</p>
            {:else}
              {#each plan.blocks as block (block.subject.id)}
                <div class="day-block">
                  <div class="day-head">
                    <span class="dot" style="background:{block.subject.color}"></span>
                    {block.subject.name}
                  </div>
                  <ul class="rows">
                    {#each block.entries as e (e.eventId)}
                      <li class="row" class:row-dropped={e.status === 'handed-over'}>
                        <span class="cell-time wk-num">{when(e.dayIndex, e.startTime, e.endTime)}</span>
                        <span class="cell-subject">{e.groupLabels.join(', ') || '—'}</span>
                        <span class="cell-people">{e.roomName ?? '—'}</span>
                        <span class="cell-note">
                          {#if e.status === 'handed-over'}
                            taken by {e.counterparts.map(t => t.name).join(', ') || 'someone else'}
                          {:else if e.status === 'covering'}
                            taken over from {e.counterparts.map(t => t.name).join(', ') || 'default'}
                          {/if}
                        </span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/each}
            {/if}
          </section>
        {/each}

      <!-- ══ ROOM PLANS ═════════════════════════════════════════════════════ -->
      {:else}
        {#each roomPlans as plan (plan.room.id)}
          <section class="plan">
            <header class="plan-head">
              <span class="plan-swatch" style="background:{plan.room.color}"></span>
              <div class="min-w-0">
                <div class="plan-name">{plan.room.name}</div>
                <div class="plan-summary">
                  {plan.entries.length} booking{plan.entries.length === 1 ? '' : 's'}
                  · {formatDuration(plan.bookedMinutes)}
                  {#if plan.room.excludeFromConflictCheck}· shared space, clashes ignored{/if}
                </div>
              </div>
            </header>

            {#if plan.entries.length === 0}
              <p class="plan-empty">Never booked.</p>
            {:else}
              {#each byDay(plan.entries) as day (day.dayIndex)}
                <div class="day-block">
                  <div class="day-head">
                    {DAY_NAMES[day.dayIndex]} {dayDateLabel(appState.wkStartDate, day.dayIndex)}
                  </div>
                  <ul class="rows">
                    {#each day.entries as e (e.eventId)}
                      <li class="row">
                        <span class="cell-time wk-num">{e.startTime}–{e.endTime}</span>
                        <span class="cell-subject">
                          <span class="dot" style="background:{e.subject.color}"></span>
                          {e.subject.name}
                        </span>
                        <span class="cell-people">{e.groupLabels.join(', ') || '—'}</span>
                        <span class="cell-room">{e.teachers.map(t => t.name).join(', ')}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/each}
            {/if}
          </section>
        {:else}
          <p class="empty-note">No rooms configured yet.</p>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .report-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in oklab, black 45%, transparent);
  }

  .report-sheet {
    display: flex;
    flex-direction: column;
    width: min(1080px, 94vw);
    /* Fixed, not content-sized: switching tabs used to resize the sheet and
       move the tab strip out from under the cursor. */
    height: 86vh;
    background: var(--wk-surface);
    color: var(--wk-text);
    border-radius: var(--wk-r-md);
    overflow: hidden;
    box-shadow: var(--wk-shadow-2);
  }

  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--wk-line);
  }

  .sheet-title {
    font-size: var(--wk-fs-lg);
    font-weight: 700;
    margin: 0;
  }

  .sheet-x {
    display: flex;
    padding: 0.3rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .sheet-x:hover { background: var(--wk-surface-alt); color: var(--wk-text); }

  .sheet-tabs {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0 1.25rem;
    border-bottom: 1px solid var(--wk-line);
  }

  .tabs-row {
    display: flex;
    gap: 0.15rem;
    flex: 1;
  }

  .tab-btn {
    padding: 0.6rem 0.7rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-sm);
    font-weight: 550;
    cursor: pointer;
  }
  .tab-btn:hover { color: var(--wk-text); }
  .tab-btn-on {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
    font-weight: 650;
  }

  .print-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.55rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-sm);
    cursor: pointer;
  }
  .print-btn:hover { background: var(--wk-surface-alt); color: var(--wk-text); }

  .report-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1.25rem 1.75rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .print-title {
    display: none;
    font-size: var(--wk-fs-lg);
    font-weight: 700;
  }

  .empty-note,
  .foot-note,
  .plan-empty {
    color: var(--wk-text-faint);
    font-size: var(--wk-fs-xs);
  }

  .banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0.85rem;
    border-radius: var(--wk-r-sm);
    font-size: var(--wk-fs-sm);
    font-weight: 600;
  }
  .banner-ok {
    color: var(--color-success);
    background: color-mix(in oklab, var(--color-success) 11%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-success) 35%, transparent);
  }
  .banner-warn {
    color: color-mix(in oklab, var(--color-warning) 78%, var(--wk-text));
    background: color-mix(in oklab, var(--color-warning) 13%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-warning) 38%, transparent);
  }

  .section-head {
    margin: 0.9rem 0 0.1rem;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex-shrink: 0;
    display: inline-block;
  }

  /* ── Coverage table ─────────────────────────────────────────────────────── */
  .cov-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--wk-fs-sm);
  }

  .cov-table th {
    text-align: center;
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--wk-text-faint);
    padding: 0.45rem 0.4rem;
    border-bottom: 1px solid var(--wk-line);
  }

  .cov-subject-head { text-align: left; padding-left: 0.2rem; }
  .cov-status-head { text-align: right; }

  .cov-table td {
    padding: 0.45rem 0.4rem;
    border-bottom: 1px solid var(--wk-line-faint);
  }

  .cov-subject {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }

  .cov-cell {
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .cov-missing {
    color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text));
    background: color-mix(in oklab, var(--color-warning) 12%, transparent);
  }

  .cov-status { text-align: right; }

  .pill {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: var(--wk-fs-2xs);
    font-weight: 700;
  }
  .pill-ok {
    color: var(--color-success);
    background: color-mix(in oklab, var(--color-success) 15%, transparent);
  }
  .pill-warn {
    color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text));
    background: color-mix(in oklab, var(--color-warning) 16%, transparent);
  }
  .pill-note {
    color: var(--wk-text-mute);
    background: color-mix(in oklab, var(--color-base-content) 9%, transparent);
  }

  /* ── Plans (groups, teachers, rooms share the shape) ────────────────────── */
  .plan {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding-bottom: 1.1rem;
    border-bottom: 1px solid var(--wk-line);
  }

  .plan-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .plan-avatar,
  .plan-badge {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--wk-fs-xs);
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    flex-shrink: 0;
  }

  .plan-badge {
    background: var(--color-primary);
    color: var(--color-primary-content);
    text-shadow: none;
  }

  .plan-swatch {
    width: 38px;
    height: 38px;
    border-radius: var(--wk-r-sm);
    flex-shrink: 0;
  }

  .plan-name { font-size: var(--wk-fs-lg); font-weight: 700; }
  .plan-summary { font-size: var(--wk-fs-xs); color: var(--wk-text-faint); }
  .plan-empty { padding-left: 3.2rem; }

  .day-block { padding-left: 3.2rem; }

  .day-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: var(--wk-fs-sm);
    font-weight: 650;
    padding-bottom: 0.25rem;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .row {
    display: grid;
    /* minmax(0, …) throughout: with fixed rem tracks the columns overflowed each
       other on a narrower page, and "Planungsarbeit" printed on top of the
       teacher's name. */
    grid-template-columns: minmax(7rem, 11rem) minmax(0, 1.5fr) minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 0.5rem 0.75rem;
    align-items: baseline;
    padding: 0.24rem 0.4rem;
    font-size: var(--wk-fs-sm);
    border-radius: 4px;
  }

  .row > * {
    min-width: 0;
    overflow-wrap: break-word;
  }

  .row:nth-child(odd) {
    background: color-mix(in oklab, var(--color-base-content) 3%, transparent);
  }

  .row-break {
    color: var(--wk-text-faint);
    font-style: italic;
  }

  .cell-time { font-weight: 500; }
  .cell-subject { display: flex; align-items: center; gap: 0.45rem; min-width: 0; }
  .cell-people,
  .cell-room { color: var(--wk-text-mute); }
  .cell-note { font-size: var(--wk-fs-2xs); color: var(--wk-text-faint); font-style: italic; }

  /* A handed-over instance stays listed so the teacher can see it is no longer
     theirs, rather than silently vanishing from their plan. */
  .row-dropped .cell-time,
  .row-dropped .cell-subject,
  .row-dropped .cell-people {
    text-decoration: line-through;
    opacity: 0.45;
  }
  .row-dropped .cell-note {
    color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text));
    font-style: normal;
    font-weight: 600;
  }

  /* ── Print: one plan per page, no app chrome ───────────────────────────── */
  @media print {
    :global(body.wk-report-open .app-layout) { display: none !important; }

    .report-overlay {
      position: static;
      display: block;
      background: none;
    }

    .report-sheet {
      width: 100%;
      max-width: none;
      height: auto;
      border-radius: 0;
      box-shadow: none;
      overflow: visible;
    }

    .report-chrome { display: none !important; }

    .report-body {
      overflow: visible;
      padding: 0;
      gap: 0.9rem;
    }

    .print-title { display: block; }

    .plan {
      break-inside: avoid;
      break-after: page;
      border-bottom: none;
    }

    .plan:last-child { break-after: auto; }

    .row:nth-child(odd) { background: none; }

    .row {
      font-size: 11px;
      gap: 0.4rem 0.5rem;
      grid-template-columns: minmax(5.5rem, 8rem) minmax(0, 1.5fr) minmax(0, 1.2fr) minmax(0, 1fr);
    }

    .day-block,
    .plan-empty { padding-left: 2.4rem; }
  }
</style>
