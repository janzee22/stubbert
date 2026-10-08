import { episodeNumbers, type NotifyItem, type ProviderIds } from './item.js';
import type { MessageKind } from '../shared/notify.js';
import type { PlannedMessage } from './plan.js';
import type { Value } from './template/index.js';

export interface MessageDetails {
  series?: { name: string; year: number | null; overview: string | null; providerIds: ProviderIds };
  season?: { id: string | null; name: string | null; overview: string | null };
  serverName: string | null;
  linkBase: string | null;
}

export interface Links {
  tmdb: string | null;
  imdb: string | null;
  tvdb: string | null;
  jellyfin: string | null;
}

export function jellyfinLink(base: string | null, id: string | null): string | null {
  if (!base || !id) return null;
  return `${base.replace(/\/+$/, '')}/web/#/details?id=${id}`;
}

function buildLinks(msg: PlannedMessage, d: MessageDetails): Links {
  const first = msg.items[0] as NotifyItem;
  if (msg.kind === 'movie') {
    const ids = first.providerIds;
    return {
      tmdb: ids.tmdb ? `https://www.themoviedb.org/movie/${ids.tmdb}` : null,
      imdb: ids.imdb ? `https://www.imdb.com/title/${ids.imdb}/` : null,
      tvdb: ids.tvdb ? `https://thetvdb.com/dereferrer/movie/${ids.tvdb}` : null,
      jellyfin: jellyfinLink(d.linkBase, first.id),
    };
  }
  const series = d.series?.providerIds ?? first.series?.providerIds ?? {};
  const single = msg.kind === 'episode';
  const own = single ? first.providerIds : {};
  const imdbId = own.imdb ?? series.imdb;
  let tvdbLink: string | null = null;
  if (own.tvdb) tvdbLink = `https://thetvdb.com/dereferrer/episode/${own.tvdb}`;
  else if (series.tvdb) tvdbLink = `https://thetvdb.com/dereferrer/series/${series.tvdb}`;
  const seasonPart = msg.season === null ? '' : `/season/${msg.season}`;
  const episodePart =
    single && seasonPart && first.episode !== null ? `/episode/${first.episode}` : '';
  return {
    tmdb: series.tmdb
      ? `https://www.themoviedb.org/tv/${series.tmdb}${seasonPart}${episodePart}`
      : null,
    imdb: imdbId ? `https://www.imdb.com/title/${imdbId}/` : null,
    tvdb: tvdbLink,
    jellyfin: jellyfinLink(
      d.linkBase,
      single ? first.id : (d.season?.id ?? first.seasonId ?? first.series?.id ?? null),
    ),
  };
}

export function buildContext(msg: PlannedMessage, d: MessageDetails): Record<string, Value> {
  const first = msg.items[0] as NotifyItem;
  const library: Value = { name: first.library?.name ?? null };
  const server: Value = { name: d.serverName };
  const links = buildLinks(msg, d) as unknown as Value;
  if (msg.kind === 'movie') {
    return {
      item: { name: first.name, year: first.year, overview: first.overview, type: 'movie' },
      links,
      library,
      server,
    };
  }
  const seriesName = d.series?.name ?? first.series?.name ?? '';
  const series: Value = {
    name: seriesName,
    year: d.series?.year ?? null,
    overview: d.series?.overview ?? null,
  };
  const seasonName = d.season?.name ?? (msg.season === null ? null : `Season ${msg.season}`);
  const season: Value = {
    number: msg.season,
    name: seasonName,
    episode_count: msg.seasonSize?.numbers.length ?? null,
  };
  if (msg.kind === 'episode') {
    return {
      item: {
        name: first.name,
        year: d.series?.year ?? null,
        overview: first.overview,
        type: 'episode',
      },
      series,
      season,
      episode: { number: first.episode, name: first.name, overview: first.overview },
      links,
      library,
      server,
    };
  }
  const episodes: Value = msg.items.flatMap((e) => {
    const numbers = episodeNumbers(e);
    return (numbers.length ? numbers : [null]).map((n) => ({
      season: e.season,
      number: n,
      name: e.name,
    }));
  });
  return {
    item: {
      name: seasonName ?? seriesName,
      year: d.series?.year ?? null,
      overview: d.season?.overview ?? null,
      type: 'season',
    },
    series,
    season,
    episodes,
    links,
    library,
    server,
  };
}

const SAMPLE_LINKS = {
  tmdb: 'https://www.themoviedb.org/tv/69478-the-handmaid-s-tale',
  imdb: 'https://www.imdb.com/title/tt5834204/',
  tvdb: 'https://thetvdb.com/dereferrer/series/321239',
  jellyfin: 'http://jellyfin:8096/web/#/details?id=4f1c',
};

export function sampleContext(kind: MessageKind): Record<string, Value> {
  const library = { name: 'Series' };
  const server = { name: 'Jellyfin' };
  if (kind === 'movie') {
    return {
      item: {
        name: 'Dune: Part Two',
        year: 2024,
        overview:
          'Paul Atreides unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.',
        type: 'movie',
      },
      links: {
        tmdb: 'https://www.themoviedb.org/movie/693134',
        imdb: 'https://www.imdb.com/title/tt15239678/',
        tvdb: 'https://thetvdb.com/dereferrer/movie/3215',
        jellyfin: 'http://jellyfin:8096/web/#/details?id=9a2b',
      },
      library: { name: 'Movies' },
      server,
    };
  }
  const series = {
    name: "The Handmaid's Tale",
    year: 2017,
    overview:
      'Set in a dystopian future, a woman is forced to live as a concubine under a fundamentalist theocratic dictatorship.',
  };
  const season = { number: 6, name: 'Season 6', episode_count: 10 };
  if (kind === 'episode') {
    return {
      item: {
        name: 'Train',
        year: 2017,
        overview: 'June and Luke make a desperate move.',
        type: 'episode',
      },
      series,
      season,
      episode: { number: 1, name: 'Train', overview: 'June and Luke make a desperate move.' },
      links: SAMPLE_LINKS,
      library,
      server,
    };
  }
  const names = [
    'Train',
    'Surrender',
    'Exile',
    'Promises',
    'Shattered',
    'Janine',
    'Safe',
    'Stand',
    'Sunrise',
    'Resistance',
  ];
  const count = kind === 'season' ? 10 : 3;
  return {
    item: { name: 'Season 6', year: 2017, overview: 'The final season.', type: 'season' },
    series,
    season,
    episodes: names.slice(0, count).map((name, i) => ({ season: 6, number: i + 1, name })),
    links: SAMPLE_LINKS,
    library,
    server,
  };
}
