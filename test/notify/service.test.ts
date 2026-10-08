import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BaseItemDto } from '../../src/jellyfin/client.js';
import { NotifyService, type NotifyDeps, type NotifyJellyfin } from '../../src/notify/service.js';
import { NotifyStore } from '../../src/notify/store.js';

const WEBHOOK = 'https://discord.com/api/webhooks/123/abc-DEF';
const hex = (n: number) => n.toString(16).padStart(32, '0');

interface Sent {
  payload: Record<string, unknown>;
  file?: { name: string; type: string };
}

class FakeDiscord {
  sent: Sent[] = [];
  responses: Array<{ status: number; body?: unknown }> = [];

  fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const target = String(url);
    if (!target.startsWith('https://discord.com/')) {
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }
    const next = this.responses.shift() ?? { status: 200, body: { id: '1' } };
    if (next.status === 200) {
      const body = init?.body;
      if (body instanceof FormData) {
        const file = body.get('files[0]') as File;
        this.sent.push({
          payload: JSON.parse(body.get('payload_json') as string),
          file: { name: file.name, type: file.type },
        });
      } else {
        this.sent.push({ payload: JSON.parse(body as string) });
      }
    }
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    });
  };

  titles() {
    return this.sent.map((s) => (s.payload.embeds as Array<{ title: string }>)[0]?.title);
  }
}

class FakeJellyfin implements NotifyJellyfin {
  configured = true;
  episodes = new Map<string, BaseItemDto[]>();

  async itemsByIds(ids: readonly string[]): Promise<BaseItemDto[]> {
    return ids.map((id) => ({
      Id: id,
      Name: `Series ${id.slice(-2)}`,
      ProviderIds: { Tmdb: `t${id.slice(-2)}` },
      ProductionYear: 2020,
    }));
  }

  async ancestors(): Promise<BaseItemDto[]> {
    return [{ Id: hex(999), Name: 'Movies', Type: 'CollectionFolder' }];
  }

  async seasonEpisodes(seriesId: string, season: number): Promise<BaseItemDto[]> {
    return this.episodes.get(`${seriesId}#${season}`) ?? [];
  }

  async image() {
    return { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' };
  }
}

let dir: string;
let now: number;
let discord: FakeDiscord;
let jellyfin: FakeJellyfin;
let store: NotifyStore;
let service: NotifyService;
let counter = 0;

const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function makeService(extra: Partial<NotifyDeps> = {}) {
  store = new NotifyStore(dir);
  await store.load();
  service = new NotifyService({
    store,
    jellyfin,
    fetch: discord.fetch as typeof fetch,
    now: () => new Date(now),
    sleep: async () => undefined,
    log: quiet,
    ...extra,
  });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stubbert-notify-'));
  now = Date.UTC(2026, 9, 7, 12, 0, 0);
  discord = new FakeDiscord();
  jellyfin = new FakeJellyfin();
  await makeService();
  await service.updateSettings({ ...store.settings, enabled: true, discordWebhookUrl: WEBHOOK });
});

afterEach(async () => {
  await store.flushed();
  await rm(dir, { recursive: true, force: true });
});

const minutes = (n: number) => {
  now += n * 60_000;
};

function movie(name: string, tmdb?: string) {
  counter++;
  return {
    NotificationType: 'ItemAdded',
    ItemType: 'Movie',
    ItemId: hex(counter),
    Name: name,
    Year: 2024,
    ...(tmdb && { Provider_tmdb: tmdb }),
  };
}

function episode(series: number, season: number, ep: number) {
  counter++;
  return {
    NotificationType: 'ItemAdded',
    ItemType: 'Episode',
    ItemId: hex(counter + 10_000),
    Name: `Episode ${ep}`,
    SeriesName: `Series ${series}`,
    SeriesId: hex(series),
    SeasonNumber: season,
    EpisodeNumber: ep,
  };
}

