import { describe, expect, it } from 'vitest';
import {
  guard,
  isEmpty,
  plan,
  resolveCollections,
  type CurrentCollection,
  type DesiredCategory,
  type Resolution,
  type SyncState,
} from '../../src/core/planner.js';

const desired = (id: string, over: Partial<DesiredCategory> = {}): DesiredCategory => ({
  id,
  name: id.toUpperCase(),
  itemIds: [],
  childIds: [],
  ...over,
});
const current = (boxSetId: string, over: Partial<CurrentCollection> = {}): CurrentCollection => ({
  boxSetId,
  name: '',
  memberIds: [],
  hasPrimaryImage: false,
  ...over,
});

function run(
  categories: DesiredCategory[],
  collections: CurrentCollection[],
  state: SyncState = {},
  force = false,
) {
  const resolutions = new Map<string, Resolution>();
  for (const c of categories) {
    const entry = state[c.id];
    if (entry) resolutions.set(c.id, { boxSetId: entry.boxSetId, adopted: false });
  }
  return plan({
    categories,
    resolutions,
    current: new Map(collections.map((c) => [c.boxSetId, c])),
    state,
    force,
  });
}

describe('resolveCollections', () => {
  const existing = [
    { id: 'b1', name: 'Disney' },
    { id: 'b2', name: 'Horror' },
  ];

  it('uses the state when its collection still exists', () => {
    const r = resolveCollections(
      [{ id: 'disney', name: 'Something else' }],
      { disney: { boxSetId: 'b1' } },
      existing,
    );
    expect(r.get('disney')).toEqual({ boxSetId: 'b1', adopted: false });
  });

  it('adopts by name (case-insensitive) when the state is missing or stale', () => {
    const r = resolveCollections(
      [
        { id: 'disney', name: 'disney' },
        { id: 'horror', name: 'Horror' },
      ],
      { horror: { boxSetId: 'gone' } },
      existing,
    );
    expect(r.get('disney')).toEqual({ boxSetId: 'b1', adopted: true });
    expect(r.get('horror')).toEqual({ boxSetId: 'b2', adopted: true });
  });

  it('never gives one collection to two categories', () => {
    const r = resolveCollections(
      [
        { id: 'new', name: 'Disney' },
        { id: 'old', name: 'Renamed' },
      ],
      { old: { boxSetId: 'b1' } },
      existing,
    );
    expect(r.get('old')?.boxSetId).toBe('b1');
    expect(r.has('new')).toBe(false);
  });
});

