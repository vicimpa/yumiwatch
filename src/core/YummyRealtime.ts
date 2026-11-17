export type RealtimeStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'denied';
export type YummyEvent = { event: string; [key: string]: unknown };
type Listener = (event: YummyEvent) => void;
type Subscription = { type: string; id: number; key: string; listeners: Set<Listener> };

// REST mirrors use their own socket cluster; old/ru themselves do not serve /socket.
const SERVERS = ['yani.tv', 'yummyani.me'].flatMap(domain =>
  [1, 2, 3].map(id => `wss://socket${id}.${domain}/socket`)
);

/** The site's JSON protocol, shared by all screens. Never log socket URLs: they contain a token. */
export class YummyRealtime {
  private socket?: WebSocket;
  private token?: string;
  private active = false;
  private attempt = 0;
  private server = 0;
  private sequence = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private listeners = new Set<Listener>();
  private subscriptions = new Map<string, Subscription>();
  status: RealtimeStatus = 'idle';

  constructor(
    private changed: (status: RealtimeStatus) => void = () => {},
    private createSocket = (url: string) => new WebSocket(url)
  ) {}

  private setStatus(status: RealtimeStatus) {
    this.status = status;
    this.changed(status);
  }

  start(token?: string) {
    if (this.active && token === this.token) return;
    this.stop();
    this.active = true;
    this.token = token;
    this.connect();
  }

  stop() {
    this.active = false;
    this.token = undefined;
    this.attempt = 0;
    clearTimeout(this.retry);
    this.disconnect();
    this.setStatus('idle');
  }

  private disconnect() {
    clearTimeout(this.deadline);
    clearInterval(this.heartbeat);
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }

  offline() {
    clearTimeout(this.retry);
    this.disconnect();
    if (this.active) this.setStatus('offline');
  }

  reconnect() {
    if (!this.active) return;
    clearTimeout(this.retry);
    this.disconnect();
    this.attempt = 0;
    this.connect();
  }

  private send(value: Record<string, unknown>) {
    const socket = this.socket;
    if (socket?.readyState === 1) {
      try {
        socket.send(JSON.stringify(value));
      } catch {
        this.fail(socket);
      }
    }
  }

  private connect() {
    if (!this.active) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus('offline');
      return;
    }
    this.setStatus(this.attempt ? 'reconnecting' : 'connecting');
    const query = new URLSearchParams({
      accept: 'application/json,image/avif,image/webp',
      lang: 'ru',
    });
    if (this.token) query.set('token', this.token);
    let socket: WebSocket;
    try {
      socket = this.createSocket(`${SERVERS[this.server++ % SERVERS.length]}?${query}`);
    } catch {
      this.schedule();
      return;
    }
    this.socket = socket;
    this.deadline = setTimeout(() => this.fail(socket), 10_000);
    socket.onopen = () => {
      if (this.socket !== socket) return;
      clearTimeout(this.deadline);
      this.attempt = 0;
      if (this.token) this.send({ event: 'subscribe-events' });
      for (const sub of this.subscriptions.values()) this.sendSubscription(sub, true);
      if (this.socket !== socket) return;
      this.setStatus('connected');
      this.emit({ event: 'connect' });
      this.heartbeat = setInterval(() => {
        this.send({ event: 'ping' });
        this.deadline = setTimeout(() => this.fail(socket), 10_000);
      }, 30_000);
    };
    socket.onmessage = message => {
      if (
        this.socket !== socket ||
        typeof message.data !== 'string' ||
        message.data.length > 1_048_576
      )
        return;
      let value: YummyEvent;
      try {
        value = JSON.parse(message.data);
      } catch {
        return;
      }
      if (!value || typeof value !== 'object' || typeof value.event !== 'string') return;
      if (value.event === 'pong') {
        clearTimeout(this.deadline);
        return;
      }
      if (value.event.startsWith('update-')) {
        const sub = this.subscriptions.get(`${value.event.slice(7)}:${value.object_id}`);
        sub?.listeners.forEach(listener => listener(value));
      }
      this.emit(value);
    };
    socket.onerror = () => this.fail(socket);
    socket.onclose = event => {
      if (this.socket !== socket) return;
      this.disconnect();
      if (event.code === 1008) this.setStatus('denied');
      else this.schedule();
    };
  }

  private fail(socket: WebSocket) {
    if (this.socket !== socket) return;
    this.disconnect();
    this.schedule();
  }

  private schedule() {
    if (!this.active) return;
    this.setStatus('reconnecting');
    clearTimeout(this.retry);
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempt++, 5));
    this.retry = setTimeout(() => this.connect(), delay * (0.75 + Math.random() * 0.5));
  }

  private emit(event: YummyEvent) {
    this.listeners.forEach(listener => listener(event));
  }

  onEvent(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private sendSubscription(sub: Subscription, subscribe: boolean) {
    this.send({
      event: subscribe ? 'subscribe-global' : 'unsubscribe-global',
      objectType: sub.type,
      objectId: sub.id,
      key: sub.key,
    });
  }

  subscribe(type: string, id: number, listener: Listener) {
    if (!/^[a-z]+$/.test(type) || !Number.isSafeInteger(id) || id <= 0) return () => {};
    const key = `${type}:${id}`;
    let sub = this.subscriptions.get(key);
    if (!sub) {
      sub = { type, id, key: `yw-${++this.sequence}`, listeners: new Set() };
      this.subscriptions.set(key, sub);
      this.sendSubscription(sub, true);
    }
    const receive: Listener = event => listener(event);
    sub.listeners.add(receive);
    const captured = sub;
    return () => {
      captured.listeners.delete(receive);
      if (!captured.listeners.size && this.subscriptions.get(key) === captured) {
        this.subscriptions.delete(key);
        this.sendSubscription(captured, false);
      }
    };
  }
}
