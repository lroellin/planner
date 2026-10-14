import { Fragment, h, type VNode } from 'fullcalendar/preact';
import { getContrastColor } from './colorUtils';
import { icon } from './eventCard';
import type { TimelineBarProps, TimelineRowProps } from './timeline';

/**
 * What the Belegung draws inside its row labels and bars, as Preact elements
 * from FullCalendar's own copy — the same approach as the grid's `eventCard`:
 * user-entered names travel as text, so nothing is escaped by hand.
 */

// Element props differ per tag; only the root is handed to FC.
type El = VNode<any>;

/** An Ausbildner gets the avatar the cards carry; a Raum the room-code pill. */
export function timelineRowLabel(title: string, props: TimelineRowProps): El {
  const mark = props.kind === 'teacher'
    ? h('span', {
        class: 'wk-tl-av',
        style: { background: props.color, color: getContrastColor(props.color) },
      }, props.short)
    : h('span', { class: 'wk-tl-room', style: { '--room': props.color } }, props.short);
  // A fragment: the cell's own inner box lays the three out (timeline.css).
  return h(Fragment, null,
    mark,
    h('span', { class: 'wk-tl-name', title }, title),
    props.shared && h('span', {
      class: 'wk-tl-shared',
      title: 'Vom Konfliktcheck ausgenommen — mehrere Lektionen gleichzeitig sind hier in Ordnung',
    }, 'geteilt'),
  );
}

export function timelineBar(props: TimelineBarProps): El {
  // A clash in *another* row of the same Lektion, still flagged here so a bar
  // never reads cleaner than the card it stands for.
  const flagLevel = props.conflictHere ?? props.conflictElsewhere;
  return h(Fragment, null,
    flagLevel && h('span', { class: `wk-tl-flag wk-tl-flag-${flagLevel}` }, icon('alert', 10)),
    h('span', { class: 'wk-tl-lanes' }, props.lanes),
    h('span', { class: 'wk-tl-subj' }, props.subjectShort),
  );
}
