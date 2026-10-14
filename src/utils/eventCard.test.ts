import { describe, expect, it } from 'vitest';
import type { VNode } from 'fullcalendar/preact';
import { eventCard } from './eventCard';

/** Every string child anywhere in the tree, in order. */
function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === 'object' && 'props' in node) {
    return texts((node as VNode<{ children?: unknown }>).props.children);
  }
  return [];
}

describe('eventCard', () => {
  it('carries user-entered names as text, not markup', () => {
    const card = eventCard({
      title: 'Karten <b>"x"</b>',
      teachers: [{ name: 'A <i>', shortName: 'A<', color: '#123456' }],
      room: { name: 'R & D', shortName: 'R&D', color: '#654321' },
      startTime: '08:00',
      endTime: '09:00',
    });
    const all = texts(card);
    expect(all).toContain('Karten <b>"x"</b>');
    expect(all).toContain('A<');
    expect(all).toContain('R & D');
    expect(all).toContain('–09:00');
  });

  it('renders a title-only preview for a sidebar drag mirror', () => {
    expect(texts(eventCard({ title: 'Antenne' }))).toEqual(['Antenne']);
  });
});
