import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { CATEGORIES_LIBRARY_ID } from '../fake-jellyfin.js';
import { call, config, get, h, post } from './harness.js';
import { describe, expect, it } from 'vitest';

describe('config', () => {
  it('returns the config and saves a valid one', async () => {
    expect((await get('/api/config')).json()).toMatchObject({
      valid: true,
      config: { categoriesLibraryId: CATEGORIES_LIBRARY_ID },
    });

    const bad = await call({
      method: 'PUT',
      url: '/api/config',
      payload: { ...config, categories: [{ id: 'Bad Id', name: 'x' }] },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().issues[0].path).toBe('categories[0].id');

    const next = {
      ...config,
      schedule: { enabled: true, intervalMinutes: 30 },
      categories: [{ id: 'kids', name: 'Kids', poster: 'kids.png' }],
    };
    const saved = await call({ method: 'PUT', url: '/api/config', payload: next });
    expect(saved.json()).toEqual({
      valid: true,
      issues: [],
      warnings: ['categories[0].poster: "kids.png" is not in the posters folder'],
    });
    expect(parse(await readFile(h.data.configPath, 'utf8'))).toEqual(next);
    const status = (await get('/api/status')).json();
    expect(status.schedule).toEqual({
      enabled: true,
      intervalMinutes: 30,
      syncOnStart: false,
      syncOnNewItems: true,
    });
    expect(new Date(status.nextRunAt).getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
  });

  it('validates without saving', async () => {
    const res = (await post('/api/config/validate', { categoriesLibraryId: 'x' })).json();
    expect(res.valid).toBe(false);
    expect(parse(await readFile(h.data.configPath, 'utf8'))).toEqual(config);
  });
});
