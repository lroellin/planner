<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  // The grid keys are the fastest part of the app and were documented only in
  // SPECS.md, where nobody planning a WK is going to look for them.
  interface Shortcut {
    keys: string[];
    what: string;
  }

  // On macOS, Ctrl+click is the context menu — the browser never delivers it as
  // a click — so the additive gesture there is Cmd and the sheet has to say so.
  const mac =
    typeof navigator !== 'undefined' &&
    /mac|iphone|ipad/i.test(
      (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
        navigator.platform ??
        navigator.userAgent,
    );
  const MOD = mac ? '⌘' : 'Ctrl';

  const SECTIONS: { title: string; items: Shortcut[] }[] = [
    {
      title: 'Allgemein',
      items: [
        { keys: [MOD, 'Z'], what: 'Rückgängig' },
        { keys: [MOD, '⇧', 'Z'], what: 'Wiederholen' },
        { keys: [MOD, 'P'], what: 'Drucken — Arbeitsprogramm oder Handzettel' },
        { keys: ['?'], what: 'Diese Übersicht' },
        { keys: ['Esc'], what: 'Dialog schliessen oder Auswahl aufheben' },
      ],
    },
    {
      title: 'Auswählen',
      items: [
        { keys: ['Klick'], what: 'Lektion auswählen und Schnellbearbeitung öffnen' },
        { keys: ['Doppelklick'], what: 'Vollständigen Editor öffnen' },
        { keys: ['Rechtsklick'], what: 'Auf eine Lektion: Schnellbearbeitung; auf leere Fläche: Lektion einsetzen' },
        { keys: [MOD, 'Klick'], what: 'Lektion zur Auswahl hinzufügen oder entfernen' },
        { keys: ['⇧', 'Klick'], what: 'Lektion zur Auswahl hinzufügen' },
        { keys: ['Ziehen'], what: 'Rahmen über leere Fläche wählt alles darin aus' },
        { keys: [MOD, 'A'], what: 'Alle sichtbaren Lektionen auswählen' },
        { keys: ['Klick'], what: 'Auf den Tag im Kalenderkopf: ganzen Tag auswählen' },
        { keys: ['Klick'], what: 'Auf die Gruppe im Kalenderkopf: diese Gruppe an diesem Tag' },
        { keys: ['Klick'], what: 'Auf die Uhrzeit links: alles, was zu dieser Zeit läuft' },
      ],
    },
    {
      title: 'Kalender',
      items: [
        { keys: ['Klick'], what: 'Auf den Phasennamen über dem Kalender: Phase ein- oder ausklappen' },
      ],
    },
    {
      title: 'Ausgewählte Lektionen',
      items: [
        { keys: ['↑↓'], what: 'Um 15 Minuten verschieben' },
        { keys: ['⇧', '↑↓'], what: 'Um 15 Minuten verlängern oder kürzen' },
        { keys: ['←→'], what: 'Einen Tag verschieben' },
        { keys: ['Enter'], what: 'Vollständigen Editor öffnen' },
        { keys: [MOD, 'D'], what: 'Duplizieren' },
        { keys: ['Entf'], what: 'Löschen' },
      ],
    },
  ];

  /**
   * Z2: focus the dialog itself, not its close button.
   *
   * `showModal()` hands focus to the first focusable descendant, which in every
   * one of these is the ✕ — so a keyboard user opened the dialog already on
   * "leave", and their first Tab went out of the content rather than into it.
   * The panel takes `tabindex="-1"` so it can hold focus without joining the tab
   * order; the first Tab then lands on the first real control.
   */
  let dialogEl: HTMLDialogElement;
  let sheetEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (!dialogEl) return;
    dialogEl.showModal();
    sheetEl?.focus();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialogEl}
  onclose={onclose}
  onclick={(e) => { if (e.target === dialogEl) dialogEl.close(); }}
  class="modal"
>
  <div bind:this={sheetEl} class="sheet" tabindex="-1">
    <header class="sheet-head">
      <h3 class="sheet-title">Tastenkürzel</h3>
      <button class="sheet-x" onclick={onclose} aria-label="Schliessen">
        <Icon name="x" size={16} />
      </button>
    </header>

    <div class="sheet-body">
      {#each SECTIONS as section (section.title)}
        <section class="group">
          <p class="wk-eyebrow">{section.title}</p>
          <dl class="rows">
            {#each section.items as item (item.what)}
              <div class="row">
                <dt class="keys">
                  {#each item.keys as key, i (key + i)}
                    {#if i > 0}<span class="plus">+</span>{/if}
                    <kbd class="key">{key}</kbd>
                  {/each}
                </dt>
                <dd class="what">{item.what}</dd>
              </div>
            {/each}
          </dl>
        </section>
      {/each}
    </div>

    <footer class="sheet-foot">
      <p class="foot-note">
        Tastenkürzel wirken nicht, solange der Fokus in einem Eingabefeld steht.
      </p>
      <!-- Ghost: this sheet is read, not acted on. A solid primary implied there
           was something here to commit. -->
      <button class="btn btn-sm btn-ghost" onclick={onclose}>Schliessen</button>
    </footer>
  </div>
</dialog>

<style>
  dialog::backdrop {
    background: var(--wk-scrim);
  }

  .modal {
    border: none;
    padding: 0;
    background: none;
    margin: auto;
  }

  .sheet {
    width: min(620px, 92vw);
    max-height: 82vh;
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

  .sheet-title {
    flex: 1;
    font-size: var(--wk-fs-md);
    font-weight: 650;
  }

  .sheet-x {
    border: none;
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
    display: flex;
    padding: 2px;
  }
  .sheet-x:hover { color: var(--wk-text); }

  .sheet-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.9rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  /* One grid for the section, so the key column is as wide as its widest cap
     and no wider. As a fixed 180px track with the caps left-aligned in it, a
     one-key row like "?" left ~160px of empty gutter before its meaning, and
     the eye had to cross the sheet to pair them up. */
  .rows {
    display: grid;
    grid-template-columns: max-content 1fr;
    align-items: baseline;
    gap: 0.1rem 2rem;
    margin-top: 0.4rem;
  }

  .row {
    display: contents;
  }

  /* Right-aligned in their own track: the caps end at a common edge, so the
     gap between a shortcut and its meaning is the same on every row. */
  .keys {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.2rem;
    flex-wrap: wrap;
    padding: 0.22rem 0;
  }

  .what {
    padding: 0.22rem 0;
  }

  .key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    padding: 0.1rem 0.35rem;
    border: 1px solid var(--wk-line-strong);
    border-bottom-width: 2px;
    border-radius: 5px;
    background: var(--wk-surface-alt);
    font-family: inherit;
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    color: var(--wk-text-mute);
  }

  .plus {
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
  }

  .what {
    font-size: var(--wk-fs-xs);
    color: var(--wk-text);
  }

  .sheet-foot {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 1rem;
    border-top: 1px solid var(--wk-line);
    flex-shrink: 0;
  }

  .foot-note {
    flex: 1;
    font-size: var(--wk-fs-2xs);
    color: var(--wk-text-faint);
  }
</style>
