/**
 * What a plan needs before anything can be planned.
 *
 * A fresh plan ships Gruppen, Phasen and two Pausen; the three lists that
 * actually carry the WK — Ausbildner, Räume, Themen — start empty, and all
 * three are filled in the same dialog. This module is the one predicate for
 * "is that done", so the Einrichtung tab, the tab the Konfiguration opens on
 * and the mark on the toolbar button cannot disagree about it.
 *
 * Deliberately not part of `AppState`: every step is derivable from the plan
 * itself, so there is no "has the user seen this" flag to persist, to migrate,
 * or to go stale after an import.
 */

import type { AppState } from '../types';

export type SetupStepKey = 'groups' | 'phases' | 'teachers' | 'rooms' | 'subjects';

export interface SetupStep {
  key: SetupStepKey;
  /** Nothing more is needed here — not "the user visited the tab". */
  done: boolean;
  /** How many there are, for the row and the tab strip. */
  count: number;
}

/**
 * The WK-Woche is deliberately absent. `createDefaultState` picks next Monday,
 * which is often already the right one, and nothing records whether anybody
 * looked at it — so it is a row with an action and no checkbox, never a step
 * that could claim to be undone (see `L1` in docs/DESIGN-PASS-4.md).
 */
export function setupSteps(state: AppState): SetupStep[] {
  const groups = state.groups.filter(g => g.enabled).length;
  const phases = state.phases.length;
  const teachers = state.teachers.length;
  const rooms = state.rooms.length;
  // Programmpunkte count: a plan whose only entries are Begrüssung and
  // Schlussrapport has something to place. Pausen do not — they ship with
  // every plan, so counting them would mark the step done before it began.
  const subjects = state.subjects.filter(s => s.kind !== 'break').length;

  return [
    { key: 'groups',   done: groups > 0,   count: groups },
    { key: 'phases',   done: phases > 0,   count: phases },
    { key: 'teachers', done: teachers > 0, count: teachers },
    { key: 'rooms',    done: rooms > 0,    count: rooms },
    { key: 'subjects', done: subjects > 0, count: subjects },
  ];
}

/** True once every step is done — the plan can be planned. */
export function setupComplete(state: AppState): boolean {
  return setupSteps(state).every(step => step.done);
}

/** The step the user is sent to first, or `null` when there is nothing left. */
export function firstOpenStep(state: AppState): SetupStepKey | null {
  return setupSteps(state).find(step => !step.done)?.key ?? null;
}
