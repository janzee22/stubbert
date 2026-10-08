import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../../src/config/schema.js';
import { parseConfig } from '../../src/config/validate.js';
import { isEmpty, type SyncState } from '../../src/core/planner.js';
import { JellyfinClient } from '../../src/jellyfin/client.js';
import { JellyfinHttp } from '../../src/jellyfin/http.js';
import { sync, type SyncDeps } from '../../src/sync/engine.js';
import { PreflightError } from '../../src/sync/preflight.js';
import { CATEGORIES_LIBRARY_ID, FakeJellyfin } from '../fake-jellyfin.js';

let fake: FakeJellyfin;
let state: SyncState;
let posters: Map<string, Uint8Array>;

function config(categories: unknown[]): Config {
  const res = parseConfig({ categoriesLibraryId: CATEGORIES_LIBRARY_ID, categories });
  if (!res.ok) throw new Error(JSON.stringify(res.issues));
  return res.config;
}

function deps(): SyncDeps {
  const client = new JellyfinClient(new JellyfinHttp(fake.url, 'test-key'), {
    attempts: 3,
    baseDelayMs: 0,
  });
  return {
    client,
    readPoster: async (file) => {
      const bytes = posters.get(file);
      if (!bytes) throw new Error(`no poster ${file}`);
      return bytes;
    },
    loadState: async () => structuredClone(state),
    saveState: async (s) => {
      state = structuredClone(s);
    },
  };
}

const run = (cfg: Config, apply: boolean, force = false) => sync(cfg, deps(), { apply, force });
const byName = (name: string) => fake.categories().find((c) => c.Name === name)!;
const names = (ids: string[]) => ids.map((i) => fake.items.get(i)!.Name).toSorted();

const disneyTree = [
  {
    id: 'disney',
    name: 'Disney',
    sortName: '01 Disney',
    poster: 'disney.png',
    rules: [{ type: 'studio', values: ['walt disney pictures'] }],
    children: [{ id: 'pixar', name: 'Pixar', rules: [{ type: 'studio', values: ['Pixar'] }] }],
  },
  {
    id: 'horror',
    name: 'Horror',
    mediaTypes: ['Movie'],
    rules: [{ type: 'genre', values: ['Horror'] }],
  },
];

beforeEach(async () => {
  fake = new FakeJellyfin();
  fake.addMedia('Movie', 'Frozen', { studios: ['Walt Disney Pictures'], Genres: ['Animation'] });
  fake.addMedia('Movie', 'Moana', { studios: ['Walt Disney Pictures'] });
  fake.addMedia('Movie', 'Toy Story', { studios: ['Pixar'], Genres: ['Animation'] });
  fake.addMedia('Movie', 'Halloween', { Genres: ['Horror'] });
  fake.addMedia('Series', 'Stranger Things', { Genres: ['Horror'] });
  await fake.start();
  state = {};
  posters = new Map([['disney.png', new Uint8Array([137, 80, 78, 71, 1, 2, 3])]]);
});

afterEach(async () => {
  expect(fake.violations).toEqual([]);
  await fake.stop();
});

