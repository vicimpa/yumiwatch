import { signal } from '@preact/signals';

export const toastMessage = signal('');

let timer: ReturnType<typeof setTimeout> | undefined;

export function notify(message: string) {
  clearTimeout(timer);
  toastMessage.value = message;
  timer = setTimeout(() => {
    toastMessage.value = '';
    timer = undefined;
  }, 4000);
}
