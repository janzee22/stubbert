import { TemplateError } from './errors.js';
import type { Expr, Node } from './parser.js';
import { FILTERS, pathText, type Value } from './render.js';

const ANY: unique symbol = Symbol('any');
type Shape = Value | typeof ANY;

export interface UnknownName {
  error: TemplateError;
  found: string;
  suggestion?: string;
}

function isRecord(v: unknown): v is Record<string, Value> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function knownPaths(shape: Record<string, Value>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(path);
    if (isRecord(value)) out.push(...knownPaths(value, path));
  }
  return out;
}

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}

export function suggest(found: string, paths: string[]): string | undefined {
  let best: { path: string; d: number } | undefined;
  for (const path of paths) {
    const d = levenshtein(found.toLowerCase(), path.toLowerCase());
    if (!best || d < best.d) best = { path, d };
  }
  if (!best) return undefined;
  return best.d <= Math.max(2, Math.floor(found.length / 3)) ? best.path : undefined;
}

class Checker {
  readonly problems: UnknownName[] = [];
  readonly #paths: string[];

  constructor(
    private readonly source: string,
    root: Record<string, Value>,
  ) {
    this.#paths = knownPaths(root);
  }

  #unknown(expr: Expr, missing: Expr) {
    const found = pathText(missing) ?? this.source.slice(missing.start, missing.end);
    const full = pathText(expr) ?? found;
    const suggestion = suggest(full, this.#paths) ?? suggest(found, this.#paths);
    const error = new TemplateError(
      `there is no \`${found}\`${suggestion ? `. Did you mean \`${suggestion}\`?` : ''}`,
      this.source,
      expr.start,
      expr.end,
    );
    this.problems.push({ error, found: full, suggestion });
  }

  shape(expr: Expr, scope: Record<string, Shape>, whole: Expr = expr): Shape {
    switch (expr.kind) {
      case 'literal':
        return expr.value;
      case 'list':
        for (const i of expr.items) this.shape(i, scope);
        return ANY;
      case 'name':
        if (Object.hasOwn(scope, expr.name)) return scope[expr.name] as Shape;
        this.#unknown(whole, expr);
        return ANY;
      case 'attr': {
        const base = this.shape(expr.target, scope, whole);
        if (base === ANY || !isRecord(base)) return ANY;
        if (Object.hasOwn(base, expr.name)) return base[expr.name] as Value;
        this.#unknown(whole, expr);
        return ANY;
      }
      case 'index':
        this.shape(expr.target, scope);
        this.shape(expr.key, scope);
        return ANY;
      case 'filter': {
        if (!Object.hasOwn(FILTERS, expr.name)) {
          const names = Object.keys(FILTERS);
          const close = suggest(expr.name, names);
          this.problems.push({
            error: new TemplateError(
              `there is no filter \`${expr.name}\`${close ? `. Did you mean \`${close}\`?` : ''}`,
              this.source,
              expr.start,
              expr.end,
            ),
            found: expr.name,
            suggestion: close,
          });
        }
        const target = this.shape(expr.target, scope);
        for (const a of expr.args) this.shape(a, scope);
        for (const a of Object.values(expr.kwargs)) this.shape(a, scope);
        if (expr.name === 'first' && Array.isArray(target)) return (target[0] as Value) ?? ANY;
        return ANY;
      }
      case 'test':
        if (expr.name !== 'defined' && expr.name !== 'undefined') this.shape(expr.target, scope);
        return ANY;
      case 'unary':
        this.shape(expr.operand, scope);
        return ANY;
      case 'binary':
        this.shape(expr.left, scope);
        this.shape(expr.right, scope);
        return ANY;
    }
  }

  walk(nodes: Node[], scope: Record<string, Shape>) {
    for (const node of nodes) {
      if (node.kind === 'output') this.shape(node.expr, scope);
      else if (node.kind === 'if') {
        for (const b of node.branches) {
          this.shape(b.test, scope);
          this.walk(b.body, scope);
        }
        this.walk(node.otherwise, scope);
      } else if (node.kind === 'for') {
        const iter = this.shape(node.iter, scope);
        const item: Shape = Array.isArray(iter) && iter.length ? (iter[0] as Value) : ANY;
        const loop: Value = { index: 1, index0: 0, first: true, last: true, length: 1 };
        this.walk(node.body, { ...scope, [node.target]: item, loop });
        this.walk(node.otherwise, scope);
      }
    }
  }
}

export function checkNames(
  source: string,
  nodes: Node[],
  shape: Record<string, Value>,
): UnknownName[] {
  const checker = new Checker(source, shape);
  checker.walk(nodes, shape);
  return checker.problems;
}
