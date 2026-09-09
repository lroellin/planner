<script lang="ts">
  /**
   * Learning objectives, one per row.
   *
   * A textarea would have been less code, but goals are entered in bursts —
   * three or four at a time, from a Lehrmittel — so the row editor is built for
   * that: Enter opens the next row, Backspace on an empty row removes it and
   * steps back, and pasting a block of lines becomes one row per line. Rows are
   * held locally and pushed to the store on every change; the component is
   * remounted per subject, so the local copy cannot go stale.
   */
  import { tick } from 'svelte';
  import Icon from '../Icon.svelte';

  interface Props {
    goals: string[];
    onchange: (goals: string[]) => void;
  }

  let { goals, onchange }: Props = $props();

  // svelte-ignore state_referenced_locally
  let rows = $state<string[]>(goals.length > 0 ? [...goals] : []);
  let listEl: HTMLDivElement | undefined = $state();

  // Read the inputs off the DOM rather than holding an array of refs: the rows
  // are reordered by splicing, and a ref array has to be spliced in lockstep.
  function inputAt(index: number): HTMLInputElement | null {
    return listEl?.querySelectorAll<HTMLInputElement>('.goal-input')[index] ?? null;
  }

  function commit(): void {
    // Blank rows are scaffolding for typing, not content.
    onchange(rows.map(r => r.trim()).filter(r => r !== ''));
  }

  async function focusRow(index: number, atEnd = false): Promise<void> {
    await tick();
    const el = inputAt(index);
    if (!el) return;
    el.focus();
    if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
  }

  function addRow(after = rows.length - 1): void {
    rows = [...rows.slice(0, after + 1), '', ...rows.slice(after + 1)];
    void focusRow(after + 1);
  }

  function removeRow(index: number): void {
    rows = rows.filter((_, i) => i !== index);
    commit();
    void focusRow(Math.max(0, index - 1), true);
  }

  function onKeydown(e: KeyboardEvent, index: number): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      addRow(index);
      return;
    }
    if (e.key === 'Backspace' && rows[index] === '' && rows.length > 1) {
      e.preventDefault();
      removeRow(index);
      return;
    }
    if (e.key === 'ArrowDown' && index < rows.length - 1) {
      e.preventDefault();
      void focusRow(index + 1, true);
    }
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      void focusRow(index - 1, true);
    }
  }

  /** A pasted block of lines is a list, not one goal with newlines in it. */
  function onPaste(e: ClipboardEvent, index: number): void {
    const text = e.clipboardData?.getData('text') ?? '';
    const lines = text.split(/\r?\n/).map(l => l.replace(/^\s*[-•*\d.)\s]+/, '').trim()).filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const current = rows[index] ?? '';
    rows = [
      ...rows.slice(0, index),
      current.trim() === '' ? lines[0]! : `${current}${lines[0]}`,
      ...lines.slice(1),
      ...rows.slice(index + 1),
    ];
    commit();
    void focusRow(index + lines.length - 1, true);
  }
</script>

<div class="goals" bind:this={listEl}>
  {#each rows as _, i (i)}
    <div class="goal-row">
      <span class="goal-num wk-num">{i + 1}</span>
      <input
        class="goal-input input input-bordered input-sm flex-1 min-w-0"
        type="text"
        bind:value={rows[i]}
        placeholder="Was die Gruppe danach kann"
        onchange={commit}
        onblur={commit}
        onkeydown={(e) => onKeydown(e, i)}
        onpaste={(e) => onPaste(e, i)}
      />
      <button
        type="button"
        class="goal-x"
        onclick={() => removeRow(i)}
        aria-label="Lernziel {i + 1} entfernen"
      ><Icon name="x" size={13} /></button>
    </div>
  {/each}

  <button type="button" class="goal-add" onclick={() => addRow()}>
    <Icon name="plus" size={12} />
    {rows.length === 0 ? 'Lernziel hinzufügen' : 'Weiteres hinzufügen'}
  </button>

  {#if rows.length > 0}
    <p class="field-hint">Enter legt die nächste Zeile an · eine eingefügte Liste füllt mehrere Zeilen</p>
  {/if}
</div>

<style>
  .goals {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .goal-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .goal-num {
    width: 1.1rem;
    text-align: right;
    font-size: var(--wk-fs-xs);
    color: var(--wk-text-faint);
    flex-shrink: 0;
  }

  .goal-x {
    display: flex;
    padding: 0.25rem;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .goal-x:hover {
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 12%, transparent);
  }

  .goal-add {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    align-self: flex-start;
    margin-left: 1.55rem;
    padding: 0.2rem 0.1rem;
    border: none;
    background: none;
    color: var(--color-primary);
    font-size: var(--wk-fs-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .goal-add:hover { text-decoration: underline; }
</style>
