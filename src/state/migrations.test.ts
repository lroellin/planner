import { describe, it, expect } from 'vitest';
import { migrate_v5_to_v6, migrateState } from './migrations';

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
    expect(out.name).toBe('WK plan');
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

describe('migrateState', () => {
  it('walks a v5 store up to the current version', () => {
    expect(migrateState(v5State(), 6)?.version).toBe(6);
  });

  it('returns state that is already current untouched', () => {
    const current = migrate_v5_to_v6(v5State());
    expect(migrateState(current, 6)).toBe(current);
  });

  it('refuses a version with no path to the target', () => {
    // Newer than this build, and a hop nothing knows how to make.
    expect(migrateState({ version: 99 }, 6)).toBeNull();
    expect(migrateState({ version: 1 }, 6)).toBeNull();
  });
});
