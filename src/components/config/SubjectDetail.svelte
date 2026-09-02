<script lang="ts">
  import { addSubject, updateSubject, removeSubject, getState } from '../../state/store.svelte';
  import { coverageForSubject, missingLanesForSubject } from '../../reports/reports';
  import ColorPicker from './ColorPicker.svelte';
  import Icon from '../Icon.svelte';
  import type { Subject } from '../../types';

  interface Props {
    /** null = the create form; an entity = the autosaving edit form. */
    subject: Subject | null;
    draftColor: string;
    oncreated: (id: string) => void;
    oncancel: () => void;
    ondeleted: (index: number) => void;
  }

  let { subject, draftColor, oncreated, oncancel, ondeleted }: Props = $props();

  const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

  const KIND_OPTIONS = [
    {
      value: false,
      icon: 'rows' as const,
      title: 'Lesson',
      sub: 'Counted towards each lane’s coverage.',
    },
    {
      value: true,
      icon: 'clock' as const,
      title: 'Break',
      sub: 'Meals and pauses. Drawn as a break, never counted.',
    },
  ];

  const SCOPE_OPTIONS = [
    {
      value: false,
      icon: 'pin' as const,
      title: 'One lane',
      sub: 'Each group gets its own placement.',
    },
    {
      value: true,
      icon: 'users' as const,
      title: 'All lanes at once',
      sub: 'One placement covers every active lane of the phase.',
    },
  ];

  const appState = $derived(getState());
  const orderedPhases = $derived([...appState.phases].sort((a, b) => a.startDay - b.startDay));

  // Seeded once — see TeacherDetail.
  // svelte-ignore state_referenced_locally
  let draft = $state<Omit<Subject, 'id'>>({
    name: '',
    color: draftColor,
    defaultTeacherIds: [],
    defaultRoomId: null,
    defaultDurationMinutes: 60,
    isBreak: false,
    isMultiGroup: false,
    phaseId: null,
  });

  const view = $derived(subject ?? draft);
  const isNew = $derived(subject === null);

  function set(patch: Partial<Omit<Subject, 'id'>>, coalesceKey?: string): void {
    if (subject) updateSubject(subject.id, patch, coalesceKey ? { coalesceKey } : {});
    else draft = { ...draft, ...patch };
  }

  function toggleTeacher(teacherId: string): void {
    const current = view.defaultTeacherIds;
    set({
      defaultTeacherIds: current.includes(teacherId)
        ? current.filter(id => id !== teacherId)
        : [...current, teacherId],
    });
  }

  function create(e?: Event): void {
    e?.preventDefault();
    if (!draft.name.trim()) return;
    addSubject({ ...draft, name: draft.name.trim() });
    oncreated(getState().subjects.at(-1)?.id ?? '');
  }

  function remove(): void {
    if (!subject) return;
    if (!window.confirm(`Delete "${subject.name}"?\nAll placed events will be removed.`)) return;
    const index = getState().subjects.findIndex(s => s.id === subject.id);
    removeSubject(subject.id);
    ondeleted(index);
  }
</script>

