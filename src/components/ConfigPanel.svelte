<script lang="ts">
  import {
    getState,
    addGroup, updateGroup, removeGroup, moveGroupUp, moveGroupDown, moveGroupToIndex,
    eventCountForGroup,
    addPhase, updatePhase, removePhase, eventCountForPhase,
    addTeacher, addRoom,
    setPlanName, replacePlan, resetToDefaults,
  } from '../state/store.svelte';
  import { serializePlan, planFileName, parsePlan } from '../state/persistence';
  import { generateDistinctColor, generateInitials } from '../utils/colorUtils';
  import { teacherShort } from '../utils/format';
  import { DAY_NAMES, orderedPhases, sortSubjects } from '../utils/timeUtils';
  import { describeWindow } from '../utils/availability';
  import AddRow from './config/AddRow.svelte';
  import MasterDetail from './config/MasterDetail.svelte';
  import TeacherDetail from './config/TeacherDetail.svelte';
  import RoomDetail from './config/RoomDetail.svelte';
  import SubjectDetail from './config/SubjectDetail.svelte';
  import Icon from './Icon.svelte';
  import type { ID } from '../types';

  interface Props { onclose: () => void; }
  let { onclose }: Props = $props();

  type Tab = 'groups' | 'phases' | 'teachers' | 'rooms' | 'subjects' | 'data';
  const TABS: { key: Tab; label: string }[] = [
    { key: 'groups', label: 'Gruppen' },
    { key: 'phases', label: 'Phasen' },
    { key: 'teachers', label: 'Gruppenführer' },
    { key: 'rooms', label: 'Räume' },
    { key: 'subjects', label: 'Themen' },
    { key: 'data', label: 'Plan & Daten' },
  ];
  let activeTab: Tab = $state('groups');

  const appState = $derived(getState());
  const sortedGroups = $derived([...appState.groups].sort((a, b) => a.order - b.order));
  const phases = $derived(orderedPhases(appState));

  // One line, not a paragraph: the full explanation lives behind the ⓘ so it
  // isn't re-read on every visit to the tab.
  const TAB_INTRO: Record<Tab, { short: string; long: string }> = {
    groups: {
      short: 'Gruppen sind die Spalten des Stundenplans.',
      long: 'Jede Gruppe muss jedes Thema besuchen. Inaktive Gruppen behalten ihre Daten, werden aber im Kalender ausgeblendet und von der Konfliktprüfung übersprungen.',
    },
    phases: {
      short: 'Phasen teilen die Woche in Abschnitte mit eigenen Gruppen.',
      long: 'Ein Kadervorkurs braucht nur eine Gruppe, die Gruppenrotation alle. Jede Phase wird als eigener Kalender gezeichnet, damit schmale Phasen keinen Platz verschwenden.',
    },
    teachers: {
      short: 'Derselbe Gruppenführer kann nicht zweimal gleichzeitig eingeteilt sein.',
      long: 'Konflikte bei Gruppenführern sind harte Konflikte. Kürzel und Farbe sind das, was auf den Karten im Kalender erscheint.',
    },
    rooms: {
      short: 'Räume werden auf weiche Konflikte geprüft.',
      long: 'Bei geteilten Flächen wie «draussen», wo zwei Gruppen problemlos am selben Ort sein können, die Konfliktprüfung ausschalten.',
    },
    subjects: {
      short: 'Themen werden auf den Kalender gezogen und dort zu Lektionen.',
      long: 'Ihre Vorgaben — Gruppenführer, Raum, Dauer — werden auf jede platzierte Lektion kopiert, wo sie einzeln überschrieben werden können. Auch Inhalt (Lernziele, Notizen) liegt am Thema. Die Dauer ist zugleich das Soll pro Gruppe.',
    },
    data: {
      short: 'Ein Plan, in diesem Browser gespeichert. Eine Datei ist der Weg hinaus und zurück.',
      long: 'Alles liegt im localStorage dieses Browsers — Website-Daten löschen löscht den Plan. Der Export schreibt den ganzen Plan in eine JSON-Datei; ein Import ersetzt, was hier ist. Es gibt keine Planbibliothek: die Datei ist das Archiv.',
    },
  };

  let introOpen = $state(false);

  // ─── Master-detail selection ──────────────────────────────────────────────
  let selectedTeacherId: ID | null = $state(getState().teachers[0]?.id ?? null);
  let selectedRoomId: ID | null = $state(getState().rooms[0]?.id ?? null);
  let selectedSubjectId: ID | null = $state(getState().subjects[0]?.id ?? null);
  let addingSubject = $state(false);

  const selectedTeacher = $derived(appState.teachers.find(t => t.id === selectedTeacherId) ?? null);
  const selectedRoom    = $derived(appState.rooms.find(r => r.id === selectedRoomId) ?? null);
  const selectedSubject = $derived(appState.subjects.find(s => s.id === selectedSubjectId) ?? null);

  // Alphabetical everywhere, breaks kept apart: the stored order is insertion
  // order, which stops being findable at about a dozen subjects.
  const listedSubjects = $derived([
    ...sortSubjects(appState.subjects.filter(s => !s.isBreak)),
    ...sortSubjects(appState.subjects.filter(s => s.isBreak)),
  ]);

  // A fresh entity opens on a colour that is far from the ones already in use.
  const nextTeacherColor = $derived(generateDistinctColor(appState.teachers.map(t => t.color)));
  const nextRoomColor    = $derived(generateDistinctColor(appState.rooms.map(r => r.color)));
  const nextSubjectColor = $derived(generateDistinctColor(appState.subjects.map(s => s.color)));

  /** After a delete, land on the entity that slid into the removed one's place. */
  function neighbourId(list: { id: ID }[], index: number): ID | null {
    return list[index]?.id ?? list.at(-1)?.id ?? null;
  }

  // Quick add: a name and Enter. The short name is derived and the colour is
  // picked to sit far from the ones in use — both editable in the pane that
  // opens right after, which is where they belong anyway.
  function quickAddTeacher(name: string): void {
    selectedTeacherId = addTeacher(name, generateInitials(name), nextTeacherColor);
  }

  function quickAddRoom(name: string): void {
    selectedRoomId = addRoom(name, nextRoomColor, false);
  }

  // ─── Groups ───────────────────────────────────────────────────────────────
  function nextGroupLabel(): string {
    let i = 1;
    while (appState.groups.some(g => g.label === `G${i}`)) i++;
    return `G${i}`;
  }
  // Deleting a lane takes its events with it, so say how many before doing it.
  function confirmRemoveGroup(id: ID, label: string): void {
    const count = eventCountForGroup(id);
    const detail = count === 0
      ? 'Sie hat keine eigenen Lektionen.'
      : `${count} auf dieser Gruppe platzierte ${count === 1 ? 'Lektion wird' : 'Lektionen werden'} gelöscht.`;
    if (!window.confirm(`Gruppe «${label}» löschen?\n${detail}`)) return;
    removeGroup(id);
  }

  // Drag to reorder: the rows *are* the columns of the timetable, so dragging
  // them is the gesture that matches. The ▲▼ buttons stay for the keyboard.
  let dragId: ID | null = $state(null);

  function onDrop(targetId: ID): void {
    const dragged = dragId;
    const to = sortedGroups.findIndex(g => g.id === targetId);
    dragId = null;
    if (dragged === null || to < 0) return;
    moveGroupToIndex(dragged, to);
  }

  // ─── Phases ───────────────────────────────────────────────────────────────
  /** A new phase takes the days after the last one, through Friday. */
  function submitPhase(label: string): void {
    const lastDay = appState.phases.reduce((m, p) => Math.max(m, p.endDay), -1);
    const start = Math.min(lastDay + 1, DAY_NAMES.length - 1);
    addPhase(label, start, DAY_NAMES.length - 1, appState.groups.filter(g => g.enabled).map(g => g.id));
  }

  // Moving one end past the other drags the other end along, so a phase can
  // never end before it starts.
  function setPhaseStart(id: ID, startDay: number, endDay: number): void {
    updatePhase(id, startDay > endDay ? { startDay, endDay: startDay } : { startDay });
  }

  function setPhaseEnd(id: ID, endDay: number, startDay: number): void {
    updatePhase(id, endDay < startDay ? { endDay, startDay: endDay } : { endDay });
  }

  // Removing a phase keeps its events but leaves them on no calendar at all.
  function confirmRemovePhase(id: ID, label: string): void {
    const count = eventCountForPhase(id);
    const detail = count === 0
      ? 'Sie deckt keine Lektionen ab.'
      : `${count} ${count === 1 ? 'Lektion an diesen Tagen wird' : 'Lektionen an diesen Tagen werden'} nirgends mehr gezeichnet — ` +
        `sie erscheinen unter «Auf keinem Kalender», bis sie verschoben werden.`;
    if (!window.confirm(`Phase «${label}» löschen?\n${detail}`)) return;
    removePhase(id);
  }

  /** Colour a phase gets in the week strip — position, not identity. */
  const PHASE_HUES = ['var(--color-primary)', 'var(--color-accent)', 'var(--color-info)', 'var(--color-success)'];

  // Phases are drawn independently, so a bad day range silently hides events
  // rather than erroring — surface the common mistakes instead.
  const phaseWarning = $derived.by(() => {
    const problems: string[] = [];
    if (appState.phases.some(p => p.endDay < p.startDay)) {
      problems.push('eine Phase endet vor ihrem Beginn');
    }
    if (appState.phases.some(p => p.groupIds.length === 0)) {
      problems.push('eine Phase hat keine Gruppen');
    }
    const covered = new Set<number>();
    let overlaps = false;
    for (const p of appState.phases) {
      for (let d = p.startDay; d <= p.endDay; d++) {
        if (covered.has(d)) overlaps = true;
        covered.add(d);
      }
    }
    if (overlaps) problems.push('zwei Phasen decken denselben Tag ab');
    const uncovered = DAY_NAMES.filter((_, i) => !covered.has(i));
    if (uncovered.length > 0) problems.push(`${uncovered.join(', ')} von keiner Phase abgedeckt`);
    return problems.length > 0 ? `Phasen prüfen: ${problems.join('; ')}.` : null;
  });

  /** Which phase owns each weekday — drives the strip above the phase table. */
  const weekStrip = $derived(
    DAY_NAMES.map((name, day) => {
      const index = phases.findIndex(p => day >= p.startDay && day <= p.endDay);
      return {
        name,
        phase: index >= 0 ? phases[index]! : null,
        hue: index >= 0 ? PHASE_HUES[index % PHASE_HUES.length]! : null,
      };
    }),
  );

  // ─── Plan & data ──────────────────────────────────────────────────────────
  let importError: string | null = $state(null);
  let importFileEl: HTMLInputElement | undefined = $state();

  function exportPlan(): void {
    const state = getState();
    const blob = new Blob([serializePlan(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = planFileName(state);
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File): Promise<void> {
    importError = null;
    const result = parsePlan(await file.text());
    if (!result.ok) {
      importError = result.error;
      return;
    }
    const incoming = result.state;
    const events = incoming.events.length;
    if (!window.confirm(
      `«${incoming.name}» laden?\n\n` +
      `Er enthält ${events} ${events === 1 ? 'Lektion' : 'Lektionen'} und beginnt am ${incoming.wkStartDate}.\n\n` +
      'Das ersetzt den Plan in diesem Browser, und der Verlauf wird gelöscht. ' +
      'Zuerst den aktuellen Plan exportieren, wenn er behalten werden soll.',
    )) return;
    replacePlan(incoming);
    onclose();
  }

  function onImportChange(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so choosing the same file twice fires a change event both times.
    input.value = '';
    if (file) void handleImportFile(file);
  }

  function handleClearAll(): void {
    if (!window.confirm(
      'ALLE Daten löschen?\n\nDas entfernt endgültig jede Lektion, jede Gruppe, jeden Gruppenführer, jeden Raum und jedes Thema und setzt auf die Vorgaben zurück.\n\nDas kann nicht rückgängig gemacht werden.'
    )) return;
    resetToDefaults();
    onclose();
  }

  let dialogEl: HTMLDialogElement;
  $effect(() => { if (dialogEl) dialogEl.showModal(); });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} onclose={onclose} onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}
  class="modal">
  <div class="config-panel">

    <!-- Header -->
    <header class="cfg-head">
      <h3 class="cfg-title">Konfiguration</h3>
      <button class="cfg-x" onclick={onclose} aria-label="Schliessen">
        <Icon name="x" size={16} />
      </button>
    </header>

    <!-- Tabs -->
    <div role="tablist" class="cfg-tabs">
      {#each TABS as tab (tab.key)}
        <button
          role="tab"
          class="cfg-tab"
          class:cfg-tab-on={activeTab === tab.key}
          aria-selected={activeTab === tab.key}
          onclick={() => { activeTab = tab.key; introOpen = false; }}
        >{tab.label}</button>
      {/each}
    </div>

    <!-- One-line intro; the rest is behind the ⓘ -->
    <div class="intro-band">
      <p>{TAB_INTRO[activeTab].short}</p>
      <button class="intro-more" onclick={() => (introOpen = !introOpen)}>
        <Icon name="info" size={13} />
        {introOpen ? 'weniger' : 'mehr'}
      </button>
    </div>
    {#if introOpen}
      <p class="intro-long">{TAB_INTRO[activeTab].long}</p>
    {/if}

    <!-- Content -->
    <div class="cfg-body">

      <!-- ════ GROUPS ════════════════════════════════════════════════════════ -->
      {#if activeTab === 'groups'}
        <div class="pane">
          <div class="pane-scroll">
            {#if appState.groups.length > 0}
              <div class="table">
                <div class="table-head grid-groups">
                  <span></span>
                  <span class="text-center">Aktiv</span>
                  <span>Bezeichnung</span>
                  <span class="text-center">Reihenfolge</span>
                  <span></span>
                </div>
                {#each sortedGroups as g, i (g.id)}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="table-row grid-groups"
                    class:row-off={!g.enabled}
                    class:row-dragging={dragId === g.id}
                    draggable="true"
                    ondragstart={() => (dragId = g.id)}
                    ondragover={(e) => e.preventDefault()}
                    ondrop={(e) => { e.preventDefault(); onDrop(g.id); }}
                    ondragend={() => (dragId = null)}
                  >
                    <span class="drag-handle" title="Ziehen, um die Spalten neu zu ordnen">
                      <Icon name="grip" size={14} />
                    </span>
                    <div class="flex justify-center">
                      <input type="checkbox" class="toggle toggle-primary toggle-sm"
                        checked={g.enabled}
                        aria-label="Gruppe aktiv"
                        onchange={(e) => updateGroup(g.id, { enabled: (e.currentTarget as HTMLInputElement).checked })}
                      />
                    </div>
                    <input class="input input-bordered input-sm w-28" type="text" value={g.label}
                      aria-label="Gruppenbezeichnung"
                      onchange={(e) => updateGroup(g.id, { label: (e.currentTarget as HTMLInputElement).value })}
                    />
                    <div class="order-btns">
                      <button class="mini" disabled={i === 0}
                        onclick={() => moveGroupUp(g.id)} aria-label="Nach oben">
                        <Icon name="chevronUp" size={12} />
                      </button>
                      <button class="mini" disabled={i === sortedGroups.length - 1}
                        onclick={() => moveGroupDown(g.id)} aria-label="Nach unten">
                        <Icon name="chevronDown" size={12} />
                      </button>
                    </div>
                    <button class="mini mini-danger"
                      onclick={() => confirmRemoveGroup(g.id, g.label)} aria-label="Gruppe löschen">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                {/each}
              </div>
              <p class="field-hint mt-3">
                Switching a group off keeps its events; they are simply not drawn and stop
                raising conflicts.
              </p>
            {:else}
              <p class="pane-empty">No groups yet. Add one below.</p>
            {/if}
          </div>

          <AddRow
            label="Gruppe hinzufügen"
            placeholder="G4"
            nextValue={nextGroupLabel}
            onadd={addGroup}
            inputClass="w-28"
          />
        </div>

      <!-- ════ PHASES ════════════════════════════════════════════════════════ -->
      {:else if activeTab === 'phases'}
        <div class="pane">
          <div class="pane-scroll">
            <!-- The week at a glance: the one picture that explains the model. -->
            <div class="week-strip">
              {#each weekStrip as day (day.name)}
                <div class="strip-day" style={day.hue ? `--ph:${day.hue}` : ''} class:strip-gap={!day.phase}>
                  <span class="strip-name">{day.name}</span>
                  <span class="strip-phase">{day.phase?.label ?? 'keine Phase'}</span>
                </div>
              {/each}
            </div>

            {#if phaseWarning}
              <p class="warn-banner">
                <Icon name="alert" size={14} /> {phaseWarning}
              </p>
            {/if}

            {#if appState.phases.length > 0}
              <div class="table">
                <div class="table-head grid-phases">
                  <span>Bezeichnung</span>
                  <span>Von</span>
                  <span>Bis</span>
                  <span>Gruppen</span>
                  <span></span>
                </div>
                {#each phases as p, i (p.id)}
                  <div class="table-row grid-phases">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="phase-swatch" style="background:{PHASE_HUES[i % PHASE_HUES.length]}"></span>
                      <input class="input input-bordered input-sm w-full" type="text" value={p.label}
                        aria-label="Phasenbezeichnung"
                        onchange={(e) => updatePhase(p.id, { label: (e.currentTarget as HTMLInputElement).value })}
                      />
                    </div>
                    <select class="select select-bordered select-sm" value={p.startDay}
                      aria-label="Erster Tag"
                      onchange={(e) => setPhaseStart(p.id, Number((e.currentTarget as HTMLSelectElement).value), p.endDay)}>
                      {#each DAY_NAMES as name, d (name)}
                        <option value={d}>{name}</option>
                      {/each}
                    </select>
                    <select class="select select-bordered select-sm" value={p.endDay}
                      aria-label="Letzter Tag"
                      onchange={(e) => setPhaseEnd(p.id, Number((e.currentTarget as HTMLSelectElement).value), p.startDay)}>
                      {#each DAY_NAMES as name, d (name)}
                        <option value={d}>{name}</option>
                      {/each}
                    </select>
                    <div class="lane-picks">
                      {#each sortedGroups as g (g.id)}
                        <label class="lane-pick" class:lane-pick-on={p.groupIds.includes(g.id)}>
                          <input type="checkbox"
                            checked={p.groupIds.includes(g.id)}
                            onchange={(e) => updatePhase(p.id, {
                              groupIds: (e.currentTarget as HTMLInputElement).checked
                                ? [...p.groupIds, g.id]
                                : p.groupIds.filter(id => id !== g.id),
                            })}
                          />
                          {g.label}
                        </label>
                      {/each}
                    </div>
                    <button class="mini mini-danger"
                      onclick={() => confirmRemovePhase(p.id, p.label)} aria-label="Phase löschen">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="pane-empty">No phases yet. Add one below.</p>
            {/if}
          </div>

          <AddRow label="Phase hinzufügen" placeholder="Name der Phase" onadd={submitPhase} />
        </div>

      <!-- ════ TEACHERS ══════════════════════════════════════════════════════ -->
      {:else if activeTab === 'teachers'}
        <MasterDetail
          items={appState.teachers}
          selectedId={selectedTeacherId}
          addLabel="Gruppenführer hinzufügen"
          placeholder="Name des Gruppenführers"
          emptyListText="Noch keine Gruppenführer"
          onselect={(id) => (selectedTeacherId = id)}
          onquickadd={quickAddTeacher}
        >
          {#snippet row(t)}
            <span class="list-avatar" style="background:{t.color}">{teacherShort(t)}</span>
            <span class="truncate min-w-0 flex-1">{t.name}</span>
            {#if t.unavailable.length > 0}
              <span class="row-tag" title={t.unavailable.map(describeWindow).join(' · ')}>abwesend</span>
            {/if}
          {/snippet}
          {#snippet detail()}
            {#if selectedTeacher}
              {#key selectedTeacher.id}
                <TeacherDetail
                  teacher={selectedTeacher}
                  ondeleted={(i) => (selectedTeacherId = neighbourId(getState().teachers, i))}
                />
              {/key}
            {:else}
              <div class="empty-detail">
                <Icon name="users" size={26} />
                <span>Unten einen Namen eingeben, um einen Gruppenführer hinzuzufügen — bearbeitet wird er dann hier.</span>
              </div>
            {/if}
          {/snippet}
        </MasterDetail>

      <!-- ════ ROOMS ═════════════════════════════════════════════════════════ -->
      {:else if activeTab === 'rooms'}
        <MasterDetail
          items={appState.rooms}
          selectedId={selectedRoomId}
          addLabel="Raum hinzufügen"
          placeholder="Raumname"
          emptyListText="Noch keine Räume"
          onselect={(id) => (selectedRoomId = id)}
          onquickadd={quickAddRoom}
        >
          {#snippet row(r)}
            <span class="w-2.5 h-full min-h-[1.4rem] rounded-sm shrink-0 self-stretch" style="background:{r.color}"></span>
            <span class="truncate min-w-0 flex-1">{r.name}</span>
            {#if r.unavailable.length > 0}
              <span class="row-tag" title={r.unavailable.map(describeWindow).join(' · ')}>blocked</span>
            {/if}
            {#if r.excludeFromConflictCheck}
              <span class="row-tag">shared</span>
            {/if}
          {/snippet}
          {#snippet detail()}
            {#if selectedRoom}
              {#key selectedRoom.id}
                <RoomDetail
                  room={selectedRoom}
                  ondeleted={(i) => (selectedRoomId = neighbourId(getState().rooms, i))}
                />
              {/key}
            {:else}
              <div class="empty-detail">
                <Icon name="pin" size={26} />
                <span>Unten einen Namen eingeben, um einen Raum hinzuzufügen — bearbeitet wird er dann hier.</span>
              </div>
            {/if}
          {/snippet}
        </MasterDetail>

      <!-- ════ SUBJECTS ══════════════════════════════════════════════════════ -->
      {:else if activeTab === 'subjects'}
        <MasterDetail
          items={listedSubjects}
          selectedId={selectedSubjectId}
          adding={addingSubject}
          addLabel="Thema hinzufügen"
          emptyListText="Noch keine Themen"
          onselect={(id) => { selectedSubjectId = id; addingSubject = false; }}
          onadd={() => { addingSubject = true; selectedSubjectId = null; }}
        >
          {#snippet row(s)}
            <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:{s.color}"></span>
            <span class="truncate min-w-0 flex-1">{s.name}</span>
            {#if s.isBreak}
              <span class="row-tag">Pause</span>
            {/if}
          {/snippet}
          {#snippet detail()}
            {#if addingSubject || selectedSubject}
              {#key selectedSubject?.id ?? 'new'}
                <SubjectDetail
                  subject={addingSubject ? null : selectedSubject}
                  draftColor={nextSubjectColor}
                  oncreated={(id) => { addingSubject = false; selectedSubjectId = id; }}
                  oncancel={() => { addingSubject = false; selectedSubjectId = listedSubjects[0]?.id ?? null; }}
                  ondeleted={() => (selectedSubjectId = listedSubjects.find(s => s.id !== selectedSubjectId)?.id ?? null)}
                />
              {/key}
            {:else}
              <div class="empty-detail">
                <Icon name="calendar" size={26} />
                <span>Ein Thema zum Bearbeiten wählen, oder ein neues hinzufügen.</span>
              </div>
            {/if}
          {/snippet}
        </MasterDetail>

      <!-- ════ PLAN & DATA ═══════════════════════════════════════════════════ -->
      {:else if activeTab === 'data'}
        <div class="pane">
          <div class="pane-scroll">
            <div class="data-stack">

              <section class="data-card">
                <h4 class="section-title">Planname</h4>
                <p class="field-hint">
                  Erscheint in der Werkzeugleiste, auf den gedruckten Plänen und im Namen der Exportdatei.
                </p>
                <input
                  class="input input-bordered input-sm w-80 max-w-full"
                  type="text"
                  value={appState.name}
                  placeholder="z. B. WK 2026 Zug 3"
                  aria-label="Planname"
                  onchange={(e) => setPlanName((e.currentTarget as HTMLInputElement).value.trim() || 'WK-Plan')}
                />
              </section>

              <section class="data-card">
                <h4 class="section-title">Plandatei</h4>
                <p class="field-hint">
                  Der Plan liegt nur in diesem Browser. Eine Datei ist die Sicherung, der Weg auf einen
                  anderen Rechner und der Weg zu jemand anderem.
                </p>
                <div class="data-actions">
                  <button class="btn btn-sm btn-primary gap-1.5" onclick={exportPlan}>
                    <Icon name="download" size={14} /> Plan exportieren …
                  </button>
                  <button class="btn btn-sm gap-1.5" onclick={() => importFileEl?.click()}>
                    <Icon name="upload" size={14} /> Plan importieren …
                  </button>
                  <input
                    bind:this={importFileEl}
                    type="file"
                    accept="application/json,.json"
                    class="hidden"
                    onchange={onImportChange}
                  />
                </div>
                <p class="field-hint">
                  <span class="wk-num">{appState.events.length}</span> Lektionen ·
                  <span class="wk-num">{appState.subjects.length}</span> Themen ·
                  <span class="wk-num">{appState.teachers.length}</span> Gruppenführer ·
                  <span class="wk-num">{appState.rooms.length}</span> Räume
                </p>
                {#if importError}
                  <p class="warn-banner"><Icon name="alert" size={14} /> {importError}</p>
                {/if}
              </section>

              <section class="data-card data-card-danger">
                <h4 class="section-title">Gefahrenzone</h4>
                <div class="danger-body">
                  <span class="danger-note">
                    Entfernt jede Lektion, jede Gruppe, jeden Gruppenführer, jeden Raum und jedes Thema und beginnt
                    wieder mit den Vorgaben. Vorher exportieren, wenn etwas erhalten bleiben soll.
                  </span>
                  <button class="btn btn-sm btn-error gap-1.5" onclick={handleClearAll}>
                    <Icon name="trash" size={13} /> Alle Daten zurücksetzen
                  </button>
                </div>
              </section>

            </div>
          </div>
        </div>
      {/if}

    </div>

  </div>
</dialog>

<style>
  dialog::backdrop {
    background: color-mix(in oklab, black 45%, transparent);
  }

  .config-panel {
    display: flex;
    flex-direction: column;
    width: min(1000px, 92vw);
    /* Fixed: a short tab used to shrink the dialog and move the tab strip out
       from under the pointer mid-click. */
    height: 82vh;
    background: var(--wk-surface);
    color: var(--wk-text);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
    overflow: hidden;
  }

  .cfg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .cfg-title {
    font-size: var(--wk-fs-lg);
    font-weight: 700;
    margin: 0;
  }

  .cfg-x {
    display: flex;
    padding: 0.3rem;
    border: none;
    border-radius: var(--wk-r-sm);
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .cfg-x:hover { background: var(--wk-surface-alt); color: var(--wk-text); }

  .cfg-tabs {
    display: flex;
    gap: 0.15rem;
    padding: 0 1.25rem;
    border-bottom: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .cfg-tab {
    padding: 0.6rem 0.7rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-sm);
    font-weight: 550;
    cursor: pointer;
  }
  .cfg-tab:hover { color: var(--wk-text); }
  .cfg-tab-on {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
    font-weight: 650;
  }

  .intro-band {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-shrink: 0;
    padding: 0.45rem 1.25rem;
    background: var(--wk-surface-alt);
    border-bottom: 1px solid var(--wk-line);
  }

  .intro-band p {
    margin: 0;
    flex: 1;
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
  }

  .intro-more {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    border: none;
    background: none;
    color: var(--color-primary);
    font-size: var(--wk-fs-2xs);
    cursor: pointer;
  }
  .intro-more:hover { text-decoration: underline; }

  .intro-long {
    flex-shrink: 0;
    margin: 0;
    padding: 0.55rem 1.25rem;
    font-size: var(--wk-fs-xs);
    line-height: 1.55;
    color: var(--wk-text-mute);
    background: var(--wk-surface-alt);
    border-bottom: 1px solid var(--wk-line);
  }

  .cfg-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    overflow: hidden;
  }

  .pane-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.4rem;
  }

  .pane-empty {
    font-size: var(--wk-fs-sm);
    color: var(--wk-text-faint);
    text-align: center;
    padding: 1.5rem 0;
  }

  /* ── Tables ─────────────────────────────────────────────────────────────── */
  .table {
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-md);
    overflow: hidden;
    max-width: 46rem;
  }

  .table-head {
    align-items: center;
    padding: 0.4rem 0.85rem;
    background: var(--wk-surface-alt);
    border-bottom: 1px solid var(--wk-line);
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--wk-text-faint);
  }

  .table-row {
    align-items: center;
    padding: 0.4rem 0.85rem;
    border-bottom: 1px solid var(--wk-line);
    transition: background 0.1s;
  }
  .table-row:last-child { border-bottom: 0; }
  .table-row:hover { background: color-mix(in oklab, var(--color-base-content) 3%, transparent); }

  .row-off { opacity: 0.45; }
  .row-dragging { opacity: 0.4; background: color-mix(in oklab, var(--color-primary) 10%, transparent); }

  .grid-groups {
    display: grid;
    grid-template-columns: 1.4rem 3rem 1fr 2.6rem 2rem;
    gap: 0.6rem;
  }

  .grid-phases {
    display: grid;
    grid-template-columns: minmax(9rem, 1fr) 5.5rem 5.5rem minmax(10rem, 1.2fr) 2rem;
    gap: 0.6rem;
  }

  .drag-handle {
    display: flex;
    color: var(--wk-text-faint);
    cursor: grab;
  }
  .drag-handle:active { cursor: grabbing; }

  .order-btns {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .mini {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 18px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .mini:hover:not(:disabled) { background: var(--wk-surface-alt); color: var(--wk-text); }
  .mini:disabled { opacity: 0.25; cursor: default; }

  .mini-danger { height: 24px; }
  .mini-danger:hover {
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 12%, transparent);
  }

  .row-tag {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
    flex-shrink: 0;
  }

  /* ── Phases: the week strip ─────────────────────────────────────────────── */
  .week-strip {
    display: flex;
    gap: 3px;
    margin-bottom: 1rem;
    max-width: 46rem;
  }

  .strip-day {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.45rem 0.55rem;
    border-radius: var(--wk-r-sm);
    border-top: 3px solid var(--ph, var(--wk-line-strong));
    background: color-mix(in oklab, var(--ph, gray) 9%, var(--wk-surface-alt));
    min-width: 0;
  }

  .strip-gap {
    background: repeating-linear-gradient(
      135deg,
      transparent 0 5px,
      color-mix(in oklab, var(--color-error) 12%, transparent) 5px 10px
    );
    border-top-color: var(--color-error);
  }

  .strip-name {
    font-size: var(--wk-fs-xs);
    font-weight: 700;
  }

  .strip-phase {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-mute);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .phase-swatch {
    width: 8px;
    height: 22px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .lane-picks {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .lane-pick {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    font-size: var(--wk-fs-xs);
    cursor: pointer;
  }
  .lane-pick-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
    font-weight: 600;
  }
  .lane-pick input { accent-color: var(--color-primary); }

  .warn-banner {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 46rem;
    margin-bottom: 0.9rem;
    padding: 0.5rem 0.7rem;
    border-radius: var(--wk-r-sm);
    font-size: var(--wk-fs-xs);
    background: color-mix(in oklab, var(--color-warning) 13%, transparent);
    color: color-mix(in oklab, var(--color-warning) 80%, var(--wk-text));
  }

  /* ── Plan & data ────────────────────────────────────────────────────────── */
  .data-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 46rem;
  }

  .data-card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-md);
    background: var(--wk-surface-alt);
  }

  .data-card-danger {
    border-color: color-mix(in oklab, var(--color-error) 35%, transparent);
    background: color-mix(in oklab, var(--color-error) 6%, transparent);
  }

  .data-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .danger-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .danger-note {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-mute);
  }
</style>
