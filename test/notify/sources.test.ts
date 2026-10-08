import { describe, expect, it } from 'vitest';
import { sendToDiscord } from '../../src/notify/discord.js';
import { fromJellyfin, seasonSize } from '../../src/notify/sources.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const f = async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(
      `${u}${(init?.headers as Record<string, string>)?.Authorization ? ' [bearer]' : ''}`,
    );
    const hit = Object.entries(routes).find(([prefix]) => u.startsWith(prefix));
    return hit ? hit[1]() : json({}, 404);
  };
  return { f: f as typeof fetch, calls };
}

const none = async () => [];

describe('season size sources', () => {
  it('uses Jellyfin only when it lists missing episodes', () => {
    expect(fromJellyfin([{ Id: 'a', Name: 'a', IndexNumber: 1 }])).toBeNull();
    expect(
      fromJellyfin([
        { Id: 'a', Name: 'a', IndexNumber: 1, IndexNumberEnd: 2 },
        { Id: 'b', Name: 'b', IndexNumber: 3, LocationType: 'Virtual' },
      ]),
    ).toEqual([1, 2, 3]);
  });

  it('looks a show up on TVmaze by TVDb id and reads episodeOrder', async () => {
    const { f, calls } = fakeFetch({
      'https://api.tvmaze.com/lookup/shows?thetvdb=81189': () => json({ id: 169 }),
      'https://api.tvmaze.com/shows/169/seasons': () =>
        json([
          { id: 1, number: 1, episodeOrder: 7 },
          { id: 2, number: 2, episodeOrder: 13 },
        ]),
    });
    const r = await seasonSize(
      { seriesJellyfinId: 'x', providerIds: { tvdb: '81189' }, season: 1 },
      { jellyfinEpisodes: none, fetch: f, tvmaze: true, tmdbApiKey: null },
    );
    expect(r.size).toEqual({ numbers: [1, 2, 3, 4, 5, 6, 7], source: 'tvmaze' });
    expect(calls).toHaveLength(2);
  });

  it('falls through to TMDb and reports a rejected key', async () => {
    const { f, calls } = fakeFetch({
      'https://api.themoviedb.org/3/tv/42/season/2': () => json({ status_message: 'no' }, 401),
    });
    const r = await seasonSize(
      { seriesJellyfinId: 'x', providerIds: { tmdb: '42' }, season: 2 },
      { jellyfinEpisodes: none, fetch: f, tvmaze: true, tmdbApiKey: 'bad' },
    );
    expect(r).toMatchObject({ size: null, tmdbRejected: true });
    expect(calls[0]).toBe('https://api.themoviedb.org/3/tv/42/season/2?api_key=bad');
  });

  it('reads TMDb episodes with a v4 token', async () => {
    const { f, calls } = fakeFetch({
      'https://api.themoviedb.org/3/tv/42/season/2': () =>
        json({ episodes: [{ episode_number: 1 }, { episode_number: 2 }] }),
    });
    const r = await seasonSize(
      { seriesJellyfinId: 'x', providerIds: { tmdb: '42' }, season: 2 },
      { jellyfinEpisodes: none, fetch: f, tvmaze: false, tmdbApiKey: 'eyJhbGciOi' },
    );
    expect(r.size).toEqual({ numbers: [1, 2], source: 'tmdb' });
    expect(calls[0]).toBe('https://api.themoviedb.org/3/tv/42/season/2 [bearer]');
  });

  it('returns unknown when nobody knows', async () => {
    const r = await seasonSize(
      { seriesJellyfinId: 'x', providerIds: {}, season: 1 },
      { jellyfinEpisodes: none, fetch: fakeFetch({}).f, tvmaze: true, tmdbApiKey: null },
    );
    expect(r.size).toBeNull();
  });
});

describe('sendToDiscord', () => {
  it('only posts to Discord hosts', async () => {
    await expect(
      sendToDiscord(
        'https://evil.example/api/webhooks/1/x',
        { embeds: [], allowed_mentions: { parse: [] } },
        undefined,
      ),
    ).rejects.toThrow('not a Discord webhook URL');
  });

  it('stops on 404 without retrying', async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return json({ message: 'Unknown Webhook' }, 404);
    }) as typeof fetch;
    await expect(
      sendToDiscord(
        'https://discord.com/api/webhooks/1/x',
        { embeds: [], allowed_mentions: { parse: [] } },
        undefined,
        {
          fetch: f,
          sleep: async () => undefined,
        },
      ),
    ).rejects.toMatchObject({ status: 404, message: "Discord doesn't know this webhook (404)." });
    expect(calls).toBe(1);
  });
});
