<script lang="ts">
  import { addSubject, updateSubject, removeSubject, getState } from '../../state/store.svelte';
  import { coverageForSubject, missingLanesForSubject } from '../../reports/reports';
  import { formatDuration, orderedPhases } from '../../utils/timeUtils';
  import { collidingSubjectShorts, subjectShort } from '../../utils/format';
  import ColorPicker from './ColorPicker.svelte';
  import GoalsEditor from './GoalsEditor.svelte';
  import Icon from '../Icon.svelte';
  import DurationField from '../DurationField.svelte';
  import type { Subject, SubjectContent } from '../../types';

  interface Props {
    /** null = the create form; an entity = the autosaving edit form. */
    subject: Subject | null;
    draftColor: string;
    oncreated: (id: string) => void;
    oncancel: () => void;
    ondeleted: (index: number) => void;
    /**
     * Switch the Konfiguration to another tab. A callback rather than
     * `requestConfig`: the panel around this form is mounted once and reads its
     * `initialTab` under `untrack`, so a request would open nothing new and
     * change nothing here.
     */
    onnavigate?: (tab: 'teachers' | 'rooms') => void;
  }

  let { subject, draftColor, oncreated, oncancel, ondeleted, onnavigate }: Props = $props();

  const KIND_OPTIONS = [
    {
      value: 'lesson' as const,
      icon: 'rows' as const,
      title: 'Lektion',
      sub: 'Zählt zur Abdeckung jeder Gruppe.',
    },
    {
      value: 'oneoff' as const,
      icon: 'calendar' as const,
      title: 'Programmpunkt',
      sub: 'Begrüssung, Antreten, Rapport: findet einmal statt, keine Abdeckung.',
    },
    {
      value: 'break' as const,
      icon: 'clock' as const,
      title: 'Pause',
      sub: 'Essen und Pausen. Wird als Pause angezeigt, nie gezählt.',
    },
  ];

  const SCOPE_OPTIONS = [
    {
      value: false,
      icon: 'pin' as const,
      title: 'Einzelne Gruppe',
      sub: 'Jede Gruppe erhält eine eigene Platzierung.',
    },
    {
      value: true,
      icon: 'users' as const,
      title: 'Alle Gruppen auf einmal',
      sub: 'Eine Platzierung deckt jede aktive Gruppe der Phase ab.',
    },
  ];

  /**
   * `optional` used to be the one raw checkbox in this form, sitting under two
   * settings that are segmented pairs — and it is the same shape of question as
   * they are: who owes this Thema, not a feature being switched on. Naming both
   * sides also puts the consequence on screen without flipping anything.
   */
  const COVERAGE_OPTIONS = [
    {
      value: false,
      icon: 'check' as const,
      title: 'Alle Gruppen',
      sub: 'Jede Gruppe braucht dieses Thema — mit Zeile in der Abdeckung.',
    },
    {
      value: true,
      icon: 'ban' as const,
      title: 'Nur einzelne Gruppen',
      sub: 'Kein Soll pro Gruppe: keine Auswertungszeile, kein «fehlt noch» am Chip.',
    },
  ];

  const appState = $derived(getState());
  const phases = $derived(orderedPhases(appState));

  // Seeded once — see TeacherDetail.
  // svelte-ignore state_referenced_locally
  let draft = $state<Omit<Subject, 'id'>>({
    name: '',
    shortName: '',
    color: draftColor,
    defaultTeacherIds: [],
    defaultRoomId: null,
    defaultDurationMinutes: 60,
    kind: 'lesson',
    isMultiGroup: false,
    optional: false,
    phaseId: null,
    content: { goals: [], notes: '' },
  });

  const view = $derived(subject ?? draft);
  const isNew = $derived(subject === null);

  // Two panes rather than one long scroll: how the subject is *scheduled* and
  // what it is *about* are consulted at different moments, and stacking them
  // pushed the create button below the fold.
  type Pane = 'setup' | 'content';
  let pane = $state<Pane>('setup');

  const contentCount = $derived(
    view.content.goals.length + (view.content.notes.trim() === '' ? 0 : 1),
  );

  /**
   * What this Thema will actually say on a narrow lane, and whether another
   * Thema says the same thing there.
   *
   * The derivation keeps something from every token, so most plans never see a
   * collision — but two Themen that genuinely start alike have nothing for it
   * to work with, and that is exactly the case where only the user can choose.
   * The draft is folded into the list so a name typed at creation is checked
   * against the plan before it is saved.
   */
  const cardLabel = $derived(subjectShort({ name: view.name, shortName: view.shortName }));
  // The draft has no id yet, so it borrows one for the check.
  const selfId = $derived(subject?.id ?? '__draft__');
  const collisionIds = $derived(
    collidingSubjectShorts([
      ...appState.subjects.filter(s => s.id !== subject?.id),
      { id: selfId, name: view.name, shortName: view.shortName },
    ]),
  );
  const collides = $derived(view.name.trim() !== '' && collisionIds.has(selfId));
  const collidesWith = $derived(
    collides
      ? appState.subjects
          .filter(s => s.id !== selfId && collisionIds.has(s.id))
          .map(s => `«${s.name}»`)
      : [],
  );

  function set(patch: Partial<Omit<Subject, 'id'>>, coalesceKey?: string): void {
    if (subject) updateSubject(subject.id, patch, coalesceKey ? { coalesceKey } : {});
    else draft = { ...draft, ...patch };
  }

  function setContent(patch: Partial<SubjectContent>): void {
    set({ content: { ...view.content, ...patch } }, `subject-content:${subject?.id ?? 'new'}`);
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
    const name = draft.name.trim();
    oncreated(addSubject({
      ...draft,
      name,
      // Seeded, the way `Teacher.shortName` already is. Left empty, the narrow
      // width band on a card has nothing to fall back to — `subjectShort()`
      // returns the *full* name for anything without a separator in it, so
      // "Sanität" arrived at a 66px lane at full length and wrapped as
      // "Sanit / ät". Still editable, and still blank-able.
      shortName: draft.shortName.trim() || seedShortName(name),
    }));
  }

  // See TeacherDetail: undoable, so it is announced rather than asked about.
  /**
   * A short form that fits a narrow lane: the part before the first separator,
   * capped at a length a ~90px column can actually hold. Returns '' when the
   * name is already short enough, so the derived fallback stays live and follows
   * a rename.
   */
  function seedShortName(name: string): string {
    const cut = name.split(/[/(,–—]/)[0]?.trim() ?? name;
    if (cut.length <= 12) return cut === name ? '' : cut;
    const atWord = cut.slice(0, 12).replace(/\s+\S*$/, '');
    return (atWord.length >= 6 ? atWord : cut.slice(0, 12)).trim();
  }

  function remove(): void {
    if (!subject) return;
    const index = getState().subjects.findIndex(s => s.id === subject.id);
    removeSubject(subject.id);
    ondeleted(index);
  }
</script>

<form class="detail-form" onsubmit={create}>
  <div class="detail-header">
    <span class="detail-title">{isNew ? 'Neues Thema' : view.name}</span>
    {#if !isNew}
      <span class="autosave-pill"><Icon name="check" size={12} /> Automatisch gespeichert</span>
    {/if}
  </div>

  <div class="pane-switch" role="tablist">
    <button
      type="button"
      role="tab"
      class="pane-tab"
      class:pane-tab-on={pane === 'setup'}
      aria-selected={pane === 'setup'}
      onclick={() => (pane = 'setup')}
    >Planung</button>
    <button
      type="button"
      role="tab"
      class="pane-tab"
      class:pane-tab-on={pane === 'content'}
      aria-selected={pane === 'content'}
      onclick={() => (pane = 'content')}
    >
      Inhalt
      {#if contentCount > 0}<span class="pane-badge wk-num">{contentCount}</span>{/if}
    </button>
  </div>

  {#if pane === 'content'}
    <div class="flex flex-col gap-5 pt-1">
      <section class="section">
        <h4 class="section-title">Lernziele</h4>
        <p class="field-hint">
          Ein Lernziel pro Zeile.
        </p>
        <GoalsEditor goals={view.content.goals} onchange={(goals) => setContent({ goals })} />
      </section>

      <section class="section">
        <h4 class="section-title">Notizen</h4>
        <textarea
          class="textarea textarea-bordered w-full"
          rows="8"
          placeholder="Material, Vorbereitung, alles was der Ausbildner am Tag selbst braucht."
          value={view.content.notes}
          onchange={(e) => setContent({ notes: (e.currentTarget as HTMLTextAreaElement).value })}
        ></textarea>
      </section>
    </div>
  {:else}
  <!-- L3: two columns once the dialog is wide enough.
       The Thema form is the longest in the app and it ran down one ~400px
       column inside a 720px pane, so Art, Erweitert and Platzierung sat below
       the fold with 300px of unused width beside them. Ausbildner and Räume
       have short forms and never showed it. Below ~900px it is one column
       again, in the original order. -->
  <div class="setup-cols">
    <div class="setup-col">

    <section class="section">
      <h4 class="section-title">Bezeichnung</h4>
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
            placeholder="z. B. Karteneröffnung"
            oninput={isNew ? (e) => set({ name: (e.currentTarget as HTMLInputElement).value }) : undefined}
            onchange={isNew ? undefined : (e) => set({ name: (e.currentTarget as HTMLInputElement).value })}
          />
        </div>
      </div>

      <div class="form-field">
        <span class="field-label">Kürzel <span class="field-label-note">(erscheint auf den Karten)</span></span>
        <input
          class="input input-bordered input-sm w-56"
          type="text"
          value={view.shortName}
          placeholder={subjectShort({ name: view.name, shortName: '' })}
          oninput={isNew ? (e) => set({ shortName: (e.currentTarget as HTMLInputElement).value }) : undefined}
          onchange={isNew ? undefined : (e) => set({ shortName: (e.currentTarget as HTMLInputElement).value })}
        />
        <p class="field-hint">
          Leer lassen: dann wird es aus dem Namen abgeleitet und folgt einer Umbenennung.
        </p>
        <!-- N2: nothing in the app used to show the label a Thema actually gets
             on a narrow lane, so nobody could tell a Kürzel was needed. The
             preview is the card's own type at the card's own size. -->
        <p class="card-preview">
          <span class="card-preview-label">Auf schmalen Karten:</span>
          <span class="card-preview-chip" style="--pc: {view.color}">{cardLabel}</span>
        </p>
        {#if collides}
          <p class="field-warn">
            Gleiche Kartenbeschriftung wie {collidesWith.join(', ')}. Auf einer
            schmalen Spalte sind die Karten nicht zu unterscheiden — ein eigenes
            Kürzel trennt sie.
          </p>
        {/if}
      </div>
    </section>

    <!-- What a new placement inherits. This is the pane's real payload — it used
         to sit under Behaviour and Coverage, below the fold, where the two
         settings you actually reach for every day could not be seen at all. -->
    <section class="section">
      <h4 class="section-title">Vorgaben</h4>

      <!-- Raum before Ausbildner: one line against four rows of chips. The
           single-row field led with the taller one below it, so the Dauer
           field underneath sat a picker-height away from the top of the
           section for a Thema with eight Ausbildner. -->
      {#if appState.rooms.length > 0}
        <div class="form-field">
          <span class="field-label">Raum</span>
          <select
            class="select select-bordered select-sm w-56"
            value={view.defaultRoomId ?? ''}
            onchange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              set({ defaultRoomId: v === '' ? null : v });
            }}
          >
            <option value="">Keine Vorgabe</option>
            {#each appState.rooms as r (r.id)}
              <option value={r.id}>{r.name}</option>
            {/each}
          </select>
        </div>
      {:else}
        <div class="form-field">
          <span class="field-label">Raum</span>
          <p class="field-hint">
            Noch keine Räume erfasst.
            {#if onnavigate}
              <button class="link-cta" onclick={() => onnavigate?.('rooms')}>
                Raum anlegen <Icon name="chevronRight" size={11} />
              </button>
            {/if}
          </p>
        </div>
      {/if}

      {#if appState.teachers.length > 0}
        <div class="form-field">
          <div class="flex items-center gap-2">
            <span class="field-label">Ausbildner</span>
            <span class="count-pill" class:count-pill-empty={view.defaultTeacherIds.length === 0}>
              {view.defaultTeacherIds.length} von {appState.teachers.length} ausgewählt
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
      {:else}
        <!-- The field used to be hidden outright while the list was empty, so
             the one form where a first-time user would learn that a Thema has
             a Ausbildner-Vorgabe said nothing at all — and offered no way to
             make one. -->
        <div class="form-field">
          <span class="field-label">Ausbildner</span>
          <p class="field-hint">
            Noch keine Ausbildner erfasst. Ohne sie prüft nichts auf Konflikte.
            {#if onnavigate}
              <button class="link-cta" onclick={() => onnavigate?.('teachers')}>
                Ausbildner anlegen <Icon name="chevronRight" size={11} />
              </button>
            {/if}
          </p>
        </div>
      {/if}

      <div class="form-field">
        <span class="field-label">Dauer</span>
        <p class="field-hint">
          Zugleich das Soll pro Gruppe: Jede Gruppe braucht so lange für dieses Thema — am Stück
          oder aufgeteilt, etwa 1 h 30 min + 1 h für 2 h 30 min.
        </p>
        <DurationField
          value={view.defaultDurationMinutes}
          onchange={(m) => set({ defaultDurationMinutes: m })}
        />
      </div>
    </section>

    <!-- Both of these were toggles, and a toggle labelled "Break" only ever
         names the state it is in: you had to flip it to learn what the other
         side was. As a pair of named options each setting reads as the choice
         it actually is. -->
    </div>

    <div class="setup-col">

    <section class="section">
      <h4 class="section-title">Art</h4>

      <div class="form-field">
        <span class="field-label">Zählt als</span>
        <div class="choice" role="radiogroup" aria-label="Zählt als">
          {#each KIND_OPTIONS as opt (opt.value)}
            <button
              type="button"
              class="choice-opt"
              class:choice-opt-on={view.kind === opt.value}
              role="radio"
              aria-checked={view.kind === opt.value}
              onclick={() => set({ kind: opt.value })}
            >
              <span class="choice-head"><Icon name={opt.icon} size={14} /> {opt.title}</span>
              <span class="choice-sub">{opt.sub}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="form-field">
        <span class="field-label">Platziert für</span>
        <div class="choice" role="radiogroup" aria-label="Platziert für">
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
            Die Platzierung folgt der Phase: Eine später hinzugefügte oder eingeschaltete Gruppe ist
            automatisch dabei.
          </p>
        {/if}
      </div>
    </section>

    <!-- Inferring the phase from the placements is right for every subject
         until it isn't, so the override stays out of the way. It is a coverage
         setting, so it is not shown for the kinds coverage never looks at. -->
    {#if view.kind === 'lesson'}
    <details class="advanced">
      <summary class="advanced-summary">
        <Icon name="chevronRight" size={12} /> Erweitert
      </summary>
      <div class="advanced-body form-field">
        <!-- The other half of "not everyone owes this": a Programmpunkt is
             outside coverage because it happens *once*, this because only some
             groups sit it. The chip loses its «fehlt» badge either way. -->
        <span class="field-label">Wer besucht es</span>
        <div class="choice" role="radiogroup" aria-label="Wer besucht es">
          {#each COVERAGE_OPTIONS as opt (opt.value)}
            <button
              type="button"
              class="choice-opt"
              class:choice-opt-on={view.optional === opt.value}
              role="radio"
              aria-checked={view.optional === opt.value}
              onclick={() => set({ optional: opt.value })}
            >
              <span class="choice-head"><Icon name={opt.icon} size={14} /> {opt.title}</span>
              <span class="choice-sub">{opt.sub}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="advanced-body form-field">
        <span class="field-label">Gehört zu Phase</span>
        <p class="field-hint">
          Die Abdeckung wird pro Phase gerechnet: Ein Thema, das nur das Kader hat, darf nicht an
          den Gruppen gemessen werden. Ohne Auswahl wird die Phase aus den Platzierungen gelesen.
        </p>
        <select
          class="select select-bordered select-sm w-56"
          value={view.phaseId ?? ''}
          onchange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            set({ phaseId: v === '' ? null : v });
          }}
        >
          <option value="">Aus Platzierungen ableiten</option>
          {#each phases as p (p.id)}
            <option value={p.id}>{p.label}</option>
          {/each}
        </select>
      </div>
    </details>
    {/if}
    </div>
  </div>
  {/if}

  {#if !isNew && subject && pane === 'setup'}
    {@const cov = coverageForSubject(appState, subject.id)}
    {@const missing = missingLanesForSubject(appState, subject.id)}
    <section class="usage">
      <h4 class="section-title">Platzierung</h4>
      <div class="wk-stat-row">
        <div class="wk-stat">
          <span class="wk-stat-value wk-num">{appState.events.filter(e => e.subjectId === subject.id).length}</span>
          <span class="wk-stat-label">im Kalender platziert</span>
        </div>
        {#if view.kind === 'lesson'}
          <div class="wk-stat">
            <span class="wk-stat-value wk-num">{cov.placed}/{cov.total}</span>
            <span class="wk-stat-label">Gruppen abgedeckt</span>
          </div>
          <div class="wk-stat">
            <span class="wk-stat-value wk-num">{formatDuration(view.defaultDurationMinutes)}</span>
            <span class="wk-stat-label">Soll pro Gruppe</span>
          </div>
        {/if}
      </div>
      {#if view.kind === 'lesson'}
        <p class="usage-note">
          {#if missing.length === 0}
            Jede Gruppe der Phase hat dieses Thema{cov.short ? '' : ' vollständig'}.
          {:else}
            Fehlt noch bei: {missing.join(', ')}.
          {/if}
        </p>
      {/if}
    </section>
  {/if}

  <div class="detail-footer">
    {#if isNew}
      <button type="button" class="btn btn-ghost btn-sm" onclick={oncancel}>Abbrechen</button>
      <button type="submit" class="btn btn-primary btn-sm" disabled={!draft.name.trim()}>Thema erstellen</button>
    {:else}
      <button type="button" class="btn btn-ghost btn-sm text-error gap-1.5" onclick={remove}>
        <Icon name="trash" size={13} /> Thema löschen
      </button>
    {/if}
  </div>
</form>

<style>
  /* The way out of an empty list. Inline in the hint that names the gap, so the
     sentence and its remedy are one thing to read. */
  .link-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    font-size: inherit;
    font-weight: 600;
    color: var(--color-primary);
  }
  .link-cta:hover { text-decoration: underline; }

  /* L3 */
  .setup-cols {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.25rem;
    padding-top: 0.25rem;
    align-items: start;
  }
  .setup-col {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-width: 0;
  }
  /* The dialog is min(1000px, 92vw) and the detail pane about 720px of it, so
     the second column is worth having from roughly this viewport up. A media
     query rather than a container query: `container-type` would also make the
     pane a containing block for the ColorPicker's absolutely-positioned popover
     and clip it. */
  @media (min-width: 1024px) {
    .setup-cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.5rem; }
  }

  /* N2: the label a Thema gets once its lane is too narrow for the full name —
     shown in the card's own type so the preview is the thing, not a note about
     it. */
  .card-preview {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .card-preview-label {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
  }
  .card-preview-chip {
    font-size: var(--wk-fs-xs);
    font-weight: 700;
    line-height: 1.2;
    padding: 3px 7px;
    border-radius: var(--wk-r-sm);
    border: 1px solid color-mix(in oklab, var(--pc) 45%, var(--wk-surface));
    border-left: 3px solid var(--pc);
    background: color-mix(in oklab, var(--pc) var(--wk-tint), var(--wk-surface));
    color: var(--wk-text);
  }
  .field-warn {
    margin-top: 8px;
    font-size: var(--wk-fs-xs);
    line-height: 1.45;
    color: var(--color-warning);
    max-width: 46ch;
  }

  .pane-switch {
    display: flex;
    gap: 0.15rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--wk-line);
    margin-bottom: -0.3rem;
  }

  .pane-tab {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .pane-tab:hover { color: var(--wk-text); }

  .pane-tab-on {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .pane-badge {
    padding: 0 0.3rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-primary) 16%, transparent);
    color: var(--color-primary);
    font-size: var(--wk-fs-2xs);
  }
</style>