<form class="detail-form" onsubmit={create}>
  <div class="detail-header">
    <span class="detail-title">{isNew ? 'New subject' : view.name}</span>
    {#if !isNew}
      <span class="autosave-pill"><Icon name="check" size={12} /> Autosaved</span>
    {/if}
  </div>

  <div class="flex flex-col gap-5 pt-1">

    <section class="section">
      <h4 class="section-title">Identity</h4>
      <div class="form-field">
        <span class="field-label">Name</span>
        <div class="flex items-center gap-3 max-w-md">
          <ColorPicker
            value={view.color}
            onpick={(color) => set({ color }, `subject-color:${subject?.id ?? 'new'}`)}
          />
          <input
            class="input input-bordered input-sm flex-1"
            type="text"
            value={view.name}
            placeholder="e.g. Karteneröffnung"
            oninput={isNew ? (e) => set({ name: (e.currentTarget as HTMLInputElement).value }) : undefined}
            onchange={isNew ? undefined : (e) => set({ name: (e.currentTarget as HTMLInputElement).value })}
          />
        </div>
      </div>
    </section>

    <!-- What a new placement inherits. This is the pane's real payload — it used
         to sit under Behaviour and Coverage, below the fold, where the two
         settings you actually reach for every day could not be seen at all. -->
    <section class="section">
      <h4 class="section-title">Defaults for new placements</h4>

      {#if appState.teachers.length > 0}
        <div class="form-field">
          <div class="flex items-center gap-2">
            <span class="field-label">Teachers</span>
            <span class="count-pill" class:count-pill-empty={view.defaultTeacherIds.length === 0}>
              {view.defaultTeacherIds.length} of {appState.teachers.length} selected
            </span>
          </div>
          <div class="picker-grid">
            {#each appState.teachers as t (t.id)}
              {@const selected = view.defaultTeacherIds.includes(t.id)}
              <button
                type="button"
                class="picker-chip"
                class:picker-chip-on={selected}
                style={selected ? `--tc:${t.color}` : ''}
                aria-pressed={selected}
                onclick={() => toggleTeacher(t.id)}
              >
                <span class="picker-box">{selected ? '✓' : ''}</span>
                <span class="teacher-dot" style="background:{t.color}"></span>
                <span class="truncate">{t.name}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if appState.rooms.length > 0}
        <div class="form-field">
          <span class="field-label">Room</span>
          <select
            class="select select-bordered select-sm w-56"
            value={view.defaultRoomId ?? ''}
            onchange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              set({ defaultRoomId: v === '' ? null : v });
            }}
          >
            <option value="">No default</option>
            {#each appState.rooms as r (r.id)}
              <option value={r.id}>{r.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="form-field">
        <span class="field-label">Duration</span>
        <div class="flex items-center gap-2 flex-wrap">
        {#each DURATION_PRESETS as preset (preset)}
          <button
            type="button"
            class="preset-chip"
            class:preset-chip-on={view.defaultDurationMinutes === preset}
            onclick={() => set({ defaultDurationMinutes: preset })}
          >{preset < 60 ? `${preset} min` : `${preset / 60} h`}</button>
        {/each}
        <div class="flex items-center gap-1.5 ml-2">
          <input
            class="input input-bordered input-sm w-20 text-right"
            type="number"
            min="15"
            step="15"
            value={view.defaultDurationMinutes}
            onchange={(e) => {
              const n = Number((e.currentTarget as HTMLInputElement).value);
              if (Number.isFinite(n) && n >= 15) set({ defaultDurationMinutes: n });
            }}
          />
          <span class="text-sm text-base-content/50">min</span>
        </div>
        </div>
      </div>
    </section>

    <!-- Both of these were toggles, and a toggle labelled "Break" only ever
         names the state it is in: you had to flip it to learn what the other
         side was. As a pair of named options each setting reads as the choice
         it actually is. -->
    <section class="section">
      <h4 class="section-title">Kind</h4>

      <div class="form-field">
        <span class="field-label">Counts as</span>
        <div class="choice" role="radiogroup" aria-label="Counts as">
          {#each KIND_OPTIONS as opt (opt.value)}
            <button
              type="button"
              class="choice-opt"
              class:choice-opt-on={view.isBreak === opt.value}
              role="radio"
              aria-checked={view.isBreak === opt.value}
              onclick={() => set({ isBreak: opt.value })}
            >
              <span class="choice-head"><Icon name={opt.icon} size={14} /> {opt.title}</span>
              <span class="choice-sub">{opt.sub}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="form-field">
        <span class="field-label">Placed for</span>
        <div class="choice" role="radiogroup" aria-label="Placed for">
          {#each SCOPE_OPTIONS as opt (opt.value)}
            <button
              type="button"
              class="choice-opt"
              class:choice-opt-on={view.isMultiGroup === opt.value}
              role="radio"
              aria-checked={view.isMultiGroup === opt.value}
              onclick={() => set({ isMultiGroup: opt.value })}
            >
              <span class="choice-head"><Icon name={opt.icon} size={14} /> {opt.title}</span>
              <span class="choice-sub">{opt.sub}</span>
            </button>
          {/each}
        </div>
        {#if view.isMultiGroup}
          <p class="field-hint">
            It keeps following the phase, so a lane added or switched on later is included
            automatically.
          </p>
        {/if}
      </div>
    </section>

    <!-- Inferring the phase from the placements is right for every subject
         until it isn't, so the override stays out of the way. -->
    <details class="advanced">
      <summary class="advanced-summary">
        <Icon name="chevronRight" size={12} /> Advanced
      </summary>
      <div class="advanced-body form-field">
        <span class="field-label">Belongs to phase</span>
        <p class="field-hint">
          Coverage is measured per phase — a Kader lesson must not be judged against the group lanes.
          Left on "infer", the phase is read from wherever the subject is placed.
        </p>
        <select
          class="select select-bordered select-sm w-56"
          value={view.phaseId ?? ''}
          onchange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            set({ phaseId: v === '' ? null : v });
          }}
        >
          <option value="">Infer from placements</option>
          {#each orderedPhases as p (p.id)}
            <option value={p.id}>{p.label}</option>
          {/each}
        </select>
      </div>
    </details>
  </div>

  {#if !isNew && subject}
    {@const cov = coverageForSubject(appState, subject.id)}
    {@const missing = missingLanesForSubject(appState, subject.id)}
    <section class="usage">
      <h4 class="section-title">Placement</h4>
      <div class="wk-stat-row">
        <div class="wk-stat">
          <span class="wk-stat-value wk-num">{appState.events.filter(e => e.subjectId === subject.id).length}</span>
          <span class="wk-stat-label">placed on the grid</span>
        </div>
        {#if !view.isBreak}
          <div class="wk-stat">
            <span class="wk-stat-value wk-num">{cov.placed}/{cov.total}</span>
            <span class="wk-stat-label">lanes covered</span>
          </div>
        {/if}
      </div>
      {#if !view.isBreak}
        <p class="usage-note">
          {missing.length === 0
            ? 'Every lane of its phase has this subject.'
            : `Still missing on: ${missing.join(', ')}.`}
        </p>
      {/if}
    </section>
  {/if}

  <div class="detail-footer">
    {#if isNew}
      <button type="button" class="btn btn-ghost btn-sm" onclick={oncancel}>Cancel</button>
      <button type="submit" class="btn btn-primary btn-sm" disabled={!draft.name.trim()}>Create subject</button>
    {:else}
      <button type="button" class="btn btn-ghost btn-sm text-error gap-1.5" onclick={remove}>
        <Icon name="trash" size={13} /> Delete subject
      </button>
    {/if}
  </div>
</form>
