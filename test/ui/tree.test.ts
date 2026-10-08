import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config/validate.js';
import { describeRules } from '../../src/ui/lib/describe.js';
import {
  compactConfig,
  categoryEdited,
  draftChanges,
  newCategory,
  normalizeConfig,
  slug,
} from '../../src/ui/lib/draft.js';
import {
  appendAt,
  findPath,
  flatten,
  getAt,
  indent,
  issuePath,
  move,
  outdent,
  pathFromIssue,
  removeAt,
  type Category,
} from '../../src/ui/lib/tree.js';

const cat = (id: string, children: Category[] = []): Category => ({
  ...newCategory(id.toUpperCase(), new Set()),
  id,
  children,
});
const tree = [cat('a', [cat('a1'), cat('a2', [cat('a2x')])]), cat('b')];
const ids = (cs: Category[]) => flatten(cs).map((n) => `${'  '.repeat(n.depth)}${n.category.id}`);

describe('tree edits', () => {
  it('finds nodes by path and id', () => {
    expect(getAt(tree, [0, 1, 0])?.id).toBe('a2x');
    expect(getAt(tree, [5])).toBeUndefined();
    expect(findPath(tree, 'a2x')).toEqual([0, 1, 0]);
    expect(issuePath([0, 1, 0])).toBe('categories[0].children[1].children[0]');
  });

  it('appends, removes and moves without touching the input', () => {
    const before = JSON.stringify(tree);
    const added = appendAt(tree, [0, 1], cat('new'));
    expect(added.path).toEqual([0, 1, 1]);
    expect(getAt(added.categories, added.path)?.id).toBe('new');
    expect(appendAt(tree, [], cat('root')).path).toEqual([2]);

    expect(ids(removeAt(tree, [0, 0]))).toEqual(['a', '  a2', '    a2x', 'b']);

    const moved = move(tree, [0, 1], -1);
    expect(moved.path).toEqual([0, 0]);
    expect(ids(moved.categories)).toEqual(['a', '  a2', '    a2x', '  a1', 'b']);
    expect(move(tree, [1], 1).path).toEqual([1]);
    expect(JSON.stringify(tree)).toBe(before);
  });

  it('nests a category under its previous sibling and takes it out again', () => {
    const before = JSON.stringify(tree);
    const nested = indent(tree, [1]);
    expect(nested.path).toEqual([0, 2]);
    expect(ids(nested.categories)).toEqual(['a', '  a1', '  a2', '    a2x', '  b']);
    expect(indent(tree, [0]).path).toEqual([0]);

    const out = outdent(tree, [0, 1]);
    expect(out.path).toEqual([1]);
    expect(ids(out.categories)).toEqual(['a', '  a1', 'a2', '  a2x', 'b']);
    expect(outdent(tree, [1]).path).toEqual([1]);
    expect(JSON.stringify(tree)).toBe(before);
  });

  it('turns an issue path back into a tree path', () => {
    expect(pathFromIssue('categories[0].children[1].rules[0].values')).toEqual([0, 1]);
    expect(pathFromIssue('categories[2].name')).toEqual([2]);
    expect(pathFromIssue('schedule.intervalMinutes')).toBeUndefined();
  });
});

describe('draft changes', () => {
  const saved = normalizeConfig({
    categoriesLibraryId: 'lib',
    categories: [
      { id: 'a', name: 'A', rules: [{ type: 'genre', values: ['x'] }] },
      { id: 'b', name: 'B' },
    ],
  });

  it('lists what changed per category and setting', () => {
    const draft = {
      ...saved,
      schedule: { ...saved.schedule, intervalMinutes: 30 },
      categories: [{ ...saved.categories[0]!, name: 'Ay', overview: 'new text' }, cat('c')],
    };
    expect(draftChanges(saved, draft)).toEqual([
      { label: 'Ay', detail: 'name, overview' },
      { label: 'C', detail: 'new' },
      { label: 'B', detail: 'removed' },
      { label: 'Schedule', detail: 'changed' },
    ]);
    expect(draftChanges(saved, saved)).toEqual([]);
  });

  it('marks a category edited by its own fields, not its children', () => {
    const a = saved.categories[0]!;
    expect(categoryEdited(a, a)).toBe(false);
    expect(categoryEdited(a, { ...a, children: [cat('z')] })).toBe(false);
    expect(categoryEdited(a, { ...a, poster: 'a.png' })).toBe(true);
    expect(categoryEdited(undefined, a)).toBe(true);
  });
});

describe('ids', () => {
  it('slugs names and avoids taken ids', () => {
    expect(slug('Walt Disney & Pixar', new Set())).toBe('walt-disney-pixar');
    expect(slug('Pokémon', new Set())).toBe('pokemon');
    expect(slug('Horror', new Set(['horror', 'horror-2']))).toBe('horror-3');
    expect(slug('!!!', new Set())).toBe('category');
  });
});

describe('load and save', () => {
  it('fills defaults, then writes them out again', () => {
    const raw = {
      categoriesLibraryId: 'e679087c0457e175fbaee597d5d107ff',
      categories: [
        {
          id: 'disney',
          name: 'Disney',
          poster: 'disney.jpg',
          rules: [
            { type: 'studio', values: ['Pixar'] },
            { type: 'name', match: 'regex', values: ['^Toy'], negate: true },
          ],
          children: [{ id: 'pixar', name: 'Pixar', mediaTypes: ['Movie'] }],
        },
      ],
    };
    const draft = normalizeConfig(raw);
    expect(draft.schedule).toEqual({
      enabled: true,
      intervalMinutes: 60,
      syncOnStart: false,
      syncOnNewItems: true,
    });
    expect(draft.categories[0]!.rules[0]).toEqual({
      type: 'studio',
      values: ['Pixar'],
      quantifier: 'any',
      negate: false,
    });
    expect(compactConfig(draft)).toEqual({
      ...raw,
      schedule: { enabled: true, intervalMinutes: 60 },
    });
    expect(parseConfig(compactConfig(draft)).ok).toBe(true);
  });

  it('survives a missing or broken config', () => {
    expect(normalizeConfig(null)).toEqual({
      categoriesLibraryId: '',
      schedule: { enabled: true, intervalMinutes: 60, syncOnStart: false, syncOnNewItems: true },
      categories: [],
    });
    expect(
      normalizeConfig({
        categories: [{ id: 'x', name: 'X', rules: [{ type: 'people' }, 'junk'] }, 5],
      }).categories,
    ).toEqual([
      {
        id: 'x',
        name: 'X',
        mediaTypes: ['Movie', 'Series'],
        combine: 'any',
        rules: [],
        children: [],
      },
    ]);
  });

  it('describes rules in one line', () => {
    const c = normalizeConfig({
      categories: [
        {
          id: 'x',
          name: 'X',
          combine: 'all',
          rules: [
            { type: 'genre', values: ['A', 'B', 'C'] },
            { type: 'tag', values: ['kids'], negate: true },
          ],
        },
      ],
    }).categories[0]!;
    expect(describeRules(c)).toBe('genre is A, B +1 and tag is not kids');
    expect(describeRules(cat('empty', [cat('c')]))).toBe('Container only');
  });
});
