import type { Room, Subject, Teacher } from '../types';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Event cards are handed to FullCalendar as an HTML string, so every value that
// comes from user-entered config (subject, room and teacher names) has to be
// escaped: a subject called `Karten <Führung>` would otherwise disappear, and a
// name containing a quote would break out of the title="…" attribute.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch] ?? ch);
}

// The label shown on calendar cards and avatars. Falls back to the first two
// letters when a teacher has no explicit short name.
export function teacherShort(teacher: Pick<Teacher, 'name' | 'shortName'>): string {
  return teacher.shortName || teacher.name.slice(0, 2).toUpperCase();
}

/** What a card's short form is capped at — about what the narrowest lane holds. */
export const SUBJECT_SHORT_MAX = 10;

/**
 * The name a card falls back to once its lane is too narrow for the full one.
 *
 * This used to cut at the first separator and stop — "Kartenlesen, Signaturen"
 * became "Kartenlesen", "Karteneröffnung/-führung" became "Karteneröffnung" —
 * on the argument that anything shorter was a judgement call and therefore the
 * user's. But both of those are fifteen-odd characters entering a band that
 * exists because ~68px of lane holds about six, so both were ellipsised and
 * both read «Karten…». The judgement was never offered to the user either: no
 * screen shows the label a Thema will actually get, so nobody knew a Kürzel was
 * needed. Three such pairs collide in a twenty-Thema plan.
 *
 * So it derives like `roomShort` instead: keep something from *every* token
 * rather than all of the first one. The tail is what tells two Themen apart.
 *
 *   one token      → first ten characters      Leitungsbau → "Leitungsba"
 *   two tokens     → 4 + 3, capitalised        Schulung Kader → "SchuKad"
 *   three or more  → 3 + initials              Funk Grundlagen Praxis → "FunGP"
 *
 * An explicit `shortName` always wins, and `collidingSubjectShorts` finds the
 * pairs this still cannot separate so Konfiguration can ask for one.
 */
export function subjectShort(subject: Pick<Subject, 'name' | 'shortName'> | null | undefined): string {
  if (!subject) return '?';
  const explicit = subject.shortName.trim();
  if (explicit !== '') return explicit;

  const name = subject.name.trim();
  if (name === '') return '?';

  // Hyphens split too: "ABC-Theorie" is two tokens, and "/-führung" must not
  // leave a stray "-" behind as a token of its own.
  const tokens = name.split(/[\s/,.\-–—()·+&]+/).filter(Boolean);
  if (tokens.length === 0) return name.slice(0, SUBJECT_SHORT_MAX);

  const head = (t: string, n: number): string => t.slice(0, n);
  const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

  if (tokens.length === 1) return head(tokens[0] as string, SUBJECT_SHORT_MAX);

  if (tokens.length === 2) {
    const [first, second] = tokens as [string, string];
    return `${head(first, 4)}${cap(head(second, 3))}`.slice(0, SUBJECT_SHORT_MAX);
  }

  const [first, ...rest] = tokens as [string, ...string[]];
  const initials = rest.map(t => t.charAt(0).toUpperCase()).join('');
  return `${head(first, 3)}${initials}`.slice(0, SUBJECT_SHORT_MAX);
}

/**
 * How many leading characters of a short form actually survive the narrowest
 * lane. Two Themen agreeing this far read as the same card, whatever the rest
 * of the string says, so this is what a collision is measured on.
 */
const SUBJECT_SHORT_VISIBLE = 6;

/**
 * The ids of Themen whose card label cannot be told apart from another's.
 *
 * A derived short form is a guess, and a guess can still collide — two Themen
 * that genuinely start the same way have nothing for the derivation to work
 * with. That is a fact the app can see and the user cannot, so Konfiguration
 * names it and asks for a Kürzel rather than leaving two identical cards on the
 * grid. An explicit Kürzel that still collides is reported too: the user made
 * that one, and they are the only one who can fix it.
 */
export function collidingSubjectShorts(
  subjects: readonly Pick<Subject, 'id' | 'name' | 'shortName'>[],
): Set<string> {
  const byLabel = new Map<string, string[]>();
  for (const s of subjects) {
    const key = subjectShort(s).slice(0, SUBJECT_SHORT_VISIBLE).toLocaleLowerCase('de');
    if (key === '' || key === '?') continue;
    const bucket = byLabel.get(key);
    if (bucket) bucket.push(s.id);
    else byLabel.set(key, [s.id]);
  }
  const clashing = new Set<string>();
  for (const ids of byLabel.values()) {
    if (ids.length > 1) for (const id of ids) clashing.add(id);
  }
  return clashing;
}

/**
 * Is the user typing? Both window-level key handlers — the toolbar's Ctrl+Z and
 * the grid's arrow keys — have to leave a focused field alone, and each carried
 * its own copy of this test.
 */
/**
 * A room's code for the card. The full name is the one piece of a card that
 * never had a short form, so it was simply dropped below ~92px — while the
 * *time* survived at the same width, which is backwards: which room a Gruppe
 * walks to is exactly what a printed plan is read for.
 *
 * An explicit `shortName` always wins. Otherwise it is derived so that rooms
 * which differ only in a trailing number stay apart — "Theoriesaal 1" and
 * "Theoriesaal 2" reduced to initials would both be "T":
 *
 *   one word      → first five characters      Werkhof → "Werk h"→ "Werkh"
 *   two tokens    → 3 + 1                      Theoriesaal 1 → "The1"
 *   three or more → initials                   Schutzanlage Bern-West → "SBW"
 *
 * A numeric token is always kept whole; the result is capped at five characters,
 * which is what fits the pill in the narrowest lane the app draws.
 */
export function roomShort(room: Pick<Room, 'name' | 'shortName'> | null | undefined): string {
  if (!room) return '';
  const explicit = room.shortName.trim();
  if (explicit !== '') return explicit;

  const name = room.name.trim();
  if (name === '') return '';

  const tokens = name.split(/[\s\-/.]+/).filter(Boolean);
  const isNumber = (t: string): boolean => /^\d+$/.test(t);

  if (tokens.length === 1) return name.slice(0, 5);

  if (tokens.length === 2) {
    const [first, second] = tokens as [string, string];
    const head = isNumber(first) ? first : first.slice(0, 3);
    const tail = isNumber(second) ? second : second.slice(0, 1).toUpperCase();
    return `${head}${tail}`.slice(0, 5);
  }

  return tokens
    .map(t => (isNumber(t) ? t : t.slice(0, 1).toUpperCase()))
    .join('')
    .slice(0, 5);
}

export function isEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}
