import { Auth, hashPassword } from '../../src/server/auth.js';
import { call, get, h, PASSWORD, post } from './harness.js';
import { describe, expect, it } from 'vitest';

describe('auth', () => {
  it('needs a session for everything but health, session and login', async () => {
    expect((await get('/api/health', false)).statusCode).toBe(200);
    expect((await get('/api/session', false)).json()).toEqual({
      authRequired: true,
      authenticated: false,
      needsPassword: false,
    });
    expect((await get('/api/status', false)).statusCode).toBe(401);
    expect((await post('/api/sync', {}, false)).statusCode).toBe(401);
    expect((await get('/api/session')).json()).toEqual({
      authRequired: true,
      authenticated: true,
      needsPassword: false,
    });
  });

  it('sets an HttpOnly, SameSite=Strict cookie and logs out', async () => {
    h.cookie = '';
    const res = await post('/api/login', { password: PASSWORD }, false);
    expect(res.headers['set-cookie']).toMatch(/HttpOnly; SameSite=Strict/);
    h.cookie = String(res.headers['set-cookie']).split(';')[0]!;
    await post('/api/logout');
    expect((await get('/api/status')).statusCode).toBe(401);
  });

  it('throttles wrong passwords', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post('/api/login', { password: 'nope' }, false)).statusCode).toBe(401);
    }
    const blocked = await post('/api/login', { password: PASSWORD }, false);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('forgets clients whose failures have expired', () => {
    let now = 0;
    const auth = new Auth(hashPassword(PASSWORD), { now: () => now });
    auth.login('10.0.0.1', 'nope');
    auth.login('10.0.0.2', 'nope');
    expect(auth.trackedClients).toBe(2);
    now = 16 * 60 * 1000;
    auth.login('10.0.0.3', 'nope');
    expect(auth.trackedClients).toBe(1);
  });

  it('refuses writes that an HTML form could send', async () => {
    for (const type of [
      'application/x-www-form-urlencoded',
      'text/plain',
      'multipart/form-data; boundary=x',
    ]) {
      const res = await call({
        method: 'POST',
        url: '/api/sync',
        payload: '',
        headers: { 'content-type': type },
      });
      expect(res.statusCode).toBe(415);
    }
    expect(h.fake.writes()).toEqual([]);
  });
});
