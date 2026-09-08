import { describe, it, expect } from 'vitest';
import {
  eventGroupIds, eventInPhase, orphanEvents, phaseForDay, buildFCEvents, durationBand,
  snapToSlot, addMinutesToTime, timeDiffMinutes, eventOverrides, fullDateLabel,
  clampGroupDelta,
} from './timeUtils';
import { getContrastColor } from './colorUtils';
import { escapeHtml } from './format';
import { ALL, makeEvent, makeState, makeSubject } from '../test/fixtures';

describe('eventGroupIds', () => {
  it('resolves the ALL sentinel to the enabled lanes of the covering phase', () => {
    const state = makeState();
    const lunch = makeEvent({ groupId: ALL, dayIndex: 3 });
    expect(eventGroupIds(state, lunch)).toEqual(['g1', 'g2', 'g3']);
  });

  it('follows a lane that is switched on after the event was placed', () => {
    const base = makeState();
    const off = {
      ...base,
      groups: base.groups.map(g => (g.id === 'g3' ? { ...g, enabled: false } : g)),
    };
    const lunch = makeEvent({ groupId: ALL, dayIndex: 3 });
    expect(eventGroupIds(off, lunch)).toEqual(['g1', 'g2']);
    // …and picking the lane back up needs no repair of the stored event.
    expect(eventGroupIds(base, lunch)).toEqual(['g1', 'g2', 'g3']);
  });

  it('resolves ALL against the Kader phase on a Kader day', () => {
    const state = makeState();
    expect(eventGroupIds(state, makeEvent({ groupId: ALL, dayIndex: 0 }))).toEqual(['k']);
  });

  it('returns nothing for a disabled single lane', () => {
    const base = makeState();
    const state = { ...base, groups: base.groups.map(g => (g.id === 'g1' ? { ...g, enabled: false } : g)) };
    expect(eventGroupIds(state, makeEvent({ groupId: 'g1' }))).toEqual([]);
  });
});

describe('phaseForDay / eventInPhase', () => {
  it('maps days to their phase', () => {
    const state = makeState();
    expect(phaseForDay(state, 1)?.id).toBe('kader');
    expect(phaseForDay(state, 4)?.id).toBe('gruppen');
  });

  it('rejects an event whose lane the phase does not draw', () => {
    const state = makeState();
    const kaderPhase = state.phases[0]!;
    expect(eventInPhase(state, makeEvent({ groupId: 'g1', dayIndex: 0 }), kaderPhase)).toBe(false);
    expect(eventInPhase(state, makeEvent({ groupId: 'k', dayIndex: 0 }), kaderPhase)).toBe(true);
  });
});

describe('orphanEvents', () => {
  it('reports an event on a day its lane has no phase for', () => {
    const state = makeState({ events: [makeEvent({ id: 'stray', groupId: 'g1', dayIndex: 0 })] });
    expect(orphanEvents(state).map(e => e.id)).toEqual(['stray']);
  });

  it('does not report an event that is merely hidden by a disabled lane', () => {
    const base = makeState();
    const state = {
      ...base,
      groups: base.groups.map(g => (g.id === 'g1' ? { ...g, enabled: false } : g)),
      events: [makeEvent({ groupId: 'g1', dayIndex: 0 })],
    };
    expect(orphanEvents(state)).toEqual([]);
  });

  it('reports a multi-group event only when no phase covers its day', () => {
    const covered = makeState({ events: [makeEvent({ groupId: ALL, dayIndex: 2 })] });
    expect(orphanEvents(covered)).toEqual([]);

    const base = makeState();
    const gapped = {
      ...base,
      phases: [base.phases[0]!], // Wed–Fri no longer belongs to any phase
      events: [makeEvent({ id: 'lost', groupId: ALL, dayIndex: 2 })],
    };
    expect(orphanEvents(gapped).map(e => e.id)).toEqual(['lost']);
  });
});

