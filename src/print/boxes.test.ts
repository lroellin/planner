import { describe, expect, it } from 'vitest';
import { makeEvent, makeState, makeSubject } from '../test/fixtures';
import { buildPrintDoc } from './boxes';

function planned() {
  return makeState({
    events: [
      makeEvent({ id: 'a', groupId: 'g1', dayIndex: 2, startTime: '08:00', endTime: '09:30' }),
      makeEvent({ id: 'b', groupId: 'g1', dayIndex: 2, startTime: '07:00', endTime: '07:45', subjectId: 'other' }),
      makeEvent({ id: 'c', groupId: 'g2', dayIndex: 3, startTime: '10:00', endTime: '11:30' }),
      makeEvent({ id: 'd', groupId: 'all', dayIndex: 2, startTime: '12:00', endTime: '13:00', subjectId: 'lunch' }),
    ],
  });
}

describe('buildPrintDoc', () => {
  it('gives every enabled group a box, in lane order', () => {
    const doc = buildPrintDoc(planned(), 'groups');
    expect(doc.boxes.map(b => b.title)).toEqual([
      'Gruppe K', 'Gruppe G1', 'Gruppe G2', 'Gruppe G3',
    ]);
    expect(doc.columns).toEqual(['Zeit', 'Thema', 'Ausbildner', 'Raum']);
  });

  it('orders a day by time, not by the order events were placed', () => {
    const doc = buildPrintDoc(planned(), 'groups');
    const g1 = doc.boxes.find(b => b.title === 'Gruppe G1')!;
    const wednesday = g1.days[0]!;
    expect(wednesday.rows.map(r => r.time)).toEqual([
      '07:00–07:45', '08:00–09:30', '12:00–13:00',
    ]);
  });

  it('mutes Pausen so they read as context rather than as lessons', () => {
    const doc = buildPrintDoc(planned(), 'groups');
    const g1 = doc.boxes.find(b => b.title === 'Gruppe G1')!;
    const lunch = g1.days[0]!.rows.find(r => r.subject.full === 'Mittagessen')!;
    expect(lunch.muted).toBe(true);
    expect(g1.days[0]!.rows.find(r => r.subject.full === 'Karteneröffnung')!.muted).toBe(false);
  });

  it('leaves a group with nothing planned a box and an empty note', () => {
    // K is the Kader lane on Mon–Tue; nothing in this week is placed there, not
    // even the Mittagessen, which is a Wednesday event.
    const doc = buildPrintDoc(planned(), 'groups');
    const kader = doc.boxes.find(b => b.title === 'Gruppe K')!;
    expect(kader.days).toHaveLength(0);
    expect(kader.emptyNote).toBe('Nichts geplant.');
  });

  it('gives an all-lanes Pause to every lane of its phase', () => {
    const doc = buildPrintDoc(planned(), 'groups');
    for (const label of ['G1', 'G2', 'G3']) {
      const rows = doc.boxes.find(b => b.title === `Gruppe ${label}`)!.days.flatMap(d => d.rows);
      expect(rows.some(r => r.subject.full === 'Mittagessen')).toBe(true);
    }
  });

  it('flattens the Ausbildnerplan back into days, not Themen', () => {
    const doc = buildPrintDoc(planned(), 'teachers');
    const anna = doc.boxes.find(b => b.title === 'Anna Müller')!;
    expect(anna.days.map(d => d.label.slice(0, 2))).toEqual(['Mi', 'Do']);
    // Mittagessen too: the fixture's Pause carries her as its default teacher,
    // and a plan that hides the block she is booked for is not her day.
    expect(anna.days[0]!.rows.map(r => r.time)).toEqual([
      '07:00–07:45', '08:00–09:30', '12:00–13:00',
    ]);
    expect(doc.columns).toEqual(['Zeit', 'Thema', 'Gruppe', 'Raum']);
  });

  it('carries the teacher accent colour onto their own sheet', () => {
    const doc = buildPrintDoc(planned(), 'teachers');
    expect(doc.boxes.find(b => b.title === 'Anna Müller')!.accent).toBe('#4299e1');
  });

  it('notes a Stellvertretung on the row it applies to', () => {
    const state = makeState({
      subjects: [makeSubject({ id: 'lesson', name: 'Karteneröffnung', defaultTeacherIds: ['t1'] })],
      events: [makeEvent({ id: 'a', groupId: 'g1', teacherIds: ['t2'] })],
    });
    const doc = buildPrintDoc(state, 'teachers');
    const beat = doc.boxes.find(b => b.title === 'Beat Zwahlen')!;
    expect(beat.days[0]!.rows[0]!.note).toContain('Stellvertretung für Anna Müller');
    const anna = doc.boxes.find(b => b.title === 'Anna Müller')!;
    expect(anna.days[0]!.rows[0]!.note).toContain('abgegeben an Beat Zwahlen');
    expect(anna.days[0]!.rows[0]!.muted).toBe(true);
  });

  it('leaves a never-booked room out entirely — an empty sheet has no door', () => {
    const doc = buildPrintDoc(planned(), 'rooms');
    expect(doc.boxes.map(b => b.title)).toEqual(['Seminarraum 1']);
  });

  it('falls back to the room code a user actually entered', () => {
    const state = makeState({
      rooms: [{
        id: 'r1', name: 'Theoriesaal 1', shortName: 'TS1', color: '#48bb78',
        excludeFromConflictCheck: false, unavailable: [],
      }],
      events: [makeEvent({ id: 'a', groupId: 'g1' })],
    });
    const doc = buildPrintDoc(state, 'groups');
    const row = doc.boxes.find(b => b.title === 'Gruppe G1')!.days[0]!.rows[0]!;
    expect(row.where.full).toBe('Theoriesaal 1');
    expect(row.where.short).toBe('TS1');
  });

  it('says on the room sheet that a shared room is exempt from conflicts', () => {
    const state = makeState({
      events: [makeEvent({ id: 'a', groupId: 'g1', roomId: 'outside' })],
    });
    const doc = buildPrintDoc(state, 'rooms');
    expect(doc.boxes.find(b => b.title === 'Outside')!.summary).toContain('geteilter Raum');
  });

  it('names who and where on a group row, and which group on a room row', () => {
    const groups = buildPrintDoc(planned(), 'groups');
    const row = groups.boxes.find(b => b.title === 'Gruppe G1')!.days[0]!.rows[1]!;
    expect(row.who.full).toBe('Anna Müller');
    expect(row.where.full).toBe('Seminarraum 1');
    // The fallback the drawing layer reaches for once the column is too narrow.
    // Teachers get initials; the fixture's room has no code, so it has no short
    // form to fall back to and will be ellipsised instead.
    expect(row.who.short).toBe('AM');
    expect(row.where.short).toBe('Seminarraum 1');

    const rooms = buildPrintDoc(planned(), 'rooms');
    const booking = rooms.boxes[0]!.days[0]!.rows[0]!;
    expect(booking.who.full).toMatch(/G\d/);
    expect(booking.where.full).toBe('Anna Müller');
  });
});
