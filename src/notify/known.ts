import type { BaseItemDto } from '../jellyfin/client.js';
import {
  announcedKeys,
  movieName,
  normalizeId,
  providerIds,
  type NotifyItem,
  type ProviderIds,
} from './item.js';

export interface KnownTitles {
  keys: string[];
  movies: number;
  episodes: number;
}

function ids(dto: BaseItemDto): ProviderIds {
  const raw = (dto.ProviderIds ?? {}) as Record<string, unknown>;
  const lower = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
  return providerIds((k) => lower[k]);
}

const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);

// Builds the same item the webhook would, so announcedKeys gives the keys an upgrade will hit.
function toItem(dto: BaseItemDto, series: Map<string, BaseItemDto>): NotifyItem | null {
  const id = normalizeId(dto.Id);
  if (!id || !dto.Name) return null;
  const base = {
    id,
    name: dto.Name,
    overview: null,
    providerIds: ids(dto),
    library: null,
    receivedAt: '',
  };
  if (dto.Type === 'Movie') {
    const year = int(dto.ProductionYear);
    return {
      ...base,
      type: 'movie',
      name: movieName(dto.Name, year),
      year,
      series: null,
      seasonId: null,
      season: null,
      episode: null,
      episodeEnd: null,
    };
  }
  const seriesId = normalizeId(dto.SeriesId);
  if (dto.Type !== 'Episode' || !seriesId) return null;
  const show = series.get(seriesId);
  const episode = int(dto.IndexNumber);
  const end = int(dto.IndexNumberEnd);
  return {
    ...base,
    type: 'episode',
    year: null,
    series: { id: seriesId, name: show?.Name ?? '', providerIds: show ? ids(show) : {} },
    seasonId: normalizeId(dto.SeasonId),
    season: int(dto.ParentIndexNumber),
    episode,
    episodeEnd: end !== null && episode !== null && end > episode ? end : null,
  };
}

export function knownTitles(dtos: readonly BaseItemDto[]): KnownTitles {
  const series = new Map<string, BaseItemDto>();
  for (const dto of dtos) {
    const id = normalizeId(dto.Id);
    if (dto.Type === 'Series' && id) series.set(id, dto);
  }
  const result: KnownTitles = { keys: [], movies: 0, episodes: 0 };
  for (const dto of dtos) {
    const item = toItem(dto, series);
    if (!item) continue;
    result.keys.push(...announcedKeys(item));
    if (item.type === 'movie') result.movies++;
    else result.episodes++;
  }
  return result;
}
