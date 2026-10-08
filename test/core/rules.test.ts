import { describe, expect, it } from 'vitest';
import { ruleSchema, type Category } from '../../src/config/schema.js';
import { evaluateCategory, type MediaItem } from '../../src/core/rules.js';

const item = (id: string, over: Partial<MediaItem> = {}): MediaItem => ({
  id,
  type: 'Movie',
  name: id,
  genres: [],
  studios: [],
  tags: [],
  ...over,
});

const items: MediaItem[] = [
  item('frozen', {
    name: 'Frozen',
    genres: ['Animation', 'Family'],
    studios: ['Walt Disney Pictures'],
  }),
  item('toy-story', {
    name: 'Toy Story 2',
    genres: ['Animation'],
    studios: ['Pixar', 'Walt Disney Pictures'],
  }),
  item('amelie', {
    name: 'Amélie',
    originalTitle: "Le Fabuleux Destin d'Amélie Poulain",
    genres: ['Comedy', 'Romance'],
    tags: ['paris'],
  }),
  item('dark', {
    type: 'Series',
    name: 'Dark',
    genres: ['Drama', 'Mystery'],
    studios: ['Netflix'],
  }),
  item('halloween', { name: 'Halloween', genres: ['horror'] }),
];

function match(rules: unknown[], extra: Partial<Pick<Category, 'combine' | 'mediaTypes'>> = {}) {
  return evaluateCategory(
    {
      rules: rules.map((r) => ruleSchema.parse(r)),
      combine: 'any',
      mediaTypes: ['Movie', 'Series'],
      ...extra,
    },
    items,
  );
}

describe('rules', () => {
  it('a category without rules matches nothing', () => {
    expect(match([])).toEqual([]);
  });

  it('genre and studio match exactly and case-insensitively', () => {
    expect(match([{ type: 'genre', values: ['HORROR'] }])).toEqual(['halloween']);
    expect(match([{ type: 'genre', values: ['Anim'] }])).toEqual([]);
    expect(match([{ type: 'studio', values: ['walt disney pictures'] }])).toEqual([
      'frozen',
      'toy-story',
    ]);
  });

  it('quantifier any vs all', () => {
    expect(match([{ type: 'genre', values: ['Animation', 'Family'], quantifier: 'any' }])).toEqual([
      'frozen',
      'toy-story',
    ]);
    expect(match([{ type: 'genre', values: ['Animation', 'Family'], quantifier: 'all' }])).toEqual([
      'frozen',
    ]);
    expect(
      match([{ type: 'studio', values: ['Pixar', 'Walt Disney Pictures'], quantifier: 'all' }]),
    ).toEqual(['toy-story']);
  });

  it('negate inverts a rule', () => {
    expect(match([{ type: 'genre', values: ['Animation'], negate: true }])).toEqual([
      'amelie',
      'dark',
      'halloween',
    ]);
    expect(
      match([{ type: 'genre', values: ['Animation', 'Family'], quantifier: 'all', negate: true }]),
    ).toEqual(['toy-story', 'amelie', 'dark', 'halloween']);
  });

  it('combine any vs all', () => {
    const rules = [
      { type: 'studio', values: ['Walt Disney Pictures'] },
      { type: 'genre', values: ['Family'] },
    ];
    expect(match(rules, { combine: 'any' })).toEqual(['frozen', 'toy-story']);
    expect(match(rules, { combine: 'all' })).toEqual(['frozen']);
    expect(
      match(
        [
          { type: 'studio', values: ['Pixar'] },
          { type: 'genre', values: ['Animation'], negate: true },
        ],
        { combine: 'all' },
      ),
    ).toEqual([]);
  });

  it('mediaTypes filters before the rules', () => {
    expect(match([{ type: 'genre', values: ['Drama'] }], { mediaTypes: ['Movie'] })).toEqual([]);
    expect(match([{ type: 'genre', values: ['Drama'] }], { mediaTypes: ['Series'] })).toEqual([
      'dark',
    ]);
  });

  it('tags', () => {
    expect(match([{ type: 'tag', values: ['Paris'] }])).toEqual(['amelie']);
  });

  it('name: contains, exact and regex, on name and original title', () => {
    expect(match([{ type: 'name', values: ['toy story'] }])).toEqual(['toy-story']);
    expect(match([{ type: 'name', match: 'exact', values: ['toy story'] }])).toEqual([]);
    expect(match([{ type: 'name', match: 'exact', values: ['frozen'] }])).toEqual(['frozen']);
    expect(match([{ type: 'name', values: ['fabuleux destin'] }])).toEqual(['amelie']);
    expect(match([{ type: 'name', match: 'regex', values: ['^toy story \\d+$'] }])).toEqual([
      'toy-story',
    ]);
    expect(match([{ type: 'name', match: 'regex', values: ['^Am.lie$'] }])).toEqual(['amelie']);
  });

  it('name: caseSensitive', () => {
    expect(match([{ type: 'name', values: ['frozen'], caseSensitive: true }])).toEqual([]);
    expect(match([{ type: 'name', values: ['Frozen'], caseSensitive: true }])).toEqual(['frozen']);
    expect(
      match([{ type: 'name', match: 'regex', values: ['^dark$'], caseSensitive: true }]),
    ).toEqual([]);
  });

  it('name: quantifier all needs every value to match (either title)', () => {
    expect(match([{ type: 'name', values: ['Amélie', 'Poulain'], quantifier: 'all' }])).toEqual([
      'amelie',
    ]);
    expect(match([{ type: 'name', values: ['Toy', 'Frozen'], quantifier: 'all' }])).toEqual([]);
  });

  it('handles missing fields', () => {
    expect(
      evaluateCategory(
        {
          rules: [ruleSchema.parse({ type: 'name', values: ['x'] })],
          combine: 'any',
          mediaTypes: ['Movie'],
        },
        [item('x')],
      ),
    ).toEqual(['x']);
  });
});
