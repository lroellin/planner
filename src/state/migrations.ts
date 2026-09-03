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

/**
 * v8 → v9: `subject.shortName`, what a card shows once its lane is too narrow
 * for the full name. Seeded empty rather than derived, so the fallback stays
 * live and follows a rename until someone types a real short name.
 */
export function migrate_v8_to_v9(state: any): any {
  return {
    ...state,
    version: 9,
    subjects: (state.subjects ?? []).map((s: any) => ({
      ...s,
      shortName: typeof s.shortName === 'string' ? s.shortName : '',
    })),
  };
}

/**
 * v9 → v10: `lastExportedAt`, so the app can tell how long the plan has existed
 * only inside this one browser. Seeded null rather than "now": an existing plan
 * genuinely has never been exported, and claiming otherwise would suppress the
 * first reminder for exactly the plans that most need it.
 */
export function migrate_v9_to_v10(state: any): any {
  return {
    ...state,
    version: 10,
    lastExportedAt: typeof state.lastExportedAt === 'string' ? state.lastExportedAt : null,
  };
}

/**
 * v10 → v11: `room.shortName`, the 4–5 character code a card shows where the
 * full name cannot fit. Seeded empty, like `subject.shortName`, so the derived
 * form stays live and follows a rename.
 */
export function migrate_v10_to_v11(state: any): any {
  return {
    ...state,
    version: 11,
    rooms: (state.rooms ?? []).map((r: any) => ({
      ...r,
      shortName: typeof r.shortName === 'string' ? r.shortName : '',
    })),
  };
}

/**
 * v11 → v12: `subject.kind` replaces the boolean `subject.isBreak`, making room
 * for a third kind — the *Programmpunkt*, a fixed point of the programme that
 * happens once instead of once per group and is therefore outside coverage.
 * Nothing existing can be one, so every old subject is a Thema or a Pause.
 */
export function migrate_v11_to_v12(state: any): any {
  return {
    ...state,
    version: 12,
    subjects: (state.subjects ?? []).map(({ isBreak, ...s }: any) => ({
      ...s,
      kind: isBreak === true ? 'break' : 'lesson',
    })),
  };
}

/** Keyed by the version each step migrates *from*. Chained by `migrateState`. */
const MIGRATIONS: Record<number, Migration> = {
  5: migrate_v5_to_v6,
  6: migrate_v6_to_v7,
  7: migrate_v7_to_v8,
  8: migrate_v8_to_v9,
  9: migrate_v9_to_v10,
  10: migrate_v10_to_v11,
  11: migrate_v11_to_v12,
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
