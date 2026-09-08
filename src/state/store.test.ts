import { describe, it, expect, beforeEach } from 'vitest';
import {
  getState, createProgrammpunkt, resetToDefaults, removeEvent, undo, canUndo, addTeacher, addRoom,
} from './store.svelte';
import { ALL_GROUPS } from '../types';

/**
 * The store is a module singleton, so every test starts from the shipped
 * defaults rather than from whatever the previous one left behind.
 */
beforeEach(() => {
  resetToDefaults();
});

/** The first lane of the group rotation — what clicking a cell there hands over. */
function firstGroupId(): string {
  const state = getState();
  const wk = state.phases.find(p => p.groupIds.length > 1) ?? state.phases[0]!;
  return wk.groupIds[0]!;
}

const DRAFT = {
  name: 'Begrüssung', color: '#2563eb', durationMinutes: 30, isMultiGroup: false,
  teacherIds: [] as string[], roomId: null,
};

describe('createProgrammpunkt', () => {
  it('adds the definition and its placement together', () => {
    const before = getState().subjects.length;
    const eventId = createProgrammpunkt(DRAFT, 2, '08:00', firstGroupId());

    const state = getState();
    expect(state.subjects).toHaveLength(before + 1);
    const subject = state.subjects.find(s => s.name === 'Begrüssung')!;
    expect(subject.kind).toBe('oneoff');
    expect(subject.defaultDurationMinutes).toBe(30);

    const event = state.events.find(e => e.id === eventId)!;
    expect(event.subjectId).toBe(subject.id);
    expect(event.groupId).toBe(firstGroupId());
    expect(event.startTime).toBe('08:00');
    expect(event.endTime).toBe('08:30');
    // Nothing to inherit *from* yet, but the event still points at the subject
    // so a later default set in Konfiguration reaches it.
    expect(event.teacherIds).toBe('inherit');
  });

  it('makes the dialog\'s Ausbildner and Raum the definition\'s defaults', () => {
    // Not an override on the one card: placing the same Programmpunkt again
    // has to arrive already carrying them.
    const teacherId = addTeacher('Anna Müller', 'AM', '#4299e1');
    const roomId = addRoom('Kompanieraum', '#48bb78', false);

    const eventId = createProgrammpunkt(
      { ...DRAFT, teacherIds: [teacherId], roomId }, 2, '08:00', firstGroupId(),
    );

    const state = getState();
    const subject = state.subjects.find(s => s.name === 'Begrüssung')!;
    expect(subject.defaultTeacherIds).toEqual([teacherId]);
    expect(subject.defaultRoomId).toBe(roomId);

    const event = state.events.find(e => e.id === eventId)!;
    expect(event.teacherIds).toBe('inherit');
    expect(event.roomId).toBe('inherit');
  });

  it('takes the all-lanes sentinel when it is for every group', () => {
    const eventId = createProgrammpunkt(
      { ...DRAFT, isMultiGroup: true }, 2, '08:00', firstGroupId(),
    );
    expect(getState().events.find(e => e.id === eventId)!.groupId).toBe(ALL_GROUPS);
  });

  it('is one undo step: Ctrl+Z takes back the card *and* the definition', () => {
    // Created as two actions this left an orphan Thema in Konfiguration that
    // nobody asked for and nothing on the grid explained.
    const subjectsBefore = getState().subjects.length;
    createProgrammpunkt(DRAFT, 2, '08:00', firstGroupId());
    expect(canUndo()).toBe(true);

    undo();
    expect(getState().events).toHaveLength(0);
    expect(getState().subjects).toHaveLength(subjectsBefore);
  });

  it('reuses a Programmpunkt of the same name instead of making a second one', () => {
    // "Antreten again on Thursday", and equally the retype after a delete.
    createProgrammpunkt(DRAFT, 2, '08:00', firstGroupId());
    const subjectId = getState().subjects.find(s => s.name === 'Begrüssung')!.id;

    createProgrammpunkt({ ...DRAFT, name: 'begrüssung', color: '#e11d48' }, 3, '08:00', firstGroupId());

    const state = getState();
    expect(state.subjects.filter(s => s.kind === 'oneoff')).toHaveLength(1);
    expect(state.events.map(e => e.subjectId)).toEqual([subjectId, subjectId]);
    // The first definition wins: a reuse is a placement, not an edit.
    expect(state.subjects.find(s => s.id === subjectId)!.color).toBe('#2563eb');
  });

  it('lets the reused definition decide the lane rule', () => {
    createProgrammpunkt({ ...DRAFT, isMultiGroup: true }, 2, '08:00', firstGroupId());
    const second = createProgrammpunkt(DRAFT, 3, '08:00', firstGroupId());
    // Otherwise the same Antreten would be all-lanes on one day and a single
    // lane on the next, with nothing on screen saying why.
    expect(getState().events.find(e => e.id === second)!.groupId).toBe(ALL_GROUPS);
  });

  it('keeps the definition when its last card is deleted, so it can be placed again', () => {
    const eventId = createProgrammpunkt(DRAFT, 2, '08:00', firstGroupId());
    removeEvent(eventId);
    expect(getState().events).toHaveLength(0);
    expect(getState().subjects.some(s => s.name === 'Begrüssung')).toBe(true);
  });

  it('falls back to a name rather than creating a nameless card', () => {
    createProgrammpunkt({ ...DRAFT, name: '   ' }, 2, '08:00', firstGroupId());
    expect(getState().subjects.some(s => s.name === 'Programmpunkt')).toBe(true);
  });
});
