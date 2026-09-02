/**
 * Schema migrations.
 *
 * The app used to reset on every version bump — fine while there was no data
 * worth keeping. There is now, so stored state is stepped forward one version at
 * a time instead. Each step is a standalone function named for the hop it makes,
 * so a migration can be deleted (with its entry in MIGRATIONS) once no store in
 * the wild is old enough to need it.
 *
 * Steps run on plain parsed JSON, not on AppState: the shape they receive is by
 * definition the *old* one, so they cannot be typed against the current model.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Migration = (state: any) => any;

/**
 * v5 → v6: plan name, subject content (goals + notes), unavailability windows
 * on teachers and rooms.
 */
export function migrate_v5_to_v6(state: any): any {
  return {
    ...state,
    version: 6,
    name: typeof state.name === 'string' && state.name.trim() !== '' ? state.name : 'WK-Plan',
    teachers: (state.teachers ?? []).map((t: any) => ({
      ...t,
      unavailable: Array.isArray(t.unavailable) ? t.unavailable : [],
    })),
    rooms: (state.rooms ?? []).map((r: any) => ({
      ...r,
      unavailable: Array.isArray(r.unavailable) ? r.unavailable : [],
    })),
    subjects: (state.subjects ?? []).map((s: any) => ({
      ...s,
      content: {
        goals: Array.isArray(s.content?.goals) ? s.content.goals : [],
        notes: typeof s.content?.notes === 'string' ? s.content.notes : '',
      },
    })),
  };
}

/**
 * v6 → v7: a per-group target duration on every subject. 0 keeps the old
 * meaning of coverage — "has this lane had it at all" — so nothing changes for
 * an existing plan until a target is actually entered.
 */
export function migrate_v6_to_v7(state: any): any {
  return {
    ...state,
    version: 7,
    subjects: (state.subjects ?? []).map((s: any) => ({
      ...s,
      targetMinutesPerGroup:
        typeof s.targetMinutesPerGroup === 'number' ? s.targetMinutesPerGroup : 0,
    })),
  };
}

/**
 * v7 → v8: drops `subject.targetMinutesPerGroup` again. The target and the
 * duration were always the same number — a subject that runs 2.5 h owes every
 * group 2.5 h — so coverage measures against `defaultDurationMinutes` and the
 * second field could only ever disagree with it.
 */
export function migrate_v7_to_v8(state: any): any {
  return {
    ...state,
    version: 8,
    subjects: (state.subjects ?? []).map(
      ({ targetMinutesPerGroup: _dropped, ...s }: any) => s,
    ),
  };
}

/** Keyed by the version each step migrates *from*. Chained by `migrateState`. */
const MIGRATIONS: Record<number, Migration> = {
  5: migrate_v5_to_v6,
  6: migrate_v6_to_v7,
  7: migrate_v7_to_v8,
};

/**
 * Step `raw` forward to `target`, or return null when some hop has no migration
 * (which includes state newer than this build). The caller decides what to do
 * with a null — here, ask the user rather than silently discarding their week.
 */
export function migrateState(raw: any, target: number): any | null {
  let state = raw;
  for (let guard = 0; guard < 50; guard++) {
    const version = typeof state.version === 'number' ? state.version : -1;
    if (version === target) return state;
    const step = MIGRATIONS[version];
    if (!step) return null;
    state = step(state);
  }
  return null;
}
