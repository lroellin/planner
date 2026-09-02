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
    name: typeof state.name === 'string' && state.name.trim() !== '' ? state.name : 'WK plan',
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

/** Keyed by the version each step migrates *from*. Chained by `migrateState`. */
const MIGRATIONS: Record<number, Migration> = {
  5: migrate_v5_to_v6,
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
