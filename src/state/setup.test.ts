import { describe, it, expect } from 'vitest';
import { setupSteps, setupComplete, firstOpenStep } from './setup';
import { createDefaultState } from './persistence';
import { makeState, makeSubject } from '../test/fixtures';

function stepFor(state: ReturnType<typeof makeState>, key: string) {
  return setupSteps(state).find(s => s.key === key)!;
}

describe('setupSteps', () => {
  it('marks a fresh plan as needing Ausbildner, Räume and Themen', () => {
    const state = createDefaultState();
    const open = setupSteps(state).filter(s => !s.done).map(s => s.key);
    expect(open).toEqual(['teachers', 'rooms', 'subjects']);
  });

  it('counts what a fresh plan already ships', () => {
    const state = createDefaultState();
    expect(stepFor(state, 'groups')).toMatchObject({ done: true, count: 4 });
    expect(stepFor(state, 'phases')).toMatchObject({ done: true, count: 2 });
  });

  it('does not count Pausen towards Themen', () => {
    // The two Pausen ship with every plan; counting them would mark the step
    // done before the user has entered anything.
    const state = createDefaultState();
    expect(state.subjects).toHaveLength(2);
    expect(stepFor(state, 'subjects')).toMatchObject({ done: false, count: 0 });
  });

  it('counts a Programmpunkt as something to place', () => {
    const state = makeState({
      subjects: [makeSubject({ id: 'antreten', name: 'Antreten', kind: 'oneoff' })],
    });
    expect(stepFor(state, 'subjects')).toMatchObject({ done: true, count: 1 });
  });

  it('counts only enabled Gruppen', () => {
    const state = makeState({
      groups: [
        { id: 'k', label: 'K', enabled: true, order: 0, excludeFromCoverage: false },
        { id: 'g1', label: 'G1', enabled: false, order: 1, excludeFromCoverage: false },
      ],
    });
    expect(stepFor(state, 'groups')).toMatchObject({ done: true, count: 1 });
  });

  it('is not done when every Gruppe is switched off', () => {
    const state = makeState({
      groups: [{ id: 'k', label: 'K', enabled: false, order: 0, excludeFromCoverage: false }],
    });
    expect(stepFor(state, 'groups').done).toBe(false);
  });
});

describe('setupComplete', () => {
  it('is true for a fully set-up week', () => {
    expect(setupComplete(makeState())).toBe(true);
  });

  it('is false for a fresh plan', () => {
    expect(setupComplete(createDefaultState())).toBe(false);
  });
});

describe('firstOpenStep', () => {
  it('names the first thing still missing', () => {
    expect(firstOpenStep(createDefaultState())).toBe('teachers');
    expect(firstOpenStep(makeState({ teachers: [] }))).toBe('teachers');
    expect(firstOpenStep(makeState({ rooms: [] }))).toBe('rooms');
  });

  it('is null once nothing is left', () => {
    expect(firstOpenStep(makeState())).toBeNull();
  });
});
