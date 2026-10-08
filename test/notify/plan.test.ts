import { describe, expect, it } from 'vitest';
import { buildContext, sampleContext } from '../../src/notify/context.js';
import { DEFAULT_TEMPLATES } from '../../src/notify/defaults.js';
import {
  announcedKeys,
  parseEvent,
  PayloadError,
  titleKey,
  type NotifyItem,
} from '../../src/notify/item.js';
import { checkTemplate, renderMessage } from '../../src/notify/message.js';
import { planBatch, seasonKey, seasonsToSize, type SeasonSize } from '../../src/notify/plan.js';
import { MESSAGE_KINDS } from '../../src/shared/notify.js';

let clock = 0;
const at = () => new Date(Date.UTC(2026, 9, 7, 12, 0, clock++)).toISOString();

const movie = (name: string, tmdb?: string): NotifyItem => ({
  id: `m${name}`.padEnd(32, '0'),
  type: 'movie',
  name,
  year: 2024,
  overview: null,
  providerIds: tmdb ? { tmdb } : {},
  library: null,
  series: null,
  seasonId: null,
  season: null,
  episode: null,
  episodeEnd: null,
  receivedAt: at(),
});

const ep = (
  series: string,
  season: number | null,
  episode: number | null,
  end?: number,
): NotifyItem => ({
  id: `e${series}${season}${episode}`.padEnd(32, '0'),
  type: 'episode',
  name: `Episode ${episode}`,
  year: null,
  overview: null,
  providerIds: {},
  library: null,
  series: { id: `s${series}`.padEnd(32, '0'), name: series, providerIds: { tmdb: series } },
  seasonId: null,
  season,
  episode,
  episodeEnd: end ?? null,
  receivedAt: at(),
});

const size = (n: number): SeasonSize => ({
  numbers: Array.from({ length: n }, (_, i) => i + 1),
  source: 'tvmaze',
});
const sizes = (entries: Array<[string, number, number]>) =>
  new Map(entries.map(([s, season, n]) => [seasonKey(`tmdb:${s}`, season), size(n)]));

describe('parseEvent', () => {
  const base = {
    ServerName: 'Jellyfin',
    NotificationType: 'ItemAdded',
    ItemId: '6A1D0C7E-2B33-4E59-9D4F-0123456789AB',
    Name: 'The \\"Best\\" Movie',
    Year: 2024,
    ItemType: 'Movie',
    Provider_tmdb: '42',
    Provider_imdb: 'tt42',
  };

  it('normalizes a movie', () => {
    const e = parseEvent(base, new Date(0));
    expect(e).toMatchObject({
      kind: 'item',
      serverName: 'Jellyfin',
      item: {
        id: '6a1d0c7e2b334e599d4f0123456789ab',
        type: 'movie',
        name: 'The "Best" Movie',
        year: 2024,
        providerIds: { tmdb: '42', imdb: 'tt42' },
      },
    });
  });

  it('normalizes an episode, keys in any case', () => {
    const e = parseEvent(
      {
        notificationtype: 'ItemAdded',
        itemtype: 'Episode',
        itemid: '6a1d0c7e2b334e599d4f0123456789ab',
        name: 'Pilot',
        seriesname: 'Show',
        seriesid: '1a1d0c7e2b334e599d4f0123456789ab',
        seasonnumber: 1,
        episodenumber: 1,
        episodenumberend: 2,
      },
      new Date(0),
    );
    expect(e).toMatchObject({
      kind: 'item',
      item: { type: 'episode', season: 1, episode: 1, episodeEnd: 2, series: { name: 'Show' } },
    });
  });

  it('drops a year that Jellyfin left in the name', () => {
    const e = parseEvent({ ...base, Name: 'Sunrise4 (1927)', Year: 1927 }, new Date(0));
    expect(e.kind === 'item' && e.item.name).toBe('Sunrise4');
    const other = parseEvent({ ...base, Name: 'Blade Runner (1982)', Year: 2017 }, new Date(0));
    expect(other.kind === 'item' && other.item.name).toBe('Blade Runner (1982)');
  });

  it('ignores other notifications and item types', () => {
    expect(parseEvent({ ...base, NotificationType: 'PlaybackStart' }, new Date(0))).toEqual({
      kind: 'ignored',
      reason: 'notification PlaybackStart',
    });
    expect(parseEvent({ ...base, ItemType: 'Season' }, new Date(0)).kind).toBe('ignored');
  });

  it('rejects unusable bodies', () => {
    expect(() => parseEvent([], new Date(0))).toThrow(PayloadError);
    expect(() => parseEvent({ ...base, ItemId: 'x' }, new Date(0))).toThrow('ItemId');
  });
});

describe('keys', () => {
  it('builds movie and episode keys', () => {
    expect(announcedKeys(movie('Dune', '1'))).toEqual(['movie:tmdb:1']);
    expect(announcedKeys(movie('Dune Part Two'))).toEqual(['movie:jf:dune-part-two:2024']);
    expect(announcedKeys(ep('7', 1, 3, 4))).toEqual(['ep:tmdb:7:S1E3', 'ep:tmdb:7:S1E4']);
    expect(titleKey(ep('7', 1, 3))).toBe('series:tmdb:7');
  });
});

