import { CATEGORIES_LIBRARY_ID } from '../fake-jellyfin.js';
import { get, post } from './harness.js';
import { describe, expect, it } from 'vitest';

describe('Jellyfin info', () => {
  it('reports the connection, plugin and preflight', async () => {
    const res = (await get('/api/connection')).json();
    expect(res).toMatchObject({
      jellyfin: { ok: true, version: expect.any(String) },
      apiKey: { ok: true },
      plugin: { installed: true, status: 'Active', categoriesLibraryId: CATEGORIES_LIBRARY_ID },
      preflight: { ok: true },
    });
  });

  it('lists libraries and rule values', async () => {
    const libraries = (await get('/api/libraries')).json();
    expect(libraries.find((l: { pluginLibrary: boolean }) => l.pluginLibrary)).toMatchObject({
      id: CATEGORIES_LIBRARY_ID,
      type: 'boxsets',
    });
    expect((await get('/api/values/studios')).json()).toEqual([
      { name: 'Pixar', movies: 1, series: 0, count: 1 },
      { name: 'Walt Disney Pictures', movies: 1, series: 0, count: 1 },
    ]);
    expect((await get('/api/values/people')).statusCode).toBe(404);
  });
});

describe('rule evaluation', () => {
  it('counts what rules match now, with titles', async () => {
    const res = (
      await post('/api/evaluate', {
        rules: [{ type: 'studio', values: ['pixar', 'Walt Disney Pictures'] }],
      })
    ).json();
    expect(res).toEqual({
      count: 2,
      movies: 2,
      series: 0,
      items: [
        { id: expect.any(String), name: 'Frozen', type: 'Movie' },
        { id: expect.any(String), name: 'Toy Story', type: 'Movie' },
      ],
    });
    expect(
      (
        await post('/api/evaluate', {
          rules: [{ type: 'genre', values: ['Horror'], negate: true }],
          mediaTypes: ['Movie'],
        })
      ).json().count,
    ).toBe(2);
  });

  it('reports invalid rules', async () => {
    expect(
      (await post('/api/evaluate', { rules: [{ type: 'name', match: 'regex', values: ['('] }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post('/api/evaluate', { rules: [{ type: 'people', values: ['x'] }] })).json(),
    ).toMatchObject({ code: 'config' });
  });
});