describe('plan', () => {
  it('creates new categories with their items, children by reference', () => {
    const p = run(
      [
        desired('child', { itemIds: ['m1'] }),
        desired('parent', { itemIds: ['m2'], childIds: ['child'], sortName: '01', overview: 'o' }),
      ],
      [],
    );
    expect(
      p.categories.map((c) => ({
        id: c.categoryId,
        create: c.create,
        add: c.addItemIds,
        children: c.addChildCategoryIds,
      })),
    ).toEqual([
      { id: 'child', create: true, add: ['m1'], children: [] },
      { id: 'parent', create: true, add: ['m2'], children: ['child'] },
    ]);
    expect(p.categories[1]!.metadata).toEqual([
      { field: 'ForcedSortName', from: undefined, to: '01' },
      { field: 'Overview', from: undefined, to: 'o' },
    ]);
  });

  it('is empty when everything matches (idempotent)', () => {
    const state = { child: { boxSetId: 'bc' }, parent: { boxSetId: 'bp', posterHash: 'h' } };
    const p = run(
      [
        desired('child', { itemIds: ['m1'] }),
        desired('parent', {
          itemIds: ['m2'],
          childIds: ['child'],
          poster: { file: 'p.png', hash: 'h' },
        }),
      ],
      [
        current('bc', { name: 'CHILD', memberIds: ['m1'] }),
        current('bp', { name: 'PARENT', memberIds: ['m2', 'bc'], hasPrimaryImage: true }),
      ],
      state,
    );
    expect(isEmpty(p)).toBe(true);
  });

  it('removes extra members but keeps child collections', () => {
    const p = run(
      [desired('child'), desired('parent', { itemIds: ['m1', 'm2'], childIds: ['child'] })],
      [
        current('bc', { name: 'CHILD' }),
        current('bp', { name: 'PARENT', memberIds: ['m1', 'm2', 'bc', 'x1', 'x2'] }),
      ],
      { child: { boxSetId: 'bc' }, parent: { boxSetId: 'bp' } },
    );
    expect(p.categories[1]!.removeMemberIds).toEqual(['x1', 'x2']);
    expect(p.categories[1]!.addChildCategoryIds).toEqual([]);
  });

  it('removes a child collection that is no longer a child', () => {
    const p = run(
      [desired('child'), desired('parent', { itemIds: ['m1'] })],
      [
        current('bc', { name: 'CHILD' }),
        current('bp', { name: 'PARENT', memberIds: ['m1', 'bc'] }),
      ],
      { child: { boxSetId: 'bc' }, parent: { boxSetId: 'bp' } },
    );
    expect(p.categories[1]!.removeMemberIds).toEqual(['bc']);
  });

  it('restores drifted metadata and clears fields removed from the config', () => {
    const p = run(
      [desired('a', { name: 'A' })],
      [current('b', { name: 'A (edited)', forcedSortName: 'zz', overview: '  ' })],
      { a: { boxSetId: 'b' } },
    );
    expect(p.categories[0]!.metadata).toEqual([
      { field: 'Name', from: 'A (edited)', to: 'A' },
      { field: 'ForcedSortName', from: 'zz', to: undefined },
    ]);
  });

  it('uploads a poster when the hash changes, the image is missing, or the collection was adopted', () => {
    const poster = { file: 'a.png', hash: 'new' };
    const base = [desired('a', { poster })];
    expect(
      run(base, [current('b', { name: 'A', hasPrimaryImage: true })], {
        a: { boxSetId: 'b', posterHash: 'new' },
      }).categories[0]!.poster,
    ).toBeUndefined();
    expect(
      run(base, [current('b', { name: 'A', hasPrimaryImage: true })], {
        a: { boxSetId: 'b', posterHash: 'old' },
      }).categories[0]!.poster,
    ).toEqual(poster);
    expect(
      run(base, [current('b', { name: 'A', hasPrimaryImage: false })], {
        a: { boxSetId: 'b', posterHash: 'new' },
      }).categories[0]!.poster,
    ).toEqual(poster);
    const adopted = plan({
      categories: base,
      resolutions: new Map([['a', { boxSetId: 'b', adopted: true }]]),
      current: new Map([['b', current('b', { name: 'A', hasPrimaryImage: true })]]),
      state: { a: { boxSetId: 'b', posterHash: 'new' } },
    });
    expect(adopted.categories[0]!.poster).toEqual(poster);
  });

  it('never removes a poster when the config has none', () => {
    const p = run([desired('a')], [current('b', { name: 'A', hasPrimaryImage: true })], {
      a: { boxSetId: 'b' },
    });
    expect(p.categories[0]!.poster).toBeUndefined();
  });

  describe('guards', () => {
    const existing = [current('b', { name: 'A', memberIds: ['m1', 'm2', 'm3', 'm4'] })];
    const state = { a: { boxSetId: 'b' } };

    it('skips a category that drops to 0', () => {
      const p = run([desired('a')], existing, state);
      expect(p.categories[0]!.skipped).toBe('matches 0 items (had 4)');
      expect(p.categories[0]!.removeMemberIds).toEqual([]);
      expect(p.warnings).toHaveLength(1);
    });

    it('skips a drop of more than 50%, not of exactly 50%', () => {
      expect(
        run([desired('a', { itemIds: ['m1'] })], existing, state).categories[0]!.skipped,
      ).toMatch(/4 to 1/);
      expect(
        run([desired('a', { itemIds: ['m1', 'm2'] })], existing, state).categories[0]!.skipped,
      ).toBeUndefined();
    });

    it('--force applies anyway', () => {
      const p = run([desired('a')], existing, state, true);
      expect(p.categories[0]!.removeMemberIds).toEqual(['m1', 'm2', 'm3', 'm4']);
      expect(p.warnings).toEqual([]);
    });

    it('does not count child collections as items', () => {
      const p = run(
        [desired('c'), desired('a', { childIds: ['c'] })],
        [current('bc', { name: 'C' }), current('b', { name: 'A', memberIds: ['bc'] })],
        { c: { boxSetId: 'bc' }, a: { boxSetId: 'b' } },
      );
      expect(isEmpty(p)).toBe(true);
    });

    it('does not warn when nothing would change', () => {
      const p = run([desired('a')], [current('b', { name: 'A' })], state);
      expect(p.warnings).toEqual([]);
    });

    it('guard()', () => {
      expect(guard(0, 0)).toBeUndefined();
      expect(guard(10, 6)).toBeUndefined();
      expect(guard(10, 4)).toMatch(/10 to 4/);
    });
  });
});
