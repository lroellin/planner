import { describe, expect, it } from 'vitest';
import { makeEvent, makeState, makeSubject } from '../test/fixtures';
import { buildCalendarDoc } from './calendar';

const ALL = ['kader', 'gruppen'];

describe('buildCalendarDoc legend', () => {
  it('lists a Kürzel once, whatever it is placed on', () => {
    const state = makeState({
      rooms: [{
        id: 'r1', name: 'Theoriesaal 1', shortName: 'TS1',
        color: '#48bb78', excludeFromConflictCheck: false, unavailable: [],
      }],
      events: [
        makeEvent({ groupId: 'g1' }),
        makeEvent({ groupId: 'g2' }),
        makeEvent({ groupId: 'g3' }),
      ],
    });
    const legend = buildCalendarDoc(state, ALL).legend;
    expect(legend.filter(e => e.kind === 'room')).toEqual([
      { kind: 'room', short: 'TS1', full: 'Theoriesaal 1' },
    ]);
  });

  it('leaves out a name that is its own Kürzel, and one never placed', () => {
    const state = makeState({
      subjects: [makeSubject({ id: 'lesson', name: 'Funk', shortName: 'Funk' })],
      events: [makeEvent({ groupId: 'g1' })],
    });
    const legend = buildCalendarDoc(state, ALL).legend;
    // 'Funk' is its own short form, so it needs no key; 'Beat Zwahlen' is on no
    // event. 'Seminarraum 1' has no explicit shortName and so is *derived* to
    // 'Sem1' — the same fallback the screen card shows, and a Kürzel a printed
    // sheet has no tooltip to recover.
    expect(legend.map(e => e.short)).toEqual(['Sem1', 'AM']);
  });

  it('orders Thema, then Raum, then Ausbildner', () => {
    const state = makeState({
      subjects: [makeSubject({ id: 'lesson', name: 'Karteneröffnung', shortName: 'KÖ' })],
      rooms: [{
        id: 'r1', name: 'Theoriesaal 1', shortName: 'TS1',
        color: '#48bb78', excludeFromConflictCheck: false, unavailable: [],
      }],
      events: [makeEvent({ groupId: 'g1' })],
    });
    expect(buildCalendarDoc(state, ALL).legend.map(e => e.kind))
      .toEqual(['subject', 'room', 'teacher']);
  });
});
