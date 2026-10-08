import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SyncReport } from '../../src/sync/report.js';
import { finalStatus, RunStore, summarize, type RunRecord } from '../../src/sync/run-store.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stubbert-runs-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const report: SyncReport = {
  applied: true,
  categories: [
    {
      categoryId: 'a',
      name: 'A',
      status: 'create',
      matchedCount: 2,
      add: [
        { id: '1', name: 'x' },
        { id: '2', name: 'y' },
      ],
      remove: [],
      metadata: [],
    },
    {
      categoryId: 'b',
      name: 'B',
      status: 'ok',
      matchedCount: 1,
      add: [],
      remove: [],
      metadata: [],
    },
    {
      categoryId: 'c',
      name: 'C',
      status: 'skipped',
      matchedCount: 0,
      add: [],
      remove: [],
      metadata: [],
      skipped: 'matches 0 items (had 4)',
    },
  ],
  warnings: ['guard'],
  errors: [],
};

describe('RunStore', () => {
  it('keeps the newest N runs, newest first', async () => {
    const store = new RunStore(dir, 3);
    for (let i = 0; i < 5; i++) {
      const run: RunRecord = {
        id: store.newId(new Date(Date.UTC(2026, 8, 29, 10, i))),
        trigger: 'manual',
        force: false,
        startedAt: '',
        status: 'ok',
        log: [],
      };
      await store.save(run);
    }
    const ids = (await store.list()).map((r) => r.id.slice(0, 16));
    expect(ids).toEqual(['20260929T100400Z', '20260929T100300Z', '20260929T100200Z']);
    expect((await readdir(dir)).length).toBe(3);
  });

  it('only reads run ids, never other paths', async () => {
    const store = new RunStore(dir);
    expect(await store.get('../state')).toBeUndefined();
    expect(await store.get('20260929T100000Z-abcdef/../../x')).toBeUndefined();
  });
});

describe('summaries', () => {
  it('counts changes, warnings and errors', () => {
    const run: RunRecord = {
      id: 'x',
      trigger: 'manual',
      force: false,
      startedAt: '',
      status: finalStatus(report, undefined),
      log: ['a'],
      report,
    };
    expect(run.status).toBe('warnings');
    expect(summarize(run)).toMatchObject({
      status: 'warnings',
      totals: { categories: 3, changed: 1, created: 1, added: 2, removed: 0, skipped: 1 },
      warnings: 1,
      errors: 0,
    });
    expect(summarize(run)).not.toHaveProperty('log');
    expect(finalStatus(undefined, 'preflight failed')).toBe('failed');
    expect(finalStatus({ ...report, errors: ['x'] }, undefined)).toBe('failed');
  });
});
