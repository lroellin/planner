import { h, type VNode } from 'fullcalendar/preact';
import { getContrastColor } from './colorUtils';
import { ICON_PATHS, type IconName } from './icons';
import type { FCEventRoom, FCEventTeacher } from './timeUtils';

// Element props differ per tag; the card only hands its root to FC.
type El = VNode<any>;

/**
 * The card drawn inside every grid event, as Preact elements.
 *
 * FullCalendar v7 renders with the Preact it bundles and takes elements from
 * `eventContent` as readily as an HTML string. Elements carry user-entered
 * text (subject, room and teacher names) as text, so nothing needs escaping,
 * and FC can diff a card across `calendar.render()` instead of re-parsing it.
 * They must come from `fullcalendar/preact` — FC's own copy — or FC cannot
 * render them.
 */

/** The props a card reads; a subset of what `buildFCEvents` puts on an event. */
export interface EventCardProps {
  title: string;
  /** Undefined on a sidebar chip's drag mirror, which only knows its subject. */
  teachers?: FCEventTeacher[];
  room?: FCEventRoom | null;
  shortName?: string;
  startTime?: string;
  endTime?: string;
  hardConflict?: boolean;
  hasConflict?: boolean;
  overrides?: string[];
}

/**
 * The icon set's SVG as an element. The paths are this module's own
 * constants, never user input, so injecting them as markup is safe.
 */
export function icon(name: IconName, size: number): El {
  return h('svg', {
    class: 'wk-icon',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    dangerouslySetInnerHTML: { __html: ICON_PATHS[name] },
  });
}

export function eventCard(p: EventCardProps): El {
  const title = h('div', { class: 'wk-ev-title' },
    h('span', { class: 'wk-ev-name-full' }, p.title),
    h('span', { class: 'wk-ev-name-short' }, p.shortName ?? p.title),
  );

  // A sidebar chip's drag mirror has nothing but its subject: title only.
  if (p.teachers === undefined) {
    return h('div', { class: 'wk-ev-body' },
      h('div', { class: 'wk-ev-top' }, h('div', { class: 'wk-ev-title' }, p.title)),
    );
  }

  const overrides = p.overrides ?? [];
  const hard = p.hardConflict ?? false;

  // No layers icon for a multi-group block: it is drawn once per lane, so the
  // icon was repeated across the whole day to say what the unbroken band
  // already says. Only the first lane carries any text at all — see
  // `.wk-day-first` in calendar.css.
  //
  // Soft covers both `room` and `room-blocked`, so the tooltip cannot name the
  // double-booking: a Lektion inside a Sperrzeit is soft too. "Weicher
  // Konflikt" is what the Legende calls it; the card's own title spells out
  // which kinds actually fired.
  const flags = h('div', { class: 'wk-ev-flags' },
    overrides.length > 0 &&
      h('span', { class: 'wk-ev-flag', title: `Weicht von der Themenvorgabe ab: ${overrides.join(', ')}` },
        icon('pencil', 11)),
    p.hasConflict &&
      h('span', {
        class: `wk-ev-flag ${hard ? 'wk-ev-flag-hard' : 'wk-ev-flag-soft'}`,
        title: hard ? 'Harter Konflikt' : 'Weicher Konflikt',
      }, icon('alert', 12)),
  );

  const teachers = p.teachers.length > 0 &&
    h('div', { class: 'wk-ev-teachers' },
      p.teachers.map(t =>
        h('span', {
          class: 'wk-ev-av',
          style: { background: t.color, color: getContrastColor(t.color) },
          title: t.name,
        }, t.shortName),
      ),
    );

  // A pill carrying the room's own code, not a colour swatch beside a name
  // that gets dropped. The swatch could only be decoded against the Legende;
  // four characters name the place outright, and they fit in every lane the
  // app draws — which the full name never did.
  const room = p.room &&
    h('span', { class: 'wk-ev-room', style: { '--room': p.room.color } },
      h('span', { class: 'wk-ev-room-code' }, p.room.shortName),
      h('span', { class: 'wk-ev-room-name' }, p.room.name),
    );

  // Both names ship on every card and CSS picks one, because the choice is
  // made per *lane width* — a container query — and nothing here knows how
  // wide this card will land. Same for the two halves of the time range.
  return h('div', { class: 'wk-ev-body' },
    h('div', { class: 'wk-ev-top' }, title, flags),
    h('div', { class: 'wk-ev-meta' },
      h('span', { class: 'wk-ev-time' },
        h('span', { class: 'wk-ev-t-start' }, p.startTime ?? ''),
        h('span', { class: 'wk-ev-t-end' }, `–${p.endTime ?? ''}`),
      ),
      teachers,
      room,
    ),
  );
}
