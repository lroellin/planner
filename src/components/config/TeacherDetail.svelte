<script lang="ts">
  import { addTeacher, updateTeacher, removeTeacher, getState } from '../../state/store.svelte';
  import { generateInitials } from '../../utils/colorUtils';
  import { teacherShort } from '../../utils/format';
  import { effectiveTeacherIds, timeDiffMinutes, formatDuration, DAY_NAMES } from '../../utils/timeUtils';
  import ColorPicker from './ColorPicker.svelte';
  import Icon from '../Icon.svelte';
  import type { Teacher } from '../../types';

  interface Props {
    /** null = the create form; an entity = the autosaving edit form. */
    teacher: Teacher | null;
    draftColor: string;
    oncreated: (id: string) => void;
    oncancel: () => void;
    ondeleted: (index: number) => void;
  }

  let { teacher, draftColor, oncreated, oncancel, ondeleted }: Props = $props();

  // One set of markup serves both modes: `view` is what the fields show and
  // `set` decides whether an edit autosaves or accumulates into the draft.
  // Seeded once: the draft owns its colour from here on, and the component is
  // remounted (keyed on the entity) whenever a different one is opened.
  // svelte-ignore state_referenced_locally
  let draft = $state({ name: '', shortName: '', color: draftColor });
  let shortNameTouched = $state(false);

  const appState = $derived(getState());
  const view = $derived(teacher ?? draft);
  const isNew = $derived(teacher === null);

  /**
   * What this teacher is actually booked for. The pane was two text fields in a
   * 1000px dialog; the load is the thing you open a teacher to find out.
   */
  const load = $derived.by(() => {
    if (!teacher) return null;
    const events = appState.events.filter(ev => {
      const subject = appState.subjects.find(s => s.id === ev.subjectId);
      return effectiveTeacherIds(ev, subject).includes(teacher.id);
    });
    const minutes = events.reduce((n, ev) => n + timeDiffMinutes(ev.startTime, ev.endTime), 0);
    const days = [...new Set(events.map(ev => ev.dayIndex))].sort();
    const subjects = appState.subjects.filter(s => s.defaultTeacherIds.includes(teacher.id));
    return { count: events.length, minutes, days, subjects };
  });

  function set(patch: Partial<Omit<Teacher, 'id'>>, coalesceKey?: string): void {
    if (teacher) updateTeacher(teacher.id, patch, coalesceKey ? { coalesceKey } : {});
    else draft = { ...draft, ...patch };
  }

  function onNameInput(value: string): void {
    // The short name tracks the full name until the user types their own.
    if (isNew && !shortNameTouched) draft = { ...draft, name: value, shortName: generateInitials(value) };
    else set({ name: value });
  }

  function create(e?: Event): void {
    e?.preventDefault();
    if (!draft.name.trim()) return;
    addTeacher(draft.name.trim(), draft.shortName || generateInitials(draft.name), draft.color);
    oncreated(getState().teachers.at(-1)?.id ?? '');
  }

  function remove(): void {
    if (!teacher) return;
    if (!window.confirm(`Delete "${teacher.name}"?\nThey will be removed from all events.`)) return;
    const index = getState().teachers.findIndex(t => t.id === teacher.id);
    removeTeacher(teacher.id);
    ondeleted(index);
  }
</script>

<form class="detail-form" onsubmit={create}>
  <div class="detail-header">
    <span class="detail-title">{isNew ? 'New teacher' : view.name}</span>
    {#if !isNew}
      <span class="autosave-pill"><Icon name="check" size={12} /> Autosaved</span>
    {/if}
  </div>

  <div class="flex items-start gap-4 pt-1">
    <div class="flex flex-col items-center gap-1.5">
      <ColorPicker
        value={view.color}
        initials={teacherShort(view) || '?'}
        size={56}
        onpick={(color) => set({ color }, `teacher-color:${teacher?.id ?? 'new'}`)}
      />
      <span class="swatch-caption">Colour</span>
    </div>

    <div class="flex flex-col gap-2.5 flex-1 min-w-0">
      <div class="form-field">
        <span class="field-label">Full name</span>
        <input
          class="input input-bordered input-sm w-full"
          type="text"
          value={view.name}
          placeholder="e.g. Anna Müller"
          oninput={isNew ? (e) => onNameInput((e.currentTarget as HTMLInputElement).value) : undefined}
          onchange={isNew ? undefined : (e) => set({ name: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>
      <div class="form-field">
        <span class="field-label">
          Short name <span class="field-label-note">(shown on cards)</span>
        </span>
        <input
          class="input input-bordered input-sm w-28"
          type="text"
          value={view.shortName}
          placeholder="AM"
          oninput={isNew
            ? (e) => { shortNameTouched = true; set({ shortName: (e.currentTarget as HTMLInputElement).value }); }
            : undefined}
          onchange={isNew ? undefined : (e) => set({ shortName: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>
    </div>
  </div>

  {#if load}
    <section class="usage">
      <h4 class="section-title">Load this week</h4>
      <div class="wk-stat-row">
        <div class="wk-stat">
          <span class="wk-stat-value wk-num">{load.count}</span>
          <span class="wk-stat-label">lesson{load.count === 1 ? '' : 's'}</span>
        </div>
        <div class="wk-stat">
          <span class="wk-stat-value wk-num">{formatDuration(load.minutes)}</span>
          <span class="wk-stat-label">in front of a group</span>
        </div>
        <div class="wk-stat">
          <span class="wk-stat-value">
            {load.days.length === 0 ? '—' : load.days.map(d => DAY_NAMES[d]).join(' ')}
          </span>
          <span class="wk-stat-label">days on duty</span>
        </div>
      </div>
      {#if load.subjects.length > 0}
        <p class="usage-note">
          Default teacher for
          {#each load.subjects as s, i (s.id)}<span class="usage-subject"><span
            class="usage-dot" style="background:{s.color}"></span>{s.name}</span>{i < load.subjects.length - 1 ? ', ' : ''}{/each}
        </p>
      {:else}
        <p class="usage-note">Not the default teacher of any subject yet.</p>
      {/if}
    </section>
  {/if}

  <div class="detail-footer">
    {#if isNew}
      <button type="button" class="btn btn-ghost btn-sm" onclick={oncancel}>Cancel</button>
      <button type="submit" class="btn btn-primary btn-sm" disabled={!draft.name.trim()}>Create teacher</button>
    {:else}
      <button type="button" class="btn btn-ghost btn-sm text-error gap-1.5" onclick={remove}>
        <Icon name="trash" size={13} /> Delete teacher
      </button>
    {/if}
  </div>
</form>
