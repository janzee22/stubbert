import { randomUUID } from 'node:crypto';
import type { Runtime } from './runtime.js';
import type { ActivityEntry } from './store.js';

const ACTIVITY_LIMIT = 200;
// A failed message keeps its rendered content this long, for Retry and for resending once the webhook URL is
// fixed. After a day the news is stale, so the content is dropped and the entry stays as history only.
export const KEEP_FAILED_MS = 24 * 3600_000;

export function isRetryable(entry: ActivityEntry, now: number): boolean {
  return (
    entry.status === 'failed' && !!entry.message && Date.parse(entry.at) >= now - KEEP_FAILED_MS
  );
}

export class ActivityLog {
  constructor(private readonly rt: Runtime) {}

  get entries(): readonly ActivityEntry[] {
    return this.rt.store.state.activity;
  }

  find(id: string): ActivityEntry | undefined {
    return this.entries.find((a) => a.id === id);
  }

  heldForDiscord(): ActivityEntry[] {
    const now = this.rt.now().getTime();
    return this.entries.filter((a) => a.reason === 'discord-404' && isRetryable(a, now));
  }

  async add(entry: Omit<ActivityEntry, 'id' | 'at'>): Promise<ActivityEntry> {
    const full: ActivityEntry = { id: randomUUID(), at: this.rt.isoNow(), ...entry };
    await this.rt.store.update((s) => {
      s.activity.unshift(full);
      this.#prune(s.activity);
    });
    return full;
  }

  #prune(activity: ActivityEntry[]) {
    const now = this.rt.now().getTime();
    for (const a of activity) {
      if (a.status === 'failed' && a.message && !isRetryable(a, now)) delete a.message;
    }
    activity.splice(ACTIVITY_LIMIT);
  }
}
