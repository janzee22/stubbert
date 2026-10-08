import { buildApp } from '../../src/server/app.js';
import { Auth, hashPassword } from '../../src/server/auth.js';
import { get, h, PASSWORD } from './harness.js';
import { describe, expect, it } from 'vitest';

describe('the UI', () => {
  const ui = new Map([
    [
      '/index.html',
      {
        type: 'text/html; charset=utf-8',
        body: Buffer.from('<div id="root"></div>'),
        immutable: false,
      },
    ],
    [
      '/assets/app-1a2b.js',
      {
        type: 'text/javascript; charset=utf-8',
        body: Buffer.from('console.log(1)'),
        immutable: true,
      },
    ],
  ]);

  it('serves the build, index.html for page paths, and 404 for unknown assets and API routes', async () => {
    await h.app.close();
    h.app = buildApp({ service: h.service, auth: new Auth(hashPassword(PASSWORD)), ui });
    const index = await get('/', false);
    expect(index.headers['content-type']).toMatch(/text\/html/);
    expect(index.headers['cache-control']).toBe('no-cache');
    expect((await get('/runs/abc', false)).body).toContain('root');
    const asset = await get('/assets/app-1a2b.js', false);
    expect(asset.headers['cache-control']).toMatch(/immutable/);
    expect((await get('/assets/missing.js', false)).statusCode).toBe(404);
    expect((await get('/assets/../index.html', false)).statusCode).not.toBe(500);
    expect((await get('/api/nope', false)).statusCode).toBe(401);
  });

  it('sends security headers', async () => {
    const res = await get('/api/health', false);
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
