import { randomUUID } from 'node:crypto';
import type { ActivityLog } from './activity.js';
import type { Accepted } from './ingest.js';
import { announcedKeys, type NotifyItem } from './item.js';
import type { Runtime } from './runtime.js';

export class Batcher {
  #lock: Promise<unknown> = Promise.resolve();
  #timer?: NodeJS.Timeout;
  #flushing = false;

  constructor(
    private readonly rt: Runtime,
    private readonly activity: ActivityLog,
    private readonly send: (items: NotifyItem[]) => Promise<number>,
  ) {}

  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#lock.then(fn, fn);
    this.#lock = run.catch(() => undefined);
    return run;
  }

  start(tickMs: number) {
    this.stop();
    this.#timer = setInterval(() => void this.tick(), tickMs);
    this.#timer.unref();
    void this.tick();
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async tick(): Promise<void> {
    const batch = this.rt.store.state.batch;
    if (!batch || this.#flushing || Date.parse(batch.flushAt) > this.rt.now().getTime()) return;
    await this.flush();
  }

  add({ item, label, received }: Accepted): Promise<string> {
    return this.exclusive(async () => {
      const keys = announcedKeys(item);
      const state = this.rt.store.state;
      if (this.rt.settings.skipAnnounced && keys.every((k) => state.announced[k])) {
        await this.activity.add({
          status: 'skipped',
          reason: 'announced',
          title: label,
          detail: 'Announced before. Looks like a quality upgrade.',
        });
        return 'announced';
      }
      const inBatch = new Set(state.batch?.items.flatMap(announcedKeys) ?? []);
      if (keys.every((k) => inBatch.has(k))) return 'already waiting';
      const flushAt = new Date(
        received.getTime() + this.rt.settings.quietMinutes * 60_000,
      ).toISOString();
      await this.rt.store.update((s) => {
        s.batch ??= { id: randomUUID(), createdAt: received.toISOString(), flushAt, items: [] };
        s.batch.items.push(item);
        s.batch.flushAt = flushAt;
      });
      return 'waiting';
    });
  }

  flush(): Promise<number> {
    return this.exclusive(async () => {
      const batch = this.rt.store.state.batch;
      if (!batch || this.#flushing) return 0;
      this.#flushing = true;
      try {
        // Detach first: a crash while sending loses this batch instead of sending it twice.
        await this.rt.store.update((s) => {
          s.batch = null;
        });
        return await this.send(batch.items);
      } finally {
        this.#flushing = false;
      }
    });
  }
}
