// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YummyRealtime } from '~/core/YummyRealtime';
import { FakeSocket } from './realtime-fixture';
import { readFileSync } from 'node:fs';

let client: YummyRealtime;
beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  client = new YummyRealtime(undefined, url => new FakeSocket(url) as unknown as WebSocket);
});
afterEach(() => {
  client.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const socket = () => FakeSocket.instances.at(-1)!;

describe('Yummy realtime lifecycle', () => {
  it('shares an object subscription, dispatches only its updates, and unsubscribes after the last consumer', () => {
    client.start('user-token');
    socket().open();
    const listener = vi.fn();
    const first = client.subscribe('user', 42, listener);
    const second = client.subscribe('user', 42, listener);
    expect(socket().sent.filter(m => m.event === 'subscribe-global')).toHaveLength(1);
    socket().message({ event: 'update-user', object_id: 9, data: { last_online: 5 } });
    expect(listener).not.toHaveBeenCalled();
    first();
    expect(socket().sent.filter(m => m.event === 'unsubscribe-global')).toHaveLength(0);
    socket().message({ event: 'update-user', object_id: 42, data: { last_online: 6 } });
    expect(listener).toHaveBeenCalledTimes(1);
    second();
    expect(socket().sent.filter(m => m.event === 'unsubscribe-global')).toHaveLength(1);
  });

  it('rotates hosts and restores both personal and object subscriptions after reconnect', () => {
    client.start('token & value');
    const original = socket();
    original.open();
    client.subscribe('user', 42, vi.fn());
    expect(new URL(original.url).searchParams.get('token')).toBe('token & value');
    original.fail();
    vi.advanceTimersByTime(1000);
    expect(socket().url).toContain('socket2.yani.tv');
    socket().open();
    expect(socket().sent.map(m => m.event)).toEqual(['subscribe-events', 'subscribe-global']);
    expect(client.status).toBe('connected');
  });

  it('replaces the credential on token refresh and ignores callbacks from the old socket', () => {
    const event = vi.fn();
    client.onEvent(event);
    client.start('old');
    const old = socket();
    old.open();
    client.start('new');
    const next = socket();
    next.open();
    event.mockClear();
    old.message({ event: 'notification', message: { id: 1 } });
    old.fail();
    expect(event).not.toHaveBeenCalled();
    expect(new URL(next.url).searchParams.get('token')).toBe('new');
    expect(client.status).toBe('connected');
  });

  it('keeps guests public and drops credentials immediately on logout', () => {
    client.start('private');
    socket().open();
    client.start();
    socket().open();
    expect(new URL(socket().url).searchParams.has('token')).toBe(false);
    expect(socket().sent.some(m => m.event === 'subscribe-events')).toBe(false);
  });

  it('reconnects a silent connection but keeps a responding connection alive', () => {
    client.start();
    socket().open();
    vi.advanceTimersByTime(30000);
    expect(socket().sent.at(-1)).toEqual({ event: 'ping' });
    socket().message({ event: 'pong' });
    vi.advanceTimersByTime(10000);
    expect(client.status).toBe('connected');
    vi.advanceTimersByTime(30000);
    expect(client.status).toBe('reconnecting');
  });

  it('stops retrying on policy denial and cancels every timer on stop', () => {
    client.start('rejected');
    socket().open();
    socket().fail(1008);
    vi.advanceTimersByTime(120000);
    expect(client.status).toBe('denied');
    expect(FakeSocket.instances).toHaveLength(1);
    client.reconnect();
    expect(FakeSocket.instances).toHaveLength(2);
    client.stop();
    vi.advanceTimersByTime(120000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores malformed payloads and never sends invalid object subscriptions', () => {
    client.start();
    socket().open();
    const listener = vi.fn();
    client.onEvent(listener);
    socket().onmessage?.({ data: '{bad' });
    socket().message(null);
    socket().message({ anything: true });
    client.subscribe('profile', -1, listener);
    client.subscribe('bad-type', 1, listener);
    expect(socket().sent).toHaveLength(0);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('Yummy realtime backup cluster', () => {
  it('uses the mirror socket cluster when all yani.tv nodes fail and restores subscriptions', () => {
    const event = vi.fn();
    client.onEvent(event);
    client.subscribe('profile', 42, vi.fn());
    client.start('user-token');
    for (const delay of [1000, 2000, 4000]) {
      socket().fail();
      vi.advanceTimersByTime(delay);
    }
    expect(FakeSocket.instances.map(peer => new URL(peer.url).hostname)).toEqual([
      'socket1.yani.tv',
      'socket2.yani.tv',
      'socket3.yani.tv',
      'socket1.yummyani.me',
    ]);
    expect(new URL(socket().url).searchParams.get('token')).toBe('user-token');
    socket().open();
    expect(socket().sent.map(message => message.event)).toEqual([
      'subscribe-events',
      'subscribe-global',
    ]);
    expect(client.status).toBe('connected');
    expect(event).toHaveBeenCalledWith({ event: 'connect' });
  });

  it('tries every backup node and returns to the primary cluster if none respond', () => {
    client.start();
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000]) {
      socket().fail();
      vi.advanceTimersByTime(delay);
    }
    const hosts = FakeSocket.instances.map(peer => new URL(peer.url).hostname);
    expect(hosts).toEqual([
      'socket1.yani.tv',
      'socket2.yani.tv',
      'socket3.yani.tv',
      'socket1.yummyani.me',
      'socket2.yummyani.me',
      'socket3.yummyani.me',
      'socket1.yani.tv',
    ]);
    expect(client.status).toBe('reconnecting');
    client.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('permits both socket clusters in the packaged Tauri CSP', () => {
    const { app } = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
    const connect = app.security.csp
      .split(';')
      .find((part: string) => part.trim().startsWith('connect-src '))
      .trim()
      .split(/\s+/);
    for (const domain of ['yani.tv', 'yummyani.me']) {
      for (const id of [1, 2, 3]) expect(connect).toContain(`wss://socket${id}.${domain}`);
    }
    expect(connect).not.toContain('wss:');
  });
});