describe('planBatch', () => {
  it('stays quiet at the bulk threshold, counting a series once', () => {
    const items = [movie('a'), movie('b'), movie('c'), movie('d'), ep('x', 1, 1)];
    expect(planBatch(items, 5, new Map())).toMatchObject({ bulk: true });
    const fine = [movie('a'), movie('b'), movie('c'), ...[1, 2, 3, 4, 5].map((n) => ep('x', 1, n))];
    const plan = planBatch(fine, 5, new Map());
    expect(plan.bulk).toBe(false);
    if (plan.bulk) return;
    expect(plan.messages.map((m) => m.kind)).toEqual(['movie', 'movie', 'movie', 'episodes']);
  });

  it('classifies episode, episodes and season', () => {
    const one = planBatch([ep('x', 1, 1)], 5, new Map());
    expect(!one.bulk && one.messages[0]?.kind).toBe('episode');
    const three = [1, 2, 3].map((n) => ep('x', 1, n));
    const p3 = planBatch(three, 5, sizes([['x', 1, 10]]));
    expect(!p3.bulk && p3.messages[0]?.kind).toBe('episodes');
    const all = Array.from({ length: 10 }, (_, i) => ep('x', 1, i + 1));
    const p10 = planBatch(all, 5, sizes([['x', 1, 10]]));
    expect(!p10.bulk && p10.messages[0]?.kind).toBe('season');
    const unknown = planBatch(all, 5, new Map());
    expect(!unknown.bulk && unknown.messages[0]).toMatchObject({
      kind: 'episodes',
      sizeUnknown: true,
    });
  });

  it('counts double episodes for every number they cover', () => {
    const items = [ep('x', 1, 1, 2), ep('x', 1, 3)];
    const p = planBatch(items, 5, sizes([['x', 1, 3]]));
    expect(!p.bulk && p.messages[0]?.kind).toBe('season');
  });

  it('never calls specials a season, and splits seasons in order', () => {
    const specials = [ep('x', 0, 1), ep('x', 0, 2)];
    expect(seasonsToSize(specials)).toEqual([]);
    const items = [ep('x', 2, 1), ep('x', 1, 1), ep('x', 1, 2)];
    const p = planBatch(items, 5, new Map());
    expect(!p.bulk && p.messages.map((m) => [m.kind, m.season])).toEqual([
      ['episodes', 1],
      ['episode', 2],
    ]);
  });
});

describe('templates', () => {
  it('validates every default template', () => {
    for (const kind of MESSAGE_KINDS) {
      expect(checkTemplate(kind, DEFAULT_TEMPLATES[kind])).toMatchObject({
        issues: [],
        warnings: [],
      });
    }
  });

  it('renders the default season template like the design', () => {
    const { embed } = renderMessage('season', DEFAULT_TEMPLATES.season, {
      ...sampleContext('season'),
      item: { name: 'Season 6', year: 2017, overview: null, type: 'season' },
    });
    expect(embed.title).toBe("The Handmaid's Tale Season 6 is available");
    expect(embed.description).toBe(
      'Links:\n[TMDb](https://www.themoviedb.org/tv/69478-the-handmaid-s-tale)\n[Jellyfin](http://jellyfin:8096/web/#/details?id=4f1c)',
    );
    expect(embed.color).toBe(0xffbe2e);
  });

  it('drops link lines that have no URL', () => {
    const msg = {
      kind: 'movie' as const,
      title: 'a',
      items: [movie('Dune')],
      season: null,
      seasonSize: null,
      sizeUnknown: false,
    };
    const ctx = buildContext(msg, { serverName: null, linkBase: null });
    expect(renderMessage('movie', DEFAULT_TEMPLATES.movie, ctx).embed.description).toBe('');
  });

  it('falls back to the default template when rendering fails', () => {
    const broken = { ...DEFAULT_TEMPLATES.movie, title: '{{ item.name.nope }}' };
    const out = renderMessage('movie', broken, sampleContext('movie'));
    expect(out.fallback).toContain('there is no `item.name.nope`');
    expect(out.embed.title).toBe('Dune: Part Two (2024) is available');
  });

  it('builds episode links to the season and episode on TMDb', () => {
    const msg = {
      kind: 'episode' as const,
      title: 'x',
      items: [ep('7', 2, 5)],
      season: 2,
      seasonSize: null,
      sizeUnknown: false,
    };
    const ctx = buildContext(msg, { serverName: null, linkBase: 'http://jf:8096/' });
    expect(ctx.links).toMatchObject({
      tmdb: 'https://www.themoviedb.org/tv/7/season/2/episode/5',
      jellyfin: `http://jf:8096/web/#/details?id=${ep('7', 2, 5).id}`,
    });
  });
});
