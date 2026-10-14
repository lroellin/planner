import { describe, it, expect } from 'vitest';
import {
  buildAvailabilityBackground, buildTimelineEvents, rowConflict, timelineDays, timelineResources,
  timelineNeighbour, timelineRowId, timelineTooltip, type TimelineBarProps, type TimelineRowProps,
} from './timeline';
import { attachConflicts, detectConflicts } from '../conflicts/detector';
import { ALL, makeEvent, makeState, makeWindow } from '../test/fixtures';
import type { AppState } from '../types';

/** The store annotates every event; the tests have to do the same. */
function annotated(state: AppState): AppState {
  return attachConflicts(state, detectConflicts(state));
}

function bars(state: AppState) {
  return buildTimelineEvents(state).map(e => ({
    resourceId: e.resourceId,
    ...(e.extendedProps as TimelineBarProps),
  }));
}

describe('timelineResources', () => {
  it('lists Ausbildner before Räume, each in configured order, under two headings', () => {
    const rows = timelineResources(makeState());
    expect(rows.map(r => r.id)).toEqual(['t:t1', 't:t2', 'r:r1', 'r:outside']);
    expect(rows.map(r => r['section'])).toEqual(['Ausbildner', 'Ausbildner', 'Räume', 'Räume']);
    expect(rows.map(r => r['order'])).toEqual([0, 1, 2, 3]);
  });

  it('marks a Raum outside the conflict check as shared', () => {
    const rows = timelineResources(makeState());
    const props = rows.map(r => r.extendedProps as TimelineRowProps);
    expect(props.find(p => p.entityId === 'outside')?.shared).toBe(true);
    expect(props.find(p => p.entityId === 'r1')?.shared).toBe(false);
    expect(props.find(p => p.entityId === 't1')?.short).toBe('AM');
  });
});

describe('timelineDays', () => {
  it('spans the first Phase day to the last', () => {
    expect(timelineDays(makeState())).toEqual({ startDay: 0, dayCount: 5 });
    const state = makeState({
      phases: [{ id: 'p', label: 'WK', startDay: 2, endDay: 3, groupIds: ['g1'] }],
    });
    expect(timelineDays(state)).toEqual({ startDay: 2, dayCount: 2 });
  });

  it('falls back to the working week without any Phase', () => {
    expect(timelineDays(makeState({ phases: [] }))).toEqual({ startDay: 0, dayCount: 5 });
  });
});

describe('buildTimelineEvents', () => {
  it('puts one bar in each Ausbildner row and one in the Raum row', () => {
    const state = makeState({
      events: [makeEvent({ id: 'a', groupId: 'g1', teacherIds: ['t1', 't2'] })],
    });
    expect(bars(state).map(b => b.resourceId)).toEqual(['t:t1', 't:t2', 'r:r1']);
  });

  it('draws a multi-group Lektion once per row, naming every lane', () => {
    const state = makeState({
      events: [makeEvent({ id: 'm', groupId: ALL, dayIndex: 3 })],
    });
    const out = bars(state);
    expect(out.map(b => b.resourceId)).toEqual(['t:t1', 'r:r1']);
    expect(out[0]?.lanes).toBe('G1 G2 G3');
  });

  it('leaves out Lektionen with nobody to book and Lektionen on disabled lanes', () => {
    const base = makeState();
    const state = {
      ...base,
      groups: base.groups.map(g => (g.id === 'g2' ? { ...g, enabled: false } : g)),
      events: [
        makeEvent({ id: 'bare', groupId: 'g1', subjectId: 'lunch', teacherIds: [] }),
        makeEvent({ id: 'hidden', groupId: 'g2' }),
        makeEvent({ id: 'kept', groupId: 'g1', roomId: null }),
      ],
    };
    expect(bars(state).map(b => `${b.eventId}@${b.resourceId}`)).toEqual(['kept@t:t1']);
  });

  it('follows the toolbar filter', () => {
    const state = makeState({
      events: [
        makeEvent({ id: 'a', groupId: 'g1' }),
        makeEvent({ id: 'b', groupId: 'g2', teacherIds: ['t2'], startTime: '10:00', endTime: '11:00' }),
      ],
    });
    const out = buildTimelineEvents(state, { kind: 'teacher', id: 't2' });
    expect(out.map(e => (e.extendedProps as TimelineBarProps).eventId)).toEqual(['b', 'b']);
  });

  it('rings both bars of a teacher double-booking in that teacher row only', () => {
    // Two lanes, same Ausbildner, same time — and two different rooms, so the
    // Raum rows have nothing to say.
    const state = annotated(makeState({
      events: [
        makeEvent({ id: 'a', groupId: 'g1' }),
        makeEvent({ id: 'b', groupId: 'g2', roomId: 'outside' }),
      ],
    }));
    const out = bars(state);
    const at = (id: string, row: string) => out.find(b => b.eventId === id && b.resourceId === row);
    expect(at('a', 't:t1')?.conflictHere).toBe('hard');
    expect(at('b', 't:t1')?.conflictHere).toBe('hard');
    expect(at('a', 'r:r1')?.conflictHere).toBeNull();
    // …but the Raum bar still says the Lektion has a problem somewhere.
    expect(at('a', 'r:r1')?.conflictElsewhere).toBe('hard');
  });

  it('rings a Raum double-booking as soft, in the Raum row', () => {
    const state = annotated(makeState({
      events: [
        makeEvent({ id: 'a', groupId: 'g1' }),
        makeEvent({ id: 'b', groupId: 'g2', teacherIds: ['t2'] }),
      ],
    }));
    const roomBars = bars(state).filter(b => b.resourceId === 'r:r1');
    expect(roomBars.map(b => b.conflictHere)).toEqual(['soft', 'soft']);
    expect(bars(state).filter(b => b.resourceId?.startsWith('t:')).map(b => b.conflictHere))
      .toEqual([null, null]);
  });
});

