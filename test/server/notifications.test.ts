import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataDir } from '../../src/data.js';
import { JellyfinClient } from '../../src/jellyfin/client.js';
import { JellyfinHttp } from '../../src/jellyfin/http.js';
import { DEFAULT_TEMPLATES } from '../../src/notify/defaults.js';
import { NotifyService } from '../../src/notify/service.js';
import { DEFAULT_PREFERENCES } from '../../src/notify/settings.js';
import { NotifyStore } from '../../src/notify/store.js';
import { buildApp, redactUrl } from '../../src/server/app.js';
import { Auth, hashPassword } from '../../src/server/auth.js';
import { RunStore } from '../../src/sync/run-store.js';
import { SyncService } from '../../src/sync/service.js';
import { FakeJellyfin, MOVIES_LIBRARY_ID } from '../fake-jellyfin.js';

const API_KEY = 'secret-api-key-0123456789';
const PASSWORD = 'correct horse';
const WEBHOOK = 'https://discord.com/api/webhooks/987654321/s3cr3t-webhook-token';
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

let fake: FakeJellyfin;
let dir: string;
let app: FastifyInstance;
let service: SyncService;
let notify: NotifyService;
let store: NotifyStore;
let cookie = '';
let discordCalls: Array<{
  url: string;
  form: boolean;
  payload: Record<string, unknown>;
  file?: string;
}>;
const bodies: string[] = [];

async function call(opts: InjectOptions & { auth?: boolean }) {
  const { auth = true, ...rest } = opts;
  const res = await app.inject({
    ...rest,
    headers: { ...rest.headers, ...(auth && cookie ? { cookie } : {}) },
  });
  bodies.push(res.body);
  return res;
}
const get = (url: string) => call({ method: 'GET', url });
const post = (url: string, payload: unknown = {}) =>
  call({ method: 'POST', url, payload: payload as object });
const put = (url: string, payload: unknown) =>
  call({ method: 'PUT', url, payload: payload as object });
const hook = (token: string, body: string, contentType = 'text/plain') =>
  call({
    method: 'POST',
    url: `/hooks/jellyfin/${token}`,
    payload: body,
    headers: { 'content-type': contentType },
    auth: false,
  });

const discordFetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const body = init?.body;
  const form = body instanceof FormData;
  const payload = JSON.parse(form ? (body.get('payload_json') as string) : (body as string));
  const file = form ? (body.get('files[0]') as File | null)?.name : undefined;
  discordCalls.push({ url: String(url), form, payload, file });
  return new Response('{"id":"1"}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

beforeEach(async () => {
  fake = new FakeJellyfin();
  await fake.start();
  dir = await mkdtemp(join(tmpdir(), 'stubbert-notify-server-'));
  const data = new DataDir(dir);
  const client = new JellyfinClient(new JellyfinHttp(fake.url, API_KEY), {
    attempts: 1,
    baseDelayMs: 0,
  });
  service = new SyncService({ data, client, runs: new RunStore(data.runsDir) }, quiet);
  store = new NotifyStore(join(dir, 'notifications'));
  await store.load();
  discordCalls = [];
  notify = new NotifyService({
    store,
    jellyfin: client,
    fetch: discordFetch,
    log: quiet,
    sleep: async () => undefined,
  });
  const ui = new Map([
    ['/index.html', { type: 'text/html', body: Buffer.from('<html></html>'), immutable: false }],
    [
      '/samples/poster.jpg',
      { type: 'image/jpeg', body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), immutable: false },
    ],
  ]);
  app = buildApp({ service, notify, ui, auth: new Auth(hashPassword(PASSWORD)) });
  cookie = '';
  const login = await post('/api/login', { password: PASSWORD });
  cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
});

afterEach(async () => {
  await service.stop();
  await app.close();
  await store.flushed();
  expect(fake.violations).toEqual([]);
  await fake.stop();
  await rm(dir, { recursive: true, force: true });
  for (const body of bodies.splice(0)) {
    expect(body).not.toContain(API_KEY);
    expect(body).not.toContain('s3cr3t-webhook-token');
  }
});

const enable = (extra: Record<string, unknown> = {}) =>
  put('/api/notifications/settings', {
    preferences: {
      ...DEFAULT_PREFERENCES,
      enabled: true,
      linkBase: 'http://jellyfin:8096',
      ...extra,
    },
    discordWebhookUrl: WEBHOOK,
  });

