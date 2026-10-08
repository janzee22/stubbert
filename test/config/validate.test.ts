import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config/validate.js';

const LIB = 'e679087c0457e175fbaee597d5d107ff';
const issues = (raw: unknown) => {
  const res = parseConfig(raw);
  return res.ok ? [] : res.issues.map((i) => `${i.path}: ${i.message}`);
};

describe('parseConfig', () => {
  it('fills defaults', () => {
    const res = parseConfig({
      categoriesLibraryId: LIB,
      categories: [{ id: 'a', name: 'A', rules: [{ type: 'genre', values: ['Horror'] }] }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config.schedule).toEqual({
      enabled: true,
      intervalMinutes: 60,
      syncOnStart: false,
      syncOnNewItems: true,
    });
    expect(res.config.categories[0]).toEqual({
      id: 'a',
      name: 'A',
      mediaTypes: ['Movie', 'Series'],
      combine: 'any',
      rules: [{ type: 'genre', values: ['Horror'], quantifier: 'any', negate: false }],
      children: [],
    });
  });

  it('parses the documented example', () => {
    const yaml = `
categoriesLibraryId: ${LIB}
schedule: { intervalMinutes: 60 }
categories:
  - id: disney
    name: Disney
    sortName: "01 Disney"
    overview: "..."
    poster: disney.jpg
    mediaTypes: [Movie, Series]
    combine: any
    rules:
      - type: studio
        values: ["Walt Disney Pictures", "Pixar"]
        quantifier: any
        negate: false
      - type: genre
        values: ["Animation", "Family"]
        quantifier: all
      - type: name
        match: contains
        values: ["Toy Story"]
        caseSensitive: false
    children: []
`;
    expect(issues(parse(yaml))).toEqual([]);
  });

  it('rejects unknown keys, bad ids and poster paths', () => {
    expect(issues({ categoriesLibraryId: LIB, rootParent: { mode: 'library' } })).toEqual([
      expect.stringMatching(/Unrecognized key.*rootParent/),
    ]);
    expect(issues({ categoriesLibraryId: LIB, categories: [{ id: 'Bad Id', name: 'x' }] })).toEqual(
      [expect.stringMatching(/^categories\[0\]\.id:/)],
    );
    expect(
      issues({
        categoriesLibraryId: LIB,
        categories: [{ id: 'a', name: 'A', poster: '../etc/passwd.png' }],
      }),
    ).toEqual([expect.stringMatching(/^categories\[0\]\.poster:/)]);
    expect(issues({ categoriesLibraryId: 'not-an-id' })).toEqual([
      expect.stringMatching(/^categoriesLibraryId:/),
    ]);
  });

  it('rejects duplicate ids anywhere in the tree', () => {
    const raw = {
      categoriesLibraryId: LIB,
      categories: [{ id: 'a', name: 'A', children: [{ id: 'a', name: 'B' }] }],
    };
    expect(issues(raw)).toEqual([
      'categories[0].children[0].id: duplicate id "a" (also at categories[0])',
    ]);
  });

  it('rejects duplicate names case-insensitively, across the whole tree', () => {
    const raw = {
      categoriesLibraryId: LIB,
      categories: [
        { id: 'a', name: 'Horror' },
        { id: 'b', name: 'X', children: [{ id: 'c', name: 'horror' }] },
      ],
    };
    expect(issues(raw)).toEqual([
      expect.stringMatching(/^categories\[1\]\.children\[0\]\.name: duplicate name "horror"/),
    ]);
  });

  it('reports invalid regexes with their location', () => {
    const raw = {
      categoriesLibraryId: LIB,
      categories: [
        {
          id: 'a',
          name: 'A',
          rules: [{ type: 'name', match: 'regex', values: ['ok', '(unclosed'] }],
        },
      ],
    };
    expect(issues(raw)).toEqual([
      expect.stringMatching(/^categories\[0\]\.rules\[0\]\.values\[1\]: invalid regex/),
    ]);
  });

  it('only accepts a regex match on name rules', () => {
    expect(
      issues({
        categoriesLibraryId: LIB,
        categories: [
          { id: 'a', name: 'A', rules: [{ type: 'genre', match: 'regex', values: ['x'] }] },
        ],
      }),
    ).toHaveLength(1);
  });

  it('rejects a category that contains itself through a YAML alias', () => {
    const yaml = `
categoriesLibraryId: ${LIB}
categories:
  - &loop
    id: a
    name: A
    children: [*loop]
`;
    expect(issues(parse(yaml))).toEqual([expect.stringMatching(/cycle/)]);
  });

  it('reports a YAML alias that repeats a category as a duplicate', () => {
    const yaml = `
categoriesLibraryId: ${LIB}
categories:
  - &a { id: a, name: A }
  - *a
`;
    expect(issues(parse(yaml))).toEqual([
      expect.stringMatching(/duplicate id "a"/),
      expect.stringMatching(/duplicate name "A"/),
    ]);
  });
});
