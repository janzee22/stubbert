import { configSchema, type Category, type Config } from './schema.js';

export interface ConfigIssue {
  path: string;
  message: string;
}

export class ConfigError extends Error {
  constructor(readonly issues: ConfigIssue[]) {
    super(`Invalid config: ${issues.map((i) => `${i.path || '(file)'}: ${i.message}`).join('; ')}`);
  }
}

export type ParseResult = { ok: true; config: Config } | { ok: false; issues: ConfigIssue[] };

export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, key) => {
    if (typeof key === 'number') return `${out}[${key}]`;
    return out ? `${out}.${String(key)}` : String(key);
  }, '');
}

function findCycles(
  value: unknown,
  path: PropertyKey[],
  onPath: Set<object>,
  issues: ConfigIssue[],
) {
  if (typeof value !== 'object' || value === null) return;
  if (onPath.has(value)) {
    issues.push({
      path: formatPath(path),
      message: 'cycle: a category contains itself (YAML alias)',
    });
    return;
  }
  onPath.add(value);
  for (const [key, child] of Object.entries(value)) {
    findCycles(child, [...path, Array.isArray(value) ? Number(key) : key], onPath, issues);
  }
  onPath.delete(value);
}

export function* walkCategories(
  categories: readonly Category[],
  prefix = 'categories',
): Generator<{ category: Category; path: string; parent?: Category }> {
  for (const [i, category] of categories.entries()) {
    const path = `${prefix}[${i}]`;
    yield { category, path };
    for (const child of walkCategories(category.children, `${path}.children`)) {
      yield { ...child, parent: child.parent ?? category };
    }
  }
}

function regexError(source: string, caseSensitive: boolean): string | undefined {
  try {
    RegExp(source, caseSensitive ? 'u' : 'iu');
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

export function parseConfig(raw: unknown): ParseResult {
  const issues: ConfigIssue[] = [];
  findCycles(raw, [], new Set(), issues);
  if (issues.length) return { ok: false, issues };

  const parsed = configSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })),
    };
  }

  const config = parsed.data;
  const ids = new Map<string, string>();
  const names = new Map<string, string>();
  for (const { category, path } of walkCategories(config.categories)) {
    const idSeen = ids.get(category.id);
    if (idSeen) {
      issues.push({
        path: `${path}.id`,
        message: `duplicate id "${category.id}" (also at ${idSeen})`,
      });
    } else ids.set(category.id, path);

    const key = category.name.toLowerCase();
    const nameSeen = names.get(key);
    if (nameSeen) {
      issues.push({
        path: `${path}.name`,
        message: `duplicate name "${category.name}" (also at ${nameSeen}; names are compared case-insensitively)`,
      });
    } else names.set(key, path);

    for (const [r, rule] of category.rules.entries()) {
      if (rule.type !== 'name' || rule.match !== 'regex') continue;
      for (const [v, source] of rule.values.entries()) {
        const error = regexError(source, rule.caseSensitive);
        if (error) {
          issues.push({
            path: `${path}.rules[${r}].values[${v}]`,
            message: `invalid regex: ${error}`,
          });
        }
      }
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, config };
}
