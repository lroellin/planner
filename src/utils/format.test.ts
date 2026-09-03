import { describe, it, expect } from 'vitest';
import { roomShort, subjectShort, teacherShort } from './format';

describe('roomShort', () => {
  const room = (name: string, shortName = '') => ({ name, shortName });

  it('prefers an explicit code', () => {
    expect(roomShort(room('Schutzanlage Bern-West', 'SABW'))).toBe('SABW');
    expect(roomShort(room('Werkhof', '  WH  '))).toBe('WH');
  });

  it('initialises a name of three or more tokens', () => {
    // "Schutzanlage Bern-West" has to survive a ~70px lane, where the full name
    // was simply dropped and the card said nothing about the place at all.
    expect(roomShort(room('Schutzanlage Bern-West'))).toBe('SBW');
  });

  it('gives a two-token name three letters and an initial', () => {
    expect(roomShort(room('Alte Turnhalle'))).toBe('AltT');
  });

  it('keeps a number whole — it is what tells two rooms apart', () => {
    // Initials alone would make both of these "T".
    expect(roomShort(room('Theoriesaal 1'))).toBe('The1');
    expect(roomShort(room('Theoriesaal 2'))).toBe('The2');
  });

  it('truncates a single word rather than initialising it to one letter', () => {
    expect(roomShort(room('Werkhof'))).toBe('Werkh');
    expect(roomShort(room('Draussen'))).toBe('Draus');
  });

  it('never exceeds five characters', () => {
    expect(roomShort(room('Zivilschutz Anlage Bern Nord West Süd')).length).toBeLessThanOrEqual(5);
  });

  it('handles nothing at all', () => {
    expect(roomShort(null)).toBe('');
    expect(roomShort(room('   '))).toBe('');
  });
});

describe('teacherShort', () => {
  it('prefers the stored short name, falling back to the first two letters', () => {
    expect(teacherShort({ name: 'Anna Müller', shortName: 'AM' })).toBe('AM');
    expect(teacherShort({ name: 'Anna Müller', shortName: '' })).toBe('AN');
  });
});

describe('subjectShort', () => {
  it('cuts a compound name at its first separator', () => {
    expect(subjectShort({ name: 'Karteneröffnung/-führung', shortName: '' })).toBe('Karteneröffnung');
  });

  it('leaves a name with no separator alone — which is why the card also truncates', () => {
    expect(subjectShort({ name: 'Sanität', shortName: '' })).toBe('Sanität');
  });
});
