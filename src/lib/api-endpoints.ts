import { signal } from '@preact/signals';

export const API_URLS = [
  'https://api.yani.tv',
  'https://old.yummyani.me/api',
  'https://ru.yummyani.me/api',
] as const;

type ApiUrl = (typeof API_URLS)[number];
export const API_URL = API_URLS[0];
export const API_TIMEOUT_MS = 5000;
export const API_RECOVERY_INTERVAL = 60_000;
export const activeApiUrl = signal<ApiUrl>(API_URL);

let preferred = 0;
let generation = 0;
let primaryProbe: ((signal: AbortSignal) => Promise<boolean>) | undefined;
let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
let recoveryController: AbortController | undefined;

function stopRecovery() {
  clearTimeout(recoveryTimer);
  recoveryTimer = undefined;
  recoveryController?.abort();
  recoveryController = undefined;
}

function scheduleRecovery() {
  if (!preferred || !primaryProbe || recoveryTimer || recoveryController) return;
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = undefined;
    if (globalThis.document?.hidden || globalThis.navigator?.onLine === false) {
      scheduleRecovery();
      return;
    }
    const controller = new AbortController();
    const started = generation;
    recoveryController = controller;
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      if (await primaryProbe!(controller.signal)) {
        if (!controller.signal.aborted && generation === started) {
          // Invalidate in-flight mirror replies so they cannot undo recovery.
          generation++;
          selectEndpoint(0);
        }
      }
    } catch {
      /* Keep serving requests through the working mirror. */
    } finally {
      clearTimeout(timeout);
      if (recoveryController === controller) recoveryController = undefined;
      if (generation === started) scheduleRecovery();
    }
  }, API_RECOVERY_INTERVAL);
}

function selectEndpoint(index: number) {
  preferred = index;
  activeApiUrl.value = API_URLS[index];
  if (preferred) scheduleRecovery();
  else stopRecovery();
}

export function configurePrimaryApiProbe(probe: (signal: AbortSignal) => Promise<boolean>) {
  primaryProbe = probe;
  scheduleRecovery();
}

export function resetApiEndpoint() {
  generation++;
  selectEndpoint(0);
}

export const apiEndpointGeneration = () => generation;

export function apiEndpoints() {
  return [...API_URLS.slice(preferred), ...API_URLS.slice(0, preferred)];
}

export function rememberApiEndpoint(endpoint: ApiUrl, started = generation) {
  if (started === generation) {
    if (endpoint === API_URL) generation++;
    selectEndpoint(API_URLS.indexOf(endpoint));
  }
}

export function failApiEndpoint(endpoint: ApiUrl, started = generation) {
  if (started === generation && API_URLS[preferred] === endpoint)
    selectEndpoint((preferred + 1) % API_URLS.length);
}

/** Match exact HTTPS origins and the API prefix before forwarding account credentials. */
export function isApiUrl(url: URL) {
  return (
    !url.username &&
    !url.password &&
    !url.hash &&
    API_URLS.some(endpoint => {
      const base = new URL(endpoint);
      return (
        url.origin === base.origin &&
        url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`)
      );
    })
  );
}
