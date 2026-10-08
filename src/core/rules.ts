import type { Category, MediaType, NameRule, Rule } from '../config/schema.js';

export interface MediaItem {
  id: string;
  type: MediaType;
  name: string;
  originalTitle?: string;
  genres: readonly string[];
  studios: readonly string[];
  tags: readonly string[];
}

type Matcher = (item: MediaItem) => boolean;

function listMatcher(rule: Exclude<Rule, NameRule>): Matcher {
  const field = ({ genre: 'genres', studio: 'studios', tag: 'tags' } as const)[rule.type];
  const wanted = rule.values.map((v) => v.toLowerCase());
  return (item) => {
    const have = new Set(item[field].map((v) => v.toLowerCase()));
    return rule.quantifier === 'all'
      ? wanted.every((v) => have.has(v))
      : wanted.some((v) => have.has(v));
  };
}

function nameMatcher(rule: NameRule): Matcher {
  const fold = (s: string) => (rule.caseSensitive ? s : s.toLowerCase());
  const tests: Array<(text: string) => boolean> = rule.values.map((value) => {
    if (rule.match === 'regex') {
      const re = new RegExp(value, rule.caseSensitive ? 'u' : 'iu');
      return (text) => re.test(text);
    }
    const v = fold(value);
    return rule.match === 'exact' ? (text) => fold(text) === v : (text) => fold(text).includes(v);
  });
  return (item) => {
    const texts =
      item.originalTitle && item.originalTitle !== item.name
        ? [item.name, item.originalTitle]
        : [item.name];
    const hit = (test: (text: string) => boolean) => texts.some(test);
    return rule.quantifier === 'all' ? tests.every(hit) : tests.some(hit);
  };
}

function compileRule(rule: Rule): Matcher {
  const match = rule.type === 'name' ? nameMatcher(rule) : listMatcher(rule);
  return rule.negate ? (item) => !match(item) : match;
}

export function compileCategory(
  category: Pick<Category, 'rules' | 'combine' | 'mediaTypes'>,
): Matcher {
  if (category.rules.length === 0) return () => false;
  const types = new Set<string>(category.mediaTypes);
  const rules = category.rules.map(compileRule);
  const combined: Matcher =
    category.combine === 'all'
      ? (item) => rules.every((r) => r(item))
      : (item) => rules.some((r) => r(item));
  return (item) => types.has(item.type) && combined(item);
}

export function evaluateCategory(
  category: Pick<Category, 'rules' | 'combine' | 'mediaTypes'>,
  items: readonly MediaItem[],
): string[] {
  const match = compileCategory(category);
  return items.filter(match).map((i) => i.id);
}
