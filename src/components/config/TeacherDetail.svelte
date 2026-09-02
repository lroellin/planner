<script lang="ts">
  import { updateTeacher, removeTeacher, setTeacherUnavailable, getState } from '../../state/store.svelte';
  import { teacherShort } from '../../utils/format';
  import {
    effectiveTeacherIds, timeDiffMinutes, formatDuration, DAY_NAMES, sortSubjects,
  } from '../../utils/timeUtils';
  import ColorPicker from './ColorPicker.svelte';
  import AvailabilityEditor from './AvailabilityEditor.svelte';
  import Icon from '../Icon.svelte';
  import type { Teacher, TimeWindow } from '../../types';

  interface Props {
    /** Always an existing teacher: creation happens in the list's quick-add. */
    teacher: Teacher;
    ondeleted: (index: number) => void;
  }

  let { teacher, ondeleted }: Props = $props();

  const appState = $derived(getState());
  const view = $derived(teacher);

  /**
   * What this teacher is actually booked for. The pane was two text fields in a
   * 1000px dialog; the load is the thing you open a teacher to find out.
   */
  const load = $derived.by(() => {
    const events = appState.events.filter(ev => {
      const subject = appState.subjects.find(s => s.id === ev.subjectId);
      return effectiveTeacherIds(ev, subject).includes(teacher.id);
    });
    const minutes = events.reduce((n, ev) => n + timeDiffMinutes(ev.startTime, ev.endTime), 0);
    const days = [...new Set(events.map(ev => ev.dayIndex))].sort();
    const subjects = sortSubjects(
      appState.subjects.filter(s => s.defaultTeacherIds.includes(teacher.id)),
    );
    return { count: events.length, minutes, days, subjects };
  });

  function set(patch: Partial<Omit<Teacher, 'id'>>, coalesceKey?: string): void {
    updateTeacher(teacher.id, patch, coalesceKey ? { coalesceKey } : {});
  }

  function setWindows(unavailable: TimeWindow[]): void {
    setTeacherUnavailable(teacher.id, unavailable);
  }

  function remove(): void {
    if (!window.confirm(`Delete "${teacher.name}"?\nThey will be removed from all events.`)) return;
    const index = getState().teachers.findIndex(t => t.id === teacher.id);
    removeTeacher(teacher.id);
    ondeleted(index);
  }
</script>

<div class="detail-form">
  <div class="detail-header">
    <span class="detail-title">{view.name}</span>
    <span class="autosave-pill"><Icon name="check" size={12} /> Autosaved</span>
  </div>

  <div class="flex items-start gap-4 pt-1">
    <div class="flex flex-col items-center gap-1.5">
      <ColorPicker
        value={view.color}
        initials={teacherShort(view) || '?'}
        size={56}
        onpick={(color) => set({ color }, `teacher-color:${teacher.id}`)}
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
          onchange={(e) => set({ name: (e.currentTarget as HTMLInputElement).value })}
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
          onchange={(e) => set({ shortName: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>
    </div>
  </div>

  <AvailabilityEditor
    windows={view.unavailable}
    onchange={setWindows}
    title="Away"
    emptyText="Here the whole week. Add a day below if that is not true."
    hint="A lesson booked while they are away is a hard conflict, exactly like being in two rooms at once."
    notePlaceholder="Why (optional) — e.g. Kurs in Schwarzenburg"
  />

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

  <div class="detail-footer">
    <button type="button" class="btn btn-ghost btn-sm text-error gap-1.5" onclick={remove}>
      <Icon name="trash" size={13} /> Delete teacher
    </button>
  </div>
</div>
