<script lang="ts">
  import { getState } from '../state/store.svelte';
  import {
    buildPrintDoc, isPlanTarget, TARGET_LABELS, type PlanTarget, type PrintTarget,
  } from '../print/boxes';
  import { PER_PAGE_CHOICES, gridFor } from '../print/layout';
  import { renderPdf, resolveFit, standLabel } from '../print/pdf';
  import { buildCalendarDoc } from '../print/calendar';
  import { renderCalendarPdf, type Orientation } from '../print/calendarPdf';
  import { orderedPhases, phaseGroups } from '../utils/timeUtils';
  import Icon from './Icon.svelte';
  import type { ID } from '../types';

  interface Props {
    target?: PrintTarget;
    onclose: () => void;
  }

  let { target = 'grid', onclose }: Props = $props();

  const appState = $derived(getState());

  /**
   * 'auto' picks the densest A4 division on which every box still fits whole.
   * The explicit choices are there for when you disagree with it — a denser grid
   * is allowed to overflow, and the note under the buttons says how badly.
   */
  let perPage: number | 'auto' = $state('auto');
  let showStand = $state(true);
  let orientation: Orientation = $state('landscape');

  /**
   * Two kinds of document, not four siblings. A Wochenplan is one sheet of the
   * whole week; a Handzettel is a stack of slips to cut up and give away — and
   * they take different options for that reason. Flattened into one row of four
   * buttons, the options below changed shape depending on which was picked, with
   * nothing on screen saying why.
   */
  type Category = 'grid' | 'handout';
  const HANDOUTS: PlanTarget[] = ['groups', 'teachers', 'rooms'];
  const HANDOUT_LABELS: Record<PlanTarget, string> = {
    groups: 'Gruppen',
    teachers: 'Ausbildner',
    rooms: 'Räume',
  };

  // svelte-ignore state_referenced_locally
  let category: Category = $state(target === 'grid' ? 'grid' : 'handout');
  // svelte-ignore state_referenced_locally
  let handout: PlanTarget = $state(target === 'grid' ? 'groups' : target);

  const activeTarget = $derived<PrintTarget>(category === 'grid' ? 'grid' : handout);

  const phases = $derived(orderedPhases(appState));
  /**
   * Which phases go on the sheet. A KVK and a Gruppenrotation are two different
   * documents for two different audiences; printing the week as one grid is
   * often not what is wanted, and the days of an unchecked phase drop out
   * entirely rather than printing empty.
   */
  let excludedPhases = $state(new Set<ID>());
  const includedPhaseIds = $derived(phases.filter(p => !excludedPhases.has(p.id)).map(p => p.id));

  function togglePhase(id: ID): void {
    const next = new Set(excludedPhases);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    excludedPhases = next;
  }

  const planTarget = $derived(isPlanTarget(activeTarget) ? activeTarget : null);
  const printDoc = $derived(planTarget ? buildPrintDoc(appState, planTarget) : null);
  const fit = $derived(printDoc ? resolveFit(printDoc, perPage) : null);
  const calendarDoc = $derived(
    planTarget ? null : buildCalendarDoc(appState, includedPhaseIds),
  );

  // Read on every render rather than once: a dialog left open while the plan is
  // edited must not print an hour-old timestamp as if it were now.
  const stand = $derived(showStand ? standLabel() : null);

  const empty = $derived(
    printDoc ? printDoc.boxes.length === 0 : (calendarDoc?.columns.length ?? 0) === 0,
  );

  const fileName = $derived(
    `${TARGET_LABELS[activeTarget].toLowerCase()}-${appState.wkStartDate}.pdf`,
  );

  function build() {
    const now = showStand ? standLabel() : null;
    if (planTarget && printDoc) {
      return renderPdf(printDoc, { wkName: appState.name, stand: now, perPage });
    }
    return renderCalendarPdf(buildCalendarDoc(appState, includedPhaseIds), {
      wkName: appState.name,
      stand: now,
      orientation,
    });
  }

  /**
   * The preview is the real document, not a mock-up of it: the same output shown
   * in the browser's own viewer. That is what makes an explicit override safe to
   * offer — you see the overflow before you spend the paper.
   */
  let previewUrl: string | null = $state(null);
  $effect(() => {
    // Named so the effect re-runs on each of them.
    void [activeTarget, perPage, stand, orientation, includedPhaseIds, appState];
    const url = build().output('bloburl').toString();
    previewUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  function save(): void {
    build().save(fileName);
  }

  function printNow(): void {
    // autoPrint + the blob in a new tab: the browser's print dialog opens on the
    // PDF itself, so what the printer gets is this file and not a re-rendered DOM.
    const doc = build();
    doc.autoPrint();
    window.open(doc.output('bloburl').toString(), '_blank');
  }

  let dialogEl: HTMLDialogElement;
  let sheetEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (!dialogEl) return;
    dialogEl.showModal();
    sheetEl?.focus();
  });

  const boxCount = $derived(printDoc?.boxes.length ?? 0);
  const grid = $derived(fit ? gridFor(fit.perPage) : null);
  const laneCount = $derived(calendarDoc?.columns.length ?? 0);
