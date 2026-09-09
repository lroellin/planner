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

/** "John Doe" → "JD". Inlined so a migration never depends on app code that
 *  is free to change under it. */
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map(p => p[0]!.toUpperCase()).join('');
}

/**
 * v1 → v2: `teacher.shortName`, the initials a card shows. Derived from the
 * name, which is what the ad-hoc backfill this replaced already did.
 */
export function migrate_v1_to_v2(state: any): any {
  return {
    ...state,
    version: 2,
    teachers: (state.teachers ?? []).map((t: any) => ({
      ...t,
      shortName:
        typeof t.shortName === 'string' && t.shortName !== ''
          ? t.shortName
          : initialsFrom(String(t.name ?? '')),
    })),
  };
}

/**
 * v2 → v3: nothing. No build ever wrote a v3 store — the version went straight
 * from 2 to 4 in one commit — so this hop exists only to keep the chain
 * unbroken, and the whole of that change lives in the next step.
 */
export function migrate_v2_to_v3(state: any): any {
  return { ...state, version: 3 };
}

/**
 * v3 → v4: phases, multi-group subjects, and the `'inherit'` sentinel.
 *
 * The pre-v4 model had no phases at all: the week was one grid over every
 * group. It is rebuilt here as a single phase spanning Mon–Fri with every group
 * in it, which is exactly what that model meant. Events carried `teacherIds:
 * null` / `roomId: null` for "use the subject's default", a meaning `'inherit'`
 * now carries — `null` on a room has since come to mean the opposite
 * ("explicitly no room"), so leaving it would silently strip rooms.
 */
export function migrate_v3_to_v4(state: any): any {
  const groups = state.groups ?? [];
  const phases = Array.isArray(state.phases) && state.phases.length > 0
    ? state.phases
    : [{
        id: 'phase-migrated',
        label: 'WK',
        startDay: 0,
        endDay: 4,
        groupIds: groups.map((g: any) => g.id),
      }];

  return {
    ...state,
    version: 4,
    phases,
    subjects: (state.subjects ?? []).map((s: any) => ({
      ...s,
      isMultiGroup: s.isMultiGroup === true,
    })),
    events: (state.events ?? []).map((ev: any) => ({
      ...ev,
      // An array here was the short-lived pre-sentinel spelling of "every lane".
      groupId: Array.isArray(ev.groupId) ? 'all' : ev.groupId,
      teacherIds: ev.teacherIds == null ? 'inherit' : ev.teacherIds,
      roomId: ev.roomId == null ? 'inherit' : ev.roomId,
    })),
  };
}

/**
 * v4 → v5: `subject.phaseId`, the override that pins a Thema to one phase.
 * Seeded null — "read the phase from the placements" — which is what every
 * subject did before the field existed.
 */
export function migrate_v4_to_v5(state: any): any {
  return {
    ...state,
    version: 5,
    subjects: (state.subjects ?? []).map((s: any) => ({
      ...s,
      phaseId: typeof s.phaseId === 'string' ? s.phaseId : null,
    })),
  };
}

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

/**
 * v12 → v13: `group.excludeFromCoverage` and `subject.optional` — the two ways
 * a plan says "this one is not part of the reckoning". Both default to false,
 * which is the behaviour every existing plan already has.
 */
export function migrate_v12_to_v13(state: any): any {
  return {
    ...state,
    version: 13,
    groups: (state.groups ?? []).map((g: any) => ({
      ...g,
      excludeFromCoverage: g.excludeFromCoverage === true,
    })),
    subjects: (state.subjects ?? []).map((s: any) => ({
      ...s,
      optional: s.optional === true,
    })),
  };
}

/**
 * v13 → v14: `gridStartTime` / `gridEndTime`, the hours the grid draws.
 *
 * Both seeded `null` — "derive it from the plan" — rather than the 07:00–19:00
 * the hardcoded grid used to draw. Stamping the old constants would freeze
 * every existing plan into the very fringe this field exists to remove; null
 * lets each one narrow to its own week on first render.
 */
export function migrate_v13_to_v14(state: any): any {
  return {
    ...state,
    version: 14,
    gridStartTime: null,
    gridEndTime: null,
  };
}

/** Keyed by the version each step migrates *from*. Chained by `migrateState`. */
const MIGRATIONS: Record<number, Migration> = {
  1: migrate_v1_to_v2,
  2: migrate_v2_to_v3,
  3: migrate_v3_to_v4,
  4: migrate_v4_to_v5,
  5: migrate_v5_to_v6,
  6: migrate_v6_to_v7,
  7: migrate_v7_to_v8,
  8: migrate_v8_to_v9,
  9: migrate_v9_to_v10,
  10: migrate_v10_to_v11,
  11: migrate_v11_to_v12,
  12: migrate_v12_to_v13,
  13: migrate_v13_to_v14,
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
