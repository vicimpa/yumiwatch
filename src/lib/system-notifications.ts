import { isDesktop } from './desktop';

export async function requestSystemNotifications() {
  if (isDesktop()) {
    const { isPermissionGranted, requestPermission } =
      await import('@tauri-apps/plugin-notification');
    return (await isPermissionGranted()) || (await requestPermission()) === 'granted';
  }
  if (typeof Notification === 'undefined') return false;
  return (
    Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted'
  );
}

export async function showSystemNotification(title: string, body: string, current = () => true) {
  if (isDesktop()) {
    const { isPermissionGranted, sendNotification } =
      await import('@tauri-apps/plugin-notification');
    if ((await isPermissionGranted()) && current()) sendNotification({ title, body });
  } else if (
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    current()
  ) {
    new Notification(title, { body });
  }
}
