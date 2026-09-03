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

/**
 * The name a card falls back to once its lane is too narrow for the full one.
 * The derived form cuts at the first separator rather than at a character
 * count: "Karteneröffnung/-führung" becomes "Karteneröffnung", which still
 * wraps and hyphenates like a word, where a hard truncation would have read
 * "Karteneröf.". Anything shorter than that is a judgement call, so it is the
 * user's to make — an explicit shortName always wins.
 */
export function subjectShort(subject: Pick<Subject, 'name' | 'shortName'> | null | undefined): string {
  if (!subject) return '?';
  if (subject.shortName.trim() !== '') return subject.shortName.trim();
  const cut = subject.name.split(/[/(,–—]/)[0]?.trim() ?? '';
  return cut === '' ? subject.name : cut;
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