</script>

<dialog
  bind:this={dialogEl}
  onclose={onclose}
  onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}
  class="modal"
>
  <div bind:this={sheetEl} class="sheet" tabindex="-1">
    <header class="sheet-head">
      <h3 class="sheet-title">Drucken – {TARGET_LABELS[activeTarget]}</h3>
      <button class="sheet-x" onclick={onclose} aria-label="Schliessen">
        <Icon name="x" size={16} />
      </button>
    </header>

    <div class="sheet-body">
      <div class="controls">
        <div class="field">
          <span class="wk-eyebrow">Art</span>
          <div class="seg">
            <button
              class="seg-btn"
              class:seg-on={category === 'grid'}
              onclick={() => (category = 'grid')}
            >Wochenplan</button>
            <button
              class="seg-btn"
              class:seg-on={category === 'handout'}
              onclick={() => (category = 'handout')}
            >Handzettel</button>
          </div>
          <p class="hint">
            {#if category === 'grid'}
              Die ganze Woche auf einer Seite.
            {:else}
              Ein Blatt pro Gruppe, Ausbildner oder Raum – zum Ausschneiden und Verteilen.
            {/if}
          </p>
        </div>

        {#if category === 'handout'}
          <div class="field">
            <span class="wk-eyebrow">Ein Blatt pro</span>
            <div class="seg">
              {#each HANDOUTS as t (t)}
                <button
                  class="seg-btn"
                  class:seg-on={handout === t}
                  onclick={() => (handout = t)}
                >{HANDOUT_LABELS[t]}</button>
              {/each}
            </div>
          </div>
        {/if}

        {#if planTarget}
          <div class="field">
            <span class="wk-eyebrow">Blätter pro Seite</span>
            <div class="seg">
              <button class="seg-btn" class:seg-on={perPage === 'auto'} onclick={() => (perPage = 'auto')}>
                Auto
              </button>
              {#each PER_PAGE_CHOICES as n (n)}
                <button class="seg-btn" class:seg-on={perPage === n} onclick={() => (perPage = n)}>{n}</button>
              {/each}
            </div>
            <p class="hint">
              {#if boxCount === 0}
                Nichts zu drucken.
              {:else if fit && grid}
                {boxCount} {boxCount === 1 ? 'Blatt' : 'Blätter'} ·
                {grid.cols}×{grid.rows} pro A4 ·
                {fit.pages} {fit.pages === 1 ? 'Seite' : 'Seiten'}
                {#if fit.overflowing > 0}
                  <span class="warn">
                    · {fit.overflowing} {fit.overflowing === 1 ? 'Blatt läuft' : 'Blätter laufen'} über
                    und {fit.overflowing === 1 ? 'wird' : 'werden'} fortgesetzt
                  </span>
                {/if}
              {/if}
            </p>
          </div>
        {:else}
          <div class="field">
            <span class="wk-eyebrow">Phasen</span>
            {#each phases as phase (phase.id)}
              {@const lanes = phaseGroups(appState, phase).length}
              <label class="check">
                <input
                  type="checkbox"
                  checked={!excludedPhases.has(phase.id)}
                  onchange={() => togglePhase(phase.id)}
                />
                <span>
                  {phase.label}
                  <span class="sub">
                    {lanes} {lanes === 1 ? 'Gruppe' : 'Gruppen'}
                  </span>
                </span>
              </label>
            {:else}
              <p class="hint">Noch keine Phase erfasst.</p>
            {/each}
            <p class="hint">
              {#if laneCount === 0}
                <span class="warn">Keine Phase ausgewählt.</span>
              {:else}
                {laneCount} {laneCount === 1 ? 'Spalte' : 'Spalten'} auf einer Seite ·
                Tage einer abgewählten Phase fallen ganz weg.
              {/if}
            </p>
          </div>

          <div class="field">
            <span class="wk-eyebrow">Ausrichtung</span>
            <div class="seg">
              <button
                class="seg-btn"
                class:seg-on={orientation === 'landscape'}
                onclick={() => (orientation = 'landscape')}
              >Quer</button>
              <button
                class="seg-btn"
                class:seg-on={orientation === 'portrait'}
                onclick={() => (orientation = 'portrait')}
              >Hoch</button>
            </div>
          </div>
        {/if}

        <label class="check">
          <input type="checkbox" bind:checked={showStand} />
          <span>Stand (Datum und Uhrzeit) auf jedem Blatt</span>
        </label>

        <p class="note">
          {#if planTarget}
            Entlang der Schnittmarken am Seitenrand schneiden. Jedes Blatt trägt Name,
            Kurs und Stand, damit es einzeln lesbar bleibt.
          {:else}
            Der Wochenplan wird auf eine A4-Seite gezeichnet und passt sich ihr an.
            Konflikte sind rot umrandet: durchgezogen hart, gestrichelt weich.
          {/if}
        </p>
      </div>

      <div class="preview">
        {#if previewUrl}
          <iframe src={previewUrl} title="PDF-Vorschau"></iframe>
        {/if}
      </div>
    </div>

    <footer class="sheet-foot">
      <button class="btn btn-sm btn-ghost" onclick={onclose}>Schliessen</button>
      <div class="spacer"></div>
      <button class="btn btn-sm" onclick={save} disabled={empty}>
        <Icon name="download" size={14} /> PDF speichern
      </button>
      <button class="btn btn-sm btn-primary" onclick={printNow} disabled={empty}>
        <Icon name="printer" size={14} /> Drucken
      </button>
    </footer>
  </div>
</dialog>

<style>
  dialog::backdrop { background: var(--wk-scrim); }

  .modal {
    border: none;
    padding: 0;
    background: none;
    margin: auto;
  }

  .sheet {
    width: min(1060px, 94vw);
    height: min(780px, 90vh);
    display: flex;
    flex-direction: column;
    background: var(--wk-surface);
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-md);
    box-shadow: var(--wk-shadow-2);
    color: var(--wk-text);
  }

  .sheet-head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .sheet-title { flex: 1; font-size: var(--wk-fs-md); font-weight: 650; }

  .sheet-x {
    border: none;
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
    display: flex;
    padding: 2px;
  }
  .sheet-x:hover { color: var(--wk-text); }

  /* Controls left, the document itself right: the preview is the larger half
     because it is the thing being decided about. */
  .sheet-body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 1rem;
    padding: 1rem;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    overflow-y: auto;
  }

  .field { display: flex; flex-direction: column; gap: 0.4rem; }

  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .seg-btn {
    border: 1px solid var(--wk-line);
    background: var(--wk-surface);
    color: var(--wk-text-muted);
    border-radius: var(--wk-r-sm);
    padding: 0.28rem 0.55rem;
    font-size: var(--wk-fs-sm);
    cursor: pointer;
  }
  .seg-btn:hover { background: var(--wk-surface-alt); color: var(--wk-text); }
  .seg-on,
  .seg-on:hover {
    background: var(--wk-accent-soft);
    border-color: var(--wk-accent);
    color: var(--wk-accent);
    font-weight: 600;
  }

  .hint { font-size: var(--wk-fs-xs); color: var(--wk-text-muted); line-height: 1.45; }
  .warn { color: var(--wk-warn, #b45309); }
  .sub { color: var(--wk-text-faint); font-size: var(--wk-fs-xs); }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--wk-fs-sm);
    cursor: pointer;
  }

  .note {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-faint);
    line-height: 1.5;
    margin-top: auto;
    padding-top: 0.5rem;
  }

  .preview {
    min-width: 0;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    overflow: hidden;
    background: var(--wk-surface-alt);
  }

  .preview iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }

  .sheet-foot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .spacer { flex: 1; }
</style>