describe('sync against the fake Jellyfin', () => {
  it('dry run writes nothing', async () => {
    const result = await run(config(disneyTree), false);
    expect(result.applied).toBe(false);
    expect(fake.writes()).toEqual([]);
    expect(result.plan.categories.map((p) => [p.categoryId, p.create, p.matchedCount])).toEqual([
      ['pixar', true, 1],
      ['disney', true, 2],
      ['horror', true, 1],
    ]);
    expect(state).toEqual({});
  });

  it('creates the tree, then a second run changes nothing', async () => {
    const cfg = config(disneyTree);
    const first = await run(cfg, true);
    expect(first.errors).toEqual([]);

    const disney = byName('Disney');
    const pixar = byName('Pixar');
    expect(names(disney.members)).toEqual(['Frozen', 'Moana', 'Pixar']);
    expect(names(pixar.members)).toEqual(['Toy Story']);
    expect(names(byName('Horror').members)).toEqual(['Halloween']);
    expect(disney.ForcedSortName).toBe('01 Disney');
    expect(disney.image).toEqual(Buffer.from(posters.get('disney.png')!));
    expect(state.disney).toEqual({ boxSetId: disney.Id, posterHash: expect.any(String) });

    expect(fake.refreshes()).toEqual([CATEGORIES_LIBRARY_ID]);
    expect(fake.writes().at(-1)!.path).toBe(`/Items/${CATEGORIES_LIBRARY_ID}/Refresh`);

    const writes = fake.writes().length;
    const second = await run(cfg, true);
    expect(isEmpty(second.plan)).toBe(true);
    expect(fake.writes().length).toBe(writes);
  });

  it('refreshes after a member change, and only warns when the refresh fails', async () => {
    const cfg = config(disneyTree);
    await run(cfg, true);
    fake.addMedia('Movie', 'Encanto', { studios: ['Walt Disney Pictures'] });
    fake.failNext('POST', /\/Refresh$/, 500, 3);
    const result = await run(cfg, true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining('Refreshing the Categories library failed'),
    ]);
    expect(names(byName('Disney').members)).toContain('Encanto');
  });

  it('never writes to media items and never changes LockData', async () => {
    await run(config(disneyTree), true);
    const mediaIds = new Set(
      [...fake.items.values()].filter((i) => i.Type !== 'BoxSet').map((i) => i.Id),
    );
    for (const w of fake.writes()) {
      const target = /^\/Items\/([^/]+)/.exec(w.path)?.[1];
      expect(target && mediaIds.has(target)).toBeFalsy();
    }
  });

  it('removes members added by hand and restores drifted metadata', async () => {
    const cfg = config(disneyTree);
    await run(cfg, true);
    const disney = byName('Disney');
    const halloween = [...fake.items.values()].find((i) => i.Name === 'Halloween')!;
    disney.members.push(halloween.Id);
    disney.Overview = 'edited in jellyfin-web';

    const result = await run(cfg, true);
    const plan = result.plan.categories.find((p) => p.categoryId === 'disney')!;
    expect(plan.removeMemberIds).toEqual([halloween.Id]);
    expect(plan.metadata).toEqual([
      { field: 'Overview', from: 'edited in jellyfin-web', to: undefined },
    ]);
    expect(names(disney.members)).toEqual(['Frozen', 'Moana', 'Pixar']);
    expect(disney.Overview).toBeNull();
  });

  it('adopts existing collections by name when the state file is lost', async () => {
    const cfg = config(disneyTree);
    await run(cfg, true);
    const before = fake.categories().length;
    state = {};

    const result = await run(cfg, true);
    expect(fake.categories().length).toBe(before);
    expect(result.plan.categories.every((p) => !p.create)).toBe(true);
    expect(result.plan.categories.find((p) => p.categoryId === 'disney')!.adopted).toBe(true);
    expect(state.disney!.boxSetId).toBe(byName('Disney').Id);
    expect(isEmpty((await run(cfg, false)).plan)).toBe(true);
  });

  it('adopts a category that differs only in case and renames it', async () => {
    fake.addCategory('disney');
    const result = await run(config(disneyTree), true);
    expect(result.errors).toEqual([]);
    expect(fake.categories().filter((c) => c.Name.toLowerCase() === 'disney')).toHaveLength(1);
    expect(byName('Disney')).toBeDefined();
  });

  it('ignores collections outside the Categories library', async () => {
    const other = fake.addCollection('Disney');
    await run(config(disneyTree), true);
    expect(byName('Disney').Id).not.toBe(other.Id);
    expect(other.members).toEqual([]);
  });

  it('skips a category whose matches drop by more than half, unless forced', async () => {
    await run(config(disneyTree), true);
    for (const i of fake.items.values()) {
      if (i.Name === 'Frozen' || i.Name === 'Moana') i.Studios = [];
    }
    fake.addMedia('Movie', 'Encanto', { studios: ['Walt Disney Pictures'] });
    const half = await run(config(disneyTree), false);
    expect(half.plan.warnings).toEqual([]);

    for (const i of fake.items.values()) if (i.Name === 'Encanto') i.Studios = [];
    const cfg = config(disneyTree);
    const guarded = await run(cfg, true);
    const disney = guarded.plan.categories.find((p) => p.categoryId === 'disney')!;
    expect(disney.skipped).toMatch(/matches 0 items/);
    expect(guarded.plan.warnings).toHaveLength(1);
    expect(names(byName('Disney').members)).toEqual(['Frozen', 'Moana', 'Pixar']);

    await run(cfg, true, true);
    expect(names(byName('Disney').members)).toEqual(['Pixar']);
  });

  it('aborts before writing when the item fetch is incomplete', async () => {
    fake.totalRecordSkew = 1;
    await expect(run(config(disneyTree), true)).rejects.toThrow(/Fetched 5 of 6 items/);
    expect(fake.writes()).toEqual([]);
  });

  it('pages through large libraries and chunks member changes', async () => {
    for (let i = 0; i < 1234; i++) {
      fake.addMedia('Movie', `Filler ${String(i).padStart(4, '0')}`, { Tags: ['filler'] });
    }
    await run(
      config([{ id: 'filler', name: 'Filler', rules: [{ type: 'tag', values: ['FILLER'] }] }]),
      true,
    );
    expect(byName('Filler').members).toHaveLength(1234);
    expect(
      fake.requests.filter(
        (r) => r.method === 'GET' && r.path === '/Items' && !r.query.has('parentId'),
      ),
    ).toHaveLength(3);
    expect(
      fake.requests.filter((r) => r.method === 'POST' && r.path.startsWith('/Collections/')),
    ).toHaveLength(13);
  });

  it('re-uploads the poster only when the file changes', async () => {
    const cfg = config(disneyTree);
    await run(cfg, true);
    const uploads = () => fake.requests.filter((r) => r.path.includes('/Images/')).length;
    expect(uploads()).toBe(1);
    await run(cfg, true);
    expect(uploads()).toBe(1);
    posters.set('disney.png', new Uint8Array([137, 80, 78, 71, 9, 9]));
    await run(cfg, true);
    expect(uploads()).toBe(2);
    expect(byName('Disney').image).toEqual(Buffer.from([137, 80, 78, 71, 9, 9]));
  });

  it('retries transient errors on reads and idempotent writes', async () => {
    fake.failNext('GET', /^\/Items$/, 503, 2);
    fake.failNext('POST', /^\/Collections\/.+\/Items$/, 502, 1);
    const result = await run(config(disneyTree), true);
    expect(result.errors).toEqual([]);
    expect(names(byName('Pixar').members)).toEqual(['Toy Story']);
  });

  it('does not retry a create that may have been processed', async () => {
    fake.failNext('POST', /^\/CategoryCollections$/, 500, 1);
    const result = await run(
      config([{ id: 'horror', name: 'Horror', rules: [{ type: 'genre', values: ['Horror'] }] }]),
      true,
    );
    expect(result.errors).toEqual([expect.stringMatching(/Create "Horror".*HTTP 500/)]);
    expect(
      fake.requests.filter((r) => r.method === 'POST' && r.path === '/CategoryCollections'),
    ).toHaveLength(1);
    expect(state).toEqual({});
  });

  it('continues with other categories when one fails, and a parent still gets its existing children', async () => {
    fake.failNext('POST', /^\/Items\/[^/]+\/Images\/Primary$/, 400, 1);
    const result = await run(config(disneyTree), true);
    expect(result.errors).toEqual([expect.stringMatching(/"Disney".*HTTP 400/)]);
    expect(names(byName('Horror').members)).toEqual(['Halloween']);
    const retry = await run(config(disneyTree), true);
    expect(retry.errors).toEqual([]);
    expect(names(byName('Disney').members)).toEqual(['Frozen', 'Moana', 'Pixar']);
  });
});