describe('rowConflict', () => {
  it('reads an absence as the teacher row’s own hard conflict', () => {
    const ev = makeEvent({
      groupId: 'g1',
      conflicts: [{ kind: 'teacher-absent', resourceId: 't1', collidingEventIds: [] }],
    });
    expect(rowConflict(ev, 'teacher', 't1')).toEqual({ here: 'hard', elsewhere: null });
    expect(rowConflict(ev, 'teacher', 't2')).toEqual({ here: null, elsewhere: 'hard' });
    expect(rowConflict(ev, 'room', 't1')).toEqual({ here: null, elsewhere: 'hard' });
  });
});

describe('buildAvailabilityBackground', () => {
  it('shades each day of an absence, with an all-day window ending at midnight', () => {
    const base = makeState();
    const state = {
      ...base,
      teachers: base.teachers.map(t =>
        t.id === 't1' ? { ...t, unavailable: [makeWindow([1, 3])] } : t),
      rooms: base.rooms.map(r =>
        r.id === 'r1' ? { ...r, unavailable: [makeWindow([4], '13:00', '17:00')] } : r),
    };
    const out = buildAvailabilityBackground(state);
    expect(out.map(e => [e.resourceId, e.start, e.end])).toEqual([
      ['t:t1', '2026-09-08T00:00:00', '2026-09-09T00:00:00'],
      ['t:t1', '2026-09-10T00:00:00', '2026-09-11T00:00:00'],
      ['r:r1', '2026-09-11T13:00:00', '2026-09-11T17:00:00'],
    ]);
    expect(out.every(e => e.display === 'background')).toBe(true);
  });
});

describe('timelineTooltip', () => {
  it('names the Thema, time, lanes, Ausbildner, Raum and any Konflikt', () => {
    const state = annotated(makeState({
      events: [
        makeEvent({ id: 'a', groupId: 'g1' }),
        makeEvent({ id: 'b', groupId: 'g2' }),
      ],
    }));
    const ev = state.events.find(e => e.id === 'a')!;
    expect(timelineTooltip(state, ev)).toBe(
      'Karteneröffnung · Mi 08:00–09:30 · G1 · Anna Müller · Seminarraum 1 · ⚠ Konflikt: Ausbildner + Raum',
    );
  });

  it('builds row ids that keep Ausbildner and Räume apart', () => {
    expect(timelineRowId('teacher', 'x')).not.toBe(timelineRowId('room', 'x'));
  });
});

describe('timelineNeighbour', () => {
  const box = (key: string, row: number, start: number, end: number) => ({ key, row, start, end });
  // Row 0: a 8–9, b 10–11, c 13–14. Row 1 empty. Row 2: d 9–10, e 12–13.
  // Row 3: f 8–12 (long).
  const bars = [
    box('c', 0, 13, 14), box('a', 0, 8, 9), box('b', 0, 10, 11),
    box('e', 2, 12, 13), box('d', 2, 9, 10),
    box('f', 3, 8, 12),
  ];

  it('steps along time within the row, whatever order the bars come in', () => {
    expect(timelineNeighbour(bars, 'a', 'right')).toBe('b');
    expect(timelineNeighbour(bars, 'b', 'right')).toBe('c');
    expect(timelineNeighbour(bars, 'c', 'left')).toBe('b');
  });

  it('stops at the ends of a row', () => {
    expect(timelineNeighbour(bars, 'a', 'left')).toBeNull();
    expect(timelineNeighbour(bars, 'c', 'right')).toBeNull();
  });

  it('skips empty rows and lands on the bar nearest in time', () => {
    // b's middle is 10:30: d ends at 10 (gap 0.5), e starts at 12 (gap 1.5).
    expect(timelineNeighbour(bars, 'b', 'down')).toBe('d');
    // c's middle is 13:30: e ends at 13.
    expect(timelineNeighbour(bars, 'c', 'down')).toBe('e');
    expect(timelineNeighbour(bars, 'e', 'up')).toBe('c');
  });

  it('prefers a bar that covers the current moment', () => {
    expect(timelineNeighbour(bars, 'd', 'down')).toBe('f');
    // f's middle is 10:00, the moment d ends; e is two hours off.
    expect(timelineNeighbour(bars, 'f', 'up')).toBe('d');
  });

  it('stops at the top and bottom, and on an unknown bar', () => {
    expect(timelineNeighbour(bars, 'a', 'up')).toBeNull();
    expect(timelineNeighbour(bars, 'f', 'down')).toBeNull();
    expect(timelineNeighbour(bars, 'zz', 'right')).toBeNull();
  });
});
