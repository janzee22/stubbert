import { call, config, get, h, JPEG, PNG } from './harness.js';
import { describe, expect, it } from 'vitest';

describe('posters', () => {
  const put = (file: string, body: Buffer, type = 'image/png') =>
    call({
      method: 'PUT',
      url: `/api/posters/${file}`,
      payload: body,
      headers: { 'content-type': type },
    });

  it('uploads, lists, serves and deletes posters', async () => {
    expect((await put('disney.png', PNG)).statusCode).toBe(200);
    expect((await get('/api/posters')).json()).toEqual([
      { file: 'disney.png', size: PNG.length, modified: expect.any(String) },
    ]);
    const served = await get('/api/posters/disney.png');
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.rawPayload).toEqual(PNG);
    expect(
      (await call({ method: 'DELETE', url: '/api/posters/disney.png', payload: {} })).statusCode,
    ).toBe(200);
    expect((await get('/api/posters')).json()).toEqual([]);
  });

  it('checks names and content', async () => {
    expect((await put('disney.png', JPEG, 'image/jpeg')).json().error).toMatch(/image\/jpeg/);
    expect((await put('notes.png', Buffer.from('hello'))).statusCode).toBe(400);
    expect((await put('..%2Fstate.png', PNG)).statusCode).toBe(400);
    expect((await put('poster.gif', PNG)).statusCode).toBe(400);
    expect((await get('/api/posters/..%2Fconfig.yaml')).statusCode).toBe(400);
  });

  it('keeps a poster the config uses', async () => {
    await put('disney.png', PNG);
    await h.data.writeConfig({
      ...config,
      categories: [{ ...config.categories[0], poster: 'disney.png' }],
    });
    const res = await call({ method: 'DELETE', url: '/api/posters/disney.png', payload: {} });
    expect(res.statusCode).toBe(409);
  });
});
