import type { BaseItemDto } from '../jellyfin/client.js';
import { VERSION } from '../version.js';
import type { ProviderIds } from './item.js';
import type { SeasonSize } from './plan.js';

export type Fetch = typeof fetch;

export interface SizeQuery {
  seriesJellyfinId: string;
  providerIds: ProviderIds;
  season: number;
}

export interface SizeSources {
  jellyfinEpisodes: (seriesId: string, season: number) => Promise<BaseItemDto[]>;
  fetch: Fetch;
  tvmaze: boolean;
  tmdbApiKey: string | null;
  timeoutMs?: number;
}

export interface SizeResult {
  size: SeasonSize | null;
  tmdbRejected?: boolean;
  errors: string[];
}

const USER_AGENT = `Stubbert/${VERSION}`;

export class TmdbKeyError extends Error {}

function numbersOf(episodes: Array<{ start: number | null; end?: number | null }>): number[] {
  const set = new Set<number>();
  for (const e of episodes) {
    if (e.start === null || e.start < 1) continue;
    const end = e.end && e.end > e.start ? e.end : e.start;
    for (let n = e.start; n <= end && n - e.start < 100; n++) set.add(n);
  }
  return [...set].toSorted((a, b) => a - b);
}

export function fromJellyfin(items: BaseItemDto[]): number[] | null {
  const virtual = items.some((i) => i.LocationType === 'Virtual');
  if (!virtual) return null;
  const numbers = numbersOf(
    items.map((i) => ({
      start: typeof i.IndexNumber === 'number' ? i.IndexNumber : null,
      end: typeof i.IndexNumberEnd === 'number' ? i.IndexNumberEnd : null,
    })),
  );
  return numbers.length ? numbers : null;
}

async function getJson(
  f: Fetch,
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
) {
  const res = await f(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  return res;
}

export async function fromTvmaze(
  f: Fetch,
  ids: ProviderIds,
  season: number,
  timeoutMs: number,
): Promise<number[] | null> {
  const lookups = [
    ids.tvdb && `thetvdb=${encodeURIComponent(ids.tvdb)}`,
    ids.imdb && `imdb=${encodeURIComponent(ids.imdb)}`,
  ].filter((q): q is string => !!q);
  let showId: number | undefined;
  for (const q of lookups) {
    const res = await getJson(f, `https://api.tvmaze.com/lookup/shows?${q}`, timeoutMs);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`TVmaze answered ${res.status}`);
    const show = (await res.json()) as { id?: number };
    if (typeof show.id === 'number') {
      showId = show.id;
      break;
    }
  }
  if (showId === undefined) return null;
  const res = await getJson(f, `https://api.tvmaze.com/shows/${showId}/seasons`, timeoutMs);
  if (!res.ok) throw new Error(`TVmaze answered ${res.status}`);
  const seasons = (await res.json()) as Array<{
    id: number;
    number: number;
    episodeOrder: number | null;
  }>;
  const match = seasons.find((s) => s.number === season);
  if (!match) return null;
  if (match.episodeOrder && match.episodeOrder > 0) {
    return Array.from({ length: match.episodeOrder }, (_, i) => i + 1);
  }
  const eps = await getJson(f, `https://api.tvmaze.com/seasons/${match.id}/episodes`, timeoutMs);
  if (!eps.ok) throw new Error(`TVmaze answered ${eps.status}`);
  const list = (await eps.json()) as Array<{ number: number | null }>;
  const numbers = numbersOf(list.map((e) => ({ start: e.number })));
  return numbers.length ? numbers : null;
}

export async function fromTmdb(
  f: Fetch,
  key: string,
  tmdbId: string,
  season: number,
  timeoutMs: number,
): Promise<number[] | null> {
  const bearer = key.startsWith('eyJ');
  const url = `https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}/season/${season}${bearer ? '' : `?api_key=${encodeURIComponent(key)}`}`;
  const res = await getJson(f, url, timeoutMs, bearer ? { Authorization: `Bearer ${key}` } : {});
  if (res.status === 401) throw new TmdbKeyError('TMDb rejected the API key');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDb answered ${res.status}`);
  const body = (await res.json()) as { episodes?: Array<{ episode_number: number | null }> };
  const numbers = numbersOf((body.episodes ?? []).map((e) => ({ start: e.episode_number })));
  return numbers.length ? numbers : null;
}

export async function seasonSize(q: SizeQuery, s: SizeSources): Promise<SizeResult> {
  const timeoutMs = s.timeoutMs ?? 5000;
  const errors: string[] = [];
  let tmdbRejected: boolean | undefined;
  try {
    const numbers = fromJellyfin(await s.jellyfinEpisodes(q.seriesJellyfinId, q.season));
    if (numbers) return { size: { numbers, source: 'jellyfin' }, errors };
  } catch (err) {
    errors.push(`Jellyfin: ${(err as Error).message}`);
  }
  if (s.tvmaze && (q.providerIds.tvdb || q.providerIds.imdb)) {
    try {
      const numbers = await fromTvmaze(s.fetch, q.providerIds, q.season, timeoutMs);
      if (numbers) return { size: { numbers, source: 'tvmaze' }, errors };
    } catch (err) {
      errors.push(`TVmaze: ${(err as Error).message}`);
    }
  }
  if (s.tmdbApiKey && q.providerIds.tmdb) {
    try {
      const numbers = await fromTmdb(
        s.fetch,
        s.tmdbApiKey,
        q.providerIds.tmdb,
        q.season,
        timeoutMs,
      );
      tmdbRejected = false;
      if (numbers) return { size: { numbers, source: 'tmdb' }, errors, tmdbRejected };
    } catch (err) {
      if (err instanceof TmdbKeyError) tmdbRejected = true;
      errors.push(`TMDb: ${(err as Error).message}`);
    }
  }
  return { size: null, errors, tmdbRejected };
}
