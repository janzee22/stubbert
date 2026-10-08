import type { MessageKind } from '../shared/notify.js';
import { episodeNumbers, seriesKey, titleKey, titleOf, type NotifyItem } from './item.js';

export interface SeasonSize {
  numbers: number[];
  source: 'jellyfin' | 'tvmaze' | 'tmdb';
}

export interface SeasonRef {
  key: string;
  seriesKey: string;
  item: NotifyItem;
  season: number;
}

export interface PlannedMessage {
  kind: MessageKind;
  title: string;
  items: NotifyItem[];
  season: number | null;
  seasonSize: SeasonSize | null;
  sizeUnknown: boolean;
}

export type BatchPlan =
  { bulk: true; titles: string[] } | { bulk: false; messages: PlannedMessage[] };

export function seasonKey(series: string, season: number): string {
  return `${series}#${season}`;
}

interface TitleGroup {
  key: string;
  title: string;
  items: NotifyItem[];
}

function groupTitles(items: NotifyItem[]): TitleGroup[] {
  const groups = new Map<string, TitleGroup>();
  for (const item of items.toSorted((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
    const key = titleKey(item);
    const group = groups.get(key) ?? { key, title: titleOf(item), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function bySeason(items: NotifyItem[]): Map<number | null, NotifyItem[]> {
  const seasons = new Map<number | null, NotifyItem[]>();
  for (const item of items) {
    const list = seasons.get(item.season) ?? [];
    list.push(item);
    seasons.set(item.season, list);
  }
  return new Map([...seasons.entries()].toSorted(([a], [b]) => (a ?? Infinity) - (b ?? Infinity)));
}

function sortEpisodes(items: NotifyItem[]): NotifyItem[] {
  return items.toSorted((a, b) => (a.episode ?? Infinity) - (b.episode ?? Infinity));
}

export function countTitles(items: NotifyItem[]): string[] {
  return groupTitles(items).map((g) => g.title);
}

export function seasonsToSize(items: NotifyItem[]): SeasonRef[] {
  const refs: SeasonRef[] = [];
  for (const group of groupTitles(items)) {
    if (group.items[0]?.type !== 'episode') continue;
    for (const [season, episodes] of bySeason(group.items)) {
      if (season === null || season === 0 || episodes.length < 2) continue;
      const first = episodes[0] as NotifyItem;
      const series = seriesKey(first);
      refs.push({ key: seasonKey(series, season), seriesKey: series, item: first, season });
    }
  }
  return refs;
}

export function isComplete(episodes: NotifyItem[], size: SeasonSize): boolean {
  if (!size.numbers.length) return false;
  const covered = new Set(episodes.flatMap(episodeNumbers));
  return size.numbers.every((n) => covered.has(n));
}

export function planBatch(
  items: NotifyItem[],
  bulkThreshold: number,
  sizes: Map<string, SeasonSize | null>,
): BatchPlan {
  const groups = groupTitles(items);
  if (groups.length >= bulkThreshold) return { bulk: true, titles: groups.map((g) => g.title) };
  const messages: PlannedMessage[] = [];
  for (const group of groups) {
    if (group.items[0]?.type === 'movie') {
      for (const item of group.items) {
        messages.push({
          kind: 'movie',
          title: group.title,
          items: [item],
          season: null,
          seasonSize: null,
          sizeUnknown: false,
        });
      }
      continue;
    }
    for (const [season, list] of bySeason(group.items)) {
      const episodes = sortEpisodes(list);
      if (episodes.length === 1) {
        messages.push({
          kind: 'episode',
          title: group.title,
          items: episodes,
          season,
          seasonSize: null,
          sizeUnknown: false,
        });
        continue;
      }
      const lookup =
        season === null || season === 0
          ? undefined
          : seasonKey(seriesKey(episodes[0] as NotifyItem), season);
      const size = lookup ? (sizes.get(lookup) ?? null) : null;
      const complete = size !== null && isComplete(episodes, size);
      messages.push({
        kind: complete ? 'season' : 'episodes',
        title: group.title,
        items: episodes,
        season,
        seasonSize: size,
        sizeUnknown: lookup !== undefined && size === null,
      });
    }
  }
  return { bulk: false, messages };
}
