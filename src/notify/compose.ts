import type { BaseItemDto } from '../jellyfin/client.js';
import type { ImageChoice } from '../shared/notify.js';
import { buildContext, type MessageDetails } from './context.js';
import { announcedKeys, episodeLabel, normalizeId, titleOf, type NotifyItem } from './item.js';
import { renderMessage, type RenderedEmbed } from './message.js';
import {
  planBatch,
  seasonsToSize,
  type BatchPlan,
  type PlannedMessage,
  type SeasonSize,
} from './plan.js';
import type { Runtime } from './runtime.js';
import { seasonSize } from './sources.js';
import type { Value } from './template/index.js';

// Season sizes rarely change once a season airs; a day keeps TVmaze and TMDb calls low.
const SIZE_CACHE_MS = 24 * 3600_000;

export interface ComposedMessage {
  plan: PlannedMessage;
  label: string;
  context: Record<string, Value>;
  embed: RenderedEmbed;
  imageItemId: string | null;
  keys: string[];
  warnings: string[];
}

export function messageLabel(msg: PlannedMessage): string {
  const first = msg.items[0] as NotifyItem;
  if (msg.kind === 'movie') return titleOf(first);
  if (msg.kind === 'episode') return episodeLabel(first);
  return `${msg.title} · Season ${msg.season ?? '?'}`;
}

// What a waiting batch would send, for status and preview. It skips the bulk rule and the season-size lookups
// so polling stays offline; at flush time the batch may still be skipped as bulk or become a Season message.
export function waitingPlan(items: NotifyItem[]): PlannedMessage[] {
  const plan = planBatch(items, Infinity, new Map());
  return plan.bulk ? [] : plan.messages;
}

export function imageItemFor(msg: PlannedMessage, image: ImageChoice): string | null {
  const first = msg.items[0] as NotifyItem;
  if (image === 'none') return null;
  if (msg.kind === 'movie') return first.id;
  if (image === 'poster' && msg.kind === 'season' && first.seasonId) return first.seasonId;
  return first.series?.id ?? first.id;
}

export class Composer {
  constructor(private readonly rt: Runtime) {}

  async plan(items: NotifyItem[]): Promise<BatchPlan> {
    return planBatch(items, this.rt.settings.bulkThreshold, await this.#sizes(items));
  }

  async compose(messages: PlannedMessage[]): Promise<ComposedMessage[]> {
    const dtos = await this.#details(messages);
    return messages.map((plan) => {
      const context = buildContext(plan, this.detailsFor(plan, dtos));
      const { embed, fallback } = renderMessage(
        plan.kind,
        this.rt.settings.templates[plan.kind],
        context,
      );
      const warnings: string[] = [];
      if (fallback) warnings.push(`Used the default template: ${fallback}`);
      if (plan.sizeUnknown) {
        warnings.push('Season size unknown, so this is not called a whole season.');
      }
      return {
        plan,
        label: messageLabel(plan),
        context,
        embed,
        imageItemId: imageItemFor(plan, embed.image),
        keys: plan.items.flatMap(announcedKeys),
        warnings,
      };
    });
  }

  detailsFor(msg: PlannedMessage, dtos: Map<string, BaseItemDto>): MessageDetails {
    const first = msg.items[0] as NotifyItem;
    const series = first.series ? dtos.get(first.series.id) : undefined;
    const season = first.seasonId ? dtos.get(first.seasonId) : undefined;
    return {
      series: first.series
        ? {
            name: series?.Name ?? first.series.name,
            year: typeof series?.ProductionYear === 'number' ? series.ProductionYear : null,
            overview: series?.Overview ?? null,
            providerIds: first.series.providerIds,
          }
        : undefined,
      season: first.seasonId
        ? { id: first.seasonId, name: season?.Name ?? null, overview: season?.Overview ?? null }
        : undefined,
      serverName: this.rt.store.state.serverName,
      linkBase: this.rt.settings.linkBase,
    };
  }

  async #sizes(items: NotifyItem[]): Promise<Map<string, SeasonSize | null>> {
    const { store, jellyfin, log } = this.rt;
    const sizes = new Map<string, SeasonSize | null>();
    const now = this.rt.now().getTime();
    for (const ref of seasonsToSize(items)) {
      const cached = store.state.seasonCache[ref.key];
      if (cached && now - Date.parse(cached.fetchedAt) < SIZE_CACHE_MS) {
        sizes.set(ref.key, { numbers: cached.numbers, source: cached.source });
        continue;
      }
      const series = ref.item.series;
      if (!series) continue;
      const result = await seasonSize(
        { seriesJellyfinId: series.id, providerIds: series.providerIds, season: ref.season },
        {
          jellyfinEpisodes: (id, season) =>
            jellyfin.configured ? jellyfin.seasonEpisodes(id, season) : Promise.resolve([]),
          fetch: this.rt.fetch,
          tvmaze: this.rt.settings.tvmaze,
          tmdbApiKey: this.rt.settings.tmdbApiKey,
        },
      );
      for (const e of result.errors) {
        log.warn(`Notifications: season size of ${series.name} S${ref.season}: ${e}`);
      }
      await store.update((s) => {
        if (result.tmdbRejected !== undefined) s.tmdbRejected = result.tmdbRejected;
        if (result.size) {
          s.seasonCache[ref.key] = { ...result.size, fetchedAt: new Date(now).toISOString() };
        }
      });
      sizes.set(ref.key, result.size);
    }
    return sizes;
  }

  async #details(messages: PlannedMessage[]): Promise<Map<string, BaseItemDto>> {
    const ids = new Set<string>();
    for (const m of messages) {
      const first = m.items[0];
      if (first?.series) ids.add(first.series.id);
      if (first?.seasonId && m.kind !== 'episode') ids.add(first.seasonId);
    }
    const out = new Map<string, BaseItemDto>();
    if (!ids.size || !this.rt.jellyfin.configured) return out;
    try {
      for (const dto of await this.rt.jellyfin.itemsByIds([...ids])) {
        const id = normalizeId(dto.Id);
        if (id) out.set(id, dto);
      }
    } catch (err) {
      this.rt.log.warn(`Notifications: cannot read series details: ${(err as Error).message}`);
    }
    return out;
  }
}
