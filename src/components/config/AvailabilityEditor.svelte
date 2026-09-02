<script lang="ts">
  /**
   * Windows in which a teacher or a room is *not* available.
   *
   * Entry is day-first, because that is how absences are told: "she's only there
   * from Wednesday", "the Schutzraum is booked Thursday morning". Clicking a day
   * in the add row creates an all-day window immediately; narrowing it to a half
   * day or to exact times is the second, optional step.
   */
  import { DAY_NAMES } from '../../utils/timeUtils';
  import {
    makeWindow, presetTimes, windowPreset, PRESET_LABELS,
    type WindowPreset,
  } from '../../utils/availability';
  import TimeField from '../TimeField.svelte';
  import Icon from '../Icon.svelte';
  import type { TimeWindow } from '../../types';

  interface Props {
    windows: TimeWindow[];
    onchange: (windows: TimeWindow[]) => void;
    title: string;
    /** "Anna Müller is here all week." — shown when there are no windows. */
    emptyText: string;
    hint: string;
    notePlaceholder: string;
  }

  let { windows, onchange, title, emptyText, hint, notePlaceholder }: Props = $props();

  function patch(id: string, fields: Partial<TimeWindow>): void {
    onchange(windows.map(w => (w.id === id ? { ...w, ...fields } : w)));
  }

  function addFor(days: number[]): void {
    onchange([...windows, makeWindow(days)]);
  }

  function remove(id: string): void {
    onchange(windows.filter(w => w.id !== id));
  }

  function toggleDay(w: TimeWindow, day: number): void {
    const days = w.days.includes(day)
      ? w.days.filter(d => d !== day)
      : [...w.days, day].sort((a, b) => a - b);
    patch(w.id, { days });
  }

  function setPreset(w: TimeWindow, preset: WindowPreset): void {
    if (preset === 'custom') {
      // Seed the custom fields from the working day rather than from 00:00–24:00,
      // which is 60 clicks away from anything anyone means by "custom".
      patch(w.id, { startTime: '08:00', endTime: '12:00' });
      return;
    }
    const [startTime, endTime] = presetTimes(preset);
    patch(w.id, { startTime, endTime });
  }
</script>

<section class="section">
  <h4 class="section-title">{title}</h4>

  {#if windows.length === 0}
    <p class="field-hint">{emptyText}</p>
  {:else}
    <div class="windows">
      {#each windows as w (w.id)}
        {@const preset = windowPreset(w)}
        <div class="window" class:window-void={w.days.length === 0}>
          <div class="window-line">
            <div class="day-chips" role="group" aria-label="Tage">
              {#each DAY_NAMES as name, d (name)}
                <button
                  type="button"
                  class="day-chip"
                  class:day-chip-on={w.days.includes(d)}
                  aria-pressed={w.days.includes(d)}
                  onclick={() => toggleDay(w, d)}
                >{name}</button>
              {/each}
            </div>
            <button
              type="button"
              class="win-x"
              onclick={() => remove(w.id)}
              aria-label="Entfernen"
              title="Entfernen"
            ><Icon name="trash" size={13} /></button>
          </div>

          <div class="window-line">
            <div class="preset-chips" role="group" aria-label="Tageszeit">
              {#each PRESET_LABELS as opt (opt.key)}
                <button
                  type="button"
                  class="preset-chip"
                  class:preset-chip-on={preset === opt.key}
                  onclick={() => setPreset(w, opt.key)}
                >{opt.label}</button>
              {/each}
              <button
                type="button"
                class="preset-chip"
                class:preset-chip-on={preset === 'custom'}
                onclick={() => setPreset(w, 'custom')}
              >Zeiten …</button>
            </div>

            {#if preset === 'custom'}
              <div class="times">
                <TimeField
                  value={w.startTime}
                  class="w-24"
                  ariaLabel="Von"
                  onpick={(v) => patch(w.id, { startTime: v })}
                />
                <span class="dash">–</span>
                <TimeField
                  value={w.endTime}
                  class="w-24"
                  ariaLabel="Bis"
                  onpick={(v) => patch(w.id, { endTime: v })}
                />
              </div>
            {/if}
          </div>

          <input
            class="input input-bordered input-xs w-full"
            type="text"
            value={w.note}
            placeholder={notePlaceholder}
            onchange={(e) => patch(w.id, { note: (e.currentTarget as HTMLInputElement).value })}
          />

          {#if w.days.length === 0}
            <p class="field-hint">Mindestens einen Tag wählen — dieser Eintrag bewirkt noch nichts.</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="add-row">
    <span class="add-label">Hinzufügen für</span>
    {#each DAY_NAMES as name, d (name)}
      <button type="button" class="day-chip add-chip" onclick={() => addFor([d])}>{name}</button>
    {/each}
    <button
      type="button"
      class="day-chip add-chip"
      onclick={() => addFor(DAY_NAMES.map((_, i) => i))}
    >ganze Woche</button>
  </div>

  <p class="field-hint">{hint}</p>
</section>

<style>
  .windows {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .window {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: var(--wk-surface-alt);
  }

  .window-void { border-color: color-mix(in oklab, var(--color-warning) 45%, transparent); }

  .window-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .day-chips, .preset-chips {
    display: flex;
    gap: 0.2rem;
    flex-wrap: wrap;
  }

  .day-chip {
    min-width: 2.4rem;
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--wk-line);
    border-radius: var(--wk-r-sm);
    background: var(--wk-surface);
    color: var(--wk-text-mute);
    font-size: var(--wk-fs-xs);
    cursor: pointer;
  }
  .day-chip:hover { border-color: var(--wk-line-strong); color: var(--wk-text); }

  .day-chip-on {
    border-color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 14%, transparent);
    color: color-mix(in oklab, var(--color-error) 75%, var(--wk-text));
    font-weight: 650;
  }

  .win-x {
    margin-left: auto;
    display: flex;
    padding: 0.2rem;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--wk-text-faint);
    cursor: pointer;
  }
  .win-x:hover {
    color: var(--color-error);
    background: color-mix(in oklab, var(--color-error) 12%, transparent);
  }

  .times {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .dash { color: var(--wk-text-faint); }

  .add-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .add-label {
    font-size: var(--wk-fs-2xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--wk-text-mute);
    margin-right: 0.2rem;
  }

  .add-chip { border-style: dashed; }
  .add-chip:hover {
    border-style: solid;
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
</style>
