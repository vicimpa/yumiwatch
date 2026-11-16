import { invoke } from '@tauri-apps/api/core';

import { isDesktopWindow } from './desktop';
import { INTERFACE_EVENT, interfaceSettings } from './interface-settings';

export const supportsInterfaceScale = () =>
  isDesktopWindow() && document.documentElement.dataset.desktop === 'linux';

export async function applyInterfaceScale() {
  if (!supportsInterfaceScale()) return;

  const scale = interfaceSettings().scale;

  await invoke('set_interface_scale', { scale: scale === 'system' ? null : scale });
}

export async function initializeInterfaceScale() {
  if (!supportsInterfaceScale()) return;

  // Scaling must not prevent startup if a window is being destroyed.
  const update = () => {
    void applyInterfaceScale().catch(() => {
      window.dispatchEvent(new Event('yumiwatch:scale-error'));
    });
  };

  window.addEventListener(INTERFACE_EVENT, update);
  // Re-read GTK DPI after moving the window or changing display preferences.
  window.addEventListener('focus', update);

  let resize: ReturnType<typeof setTimeout>;

  window.addEventListener('resize', () => {
    clearTimeout(resize);
    resize = setTimeout(update, 150);
  });
  await applyInterfaceScale().catch(() => {});
}
