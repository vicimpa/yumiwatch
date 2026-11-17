// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YummyRealtime } from '~/core/YummyRealtime';
import { FakeSocket } from './realtime-fixture';

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
