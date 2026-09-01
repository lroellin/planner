<script lang="ts">
  import { onMount } from 'svelte';
  import { getState } from '../state/store.svelte';
  import { buildCoverage, buildTeacherPlans } from '../reports/reports';
  import { DAY_NAMES, dayDateLabel, formatDuration } from '../utils/timeUtils';
  import type { ID } from '../types';

  interface Props { onclose: () => void; }
  let { onclose }: Props = $props();

  type Tab = 'coverage' | 'teachers';
  let activeTab: Tab = $state('coverage');
  let teacherFilter: ID | 'all' = $state('all');

  const appState = $derived(getState());
  const coverage = $derived(buildCoverage(appState));
  const totalMissing = $derived(coverage.reduce((n, s) => n + s.totalMissing, 0));
  const plans = $derived(buildTeacherPlans(appState));
  const shownPlans = $derived(
    teacherFilter === 'all' ? plans : plans.filter(p => p.teacher.id === teacherFilter),
  );

  const groupLabel = (id: ID): string => appState.groups.find(g => g.id === id)?.label ?? '?';

  function when(dayIndex: number, startTime: string, endTime: string): string {
    return `${DAY_NAMES[dayIndex] ?? ''} ${dayDateLabel(appState.wkStartDate, dayIndex)} ${startTime}–${endTime}`;
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

    <div class="report-chrome flex items-center gap-3 px-6 py-3.5 border-b border-base-200 shrink-0">
      <h3 class="text-lg font-bold">Reports</h3>

      <div role="tablist" class="tabs tabs-boxed tabs-sm ml-2">
        <button role="tab" class="tab" class:tab-active={activeTab === 'coverage'}
          onclick={() => (activeTab = 'coverage')}>Coverage</button>
        <button role="tab" class="tab" class:tab-active={activeTab === 'teachers'}
          onclick={() => (activeTab = 'teachers')}>Teacher plans</button>
      </div>

      <div class="flex-1"></div>

      {#if activeTab === 'teachers'}
        <select class="select select-bordered select-sm w-52" bind:value={teacherFilter}>
          <option value="all">All teachers</option>
          {#each appState.teachers as t (t.id)}
            <option value={t.id}>{t.name}</option>
          {/each}
        </select>
      {/if}

      <button class="btn btn-sm btn-primary" onclick={() => window.print()}>⎙ Print</button>
      <button class="btn btn-ghost btn-sm btn-circle opacity-50 hover:opacity-100" onclick={onclose}>✕</button>
    </div>

    <div class="report-body">
      {#if activeTab === 'coverage'}
        <div class="print-title">Coverage — every group must attend every subject</div>

        {#if totalMissing === 0}
          <div class="banner banner-ok">
            ✓ Every active group has each subject placed at least once.
          </div>
        {:else}
          <div class="banner banner-warn">
            {totalMissing} group/subject combination{totalMissing === 1 ? '' : 's'} still unplanned.
          </div>
        {/if}

        {#each coverage as section (section.phase.id)}
          <div class="cov-phase-head">{section.phase.label}</div>

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
                      <span class="cov-dot" style="background:{row.subject.color}"></span>
                      {row.subject.name}
                    </td>
                    {#each section.groupIds as gid (gid)}
                      {@const n = row.counts.get(gid) ?? 0}
                      <td class="cov-cell" class:cov-missing={n === 0}>
                        {n === 0 ? '—' : n}
                      </td>
                    {/each}
                    <td class="cov-status">
                      {#if row.missing === 0}
                        <span class="pill pill-ok">complete</span>
                      {:else}
                        <span class="pill pill-warn">{row.missing} missing</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        {/each}

        <p class="cov-legend">
          Each cell counts placed instances of that subject for that group, within its phase. Breaks are excluded.
        </p>

      {:else}
        {#if shownPlans.length === 0}
          <p class="empty-note">No teachers configured yet.</p>
        {/if}

        {#each shownPlans as plan (plan.teacher.id)}
          <section class="plan">
            <header class="plan-head">
              <span class="plan-avatar" style="background:{plan.teacher.color}">
                {plan.teacher.shortName || plan.teacher.name.slice(0, 2).toUpperCase()}
              </span>
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="plan-name">{plan.teacher.name}</span>
                <span class="plan-summary">
                  {plan.teachingCount + plan.coveringCount} lesson{plan.teachingCount + plan.coveringCount === 1 ? '' : 's'}
                  · {formatDuration(plan.totalMinutes)}
                  {#if plan.coveringCount > 0}· {plan.coveringCount} as stand-in{/if}
                  {#if plan.handedOverCount > 0}· {plan.handedOverCount} handed over{/if}
                </span>
              </div>
            </header>

            {#if plan.blocks.length === 0}
              <p class="plan-empty">Nothing scheduled.</p>
            {:else}
              {#each plan.blocks as block (block.subject.id)}
                <div class="plan-subject">
                  <div class="plan-subject-head">
                    <span class="cov-dot" style="background:{block.subject.color}"></span>
                    {block.subject.name}
                  </div>
                  <ul class="plan-list">
                    {#each block.entries as e (e.eventId)}
                      <li class="plan-entry" class:entry-dropped={e.status === 'handed-over'}>
                        <span class="entry-when">{when(e.dayIndex, e.startTime, e.endTime)}</span>
                        <span class="entry-groups">{e.groupLabels.join(', ') || '—'}</span>
                        <span class="entry-room">{e.roomName ?? '—'}</span>
                        <span class="entry-note">
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
    background: rgba(0, 0, 0, 0.45);
  }

  .report-sheet {
    display: flex;
    flex-direction: column;
    width: min(1080px, 94vw);
    min-height: 460px;
    max-height: 90vh;
    background: var(--wk-surface);
    color: var(--wk-text);
    border-radius: 1rem;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  }

  .report-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1.5rem 2rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .print-title {
    display: none;
    font-size: 1.05rem;
    font-weight: 700;
  }

  .empty-note {
    color: var(--wk-text-faint);
    font-size: 0.85rem;
  }

  .banner {
    padding: 0.7rem 0.9rem;
    border-radius: 0.6rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .banner-ok {
    color: var(--color-success);
    background: color-mix(in oklab, var(--color-success) 12%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-success) 40%, transparent);
  }
  .banner-warn {
    color: var(--color-warning);
    background: color-mix(in oklab, var(--color-warning) 12%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-warning) 40%, transparent);
  }

  /* ── Coverage table ────────────────────────────────────────────────────────── */
  .cov-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .cov-table th {
    text-align: center;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--wk-text-faint);
    padding: 0.5rem 0.4rem;
    border-bottom: 1px solid var(--wk-line);
  }

  .cov-subject-head { text-align: left; padding-left: 0.2rem; }
  .cov-status-head { text-align: right; }

  .cov-phase-head {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--wk-text-faint);
    margin: 1.4rem 0 0.3rem;
  }

  .cov-table td {
    padding: 0.5rem 0.4rem;
    border-bottom: 1px solid var(--wk-line-faint);
  }

  .cov-subject {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }

  .cov-dot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex-shrink: 0;
    display: inline-block;
  }

  .cov-cell {
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .cov-missing {
    color: var(--color-warning);
    background: color-mix(in oklab, var(--color-warning) 10%, transparent);
  }

  .cov-status { text-align: right; }

  .pill {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 700;
  }
  .pill-ok {
    color: var(--color-success);
    background: color-mix(in oklab, var(--color-success) 15%, transparent);
  }
  .pill-warn {
    color: var(--color-warning);
    background: color-mix(in oklab, var(--color-warning) 15%, transparent);
  }

  .cov-legend {
    font-size: 0.72rem;
    color: var(--wk-text-faint);
  }

  /* ── Teacher plans ─────────────────────────────────────────────────────────── */
  .plan {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--wk-line);
  }

  .plan-head {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .plan-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    flex-shrink: 0;
  }

  .plan-name { font-size: 1rem; font-weight: 700; }
  .plan-summary { font-size: 0.75rem; color: var(--wk-text-faint); }
  .plan-empty { font-size: 0.8rem; color: var(--wk-text-faint); padding-left: 3.3rem; }

  .plan-subject { padding-left: 3.3rem; }

  .plan-subject-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    padding-bottom: 0.3rem;
  }

  .plan-list {
    list-style: none;
    margin: 0;
    padding: 0 0 0 1.1rem;
    display: flex;
    flex-direction: column;
  }

  .plan-entry {
    display: grid;
    grid-template-columns: 13rem 5rem 1fr 14rem;
    gap: 0.75rem;
    align-items: baseline;
    padding: 0.28rem 0.4rem;
    font-size: 0.8rem;
    border-radius: 4px;
  }

  .plan-entry:nth-child(odd) {
    background: color-mix(in oklab, var(--color-base-content) 3%, transparent);
  }

  .entry-when { font-variant-numeric: tabular-nums; font-weight: 500; }
  .entry-groups { color: var(--wk-text-mute); }
  .entry-room { color: var(--wk-text-mute); }
  .entry-note { font-size: 0.72rem; color: var(--wk-text-faint); font-style: italic; }

  /* A handed-over instance stays listed so the teacher can see it is no longer
     theirs, rather than silently vanishing from their plan. */
  .entry-dropped .entry-when,
  .entry-dropped .entry-groups,
  .entry-dropped .entry-room {
    text-decoration: line-through;
    opacity: 0.45;
  }
  .entry-dropped .entry-note {
    color: var(--color-warning);
    font-style: normal;
    font-weight: 600;
  }

  /* ── Print: one teacher per page, no app chrome ────────────────────────────── */
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
      min-height: 0;
      max-height: none;
      border-radius: 0;
      box-shadow: none;
      overflow: visible;
    }

    .report-chrome { display: none !important; }

    .report-body {
      overflow: visible;
      padding: 0;
      gap: 1rem;
    }

    .print-title { display: block; }

    .plan {
      break-inside: avoid;
      break-after: page;
      border-bottom: none;
    }

    .plan:last-child { break-after: auto; }

    .plan-entry:nth-child(odd) { background: none; }
  }
</style>
