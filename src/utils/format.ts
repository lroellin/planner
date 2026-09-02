import type { Teacher } from '../types';

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