describe('buildFCEvents', () => {
  it('gives a multi-group event every lane of the phase it renders in', () => {
    const state = makeState({ events: [makeEvent({ subjectId: 'lunch', groupId: ALL, dayIndex: 2 })] });
    const [fc] = buildFCEvents(state, state.phases[1]!);
    expect(fc!.resourceIds).toEqual(['g1', 'g2', 'g3']);
  });

  it('filters to the events a teacher is involved in', () => {
    const state = makeState({
      events: [
        makeEvent({ id: 'mine', groupId: 'g1', teacherIds: ['t1'] }),
        makeEvent({ id: 'theirs', groupId: 'g2', teacherIds: ['t2'] }),
      ],
    });
    const ids = buildFCEvents(state, state.phases[1]!, { kind: 'teacher', id: 't2' }).map(e => e.id);
    expect(ids).toEqual(['theirs']);
  });

  it('hands the subject colour to CSS instead of filling the card with it', () => {
    const base = makeState();
    const state = {
      ...base,
      subjects: base.subjects.map(s => (s.id === 'lesson' ? { ...s, color: '#a0aec0' } : s)),
      events: [makeEvent({ groupId: 'g1' })],
    };
    const [fc] = buildFCEvents(state, state.phases[1]!);
    // The card is a neutral surface tinted from --ev-color in CSS, so no inline
    // fill and no contrast-picked text colour reach FullCalendar any more.
    expect(fc!.backgroundColor).toBeUndefined();
    expect(fc!.textColor).toBeUndefined();
    expect(fc!.extendedProps!['color']).toBe('#a0aec0');
  });

  it('classifies the card by how much room it has', () => {
    const state = makeState({
      events: [makeEvent({ id: 'short', groupId: 'g1', startTime: '08:00', endTime: '08:15' })],
    });
    const [fc] = buildFCEvents(state, state.phases[1]!);
    expect(fc!.classNames).toContain('wk-dur-xs');
    expect(fc!.classNames).toContain('wk-ev-lesson');
  });

  it('separates hard clashes from advisory room clashes on the card', () => {
    const state = makeState({ events: [makeEvent({ groupId: 'g1' })] });
    const withRoom = {
      ...state,
      events: [{ ...state.events[0]!, conflicts: [{ kind: 'room' as const, resourceId: 'r1', collidingEventIds: ['x'] }] }],
    };
    const withTeacher = {
      ...state,
      events: [{ ...state.events[0]!, conflicts: [{ kind: 'teacher' as const, resourceId: 't1', collidingEventIds: ['x'] }] }],
    };
    expect(buildFCEvents(withRoom, state.phases[1]!)[0]!.classNames).toContain('wk-ev-soft');
    expect(buildFCEvents(withTeacher, state.phases[1]!)[0]!.classNames).toContain('wk-ev-hard');
  });
});

describe('durationBand', () => {
  it('gives each band the layout its height can carry', () => {
    expect(durationBand(15)).toBe('xs');
    expect(durationBand(30)).toBe('sm');
    expect(durationBand(60)).toBe('md');
    expect(durationBand(90)).toBe('lg');
  });
});

describe('time helpers', () => {
  it('snaps to the nearest quarter hour', () => {
    expect(snapToSlot('08:07')).toBe('08:00');
    expect(snapToSlot('08:08')).toBe('08:15');
  });

  it('adds minutes across the hour', () => {
    expect(addMinutesToTime('08:45', 90)).toBe('10:15');
  });

  it('measures duration', () => {
    expect(timeDiffMinutes('08:00', '09:30')).toBe(90);
  });

  it('lists only the fields that depart from the subject default', () => {
    const state = makeState();
    const subject = state.subjects[0]!;
    expect(eventOverrides(makeEvent({ groupId: 'g1' }), subject)).toEqual([]);
    expect(eventOverrides(makeEvent({ groupId: 'g1', roomId: 'outside' }), subject)).toEqual(['Raum']);
  });
});

