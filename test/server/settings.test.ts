import { readFile, rm, stat } from 'node:fs/promises';
import { JellyfinClient } from '../../src/jellyfin/client.js';
import { JellyfinHttp } from '../../src/jellyfin/http.js';
import { buildApp } from '../../src/server/app.js';
import { Auth, hashPassword } from '../../src/server/auth.js';
import { SyncService } from '../../src/sync/service.js';
import { RunStore } from '../../src/sync/run-store.js';
import { API_KEY, call, freePort, get, h, PASSWORD, post } from './harness.js';
import { describe, expect, it } from 'vitest';

describe('onboarding and settings', () => {
  async function firstStart(fromEnv?: { jellyfin: boolean; password: boolean }) {
    await h.app.close();
    await h.service.stop();
    await rm(h.data.configPath);
    h.service = new SyncService({
      data: h.data,
      client: new JellyfinClient(new JellyfinHttp(), { attempts: 1, baseDelayMs: 0 }),
      runs: new RunStore(h.data.runsDir),
    });
    h.app = buildApp({ service: h.service, auth: new Auth(undefined), fromEnv });
    h.cookie = '';
  }

  it('lets the first visitor set the password, once', async () => {
    await firstStart();
    expect((await get('/api/session', false)).json()).toEqual({
      authRequired: true,
      authenticated: false,
      needsPassword: true,
    });
    expect((await get('/api/status', false)).statusCode).toBe(401);
    expect((await post('/api/login', { password: 'anything' }, false)).statusCode).toBe(401);
    expect((await post('/api/onboarding/password', { password: 'short' }, false)).statusCode).toBe(
      400,
    );

    const res = await post('/api/onboarding/password', { password: 'a new password' }, false);
    expect(res.statusCode).toBe(200);
    h.cookie = String(res.headers['set-cookie']).split(';')[0]!;
    expect((await get('/api/session')).json()).toMatchObject({
      authenticated: true,
      needsPassword: false,
    });
    expect(
      (await post('/api/onboarding/password', { password: 'someone else' }, false)).statusCode,
    ).toBe(403);

    const saved = JSON.parse(await readFile(h.data.settingsPath, 'utf8'));
    expect(saved.passwordHash).toMatch(/^scrypt:/);
    expect(JSON.stringify(saved)).not.toContain('a new password');
    expect((await stat(h.data.settingsPath)).mode & 0o777).toBe(0o600);
  });

  it('tests and saves the Jellyfin connection, never returning the key', async () => {
    const closedPort = await freePort();
    await firstStart();
    h.fake.apiKey = API_KEY;
    h.cookie = String(
      (await post('/api/onboarding/password', { password: 'a new password' }, false)).headers[
        'set-cookie'
      ],
    ).split(';')[0]!;
    expect((await get('/api/settings')).json()).toEqual({
      jellyfin: { url: null, apiKeySet: false, fromEnv: false },
      password: { fromEnv: false, open: false },
    });
    expect((await get('/api/libraries')).json()).toMatchObject({ code: 'not-configured' });

    expect(
      (await post('/api/settings/jellyfin/test', { url: 'not a url', apiKey: 'x' })).statusCode,
    ).toBe(400);
    expect(
      (await post('/api/settings/jellyfin/test', { url: h.fake.url, apiKey: 'wrong' })).json(),
    ).toMatchObject({ error: 'Jellyfin rejected the API key.' });
    expect(
      (
        await post('/api/settings/jellyfin/test', {
          url: `http://127.0.0.1:${closedPort}`,
          apiKey: API_KEY,
        })
      ).json(),
    ).toMatchObject({
      code: 'jellyfin',
      error: expect.stringContaining(`connection refused (nothing listens on port ${closedPort})`),
    });
    expect(
      (
        await post('/api/settings/jellyfin/test', { url: 'http://127.0.0.1:1', apiKey: API_KEY })
      ).json(),
    ).toMatchObject({ error: expect.stringContaining('port 1 is blocked by fetch as unsafe') });
    expect(
      (
        await post('/api/settings/jellyfin/test', {
          url: 'http://stubbert-missing.invalid:8096',
          apiKey: API_KEY,
        })
      ).json(),
    ).toMatchObject({
      code: 'jellyfin',
      error: expect.stringContaining('host stubbert-missing.invalid not found'),
    });
    expect(
      (await post('/api/settings/jellyfin/test', { url: h.fake.url, apiKey: API_KEY })).json(),
    ).toEqual({ ok: true, version: '12.1.0', serverName: 'fake' });
    expect(await readFile(h.data.settingsPath, 'utf8')).not.toContain(API_KEY);

    const put = await call({
      method: 'PUT',
      url: '/api/settings/jellyfin',
      payload: { url: `${h.fake.url}/`, apiKey: API_KEY },
    });
    expect(put.statusCode).toBe(200);
    expect((await get('/api/settings')).json().jellyfin).toEqual({
      url: h.fake.url,
      apiKeySet: true,
      fromEnv: false,
    });
    expect((await get('/api/connection')).json()).toMatchObject({
      jellyfin: { ok: true },
      apiKey: { ok: true },
    });
    expect(
      (await call({ method: 'PUT', url: '/api/settings/jellyfin', payload: { url: h.fake.url } }))
        .statusCode,
    ).toBe(200);
  });

  it('leaves settings from the environment alone', async () => {
    await firstStart({ jellyfin: true, password: true });
    h.service.ctx.client.configure(h.fake.url, API_KEY);
    const hash = hashPassword(PASSWORD);
    await h.app.close();
    h.app = buildApp({
      service: h.service,
      auth: new Auth(hash),
      fromEnv: { jellyfin: true, password: true },
    });
    h.cookie = String(
      (await post('/api/login', { password: PASSWORD }, false)).headers['set-cookie'],
    ).split(';')[0]!;
    expect(
      (
        await call({
          method: 'PUT',
          url: '/api/settings/jellyfin',
          payload: { url: h.fake.url, apiKey: API_KEY },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call({
          method: 'PUT',
          url: '/api/settings/password',
          payload: { current: PASSWORD, password: 'another one' },
        })
      ).statusCode,
    ).toBe(409);
  });

  it('changes the password and ends other sessions', async () => {
    const other = h.cookie;
    expect(
      (
        await call({
          method: 'PUT',
          url: '/api/settings/password',
          payload: { current: 'wrong', password: 'another one' },
        })
      ).statusCode,
    ).toBe(400);
    const res = await call({
      method: 'PUT',
      url: '/api/settings/password',
      payload: { current: PASSWORD, password: 'another one' },
    });
    expect(res.statusCode).toBe(200);
    h.cookie = other;
    expect((await get('/api/status')).statusCode).toBe(401);
    h.cookie = String(res.headers['set-cookie']).split(';')[0]!;
    expect((await get('/api/status')).statusCode).toBe(200);
    expect((await post('/api/login', { password: 'another one' }, false)).statusCode).toBe(200);
  });
});
