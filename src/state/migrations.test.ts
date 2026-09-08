import { describe, it, expect } from 'vitest';
import {
  migrate_v5_to_v6, migrate_v6_to_v7, migrate_v7_to_v8, migrate_v8_to_v9, migrate_v9_to_v10,
  migrate_v10_to_v11, migrate_v11_to_v12, migrateState,
} from './migrations';
import { CURRENT_VERSION } from './persistence';

/** A v5 store, as it sat in localStorage before the plan-name/content release. */
function v5State(): Record<string, unknown> {
  return {
    version: 5,
    wkStartDate: '2026-09-07',
    groups: [{ id: 'g1', label: 'G1', enabled: true, order: 0 }],
    phases: [{ id: 'p1', label: 'WK', startDay: 0, endDay: 4, groupIds: ['g1'] }],
    teachers: [{ id: 't1', name: 'Anna', shortName: 'A', color: '#fff' }],
    rooms: [{ id: 'r1', name: 'Raum', color: '#000', excludeFromConflictCheck: false }],
    subjects: [{
      id: 's1', name: 'Karte', color: '#123456', defaultTeacherIds: ['t1'],
      defaultRoomId: 'r1', defaultDurationMinutes: 90, isBreak: false,
      isMultiGroup: false, phaseId: null,
    }],
    events: [{
      id: 'e1', subjectId: 's1', groupId: 'g1', dayIndex: 0,
      startTime: '08:00', endTime: '09:30', teacherIds: 'inherit', roomId: 'inherit',
    }],
  };
}

describe('migrate_v5_to_v6', () => {
  it('adds the new fields without touching the schedule', () => {
    const out = migrate_v5_to_v6(v5State());
    expect(out.version).toBe(6);
    expect(out.name).toBe('WK-Plan');
    expect(out.teachers[0].unavailable).toEqual([]);
    expect(out.rooms[0].unavailable).toEqual([]);
    expect(out.subjects[0].content).toEqual({ goals: [], notes: '' });
    expect(out.events).toEqual(v5State().events);
    expect(out.wkStartDate).toBe('2026-09-07');
  });

  it('keeps a name that is already there', () => {
    const out = migrate_v5_to_v6({ ...v5State(), name: 'WK 2026 Zug 3' });
    expect(out.name).toBe('WK 2026 Zug 3');
  });
});

describe('migrate_v6_to_v7', () => {
  it('gives every subject a zero target, which keeps coverage counting as before', () => {
    const out = migrate_v6_to_v7(migrate_v5_to_v6(v5State()));
    expect(out.version).toBe(7);
    expect(out.subjects[0].targetMinutesPerGroup).toBe(0);
    expect(out.events).toEqual(v5State().events);
  });

  it('keeps a target that is already there', () => {
    const v6 = migrate_v5_to_v6(v5State());
    v6.subjects[0].targetMinutesPerGroup = 90;
    expect(migrate_v6_to_v7(v6).subjects[0].targetMinutesPerGroup).toBe(90);
  });
});

describe('migrate_v7_to_v8', () => {
  it('drops the separate target again, leaving the duration to carry it', () => {
    const v7 = migrate_v6_to_v7(migrate_v5_to_v6(v5State()));
    v7.subjects[0].targetMinutesPerGroup = 120;
    const out = migrate_v7_to_v8(v7);

    expect(out.version).toBe(8);
    expect(out.subjects[0]).not.toHaveProperty('targetMinutesPerGroup');
    expect(out.subjects[0].defaultDurationMinutes).toBe(90);
    expect(out.events).toEqual(v5State().events);
  });
});

describe('migrate_v8_to_v9', () => {
  it('seeds an empty short name, which keeps the derived one live', () => {
    const v8 = migrate_v7_to_v8(migrate_v6_to_v7(migrate_v5_to_v6(v5State())));
    const out = migrate_v8_to_v9(v8);

    expect(out.version).toBe(9);
    expect(out.subjects[0].shortName).toBe('');
    expect(out.events).toEqual(v5State().events);
  });

  it('keeps a short name that is already there', () => {
    const v8 = migrate_v7_to_v8(migrate_v6_to_v7(migrate_v5_to_v6(v5State())));
    v8.subjects[0].shortName = 'Karte';
    expect(migrate_v8_to_v9(v8).subjects[0].shortName).toBe('Karte');
  });
});

describe('migrate_v9_to_v10', () => {
  const v9 = () => migrate_v8_to_v9(migrate_v7_to_v8(migrate_v6_to_v7(migrate_v5_to_v6(v5State()))));

  it('seeds lastExportedAt as null, not as "now"', () => {
    // An existing plan genuinely has never been exported. Stamping it with the
    // migration time would suppress the first reminder for exactly the plans
    // that have been living in one browser the longest.
    const out = migrate_v9_to_v10(v9());
    expect(out.version).toBe(10);
    expect(out.lastExportedAt).toBeNull();
    expect(out.events).toEqual(v5State().events);
  });

  it('keeps a timestamp that is already there', () => {
    const state = v9();
    state.lastExportedAt = '2026-09-01T10:00:00.000Z';
    expect(migrate_v9_to_v10(state).lastExportedAt).toBe('2026-09-01T10:00:00.000Z');
  });
});

