import { normId } from '../shared/ids.js';

export interface ProviderIds {
  tmdb?: string;
  imdb?: string;
  tvdb?: string;
}

export interface NotifyItem {
  id: string;
  type: 'movie' | 'episode';
  name: string;
  year: number | null;
  overview: string | null;
  providerIds: ProviderIds;
  library: { id: string; name: string } | null;
  series: { id: string; name: string; providerIds: ProviderIds } | null;
  seasonId: string | null;
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  receivedAt: string;
}

export type ParsedEvent =
  | { kind: 'item'; item: NotifyItem; serverName: string | null }
  | { kind: 'ignored'; reason: string };

export class PayloadError extends Error {}

function lowerKeys(raw: Record<string, unknown>): Map<string, unknown> {
  return new Map(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
}

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // The webhook plugin escapes " as \" inside values, on top of the JSON escaping.
  const s = v.replaceAll('\\"', '"').trim();
  return s || null;
}

function int(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
}

export function normalizeId(v: unknown): string | null {
  const id = normId(text(v));
  return id && /^[0-9a-f]{32}$/.test(id) ? id : null;
}

export function providerIds(get: (key: string) => unknown): ProviderIds {
  const ids: ProviderIds = {};
  const tmdb = text(get('tmdb'));
  const imdb = text(get('imdb'));
  const tvdb = text(get('tvdb'));
  if (tmdb) ids.tmdb = tmdb;
  if (imdb) ids.imdb = imdb;
  if (tvdb) ids.tvdb = tvdb;
  return ids;
}

// A movie's Name can end in " (year)", which titleOf adds again.
export function movieName(name: string, year: number | null): string {
  return year === null ? name : name.replace(new RegExp(`\\s*\\(${year}\\)$`), '') || name;
}

export function parseEvent(body: unknown, receivedAt: Date): ParsedEvent {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new PayloadError('the body is not a JSON object');
  }
  const f = lowerKeys(body as Record<string, unknown>);
  const notification = text(f.get('notificationtype'));
  if (!notification) throw new PayloadError('NotificationType is missing');
  if (notification !== 'ItemAdded') {
    return { kind: 'ignored', reason: `notification ${notification}` };
  }
  const itemType = text(f.get('itemtype'));
  if (itemType !== 'Movie' && itemType !== 'Episode') {
    return { kind: 'ignored', reason: `item type ${itemType ?? 'unknown'}` };
  }
  const id = normalizeId(f.get('itemid'));
  if (!id) throw new PayloadError('ItemId is missing or not an id');
  const rawName = text(f.get('name'));
  if (!rawName) throw new PayloadError('Name is missing');
  const year = int(f.get('year'));
  const name = movieName(rawName, year);
  const base = {
    id,
    name,
    year,
    overview: text(f.get('overview')),
    providerIds: providerIds((k) => f.get(`provider_${k}`)),
    library: null,
    receivedAt: receivedAt.toISOString(),
  };
  const serverName = text(f.get('servername'));
  if (itemType === 'Movie') {
    return {
      kind: 'item',
      serverName,
      item: {
        ...base,
        type: 'movie',
        series: null,
        seasonId: null,
        season: null,
        episode: null,
        episodeEnd: null,
      },
    };
  }
  const seriesId = normalizeId(f.get('seriesid'));
  if (!seriesId) throw new PayloadError('SeriesId is missing for an episode');
  const episode = int(f.get('episodenumber'));
  const end = int(f.get('episodenumberend'));
  return {
    kind: 'item',
    serverName,
    item: {
      ...base,
      type: 'episode',
      year: null,
      series: {
        id: seriesId,
        name: text(f.get('seriesname')) ?? 'Unknown series',
        providerIds: {},
      },
      seasonId: normalizeId(f.get('seasonid')),
      season: int(f.get('seasonnumber')),
      episode,
      episodeEnd: end !== null && episode !== null && end > episode ? end : null,
    },
  };
}

function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function seriesKey(item: NotifyItem): string {
  const series = item.series;
  if (!series) return `jf:${item.id}`;
  const ids = series.providerIds;
  if (ids.tmdb) return `tmdb:${ids.tmdb}`;
  if (ids.tvdb) return `tvdb:${ids.tvdb}`;
  if (ids.imdb) return `imdb:${ids.imdb}`;
  return `jf:${series.id}`;
}

export function movieKey(item: NotifyItem): string {
  const ids = item.providerIds;
  if (ids.tmdb) return `movie:tmdb:${ids.tmdb}`;
  if (ids.imdb) return `movie:imdb:${ids.imdb}`;
  return `movie:jf:${slug(item.name)}:${item.year ?? ''}`;
}

export function titleKey(item: NotifyItem): string {
  return item.type === 'movie' ? movieKey(item) : `series:${seriesKey(item)}`;
}

export function episodeNumbers(item: NotifyItem): number[] {
  if (item.episode === null) return [];
  const end = item.episodeEnd ?? item.episode;
  const out: number[] = [];
  for (let n = item.episode; n <= end && out.length < 100; n++) out.push(n);
  return out;
}

export function announcedKeys(item: NotifyItem): string[] {
  if (item.type === 'movie') return [movieKey(item)];
  const series = seriesKey(item);
  const numbers = episodeNumbers(item);
  if (item.season === null || !numbers.length) return [`ep:${series}:jf:${item.id}`];
  return numbers.map((n) => `ep:${series}:S${item.season}E${n}`);
}

export function titleOf(item: NotifyItem): string {
  if (item.type === 'movie') return item.year ? `${item.name} (${item.year})` : item.name;
  return item.series?.name ?? item.name;
}

export function episodeLabel(item: NotifyItem): string {
  const s = item.season === null ? '' : `S${String(item.season).padStart(2, '0')}`;
  const nums = episodeNumbers(item);
  const e = nums.length ? nums.map((n) => `E${String(n).padStart(2, '0')}`).join('-') : '';
  return `${item.series?.name ?? ''} ${s}${e}`.trim();
}
