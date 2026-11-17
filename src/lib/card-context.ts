import { signal } from '@preact/signals';
import { getSession } from './session';
import type { Anime } from './types';

export const cardContext = signal<{
  anime: Anime;
  x: number;
  y: number;
  source: HTMLElement;
  owner: string | null;
} | null>(null);

export function cardMenuEvents(anime: Anime) {
  const open = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const source = event.currentTarget as HTMLElement;
    const rect = source.getBoundingClientRect();
    const pointer = event instanceof MouseEvent && (event.clientX || event.clientY);
    cardContext.value = {
      anime,
      x: pointer ? (event as MouseEvent).clientX : rect.left + Math.min(24, rect.width / 2),
      y: pointer ? (event as MouseEvent).clientY : rect.top + Math.min(32, rect.height / 2),
      source,
      owner: getSession()?.token || null,
    };
  };
  return {
    onContextMenu: (event: MouseEvent) => open(event),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) open(event);
    },
  };
}