describe('the fake itself', () => {
  it('flags requests and parameters that are not in the spec', async () => {
    const http = new JellyfinHttp(fake.url, 'test-key');
    await http.request('GET', '/Collections/abc/Members');
    await http.request('GET', '/Items', {
      query: { includeItemTypes: ['Film'], parentID: 'x', noSuchParam: 1 },
    });
    await http.request('POST', '/Collections/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Items');
    expect(fake.violations).toEqual([
      'GET /Collections/abc/Members is not in the spec',
      'GET /Items: includeItemTypes: "Film" is not one of the enum values',
      'GET /Items: parentID: "x" is not a uuid',
      'GET /Items: query parameter "noSuchParam" is not in the spec',
      'POST /Collections/{collectionId}/Items: required query parameter "ids" missing',
    ]);
    fake.violations.length = 0;
  });
});

describe('preflight', () => {
  it('refuses without the plugin', async () => {
    fake.pluginInstalled = false;
    await expect(run(config(disneyTree), false)).rejects.toThrow(PreflightError);
  });

  it('refuses when the plugin points at another library', async () => {
    fake.pluginConfig = { CategoriesLibraryId: 'f137a2dd21bbc1b99aa5c0f6bf02a805' };
    await expect(run(config(disneyTree), false)).rejects.toThrow(
      /plugin is configured for library/,
    );
  });

  it('refuses when the Categories library fetches remote metadata', async () => {
    fake.boxSetFetchers = ['TheMovieDb'];
    await expect(run(config(disneyTree), false)).rejects.toThrow(/fetches remote metadata/);
  });
});
