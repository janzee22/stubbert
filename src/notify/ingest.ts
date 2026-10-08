import { timingSafeEqual } from 'node:crypto';
import type { ActivityLog } from './activity.js';
import {
  episodeLabel,
  normalizeId,
  parseEvent,
  providerIds,
  titleOf,
  type NotifyItem,
} from './item.js';
import type { Runtime } from './runtime.js';
import { hint } from './settings.js';

// Jellyfin can send ItemAdded twice for the same item, for example after a metadata refresh.
const DUPLICATE_MS = 3600_000;

export interface Accepted {
  item: NotifyItem;
  label: string;
  received: Date;
}

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export class Ingest {
  constructor(
    private readonly rt: Runtime,
    private readonly activity: ActivityLog,
    private readonly onNewItem: () => void = () => undefined,
  ) {}

  tokenMatches(token: string): boolean {
    return sameSecret(token, this.rt.settings.webhookToken);
  }

  async refused(token: string): Promise<void> {
    const at = this.rt.isoNow();
    await this.rt.store.update((s) => {
      s.ingest.refusedCount++;
      s.ingest.firstRefusedAt ??= at;
      s.ingest.lastRefusedAt = at;
      s.ingest.refusedTokenHint = hint(token);
    });
  }

  async accept(body: unknown): Promise<Accepted | string> {
    const received = this.rt.now();
    const event = parseEvent(body, received);
    if (event.kind === 'ignored') {
      await this.#countIgnored(event.reason);
      return `ignored (${event.reason})`;
    }
    const { item } = event;
    const label = item.type === 'movie' ? titleOf(item) : episodeLabel(item);
    if (await this.#isDuplicate(item, label, received, event.serverName)) return 'duplicate';
    this.onNewItem();
    const settings = this.rt.settings;
    if (!settings.enabled) {
      await this.activity.add({
        status: 'off',
        reason: 'disabled',
        title: label,
        detail: 'Notifications off.',
      });
      return 'off';
    }
    if (
      (item.type === 'movie' && !settings.movies) ||
      (item.type === 'episode' && !settings.episodes)
    ) {
      await this.#countIgnored(`filtered ${item.type}`);
      return 'filtered type';
    }
    await this.#enrich(item);
    if (
      settings.libraryIds.length &&
      item.library &&
      !settings.libraryIds.includes(item.library.id)
    ) {
      await this.#countIgnored('filtered library');
      return 'filtered library';
    }
    return { item, label, received };
  }

  #countIgnored(reason: string): Promise<void> {
    return this.rt.store.update((s) => {
      s.ingest.ignored[reason] = (s.ingest.ignored[reason] ?? 0) + 1;
    });
  }

  #isDuplicate(
    item: NotifyItem,
    label: string,
    received: Date,
    serverName: string | null,
  ): Promise<boolean> {
    return this.rt.store.update((s) => {
      s.ingest.lastEventAt = received.toISOString();
      s.ingest.lastEventSummary = label;
      if (serverName) s.serverName = serverName;
      const cutoff = received.getTime() - DUPLICATE_MS;
      for (const [k, at] of Object.entries(s.recentEvents)) {
        if (Date.parse(at) < cutoff) delete s.recentEvents[k];
      }
      if (s.recentEvents[item.id]) return true;
      s.recentEvents[item.id] = received.toISOString();
      return false;
    });
  }

  async #enrich(item: NotifyItem): Promise<void> {
    const { jellyfin, log } = this.rt;
    if (!jellyfin.configured) return;
    try {
      const library = (await jellyfin.ancestors(item.id)).find(
        (a) => a.Type === 'CollectionFolder',
      );
      const id = normalizeId(library?.Id);
      if (library && id) item.library = { id, name: library.Name };
    } catch (err) {
      log.warn(`Notifications: cannot find the library of ${item.name}: ${(err as Error).message}`);
    }
    if (!item.series) return;
    try {
      const [series] = await jellyfin.itemsByIds([item.series.id]);
      if (series) {
        const lower = Object.fromEntries(
          Object.entries(series.ProviderIds ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
        );
        item.series.providerIds = providerIds((k) => lower[k]);
        item.series.name = series.Name || item.series.name;
      }
    } catch (err) {
      log.warn(`Notifications: cannot read series ${item.series.name}: ${(err as Error).message}`);
    }
  }
}