describe('NotifyService', () => {
  it('sends one movie after the quiet period and skips an upgrade later', async () => {
    expect(await service.ingest(movie('Dune', '1'))).toBe('waiting');
    minutes(9);
    await service.tick();
    expect(discord.sent).toHaveLength(0);
    minutes(1);
    await service.tick();
    expect(discord.titles()).toEqual(['Dune (2024) is available']);
    expect(discord.sent[0]?.file).toEqual({ name: 'poster.jpg', type: 'image/jpeg' });
    expect(discord.sent[0]?.payload).toMatchObject({
      username: 'Stubbert',
      allowed_mentions: { parse: [] },
      embeds: [{ thumbnail: { url: 'attachment://poster.jpg' }, color: 0xffbe2e }],
    });
    expect(await service.ingest(movie('Dune', '1'))).toBe('announced');
    expect(store.state.activity[0]).toMatchObject({
      status: 'skipped',
      reason: 'announced',
      detail: 'Announced before. Looks like a quality upgrade.',
    });
  });

  it('tags the role above the embed in the same message', async () => {
    await service.updateSettings({
      ...store.settings,
      mention: { type: 'role', roleId: '123456789012345678' },
    });
    await service.ingest(movie('Tagged'));
    await service.sendNow();
    expect(discord.sent).toHaveLength(1);
    expect(discord.sent[0]?.payload).toMatchObject({
      content: '<@&123456789012345678>',
      allowed_mentions: { parse: [], roles: ['123456789012345678'] },
      embeds: [{ title: 'Tagged (2024) is available' }],
    });
  });

  it('resets the timer on every new item', async () => {
    await service.ingest(movie('A'));
    minutes(8);
    await service.ingest(movie('B'));
    minutes(9);
    await service.tick();
    expect(discord.sent).toHaveLength(0);
    minutes(1);
    await service.tick();
    expect(discord.titles()).toEqual(['A (2024) is available', 'B (2024) is available']);
  });

  it('groups episodes into one Episodes message', async () => {
    for (const n of [1, 2, 3]) {
      await service.ingest(episode(7, 1, n));
      minutes(2);
    }
    minutes(10);
    await service.tick();
    expect(discord.titles()).toEqual(['Series 07: 3 new episodes']);
    const embeds = discord.sent[0]?.payload.embeds as Array<{ description: string }> | undefined;
    const description = embeds?.[0]?.description;
    expect(description).toContain('Season 1 · episodes 1, 2, 3');
    expect(description).toContain('https://www.themoviedb.org/tv/t07/season/1');
  });

  it('sends a Season message when Jellyfin knows the whole season', async () => {
    jellyfin.episodes.set(`${hex(7)}#1`, [
      { Id: 'a', Name: 'a', IndexNumber: 1 },
      { Id: 'b', Name: 'b', IndexNumber: 2 },
      { Id: 'c', Name: 'c', IndexNumber: 3, LocationType: 'Virtual' },
    ]);
    for (const n of [1, 2, 3]) await service.ingest(episode(7, 1, n));
    await service.sendNow();
    expect(discord.titles()).toEqual(['Series 07 Season 1 is available']);
  });

  it('falls back to Episodes and warns when no source knows the size', async () => {
    await service.updateSettings({ ...store.settings, tvmaze: false });
    for (const n of [1, 2]) await service.ingest(episode(7, 1, n));
    await service.sendNow();
    expect(discord.titles()).toEqual(['Series 07: 2 new episodes']);
    expect(store.state.activity[0]?.warnings).toContain(
      'Season size unknown, so this is not called a whole season.',
    );
  });

  it('stays quiet for five titles and remembers them', async () => {
    for (const name of ['A', 'B', 'C', 'D']) await service.ingest(movie(name, name));
    await service.ingest(episode(7, 1, 1));
    await service.sendNow();
    expect(discord.sent).toHaveLength(0);
    expect(store.state.activity[0]).toMatchObject({
      status: 'skipped',
      reason: 'bulk',
      title: '5 titles at once',
      titles: ['A (2024)', 'B (2024)', 'C (2024)', 'D (2024)', 'Series 07'],
    });
    expect(await service.ingest(movie('A', 'A'))).toBe('announced');
  });

  it('sends 3 movies and 1 Episodes message for 4 titles', async () => {
    for (const name of ['A', 'B', 'C']) await service.ingest(movie(name));
    for (const n of [1, 2, 3, 4, 5]) await service.ingest(episode(8, 2, n));
    await service.sendNow();
    expect(discord.titles()).toEqual([
      'A (2024) is available',
      'B (2024) is available',
      'C (2024) is available',
      'Series 08: 5 new episodes',
    ]);
  });

  it('splits seasons of one series, first season first', async () => {
    await service.ingest(episode(7, 2, 1));
    await service.ingest(episode(7, 1, 4));
    await service.sendNow();
    expect(discord.titles()).toEqual([
      'Series 07 S01E04 is available',
      'Series 07 S02E01 is available',
    ]);
  });

  it('keeps the open batch over a restart', async () => {
    await service.ingest(movie('Kept'));
    await store.flushed();
    await makeService();
    expect(store.state.batch?.items).toHaveLength(1);
    minutes(11);
    await service.tick();
    expect(discord.titles()).toEqual(['Kept (2024) is available']);
  });

  it('logs but does not buffer when notifications are off', async () => {
    await service.updateSettings({ ...store.settings, enabled: false });
    expect(await service.ingest(movie('Off'))).toBe('off');
    expect(store.state.batch).toBeNull();
    expect(store.state.activity[0]).toMatchObject({ status: 'off', detail: 'Notifications off.' });
  });

  it('waits for retry_after on 429 and succeeds', async () => {
    discord.responses.push({ status: 429, body: { retry_after: 0.5 } });
    await service.ingest(movie('Busy'));
    await service.sendNow();
    expect(discord.titles()).toEqual(['Busy (2024) is available']);
  });

  it('fails after three 429s and Retry sends it', async () => {
    for (let i = 0; i < 3; i++) discord.responses.push({ status: 429, body: { retry_after: 1 } });
    await service.ingest(movie('Late'));
    await service.sendNow();
    const failed = store.state.activity[0];
    expect(failed).toMatchObject({
      status: 'failed',
      error: 'Discord answered 429: too many messages. Tried 3 times.',
    });
    await service.retry(failed?.id ?? '');
    expect(discord.titles()).toEqual(['Late (2024) is available']);
    expect(store.state.activity[0]?.status).toBe('sent');
    expect(await service.ingest(movie('Late'))).toBe('announced');
  });

  it('pauses on 404 and resends when the URL changes', async () => {
    discord.responses.push({ status: 404, body: { message: 'Unknown Webhook' } });
    await service.ingest(movie('Lost'));
    await service.sendNow();
    expect(store.state.discord.notFound).toBe(true);
    await service.ingest(movie('Held'));
    await service.sendNow();
    expect(discord.sent).toHaveLength(0);
    await service.updateSettings({
      ...store.settings,
      discordWebhookUrl: 'https://discord.com/api/webhooks/456/new',
    });
    await service.resendHeld();
    expect(discord.titles().toSorted()).toEqual([
      'Held (2024) is available',
      'Lost (2024) is available',
    ]);
  });

  it('reports every new item for a sync, even with notifications off', async () => {
    let calls = 0;
    await makeService({ onNewItem: () => calls++ });
    await service.updateSettings({ ...store.settings, enabled: false });
    const m = movie('Synced');
    await service.ingest(m);
    await service.ingest(m);
    await service.ingest({ ...m, ItemType: 'Season', ItemId: hex(4343) });
    expect(calls).toBe(1);
  });

  it('ignores duplicate events and other item types', async () => {
    const m = movie('Twice');
    expect(await service.ingest(m)).toBe('waiting');
    expect(await service.ingest(m)).toBe('duplicate');
    expect(await service.ingest({ ...m, ItemType: 'Season', ItemId: hex(4242) })).toBe(
      'ignored (item type Season)',
    );
  });

  it('filters by library and type', async () => {
    await service.updateSettings({ ...store.settings, libraryIds: [hex(1)], episodes: false });
    expect(await service.ingest(movie('Elsewhere'))).toBe('filtered library');
    expect(await service.ingest(episode(7, 1, 1))).toBe('filtered type');
  });

  it('counts refused tokens and resets on rotate', async () => {
    expect(service.tokenMatches('nope')).toBe(false);
    expect(service.tokenMatches(store.settings.webhookToken)).toBe(true);
    await service.refused('old-token-b19d');
    expect(store.state.ingest).toMatchObject({ refusedCount: 1, refusedTokenHint: '…b19d' });
    const token = await service.rotateToken();
    expect(service.tokenMatches(token)).toBe(true);
    expect(store.state.ingest.refusedCount).toBe(0);
  });
});

describe('NotifyStore', () => {
  it('stores only templates that differ from the defaults', async () => {
    const custom = { ...store.settings.templates.movie, title: 'New: {{ item.name }}' };
    await store.saveSettings({
      ...store.settings,
      templates: { ...store.settings.templates, movie: custom },
    });
    await store.flushed();
    const raw = JSON.parse(await readFile(store.settingsPath, 'utf8'));
    expect(raw.templates).toEqual({ movie: custom });
    const again = new NotifyStore(dir);
    await again.load();
    expect(again.settings.templates.movie).toEqual(custom);
    expect(again.settings.templates.season.title).toContain('is available');
  });
});