describe('migrate_v10_to_v11', () => {
  const v10 = () => migrate_v9_to_v10(
    migrate_v8_to_v9(migrate_v7_to_v8(migrate_v6_to_v7(migrate_v5_to_v6(v5State())))),
  );

  it('seeds an empty room code, which keeps the derived one live', () => {
    const out = migrate_v10_to_v11(v10());
    expect(out.version).toBe(11);
    expect(out.rooms[0].shortName).toBe('');
  });

  it('keeps a code that is already there', () => {
    const state = v10();
    state.rooms[0].shortName = 'TS1';
    expect(migrate_v10_to_v11(state).rooms[0].shortName).toBe('TS1');
  });
});

describe('migrate_v11_to_v12', () => {
  const v11 = () => migrate_v10_to_v11(migrate_v9_to_v10(
    migrate_v8_to_v9(migrate_v7_to_v8(migrate_v6_to_v7(migrate_v5_to_v6(v5State())))),
  ));

  it('turns the boolean into a kind and drops the old field', () => {
    const out = migrate_v11_to_v12(v11());
    expect(out.version).toBe(12);
    expect(out.subjects[0].kind).toBe('lesson');
    expect(out.subjects[0]).not.toHaveProperty('isBreak');
    expect(out.events).toEqual(v5State().events);
  });

  it('maps a break to the break kind', () => {
    const state = v11();
    state.subjects[0].isBreak = true;
    expect(migrate_v11_to_v12(state).subjects[0].kind).toBe('break');
  });

  it('never invents a Programmpunkt: nothing in an old store could be one', () => {
    const state = v11();
    state.subjects.push({ ...state.subjects[0], id: 's2', isBreak: true });
    const kinds = migrate_v11_to_v12(state).subjects.map((s: { kind: string }) => s.kind);
    expect(kinds).toEqual(['lesson', 'break']);
  });
});

describe('migrateState', () => {
  it('walks a v5 store up to the current version', () => {
    expect(migrateState(v5State(), CURRENT_VERSION)?.version).toBe(CURRENT_VERSION);
  });

  it('chains every hop, so a v5 store arrives with the current shape', () => {
    const out = migrateState(v5State(), CURRENT_VERSION);
    expect(out.name).toBe('WK-Plan');
    expect(out.subjects[0].content).toEqual({ goals: [], notes: '' });
    expect(out.subjects[0]).not.toHaveProperty('targetMinutesPerGroup');
    expect(out.subjects[0].shortName).toBe('');
    expect(out.lastExportedAt).toBeNull();
    expect(out.rooms[0].shortName).toBe('');
    expect(out.subjects[0].kind).toBe('lesson');
    expect(out.subjects[0]).not.toHaveProperty('isBreak');
  });

  it('returns state that is already current untouched', () => {
    const current = migrateState(v5State(), CURRENT_VERSION);
    expect(migrateState(current, CURRENT_VERSION)).toBe(current);
  });

  it('refuses a version with no path to the target', () => {
    // Newer than this build, and older than the oldest step there is.
    expect(migrateState({ version: 99 }, CURRENT_VERSION)).toBeNull();
    expect(migrateState({ version: 0 }, CURRENT_VERSION)).toBeNull();
  });

  // The chain now starts at v1 — the version the very first build wrote. A store
  // that old used to fail the shape check before any step ran (it predates
  // `phases`), be replaced by a fresh default, and take the user's week with it.
  it('carries a v1 store all the way to the current version', () => {
    const out = migrateState({
      version: 1,
      wkStartDate: '2026-09-07',
      groups: [{ id: 'g1', label: 'G1', enabled: true, order: 0 }],
      teachers: [{ id: 't1', name: 'Anna Müller', color: '#4299e1' }],
      rooms: [{ id: 'r1', name: 'Seminarraum', color: '#48bb78', excludeFromConflictCheck: false }],
      subjects: [{
        id: 's1', name: 'Karteneröffnung', color: '#9f7aea',
        defaultTeacherIds: ['t1'], defaultRoomId: 'r1',
        defaultDurationMinutes: 90, isBreak: false,
      }],
      events: [{
        id: 'e1', subjectId: 's1', groupId: 'g1', dayIndex: 0,
        startTime: '08:00', endTime: '09:30', teacherIds: null, roomId: null,
      }],
    }, CURRENT_VERSION);

    expect(out).not.toBeNull();
    expect(out.version).toBe(CURRENT_VERSION);
    expect(out.teachers[0].shortName).toBe('AM');
    // The pre-phase model was one grid over the whole week for every group.
    expect(out.phases).toHaveLength(1);
    expect(out.phases[0].groupIds).toEqual(['g1']);
    // `null` used to mean "use the subject's default"; on a room it now means
    // the opposite, so both fields have to become the sentinel.
    expect(out.events[0].teacherIds).toBe('inherit');
    expect(out.events[0].roomId).toBe('inherit');
    expect(out.subjects[0].kind).toBe('lesson');
    expect(out.subjects[0].optional).toBe(false);
    expect(out.groups[0].excludeFromCoverage).toBe(false);
  });
});
