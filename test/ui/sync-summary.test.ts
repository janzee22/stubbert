import { describe, expect, it } from 'vitest';
import { sentence, summarize } from '../../src/ui/features/sync/summary.js';
import type { CategoryReport, SyncReport } from '../../src/shared/api.js';

const category = (over: Partial<CategoryReport>): CategoryReport => ({
  categoryId: 'c',
  name: 'C',
  status: 'ok',
  matchedCount: 0,
  add: [],
  remove: [],
  metadata: [],
  ...over,
});

const report = (categories: CategoryReport[]): SyncReport => ({
  applied: false,
  categories,
  warnings: [],
  errors: [],
});

describe('sync summary', () => {
  it('counts changes and names guarded categories', () => {
    const r = report([
      category({ status: 'create', add: [{ id: '1', name: 'A' }] }),
      category({ status: 'update', remove: [{ id: '2', name: 'B' }], poster: 'p.png' }),
      category({ status: 'skipped', name: 'Disney', skipped: 'drops from 10 to 2 items' }),
      category({}),
    ]);
    expect(summarize(r)).toMatchObject({
      changed: 2,
      created: 1,
      added: 1,
      removed: 1,
      posters: 1,
    });
    expect(sentence(r)).toBe(
      'Adds 1 title, removes 1 title, sets 1 poster, makes 1 new collection. Disney is left alone.',
    );
  });

  it('says when only details change', () => {
    const r = report([category({ status: 'update', metadata: [{ field: 'Overview', to: 'x' }] })]);
    expect(sentence(r)).toBe('Updates details only.');
  });
});
