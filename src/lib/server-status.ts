import { API_URLS } from './api-endpoints';
import { desktopInvoke, isDesktop } from './desktop';

export const SERVER_STATUS_URL = 'https://yummystatus.me/';
export const SERVER_STATUS_API = `${SERVER_STATUS_URL}api/health?timeRange=3hour`;
export const SERVER_STATUS_INTERVAL = 60_000;
export const SERVER_STATUS_STALE_MS = 10 * 60_000;

export type ServerState = 'up' | 'degraded' | 'down' | 'captcha' | 'unknown';
export interface ServerStatus {
  domain: string;
  state: ServerState;
  checkedAt?: number;
  latency?: number;
}
export interface ServerStatusSnapshot {
  updatedAt: number;
  servers: ServerStatus[];
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const date = (value: unknown) => (typeof value === 'string' ? Date.parse(value) : NaN);

export function parseServerStatus(value: unknown): ServerStatusSnapshot {
  const payload = record(value);
  if (!payload || !Array.isArray(payload.domains) || !Number.isFinite(date(payload.updatedAt)))
    throw new Error('YummyStatus вернул неожиданный ответ.');
  const domains = payload.domains;
  return {
    updatedAt: date(payload.updatedAt),
    servers: API_URLS.map(endpoint => {
      const domain = new URL(endpoint).hostname;
      const report = domains.find(item => record(item)?.domain === domain);
      const buckets = record(report)?.buckets;
      // Pick the actual newest sample, not the historical health over the whole range.
      const latest = Array.isArray(buckets)
        ? buckets
            .map(record)
            .filter(
              (bucket): bucket is Record<string, unknown> =>
                !!bucket && Number.isFinite(date(bucket.time))
            )
            .sort((a, b) => date(b.time) - date(a.time))[0]
        : undefined;
      const status = latest?.status;
      const state: ServerState =
        status === 'UP'
          ? 'up'
          : typeof status === 'string' && status.startsWith('DEGRADED_')
            ? 'degraded'
            : status === 'DOWN'
              ? 'down'
              : status === 'CAPTCHA'
                ? 'captcha'
                : 'unknown';
      return {
        domain,
        state,
        ...(latest ? { checkedAt: date(latest.time) } : {}),
        ...(typeof latest?.totalTimeAvg === 'number' &&
        Number.isFinite(latest.totalTimeAvg) &&
        latest.totalTimeAvg >= 0
          ? { latency: Math.round(latest.totalTimeAvg) }
          : {}),
      };
    }),
  };
}

export async function fetchServerStatus(signal?: AbortSignal): Promise<ServerStatusSnapshot> {
  const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10_000)]);
  combined.throwIfAborted();
  const payload = isDesktop()
    ? await desktopInvoke('yummy_server_status', {}, combined)
    : await (async () => {
        // The public monitor has no CORS headers. Vite proxies this fixed endpoint in dev;
        // native builds use the fixed Rust command. Static web builds retain the source link.
        const response = await fetch(import.meta.env.DEV ? '/yummystatus-api' : SERVER_STATUS_API, {
          signal: combined,
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('Не удалось получить статус серверов.');
        return response.json();
      })();
  combined.throwIfAborted();
  return parseServerStatus(payload);
}
