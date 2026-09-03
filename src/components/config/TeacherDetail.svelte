<script lang="ts">
  import { updateTeacher, removeTeacher, setTeacherUnavailable, getState } from '../../state/store.svelte';
  import { teacherShort } from '../../utils/format';
  import { formatDuration, DAY_NAMES } from '../../utils/timeUtils';
  import { teacherLoad } from '../../reports/reports';
  import ColorPicker from './ColorPicker.svelte';
  import AvailabilityEditor from './AvailabilityEditor.svelte';
  import Icon from '../Icon.svelte';
  import { requestReport } from '../../state/ui.svelte';
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
   * 1000px dialog; the load is the thing you open a teacher to find out. The sum
   * itself belongs to reports, so this pane and the printed plan cannot disagree.
   */
  const load = $derived(teacherLoad(appState, teacher.id));

  function set(patch: Partial<Omit<Teacher, 'id'>>, coalesceKey?: string): void {
    updateTeacher(teacher.id, patch, coalesceKey ? { coalesceKey } : {});
  }

  function setWindows(unavailable: TimeWindow[]): void {
    setTeacherUnavailable(teacher.id, unavailable);
  }

  // No confirm: `removeTeacher` is one undoable `setState`, and its toast names
  // the count ("von 10 Lektionen entfernt") with a Rückgängig beside it — which
  // the OS dialog could neither do nor be undone from.
  function remove(): void {
    const index = getState().teachers.findIndex(t => t.id === teacher.id);
    removeTeacher(teacher.id);
    ondeleted(index);
  }
</script>

<div class="detail-form">
  <div class="detail-header">
    <span class="detail-title">{view.name}</span>
    <span class="autosave-pill"><Icon name="check" size={12} /> Automatisch gespeichert</span>
  </div>

  <div class="flex items-start gap-4 pt-1">
    <div class="flex flex-col items-center gap-1.5">
      <ColorPicker
        value={view.color}
        initials={teacherShort(view) || '?'}
        size={56}
        onpick={(color) => set({ color }, `teacher-color:${teacher.id}`)}
      />
      <span class="swatch-caption">Farbe</span>
    </div>

    <div class="flex flex-col gap-2.5 flex-1 min-w-0">
      <div class="form-field">
        <span class="field-label">Voller Name</span>
        <input
          class="input input-bordered input-sm w-full"
          type="text"
          value={view.name}
          placeholder="z. B. Anna Müller"
          onchange={(e) => set({ name: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>
      <div class="form-field">
        <span class="field-label">
          Kürzel <span class="field-label-note">(erscheint auf den Karten)</span>
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
    title="Abwesenheiten"
    emptyText="Die ganze Woche anwesend. Fehlt jemand an einem Tag, unten hinzufügen."
    hint="Eine Lektion in einer Abwesenheit ist ein harter Konflikt, wie eine Doppelbuchung."
    notePlaceholder="Grund (optional) — z. B. Kurs in Schwarzenburg"
  />

  <section class="usage">
    <!-- The count used to be a dead end: a number with no way through to what it
         counts, while the conflict panel next door has had "im Kalender zeigen"
         all along. -->
    <div class="usage-head">
      <h4 class="section-title">Pensum diese Woche</h4>
      {#if load.count > 0}
        <button
          type="button"
          class="usage-link"
          onclick={() => requestReport('teachers', teacher.id)}
        >Plan öffnen <Icon name="chevronRight" size={12} /></button>
      {/if}
    </div>
    <div class="wk-stat-row">
      <div class="wk-stat">
        <span class="wk-stat-value wk-num">{load.count}</span>
        <span class="wk-stat-label">{load.count === 1 ? 'Lektion' : 'Lektionen'}</span>
      </div>
      <div class="wk-stat">
        <span class="wk-stat-value wk-num">{formatDuration(load.minutes)}</span>
        <span class="wk-stat-label">Unterricht</span>
      </div>
      <div class="wk-stat">
        <span class="wk-stat-value">
          {load.days.length === 0 ? '—' : load.days.map(d => DAY_NAMES[d]).join(' ')}
        </span>
        <span class="wk-stat-label">Einsatztage</span>
      </div>
    </div>
    {#if load.subjects.length > 0}
      <p class="usage-note">
        Als Vorgabe hinterlegt bei:
        {#each load.subjects as s, i (s.id)}<span class="usage-subject"><span
          class="usage-dot" style="background:{s.color}"></span>{s.name}</span>{i < load.subjects.length - 1 ? ', ' : ''}{/each}
      </p>
    {:else}
      <p class="usage-note">Noch bei keinem Thema als Vorgabe hinterlegt.</p>
    {/if}
  </section>

  <div class="detail-footer">
    <button type="button" class="btn btn-ghost btn-sm text-error gap-1.5" onclick={remove}>
      <Icon name="trash" size={13} /> Ausbildner löschen
    </button>
  </div>
</div>