describe('Jellyfin webhook endpoint', () => {
  it('refuses unknown tokens and counts them', async () => {
    const res = await hook('wrong-token-b19d', '{}');
    expect(res.statusCode).toBe(401);
    const status = (await get('/api/notifications/status')).json();
    expect(status.webhook.refused).toMatchObject({ count: 1, hint: '…b19d' });
  });

  it('accepts a text/plain JSON event and queues the movie', async () => {
    await enable();
    const movie = fake.addMedia('Movie', 'Dune');
    movie.ProviderIds = { Tmdb: '438631' };
    const res = await hook(
      store.settings.webhookToken,
      JSON.stringify({
        NotificationType: 'ItemAdded',
        ItemType: 'Movie',
        ItemId: movie.Id,
        Name: 'Dune',
        Year: 2021,
        Provider_tmdb: '438631',
      }),
    );
    expect(res.statusCode).toBe(202);
    // The hook answers 202 before ingesting, so wait for the batch instead of a fixed delay.
    await vi.waitFor(() => expect(store.state.batch).not.toBeNull(), { timeout: 5000 });
    const status = (await get('/api/notifications/status')).json();
    expect(status.batch).toMatchObject({ titles: ['Dune (2021)'], items: 1 });
    expect(store.state.batch?.items[0]?.library).toEqual({ id: MOVIES_LIBRARY_ID, name: 'Movies' });

    expect((await post('/api/notifications/batch/send')).json()).toEqual({ sent: 1 });
    expect(discordCalls).toHaveLength(1);
    expect(discordCalls[0]).toMatchObject({
      url: `${WEBHOOK}?wait=true`,
      form: true,
      payload: {
        username: 'Stubbert',
        embeds: [
          {
            title: 'Dune (2021) is available',
            thumbnail: { url: 'attachment://poster.jpg' },
          },
        ],
      },
    });
    expect(fake.imageRequests).toEqual([`${movie.Id}/Primary`]);
    const activity = (await get('/api/notifications/activity')).json();
    expect(activity[0]).toMatchObject({ status: 'sent', title: 'Dune (2021)', kind: 'movie' });
  });

  it('answers 400 to unreadable bodies and 413 to huge ones', async () => {
    expect((await hook(store.settings.webhookToken, 'not json')).statusCode).toBe(400);
    expect((await hook(store.settings.webhookToken, '{"Name":"x"}')).json().error).toContain(
      'NotificationType is missing',
    );
    expect((await hook(store.settings.webhookToken, 'x'.repeat(1024 * 1024 + 10))).statusCode).toBe(
      413,
    );
  });

  it('stops working right after rotating the URL', async () => {
    const old = store.settings.webhookToken;
    const next = (await post('/api/notifications/token/rotate')).json();
    expect(next.webhookUrl).not.toContain(old);
    expect((await hook(old, '{}')).statusCode).toBe(401);
  });

  it('limits refused calls without blocking the real token', async () => {
    for (let i = 0; i < 60; i++) expect((await hook(`wrong-${i}`, '{}')).statusCode).toBe(401);
    expect((await hook('wrong-again', '{}')).statusCode).toBe(429);
    const status = (await get('/api/notifications/status')).json();
    expect(status.webhook.refused.count).toBe(60);
    const ignored = JSON.stringify({ NotificationType: 'PlaybackStart' });
    expect((await hook(store.settings.webhookToken, ignored)).statusCode).toBe(202);
  });

  it('keeps the token out of logged URLs', () => {
    expect(redactUrl('/hooks/jellyfin/s3cr3t')).toBe('/hooks/jellyfin/…');
    expect(redactUrl('/hooks/jellyfin/s3cr3t?x=1')).toBe('/hooks/jellyfin/…?x=1');
    expect(redactUrl('/api/session')).toBe('/api/session');
  });
});