describe('presentation helpers', () => {
  it('chooses text colour by contrast, not by naive lightness', () => {
    expect(getContrastColor('#a0aec0')).toBe('#000000'); // mid grey: black wins
    expect(getContrastColor('#2b6cb0')).toBe('#ffffff'); // saturated blue: white wins
    expect(getContrastColor('#ffffff')).toBe('#000000');
    expect(getContrastColor('#000000')).toBe('#ffffff');
  });

  it('escapes user text before it reaches an event card', () => {
    expect(escapeHtml('Karten <b>"x"</b>')).toBe('Karten &lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });
});

describe('fullDateLabel', () => {
  it('renders a stored ISO date the way a German reader writes one', () => {
    expect(fullDateLabel('2026-09-07')).toBe('7.9.2026');
    expect(fullDateLabel('2026-12-14')).toBe('14.12.2026');
  });

  // The import confirm is the one place the app names a date the user did not
  // pick from a date input, so a malformed one has to stay readable.
  it('hands back anything it cannot parse', () => {
    expect(fullDateLabel('')).toBe('');
    expect(fullDateLabel('kaputt')).toBe('kaputt');
  });
});


describe('clampGroupDelta', () => {
  it('passes a delta through while the whole set fits', () => {
    expect(clampGroupDelta([1, 2], 2, 0, 4)).toBe(2);
    expect(clampGroupDelta([2, 3], -2, 0, 4)).toBe(-2);
  });

  it('stops the set at the outermost member, keeping its shape', () => {
    // Mon+Thu dragged three days right: Thu can only go one, so neither does more.
    expect(clampGroupDelta([0, 3], 3, 0, 4)).toBe(1);
    expect(clampGroupDelta([1, 4], -3, 0, 4)).toBe(-1);
  });

  it('refuses to move at all when the edge is already reached', () => {
    expect(clampGroupDelta([0, 4], 1, 0, 4)).toBe(0);
    expect(clampGroupDelta([0, 4], -1, 0, 4)).toBe(0);
  });

  it('is a no-op for an empty set or a zero delta', () => {
    expect(clampGroupDelta([], 3, 0, 4)).toBe(0);
    expect(clampGroupDelta([2], 0, 0, 4)).toBe(0);
  });
});


// Which lanes «alle Gruppen» reaches turns on *what* is placed, not on who is in
// the phase. See `lanesForMultiGroup`.
describe('eventGroupIds for an all-lanes placement', () => {
  function withOwnProgramme(subject: Parameters<typeof makeSubject>[0]) {
    const base = makeState();
    const state = {
      ...base,
      groups: base.groups.map(g => (g.id === 'g2' ? { ...g, excludeFromCoverage: true } : g)),
      subjects: [...base.subjects, makeSubject(subject)],
    };
    return eventGroupIds(state, makeEvent({ subjectId: subject.id, groupId: ALL, dayIndex: 2 }));
  }

  it('reaches the group on its own programme with a Pause', () => {
    expect(withOwnProgramme({ id: 'p', kind: 'break', isMultiGroup: true }))
      .toEqual(['g1', 'g2', 'g3']);
  });

  it('reaches it with a Programmpunkt', () => {
    expect(withOwnProgramme({ id: 'o', kind: 'oneoff', isMultiGroup: true }))
      .toEqual(['g1', 'g2', 'g3']);
  });

  it('skips it for a Thema — it is not in the rotation', () => {
    expect(withOwnProgramme({ id: 'l', kind: 'lesson', isMultiGroup: true }))
      .toEqual(['g1', 'g3']);
  });

  it('still reaches every counted lane when nothing is excluded', () => {
    const state = makeState({ subjects: [...makeState().subjects, makeSubject({ id: 'l', kind: 'lesson', isMultiGroup: true })] });
    expect(eventGroupIds(state, makeEvent({ subjectId: 'l', groupId: ALL, dayIndex: 2 })))
      .toEqual(['g1', 'g2', 'g3']);
  });
});
