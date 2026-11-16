import type { JSX } from 'preact';

import { focusTarget, keyboardTargets } from './keyboard-navigation';

// Directional navigation stays inside a gallery and leaves inputs and the player alone.
export function navigateGallery(event: JSX.TargetedKeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey)
    return;

  const target = event.target as HTMLElement;
  const current =
    target.closest<HTMLAnchorElement>('[data-gallery-link]') ||
    target.closest('[data-gallery-item]')?.querySelector<HTMLAnchorElement>('[data-gallery-link]');

  if (
    !current ||
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
  )
    return;

  const surface = event.currentTarget;
  const links = keyboardTargets(surface).filter((node): node is HTMLAnchorElement =>
    node.matches('[data-gallery-link]')
  );
  const row = current.closest('[data-gallery-row]');
  let next: HTMLAnchorElement | undefined;

  if (event.key === 'Home' || event.key === 'End') {
    const inRow = links.filter(link => link.closest('[data-gallery-row]') === row);

    next = event.key === 'Home' ? inRow[0] : inRow.at(-1);
  } else {
    const bounds = (link: HTMLElement) =>
      (link.closest('[data-gallery-item]') || link).getBoundingClientRect();

    const rect = bounds(current),
      x = rect.x + rect.width / 2,
      y = rect.y;
    const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key);
    const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;

    next = links
      .filter(link => link !== current)
      .map(link => {
        // Use card positions, since wrapped titles have different heights in one row.
        const box = bounds(link),
          dx = box.x + box.width / 2 - x,
          dy = box.y - y;
        const along = horizontal ? dx : dy,
          across = horizontal ? dy : dx;
        const valid =
          along * direction > 2 &&
          (!horizontal || Math.abs(dy) < Math.min(rect.height, box.height) / 2);

        return { link, valid, distance: Math.abs(along) + Math.abs(across) * 3 };
      })
      .filter(item => item.valid)
      .sort((a, b) => a.distance - b.distance)[0]?.link;
  }
  if (!next && event.key === 'ArrowLeft') {
    event.preventDefault();
    window.dispatchEvent(new Event('yumiwatch:menu'));

    return;
  }
  if (next) event.preventDefault();
  if (next) focusTarget(next);
}
