<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { getState } from '../state/store.svelte';
  import {
    buildCoverage, buildTeacherPlans, buildGroupPlans, buildRoomPlans, coverageStatus as status,
    type ScheduleEntry,
  } from '../reports/reports';
  import { DAY_NAMES, dayDateLabel, formatDuration } from '../utils/timeUtils';
  import { teacherShort } from '../utils/format';
  import { getContrastColor } from '../utils/colorUtils';
  import { requestPlacement } from '../state/ui.svelte';
  import Icon from './Icon.svelte';
  import type { ID, ReportTab } from '../types';
  import type { PlanTarget } from '../print/boxes';

  interface Props {
    tab?: ReportTab;
    /**
     * Preselects the tab's own dropdown. The Ausbildner pane in Konfiguration
     * counts a Pensum and now hands off to the plan that lists it — arriving on
     * "alle Ausbildner" would drop the half of the question that names who.
     */
    filterId?: ID | null;
    /** Hands the current tab to the PDF dialog. Abdeckung has no print target:
     *  it is read here and acted on here. */
    onprint: (target: PlanTarget) => void;
    /**
     * The panel owns its tab after mount, so the prop that seeded it goes stale
     * the moment the user clicks another one. Ctrl+P has to print what is on
     * screen, which means the owner of the tab has to say when it changes.
     */
    ontab: (tab: ReportTab) => void;
    onclose: () => void;
  }

  let { tab = 'coverage', filterId = null, onprint, ontab, onclose }: Props = $props();

  let sheetEl: HTMLDivElement | undefined = $state();
  // The prop only seeds the initial tab; the panel owns it from then on.
  // svelte-ignore state_referenced_locally
  let activeTab: ReportTab = $state(tab);
  let teacherFilter: ID | 'all' = $state(
    untrack(() => (tab === 'teachers' && filterId ? filterId : 'all')),
  );
  let roomFilter: ID | 'all' = $state(
    untrack(() => (tab === 'rooms' && filterId ? filterId : 'all')),
  );

  const TABS: { key: ReportTab; label: string }[] = [
    { key: 'coverage', label: 'Abdeckung' },
    { key: 'groups', label: 'Gruppenpläne' },
    { key: 'teachers', label: 'Ausbildnerpläne' },
    { key: 'rooms', label: 'Raumpläne' },
  ];

  const TITLES: Record<ReportTab, string> = {
    coverage: 'Abdeckung',
    groups: 'Gruppenpläne',
    teachers: 'Ausbildnerpläne',
    rooms: 'Raumbelegung',
  };

  const appState = $derived(getState());
  const coverage = $derived(buildCoverage(appState));
  /**
   * F1: every phase's table is sized from the *widest* phase, not from its own
   * lane count. KVK has one lane and WK has four, so as two independently sized
   * tables the Thema column came out ~100px wider on KVK, the lane columns
   * landed at different x on each, and the Status column moved between them —
   * two tables that are read as one document disagreeing about their own ruler.
   */
  const maxLanes = $derived(Math.max(1, ...coverage.map(s => s.groupIds.length)));
  const totalMissing = $derived(coverage.reduce((n, s) => n + s.totalMissing, 0));
  // Counted by the verdict the row actually shows, so the banner and the pills
  // cannot disagree: `over` outranks `uneven` in `coverageStatus`.
  const totalUneven = $derived(
    coverage.reduce((n, s) => n + s.rows.filter(r => status(r) === 'uneven').length, 0),
  );
  const totalOver = $derived(
    coverage.reduce((n, s) => n + s.rows.filter(r => status(r) === 'over').length, 0),
  );
  // A row whose lanes all have the subject, but not yet for its full duration.
  const totalShort = $derived(
    coverage.reduce((n, s) => n + s.rows.filter(r => r.short).length, 0),
  );
  const plans = $derived(buildTeacherPlans(appState));
  const shownPlans = $derived(
    teacherFilter === 'all' ? plans : plans.filter(p => p.teacher.id === teacherFilter),
  );
  const groupPlans = $derived(buildGroupPlans(appState));
  const roomPlans = $derived(buildRoomPlans(appState));
  const shownRoomPlans = $derived(
    roomFilter === 'all' ? roomPlans : roomPlans.filter(p => p.room.id === roomFilter),
  );

  const groupLabel = (id: ID): string => appState.groups.find(g => g.id === id)?.label ?? '?';

  function when(dayIndex: number, startTime: string, endTime: string): string {
    return `${DAY_NAMES[dayIndex] ?? ''} ${dayDateLabel(appState.wkStartDate, dayIndex)} ${startTime}–${endTime}`;
  }

  /**
   * Plans read as a week, so entries are shown under their day. Generic over the
   * entry shape because the teacher plan's entries are PlanEntry, not
   * ScheduleEntry — and sorted within the day, because the teacher plan arrives
   * grouped by Thema and flattening it would otherwise list 15:45 before 08:00.
   */
  function byDay<T extends { dayIndex: number; startTime: string }>(
    entries: T[],
  ): { dayIndex: number; entries: T[] }[] {
    const days = new Map<number, T[]>();
    for (const e of entries) {
      if (!days.has(e.dayIndex)) days.set(e.dayIndex, []);
      days.get(e.dayIndex)!.push(e);
    }
    return [...days.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([dayIndex, list]) => ({
        dayIndex,
        entries: [...list].sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }));
  }

  $effect(() => ontab(activeTab));

  // Print rules key off the body class so the calendar behind can be hidden.
  onMount(() => {
    document.body.classList.add('wk-report-open');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onclose(); };
    window.addEventListener('keydown', onKey);
    sheetEl?.focus();
    return () => {
      document.body.classList.remove('wk-report-open');
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="report-overlay">
  <!-- Z2: focus lands on the panel, not on its ✕, so the first Tab goes into
       the tabs and the table rather than straight back out. -->
  <div bind:this={sheetEl} class="report-sheet" tabindex="-1">

    <div class="report-chrome shrink-0">
      <div class="sheet-head">
        <h3 class="sheet-title">Auswertungen</h3>
        <button class="sheet-x" onclick={onclose} aria-label="Schliessen">
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
        {#if activeTab === 'rooms'}
          <select class="select select-bordered select-sm w-48" bind:value={roomFilter}>
            <option value="all">Alle Räume</option>
            {#each appState.rooms as r (r.id)}
              <option value={r.id}>{r.name}</option>
            {/each}
          </select>
        {/if}
        {#if activeTab === 'teachers'}
          <select class="select select-bordered select-sm w-48" bind:value={teacherFilter}>
            <option value="all">Alle Ausbildner</option>
            {#each appState.teachers as t (t.id)}
              <option value={t.id}>{t.name}</option>
            {/each}
          </select>
        {/if}
        {#if activeTab !== 'coverage'}
          <button class="print-btn" onclick={() => onprint(activeTab as PlanTarget)}>
            <Icon name="printer" size={14} /> Drucken
          </button>
        {/if}
      </div>
    </div>

    <div class="report-body">
      <div class="print-title">{TITLES[activeTab]} — {appState.name}</div>

      <!-- ══ COVERAGE ═══════════════════════════════════════════════════════ -->
      {#if activeTab === 'coverage'}
        {#if totalMissing === 0 && totalUneven === 0 && totalOver === 0 && totalShort === 0}
          <div class="banner banner-ok">
            <Icon name="check" size={15} />
            Jede aktive Gruppe hat jedes Thema in voller Dauer.
          </div>
        {:else}
          <div class="banner banner-warn">
            <Icon name="alert" size={15} />
            {#if totalMissing > 0}
              {totalMissing}-mal fehlt einer Gruppe ein Thema noch ganz.
            {/if}
            {#if totalShort > 0}
              {totalShort} {totalShort === 1 ? 'Thema hat' : 'Themen haben'} bei mindestens einer Gruppe
              noch nicht die volle Dauer.
            {/if}
            {#if totalOver > 0}
              {totalOver} {totalOver === 1 ? 'Thema ist' : 'Themen sind'} länger geplant als seine Dauer vorgibt.
            {/if}
            {#if totalUneven > 0}
              {totalUneven} {totalUneven === 1 ? 'Thema ist' : 'Themen sind'} ungleich auf die Gruppen verteilt.
            {/if}
          </div>
        {/if}

        {#each coverage as section (section.phase.id)}
          <div class="section-head wk-eyebrow">{section.phase.label}</div>

          {#if section.rows.length === 0 || section.groupIds.length === 0}
            <p class="empty-note">In dieser Phase ist noch kein Thema geplant.</p>
          {:else}
            <table class="cov-table" style="--lanes: {maxLanes}">
              <thead>
                <tr>
                  <th class="cov-subject-head">Thema</th>
                  <th class="cov-target-head">Soll</th>
                  {#each section.groupIds as gid (gid)}
                    <th><span class="lane-label">{groupLabel(gid)}</span></th>
                  {/each}
                  <!-- The lanes this phase does not have still take their column,
                       so the Status column lands at the same x on every table. -->
                  {#each Array(maxLanes - section.groupIds.length) as _, i (i)}
                    <th class="cov-pad" aria-hidden="true"></th>
                  {/each}
                  <!-- X6: complete rows carry no pill (F2), so on a clean phase
                       this header promised a mark that never came. -->
                  <th class="cov-status-head">
                    {#if section.rows.some(r => status(r) !== 'complete')}Status{/if}
                  </th>
                </tr>
              </thead>
              <tbody>
                {#each section.rows as row (row.subject.id)}
                  <tr>
                    <td class="cov-subject">
                      <span class="dot" style="background:{row.subject.color}"></span>
                      <span class="truncate">{row.subject.name}</span>
                    </td>
                    <!-- F3: its own column. Trailing the name in grey, "Soll 2 h"
                         read as part of the Thema. -->
                    <td class="cov-target wk-num">{formatDuration(row.target)}</td>
                    {#each section.groupIds as gid (gid)}
                      {@const n = row.counts.get(gid) ?? 0}
                      {@const mins = row.minutes.get(gid) ?? 0}
                      {@const gap = n === 0 || mins < row.target}
                      <td
                        class="cov-cell"
                        class:cov-missing={n === 0}
                        class:cov-short={n > 0 && mins < row.target}
                      >
                        <!-- V1: the most actionable fact the app produces used
                             to be inert text. "ABC-Schutz, G1" is a Thema and a
                             Gruppe — everything the placement dialog needs — and
                             the user was left to memorise the pair, close this
                             overlay, find the chip and drag. -->
                        {#if gap}
                          <button
                            class="cov-fill"
                            onclick={() => requestPlacement(row.subject.id, {
                              groupId: gid,
                              dayIndex: section.phase.startDay,
                            })}
                            title={n === 0
                              ? `${row.subject.name} für ${groupLabel(gid)} platzieren`
                              : `${row.subject.name} für ${groupLabel(gid)} — noch ${formatDuration(row.target - mins)} platzieren`}
                          >
                            {#if n === 0}
                              <span class="cov-add">+</span>
                            {:else}
                              <span class="cov-mins wk-num">{formatDuration(mins)}</span>
                              <span class="cov-sub wk-num">{n}×</span>
                            {/if}
                          </button>
                        {:else}
                          <!-- The time is the answer; the instance count is only
                               how that time was cut up. -->
                          <span class="cov-mins wk-num">{formatDuration(mins)}</span>
                          <span class="cov-sub wk-num">{n}×</span>
                        {/if}
                      </td>
                    {/each}
                    {#each Array(maxLanes - section.groupIds.length) as _, i (i)}
                      <td class="cov-pad" aria-hidden="true"></td>
                    {/each}
                    <td class="cov-status">
                      <!-- F2: a complete row is marked by *nothing*. Five green
                           "vollständig" pills were the loudest thing in a report
                           whose entire purpose is finding the row that is not
                           finished — the good news shouting over the news. -->
                      {#if status(row) === 'missing'}
                        <span class="pill pill-bad">fehlt {row.missing}×</span>
                      {:else if status(row) === 'short'}
                        <span class="pill pill-warn">zu kurz</span>
                      {:else if status(row) === 'over'}
                        <!-- X5: `uneven` compares lanes with each other, so it is
                             blind in a one-lane phase and blind again when every
                             lane is over by the same amount. Both used to read
                             as complete. -->
                        <span class="pill pill-warn">zu lang</span>
                      {:else if status(row) === 'uneven'}
                        <span class="pill pill-warn">ungleich</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        {/each}

        <p class="foot-note">
          Jede Zelle zeigt, wie viel von diesem Thema die Gruppe in ihrer Phase schon hat, darunter
          die Zahl der Lektionen. Das Soll ist die Dauer des Themas — ob sie in einem Stück oder
          aufgeteilt erbracht wird, spielt keine Rolle. Pausen zählen nicht.
        </p>

      <!-- ══ GROUP PLANS ════════════════════════════════════════════════════ -->
      {:else if activeTab === 'groups'}
        {#each groupPlans as plan (plan.group.id)}
          <section class="plan">
            <header class="plan-head">
              <span class="plan-badge">{plan.group.label}</span>
              <div class="min-w-0">
                <div class="plan-name">Gruppe {plan.group.label}</div>
                <div class="plan-summary">
                  {plan.lessonCount} {plan.lessonCount === 1 ? 'Lektion' : 'Lektionen'}
                  · {formatDuration(plan.lessonMinutes)} Unterricht
                </div>
              </div>
            </header>

            {#if plan.entries.length === 0}
              <p class="plan-empty">Nichts geplant.</p>
            {:else}
              {#each byDay(plan.entries) as day (day.dayIndex)}
                <div class="day-block">
                  <div class="day-head">
                    {DAY_NAMES[day.dayIndex]} {dayDateLabel(appState.wkStartDate, day.dayIndex)}
                  </div>
                  <ul class="rows">
                    {#each day.entries as e (e.eventId)}
                      <li class="row" class:row-break={e.subject.kind === 'break'}>
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
          <p class="empty-note">Keine aktiven Gruppen.</p>
        {/each}

      <!-- ══ TEACHER PLANS ══════════════════════════════════════════════════ -->
      {:else if activeTab === 'teachers'}
        {#if shownPlans.length === 0}
          <p class="empty-note">Noch keine Ausbildner erfasst.</p>
        {/if}

        {#each shownPlans as plan (plan.teacher.id)}
          <section class="plan">
            <header class="plan-head">
              <span
                class="plan-avatar"
                style="background:{plan.teacher.color}; color:{getContrastColor(plan.teacher.color)}"
              >{teacherShort(plan.teacher)}</span>
              <div class="min-w-0">
                <div class="plan-name">{plan.teacher.name}</div>
                <div class="plan-summary">
                  {plan.teachingCount + plan.coveringCount}
                  {plan.teachingCount + plan.coveringCount === 1 ? 'Lektion' : 'Lektionen'}
                  · {formatDuration(plan.totalMinutes)}
                  {#if plan.coveringCount > 0}· {plan.coveringCount}× als Stellvertretung{/if}
                  {#if plan.handedOverCount > 0}· {plan.handedOverCount}× abgegeben{/if}
                </div>
              </div>
            </header>

            {#if plan.blocks.length === 0}
              <p class="plan-empty">Nichts geplant.</p>
            {:else}
              <!-- F4: by day, like every other plan in this panel. Grouped by
                   Thema, a teacher's Tuesday was scattered across four blocks and
                   the one question the sheet exists to answer — "where am I
                   next?" — could not be read off it. `byDay()` was already here
                   and already used by the other two tabs. -->
              {@const dayEntries = plan.blocks.flatMap(
                b => b.entries.map(e => ({ ...e, subject: b.subject })),
              )}
              {#each byDay(dayEntries) as day (day.dayIndex)}
                <div class="day-block">
                  <div class="day-head">
                    {DAY_NAMES[day.dayIndex]} {dayDateLabel(appState.wkStartDate, day.dayIndex)}
                  </div>
                  <ul class="rows">
                    {#each day.entries as e (e.eventId)}
                      <li class="row row-teacher" class:row-dropped={e.status === 'handed-over'}>
                        <span class="cell-time wk-num">{e.startTime}–{e.endTime}</span>
                        <span class="cell-subject">
                          <span class="dot" style="background:{e.subject.color}"></span>
                          {e.subject.name}
                        </span>
                        <span class="cell-people"><span class="lane-label">{e.groupLabels.join(' ') || '—'}</span></span>
                        <span class="cell-room">{e.roomName ?? '—'}</span>
                        <span class="cell-note">
                          {#if e.status === 'handed-over'}
                            abgegeben an {e.counterparts.map(t => t.name).join(', ') || 'jemand anderen'}
                          {:else if e.status === 'covering'}
                            Stellvertretung für {e.counterparts.map(t => t.name).join(', ') || 'die Vorgabe'}
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
        {#each shownRoomPlans as plan (plan.room.id)}
          <section class="plan">
            <header class="plan-head">
              <span class="plan-swatch" style="background:{plan.room.color}"></span>
              <div class="min-w-0">
                <div class="plan-name">{plan.room.name}</div>
                <div class="plan-summary">
                  {plan.entries.length} {plan.entries.length === 1 ? 'Belegung' : 'Belegungen'}
                  · {formatDuration(plan.bookedMinutes)}
                  {#if plan.room.excludeFromConflictCheck}· geteilter Raum, Konflikte ignoriert{/if}
                </div>
              </div>
            </header>

            {#if plan.entries.length === 0}
              <p class="plan-empty">Nie belegt.</p>
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
          <p class="empty-note">Noch keine Räume erfasst.</p>
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
    /* Not a <dialog>, but the same category: it takes the page away, so it dims
       with the same scrim the three real modals use. */
    background: var(--wk-scrim);
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
  /* One ruler for the whole report. `table-layout: fixed` plus explicit column
     widths is what makes two phases with different lane counts line up: without
     it each table sized its own Thema column from its own longest name, so the
     lane columns and the Status column landed somewhere different on each. */
  .cov-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: var(--wk-fs-sm);
  }

  /* The Thema column takes whatever the fixed tracks below leave over. */
  .cov-subject-head { width: auto; }

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

  .cov-table th.cov-subject-head { text-align: left; padding-left: 0.2rem; }
  .cov-table th.cov-target-head,
  .cov-target { width: 4.5rem; text-align: right; }
  .cov-table th.cov-status-head,
  .cov-status { width: 7rem; text-align: right; }
  .cov-table th:not(.cov-subject-head):not(.cov-target-head):not(.cov-status-head),
  .cov-cell,
  .cov-pad { width: 6rem; }

  /* F6: a group is a lane everywhere else in the app, and lane headers have a
     look — the uppercase tracked label from calendar.css. Reusing it means the
     "G2" in a report and the "G2" over a column of cards read as one thing. */
  .lane-label {
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--wk-text-mute);
  }

  /* Minutes lead, the instance count is the small print under them. */
  .cov-mins { display: block; }

  /* The gap, as a target. Quiet until pointed at — the report is read far more
     often than it is acted on, and forty outlined buttons would be a form. */
  .cov-fill {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    width: 100%;
    padding: 0.1rem 0.2rem;
    border: 1px solid transparent;
    border-radius: var(--wk-r-sm);
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .cov-fill:hover {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
  }
  .cov-fill:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .cov-add {
    font-size: var(--wk-fs-md);
    font-weight: 600;
    line-height: 1.1;
    color: var(--wk-text-faint);
  }
  .cov-fill:hover .cov-add { color: var(--color-primary); }

  .cov-sub {
    display: block;
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
  }

  .cov-short { color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text)); }

  .cov-target {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    font-weight: 600;
  }

  /* F3: 61px per row for one number meant 10 of 16 Themen fit on a screen whose
     job is to be read as a whole. Halved.
     `middle`, not the default baseline: a lane cell is two lines (time over
     count) and a Soll cell is one, and baseline-aligning them dropped Soll to
     the bottom of its row. */
  .cov-table td {
    padding: 0.22rem 0.4rem;
    border-bottom: 1px solid var(--wk-line-faint);
    vertical-align: middle;
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
  /* The weight the greens used to have, spent on the rows that need it. */
  .pill-bad {
    color: var(--color-error-content);
    background: var(--color-error);
  }
  .pill-warn {
    color: color-mix(in oklab, var(--color-warning) 82%, var(--wk-text));
    background: color-mix(in oklab, var(--color-warning) 24%, transparent);
  }

  /* ── Plans (groups, teachers, rooms share the shape) ────────────────────── */
  .plan {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding-bottom: 1.1rem;
    border-bottom: 1px solid var(--wk-line);
  }

  /* Sticky: a teacher with a full week runs past a screen, and scrolling into
     the middle of one plan used to leave no way to tell whose it was without
     scrolling back. */
  .plan-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    position: sticky;
    top: -1.25rem;
    z-index: 1;
    padding: 0.35rem 0;
    background: var(--wk-surface);
  }

  /* Label colour derived per teacher, not assumed white — see the calendar
     card's avatar. The badge keeps its own pair because it is a UI accent, not
     user data. */
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

  /* F4: content-width tracks, left-aligned, with the slack pushed to the end.
     Stretched across the sheet's ~1100px, a lane cell holding "K" sat alone in
     400px of white and the four columns stopped reading as a row at all. `auto`
     sizes each track to its own content; the last track absorbs what is left. */
  .row {
    display: grid;
    /* minmax(0, …) on the flexible tracks: with fixed rem tracks the columns
       overflowed each other on a narrower page, and "Planungsarbeit" printed on
       top of the teacher's name. */
    grid-template-columns: minmax(7rem, max-content) minmax(0, auto) max-content minmax(0, 1fr);
    gap: 0.5rem 1.1rem;
    justify-content: start;
    align-items: baseline;
    padding: 0.2rem 0.4rem;
    font-size: var(--wk-fs-sm);
  }

  /* The teacher plan carries one more column than the others: what became of
     the instance (covering / handed over). */
  .row-teacher {
    grid-template-columns:
      minmax(5.5rem, max-content) minmax(0, auto) max-content max-content minmax(0, 1fr);
  }

  .row > * {
    min-width: 0;
    overflow-wrap: break-word;
  }

  /* F5: hairlines, not zebra. Forty rows of alternating fill on a sheet that is
     mostly empty cells made the *stripes* the strongest pattern on the page —
     they read as data. A rule between rows does the same job at a tenth of the
     ink, and only the last row goes without. */
  .row + .row {
    border-top: 1px solid var(--wk-line-faint);
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

  /* No print layout here any more: the Drucken button hands the tab to the PDF
     dialog (src/print/), which draws these plans as cut-out slips rather than
     reflowing the screen document. `.print-title` stays in the markup and is
     simply never shown; App.svelte's print rules hide this overlay outright. */

</style>
