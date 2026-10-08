import type { Category, Rule } from '../../shared/api.js';

export type { Category, Rule };

export type Path = readonly number[];

export const pathKey = (p: Path) => p.join('.');

export function getAt(categories: readonly Category[], path: Path): Category | undefined {
  let list = categories;
  let found: Category | undefined;
  for (const i of path) {
    found = list[i];
    if (!found) return undefined;
    list = found.children;
  }
  return found;
}

export function updateAt(
  categories: readonly Category[],
  path: Path,
  fn: (c: Category) => Category,
): Category[] {
  const [head, ...rest] = path;
  if (head === undefined) return [...categories];
  return categories.map((c, i) => {
    if (i !== head) return c;
    return rest.length ? { ...c, children: updateAt(c.children, rest, fn) } : fn(c);
  });
}

function updateSiblings(
  categories: readonly Category[],
  path: Path,
  fn: (list: Category[]) => Category[],
): Category[] {
  const parent = path.slice(0, -1);
  if (!parent.length) return fn([...categories]);
  return updateAt(categories, parent, (c) => ({ ...c, children: fn([...c.children]) }));
}

export function removeAt(categories: readonly Category[], path: Path): Category[] {
  const index = path.at(-1);
  return updateSiblings(categories, path, (list) => list.filter((_, i) => i !== index));
}

export function appendAt(
  categories: readonly Category[],
  parent: Path,
  category: Category,
): { categories: Category[]; path: number[] } {
  if (!parent.length) return { categories: [...categories, category], path: [categories.length] };
  const count = getAt(categories, parent)?.children.length ?? 0;
  return {
    categories: updateAt(categories, parent, (c) => ({
      ...c,
      children: [...c.children, category],
    })),
    path: [...parent, count],
  };
}

export function move(
  categories: readonly Category[],
  path: Path,
  delta: -1 | 1,
): { categories: Category[]; path: number[] } {
  const index = path.at(-1) ?? 0;
  const target = index + delta;
  const siblings =
    path.length > 1 ? (getAt(categories, path.slice(0, -1))?.children ?? []) : categories;
  if (target < 0 || target >= siblings.length) {
    return { categories: [...categories], path: [...path] };
  }
  const next = updateSiblings(categories, path, (list) => {
    const [moving, other] = [list[index], list[target]];
    if (moving && other) [list[index], list[target]] = [other, moving];
    return list;
  });
  return { categories: next, path: [...path.slice(0, -1), target] };
}

export interface FlatNode {
  category: Category;
  path: number[];
  depth: number;
}

export function flatten(categories: readonly Category[], parent: number[] = []): FlatNode[] {
  return categories.flatMap((category, i) => {
    const path = [...parent, i];
    return [{ category, path, depth: parent.length }, ...flatten(category.children, path)];
  });
}

export function findPath(categories: readonly Category[], id: string): number[] | undefined {
  return flatten(categories).find((n) => n.category.id === id)?.path;
}

export function issuePath(path: Path): string {
  return path.map((i, depth) => `${depth === 0 ? 'categories' : '.children'}[${i}]`).join('');
}

export function allIds(categories: readonly Category[]): Set<string> {
  return new Set(flatten(categories).map((n) => n.category.id));
}

function insertAt(
  categories: readonly Category[],
  parent: Path,
  index: number,
  category: Category,
): Category[] {
  const insert = (list: readonly Category[]) => [
    ...list.slice(0, index),
    category,
    ...list.slice(index),
  ];
  if (!parent.length) return insert(categories);
  return updateAt(categories, parent, (c) => ({ ...c, children: insert(c.children) }));
}

export function indent(
  categories: readonly Category[],
  path: Path,
): { categories: Category[]; path: number[] } {
  const index = path.at(-1) ?? 0;
  const node = getAt(categories, path);
  if (!node || index === 0) return { categories: [...categories], path: [...path] };
  const target = [...path.slice(0, -1), index - 1];
  return appendAt(removeAt(categories, path), target, node);
}

export function outdent(
  categories: readonly Category[],
  path: Path,
): { categories: Category[]; path: number[] } {
  const node = getAt(categories, path);
  if (!node || path.length < 2) return { categories: [...categories], path: [...path] };
  const parent = path.slice(0, -1);
  const grandparent = parent.slice(0, -1);
  const index = (parent.at(-1) ?? 0) + 1;
  return {
    categories: insertAt(removeAt(categories, path), grandparent, index, node),
    path: [...grandparent, index],
  };
}

export function pathFromIssue(issue: string): number[] | undefined {
  const match = /^categories\[(\d+)\]((?:\.children\[\d+\])*)/.exec(issue);
  if (!match) return undefined;
  return [...`[${match[1]}]${match[2]}`.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
}
