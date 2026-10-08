import { CATEGORIES_LIBRARY_ID } from '../fake-jellyfin.js';
import { get, h, post } from './harness.js';
import { beforeEach, describe, expect, it } from 'vitest';

describe('setup', () => {
  beforeEach(() => {
    h.fake.categoriesLibrary = false;
    h.fake.categoriesFolder = false;
    h.fake.pluginConfig = {};
  });

  it('only reports without apply, then creates folder and library and configures the plugin', async () => {
    const planned = await post('/api/setup', {});
    expect(planned.json()).toEqual({
      libraryId: null,
      folder: '/media/categories',
      steps: [
        { status: 'ok', text: expect.stringContaining('Stubbert') },
        { status: 'plan', text: "Create folder /media/categories (in Jellyfin's data folder)" },
        {
          status: 'plan',
          text: 'Create library "Categories" of type boxsets at /media/categories',
        },
        { status: 'plan', text: 'Point the plugin at library "Categories"' },
      ],
    });
    expect(h.fake.writes()).toEqual([]);

    const applied = (await post('/api/setup', { apply: true })).json();
    expect(applied.libraryId).toBe(CATEGORIES_LIBRARY_ID);
    expect(applied.steps.every((s: { status: string }) => s.status === 'ok')).toBe(true);
    expect(h.fake.pluginConfig.CategoriesLibraryId).toBe(CATEGORIES_LIBRARY_ID);
    expect((await get('/api/connection')).json().preflight).toEqual({ ok: true });

    const writes = h.fake.writes().length;
    const again = (await post('/api/setup', { apply: true })).json();
    expect(again.steps.every((s: { status: string }) => s.status === 'ok')).toBe(true);
    expect(h.fake.writes()).toHaveLength(writes);
  });

  it('turns off remote fetchers on an existing library', async () => {
    h.fake.categoriesLibrary = true;
    h.fake.boxSetFetchers = ['TheMovieDb'];
    const planned = (await post('/api/setup', {})).json();
    expect(planned.steps.map((s: { status: string }) => s.status)).toEqual([
      'ok',
      'ok',
      'plan',
      'plan',
    ]);
    await post('/api/setup', { apply: true });
    expect(h.fake.boxSetFetchers).toEqual([]);
  });

  it('uses a folder that is given, and never creates it', async () => {
    h.fake.categoriesFolder = true;
    const planned = (await post('/api/setup', { path: '/media/categories' })).json();
    expect(planned.steps.some((s: { text: string }) => s.text.startsWith('Create folder'))).toBe(
      false,
    );
    expect(planned.folder).toBe('/media/categories');
    expect(
      (await post('/api/setup', { path: '/media/categories', apply: true })).json().libraryId,
    ).toBe(CATEGORIES_LIBRARY_ID);
    expect(h.fake.writes().some((r) => r.path === '/CategoryCollections/Folder')).toBe(false);
  });

  it('says so when Jellyfin accepts the library but does not store it', async () => {
    h.fake.dropNewLibraries = true;
    expect((await post('/api/setup', { apply: true })).json()).toMatchObject({
      code: 'setup',
      error: expect.stringContaining('check the Jellyfin log'),
    });
  });

  it('explains what is missing', async () => {
    h.fake.folderEndpoint = false;
    h.fake.categoriesFolder = false;
    expect((await post('/api/setup', {})).json()).toMatchObject({
      code: 'setup',
      error: expect.stringContaining('older than 0.2'),
    });
    h.fake.pluginInstalled = false;
    expect((await post('/api/setup', { path: '/media/categories' })).json()).toMatchObject({
      code: 'setup',
      error: expect.stringContaining('not installed'),
    });
    expect(h.fake.writes()).toEqual([]);
  });
});
