import type { Category, Rule } from '../../shared/api.js';
import { flatten } from './tree.js';

export interface Draft {
  categoriesLibraryId: string;
  schedule: {
    enabled: boolean;
    intervalMinutes: number;
    syncOnStart: boolean;
    syncOnNewItems: boolean;
  };
  categories: Category[];
}

export const MEDIA_TYPES = ['Movie', 'Series'] as const;

export function slug(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'category';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export function newCategory(name: string, taken: ReadonlySet<string>): Category {
  return {
    id: slug(name, taken),
    name,
    mediaTypes: ['Movie', 'Series'],
    combine: 'any',
    rules: [],
    children: [],
  };
}

export function newRule(type: Rule['type']): Rule {
  return type === 'name'
    ? {
        type,
        match: 'contains',
        values: [],
        quantifier: 'any',
        negate: false,
        caseSensitive: false,
      }
    : { type, values: [], quantifier: 'any', negate: false };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

function normalizeRule(raw: unknown): Rule | undefined {
  if (!isObject(raw)) return undefined;
  const type = raw.type;
  if (type !== 'genre' && type !== 'studio' && type !== 'tag' && type !== 'name') return undefined;
  const base = newRule(type);
  return {
    ...base,
    values: strings(raw.values),
    quantifier: raw.quantifier === 'all' ? 'all' : 'any',
    negate: raw.negate === true,
    ...(base.type === 'name'
      ? {
          match: raw.match === 'exact' || raw.match === 'regex' ? raw.match : 'contains',
          caseSensitive: raw.caseSensitive === true,
        }
      : {}),
  } as Rule;
}

function normalizeCategory(raw: unknown): Category | undefined {
  if (!isObject(raw)) return undefined;
  const types = strings(raw.mediaTypes).filter(
    (t): t is 'Movie' | 'Series' => t === 'Movie' || t === 'Series',
  );
  const out: Category = {
    id: typeof raw.id === 'string' ? raw.id : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    mediaTypes: types.length ? types : ['Movie', 'Series'],
    combine: raw.combine === 'all' ? 'all' : 'any',
    rules: (Array.isArray(raw.rules) ? raw.rules : [])
      .map(normalizeRule)
      .filter((r): r is Rule => !!r),
    children: (Array.isArray(raw.children) ? raw.children : [])
      .map(normalizeCategory)
      .filter((c): c is Category => !!c),
  };
  if (typeof raw.sortName === 'string') out.sortName = raw.sortName;
  if (typeof raw.overview === 'string') out.overview = raw.overview;
  if (typeof raw.poster === 'string') out.poster = raw.poster;
  return out;
}

export function normalizeConfig(raw: unknown): Draft {
  const c = isObject(raw) ? raw : {};
  const schedule = isObject(c.schedule) ? c.schedule : {};
  return {
    categoriesLibraryId: typeof c.categoriesLibraryId === 'string' ? c.categoriesLibraryId : '',
    schedule: {
      enabled: schedule.enabled !== false,
      intervalMinutes: typeof schedule.intervalMinutes === 'number' ? schedule.intervalMinutes : 60,
      syncOnStart: schedule.syncOnStart === true,
      syncOnNewItems: schedule.syncOnNewItems !== false,
    },
    categories: (Array.isArray(c.categories) ? c.categories : [])
      .map(normalizeCategory)
      .filter((x): x is Category => !!x),
  };
}

function compactRule(rule: Rule): Record<string, unknown> {
  const out: Record<string, unknown> = { type: rule.type };
  if (rule.type === 'name' && rule.match !== 'contains') out.match = rule.match;
  out.values = rule.values;
  if (rule.quantifier !== 'any') out.quantifier = rule.quantifier;
  if (rule.negate) out.negate = true;
  if (rule.type === 'name' && rule.caseSensitive) out.caseSensitive = true;
  return out;
}

function compactCategory(c: Category): Record<string, unknown> {
  const out: Record<string, unknown> = { id: c.id, name: c.name };
  if (c.sortName?.trim()) out.sortName = c.sortName.trim();
  if (c.overview?.trim()) out.overview = c.overview;
  if (c.poster) out.poster = c.poster;
  if (c.mediaTypes.length !== 2) out.mediaTypes = c.mediaTypes;
  if (c.combine !== 'any') out.combine = c.combine;
  if (c.rules.length) out.rules = c.rules.map(compactRule);
  if (c.children.length) out.children = c.children.map(compactCategory);
  return out;
}

export function compactConfig(draft: Draft): Record<string, unknown> {
  return {
    categoriesLibraryId: draft.categoriesLibraryId,
    schedule: {
      enabled: draft.schedule.enabled,
      intervalMinutes: draft.schedule.intervalMinutes,
      ...(draft.schedule.syncOnStart && { syncOnStart: true }),
      ...(!draft.schedule.syncOnNewItems && { syncOnNewItems: false }),
    },
    categories: draft.categories.map(compactCategory),
  };
}

export function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(compactConfig(a)) === JSON.stringify(compactConfig(b));
}

function ownFields(c: Category): string {
  return JSON.stringify({ ...compactCategory(c), children: undefined });
}

export function categoryEdited(saved: Category | undefined, current: Category): boolean {
  if (!saved) return true;
  return ownFields(saved) !== ownFields(current);
}

export interface DraftChange {
  label: string;
  detail: string;
}

const CHANGE_FIELDS = [
  ['name', 'name'],
  ['sortName', 'sort name'],
  ['overview', 'overview'],
  ['poster', 'poster'],
  ['mediaTypes', 'media types'],
  ['combine', 'any/all'],
  ['rules', 'rules'],
] as const;

export function draftChanges(saved: Draft, draft: Draft): DraftChange[] {
  const before = new Map(flatten(saved.categories).map((n) => [n.category.id, n]));
  const after = flatten(draft.categories);
  const afterIds = new Set(after.map((n) => n.category.id));
  const changes: DraftChange[] = [];
  for (const node of after) {
    const label = node.category.name || 'Unnamed';
    const old = before.get(node.category.id);
    if (!old) {
      changes.push({ label, detail: 'new' });
      continue;
    }
    const a = compactCategory(old.category);
    const b = compactCategory(node.category);
    const fields: string[] = CHANGE_FIELDS.filter(
      ([key]) => JSON.stringify(a[key]) !== JSON.stringify(b[key]),
    ).map(([, name]) => name);
    if (old.path.join('.') !== node.path.join('.')) fields.push('position');
    if (fields.length) changes.push({ label, detail: fields.join(', ') });
  }
  for (const [id, node] of before) {
    if (!afterIds.has(id)) changes.push({ label: node.category.name || id, detail: 'removed' });
  }
  if (saved.categoriesLibraryId !== draft.categoriesLibraryId) {
    changes.push({ label: 'Categories library', detail: 'changed' });
  }
  if (JSON.stringify(saved.schedule) !== JSON.stringify(draft.schedule)) {
    changes.push({ label: 'Schedule', detail: 'changed' });
  }
  return changes;
}
