import { describe, it, expect } from 'vitest';
import { collidingSubjectShorts, roomShort, subjectShort, teacherShort } from './format';

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
  const sub = (name: string, shortName = '') => ({ name, shortName });

  it('prefers an explicit Kürzel', () => {
    expect(subjectShort(sub('Karteneröffnung/-führung', 'KÖ'))).toBe('KÖ');
    expect(subjectShort(sub('Sanität', '  San  '))).toBe('San');
  });

  it('keeps the tail, because the tail is what tells two Themen apart', () => {
    // Both of these used to cut to their first token and render «Karten…»:
    // fifteen characters into a band that shows about six.
    expect(subjectShort(sub('Kartenlesen, Signaturen'))).toBe('KartSig');
    expect(subjectShort(sub('Karteneröffnung/-führung'))).toBe('KartFüh');
    expect(subjectShort(sub('Schulung Kader'))).toBe('SchuKad');
    expect(subjectShort(sub('Schulung Anlage'))).toBe('SchuAnl');
    expect(subjectShort(sub('Lagezentrum, Meldefluss'))).toBe('LageMel');
  });

  it('initialises everything after the first of three or more tokens', () => {
    expect(subjectShort(sub('Funk Grundlagen Praxis'))).toBe('FunGP');
  });

  it('truncates a single token — there is nothing else to work with', () => {
    expect(subjectShort(sub('Sanität'))).toBe('Sanität');
    expect(subjectShort(sub('Lagebericht'))).toBe('Lagebericht'.slice(0, 10));
  });

  it('never exceeds the cap', () => {
    expect(subjectShort(sub('Zivilschutz Grundausbildung')).length).toBeLessThanOrEqual(10);
    expect(subjectShort(sub('Unterbrechungsfreiestromversorgung')).length).toBeLessThanOrEqual(10);
  });

  it('handles nothing at all', () => {
    expect(subjectShort(null)).toBe('?');
    expect(subjectShort(sub('   '))).toBe('?');
  });
});

describe('collidingSubjectShorts', () => {
  const sub = (id: string, name: string, shortName = '') => ({ id, name, shortName });

  it('finds nothing in a plan whose Themen derive apart', () => {
    // The three pairs that collided before the cascade existed.
    const clash = collidingSubjectShorts([
      sub('a', 'Kartenlesen, Signaturen'),
      sub('b', 'Karteneröffnung/-führung'),
      sub('c', 'Schulung Kader'),
      sub('d', 'Schulung Anlage'),
      sub('e', 'Lagebericht'),
      sub('f', 'Lagezentrum, Meldefluss'),
    ]);
    expect(clash.size).toBe(0);
  });

  it('names both sides of a pair the derivation cannot separate', () => {
    const clash = collidingSubjectShorts([
      sub('a', 'Verkehrsdienst'),
      sub('b', 'Verkehrsregelung'),
      sub('c', 'Sanität'),
    ]);
    expect([...clash].sort()).toEqual(['a', 'b']);
  });

  it('reports an explicit Kürzel that collides too — only the user can fix that one', () => {
    const clash = collidingSubjectShorts([
      sub('a', 'Antenne', 'ABC'),
      sub('b', 'ABC-Theorie', 'ABC'),
    ]);
    expect([...clash].sort()).toEqual(['a', 'b']);
  });
});
