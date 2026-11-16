import type { DiscordActivity } from './DiscordPresence';

type TPresenceSource = {
  priority: number;
  read: () => DiscordActivity | null | undefined;
};

export class DiscordPresenceRegistry {
  private sources = new Set<TPresenceSource>();
  private last = '';
  private suspended = false;

  constructor(
    private send: (activity: DiscordActivity | null) => void,
    private enabled: () => boolean
  ) {}

  register(priority: number, read: TPresenceSource['read']) {
    const source = { priority, read };

    this.sources.add(source);
    this.publish();

    return () => {
      this.sources.delete(source);
      this.publish();
    };
  }

  publish = (force = false) => {
    let priority = -Infinity;
    let activity: DiscordActivity | null = null;

    if (!this.suspended && this.enabled())
      for (const source of this.sources) {
        if (source.priority < priority) continue;

        const value = source.read();

        if (value === undefined) continue;
        priority = source.priority;
        activity = value;
      }

    const next = JSON.stringify(activity);

    if (!force && next === this.last) return;
    this.last = next;
    this.send(activity);
  };

  refresh = () => this.publish(true);

  suspend = () => {
    this.suspended = true;
    this.publish();
  };

  resume = () => {
    this.suspended = false;
    this.refresh();
  };
}