describe('notification settings API', () => {
  it('masks secrets and keeps them when not sent', async () => {
    await enable({ tvmaze: false });
    const view = (await get('/api/notifications/settings')).json();
    expect(view.discordWebhook).toEqual({ set: true, hint: '…oken' });
    expect(view.webhookUrl).toBe(
      `http://stubbert:8080/hooks/jellyfin/${store.settings.webhookToken}`,
    );
    await put('/api/notifications/settings', {
      preferences: { ...view.preferences, quietMinutes: 3 },
    });
    expect(store.settings).toMatchObject({
      quietMinutes: 3,
      discordWebhookUrl: WEBHOOK,
      tvmaze: false,
    });
    const raw = JSON.parse(await readFile(store.settingsPath, 'utf8'));
    expect(raw.discordWebhookUrl).toBe(WEBHOOK);
  });

  it('accepts a pasted role tag and stores the id', async () => {
    const res = await put('/api/notifications/settings', {
      preferences: {
        ...DEFAULT_PREFERENCES,
        mention: { type: 'role', roleId: ' <@&123456789012345678> ' },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(store.settings.mention).toEqual({ type: 'role', roleId: '123456789012345678' });
    const bad = await put('/api/notifications/settings', {
      preferences: { ...DEFAULT_PREFERENCES, mention: { type: 'role', roleId: '@Jellyfin' } },
    });
    expect(bad.json().issues[0].message).toBe('Paste a role tag like <@&123456789012345678>.');
  });

  it('rejects other hosts than Discord and bad templates', async () => {
    const bad = await put('/api/notifications/settings', {
      preferences: DEFAULT_PREFERENCES,
      discordWebhookUrl: 'https://example.com/api/webhooks/1/x',
    });
    expect(bad.statusCode).toBe(400);
    const broken = await put('/api/notifications/settings', {
      preferences: {
        ...DEFAULT_PREFERENCES,
        templates: {
          ...DEFAULT_TEMPLATES,
          season: { ...DEFAULT_TEMPLATES.season, content: '{{ seasn.number }}' },
        },
      },
    });
    expect(broken.statusCode).toBe(400);
    expect(broken.json().issues).toEqual([
      {
        path: 'templates.season',
        message: 'Line 1: there is no `seasn`. Did you mean `season.number`?',
      },
    ]);
    const zero = await put('/api/notifications/settings', {
      preferences: { ...DEFAULT_PREFERENCES, quietMinutes: 0 },
    });
    expect(zero.json().issues[0].message).toBe('Use 1 to 120 minutes.');
  });

  it('previews a template with issues and variables', async () => {
    const ok = (
      await post('/api/notifications/preview', {
        kind: 'season',
        template: DEFAULT_TEMPLATES.season,
      })
    ).json();
    expect(ok.embed.title).toBe("The Handmaid's Tale Season 6 is available");
    expect(ok.variables).toContainEqual({ path: 'season.number', value: '6' });
    expect(ok.imageUrl).toBe('/samples/poster.jpg');
    expect((await get('/samples/poster.jpg')).headers['content-type']).toBe('image/jpeg');
    const bad = (
      await post('/api/notifications/preview', {
        kind: 'season',
        template: { ...DEFAULT_TEMPLATES.season, content: 'a\n{{ seasn.number }}' },
      })
    ).json();
    expect(bad.embed).toBeNull();
    expect(bad.issues[0]).toMatchObject({
      field: 'content',
      line: 2,
      suggestion: 'season.number',
      start: 5,
      end: 17,
    });
    const samples = (await get('/api/notifications/samples?kind=movie')).json();
    expect(samples).toEqual([{ id: 'sample', label: 'Sample data' }]);
  });

  it('marks the movies already in Jellyfin as announced', async () => {
    fake.addMedia('Movie', 'Dune').ProviderIds = { Tmdb: '438631' };
    fake.addMedia('Series', 'Severance');
    const res = await post('/api/notifications/announced/existing');
    expect(res.json()).toEqual({ movies: 1, episodes: 0 });
    expect(store.state.announced['movie:tmdb:438631']).toBeTruthy();
  });

  it('sends a test message and reports failing notifications in the status', async () => {
    await enable();
    expect((await post('/api/notifications/test')).statusCode).toBe(200);
    expect(discordCalls[0]?.payload).toMatchObject({
      embeds: [{ title: 'Stubbert is connected' }],
    });
    store.state.discord.notFound = true;
    const status = (await get('/api/status')).json();
    expect(status.notifications.failing).toBeTruthy();
  });

  it('sends a sample test message with the sample poster attached', async () => {
    await enable();
    const res = await post('/api/notifications/preview/send', {
      kind: 'movie',
      template: DEFAULT_TEMPLATES.movie,
    });
    expect(res.statusCode).toBe(200);
    expect(discordCalls[0]).toMatchObject({
      form: true,
      file: 'poster.jpg',
      payload: { embeds: [{ thumbnail: { url: 'attachment://poster.jpg' } }] },
    });
  });
});
