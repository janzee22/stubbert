import { TemplateError } from './errors.js';
import type { Expr, Node } from './parser.js';

export type Value = string | number | boolean | null | Value[] | { [key: string]: Value };

const MISSING: unique symbol = Symbol('missing');
type Result = Value | typeof MISSING;

export interface RenderLimits {
  maxOutput: number;
  maxMs: number;
}

const DEFAULT_LIMITS: RenderLimits = { maxOutput: 20_000, maxMs: 200 };

function isRecord(v: unknown): v is Record<string, Value> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function lookup(target: Result, key: string | number): Result {
  if (Array.isArray(target)) {
    let i = typeof key === 'number' ? key : NaN;
    if (typeof key === 'string' && /^\d+$/.test(key)) i = Number(key);
    if (!Number.isInteger(i)) return MISSING;
    const at = i < 0 ? target.length + i : i;
    return at >= 0 && at < target.length ? (target[at] as Value) : MISSING;
  }
  if (isRecord(target) && Object.hasOwn(target, String(key))) return target[String(key)] as Value;
  return MISSING;
}

function truthy(v: Result): boolean {
  if (v === MISSING || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (isRecord(v)) return Object.keys(v).length > 0;
  return Boolean(v);
}

export function display(v: Value): string {
  if (v === null) return '';
  if (Array.isArray(v)) return v.map(display).join(', ');
  if (isRecord(v)) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

export function pathText(expr: Expr): string | undefined {
  if (expr.kind === 'name') return expr.name;
  if (expr.kind === 'attr') {
    const base = pathText(expr.target);
    return base === undefined ? undefined : `${base}.${expr.name}`;
  }
  return undefined;
}

function truncate(s: string, length: number, killwords: boolean, end: string): string {
  if (s.length <= length) return s;
  const room = Math.max(0, length - end.length);
  if (killwords) return s.slice(0, room) + end;
  const cut = s.slice(0, room + 1);
  const space = cut.search(/\s\S*$/);
  return (space > 0 ? cut.slice(0, space) : s.slice(0, room)).replace(/[\s.,;:]+$/, '') + end;
}

type Filter = (value: Value, args: Value[], kwargs: Record<string, Value>) => Value;

const str = (v: Value) => display(v);
function num(v: Value | undefined, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return fallback;
}
function list(v: Value): Value[] {
  if (Array.isArray(v)) return v;
  return typeof v === 'string' ? [...v] : [];
}
const order = (x: Value, y: Value) => str(x).localeCompare(str(y));

function ranges(v: Value, sep: string): string {
  const numbers = [...new Set(list(v).map((x) => num(x, NaN)))]
    .filter(Number.isInteger)
    .toSorted((x, y) => x - y);
  const parts: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const start = numbers[i] as number;
    let end = i;
    while (numbers[end + 1] === (numbers[end] as number) + 1) end++;
    // A pair reads better as "5, 6" than "5-6"; only runs of three or more collapse.
    if (end - i >= 2) {
      parts.push(`${start}-${numbers[end]}`);
      i = end;
    } else parts.push(String(start));
  }
  return parts.join(sep);
}

export const FILTERS: Record<string, Filter> = {
  truncate: (v, a, k) =>
    truncate(
      str(v),
      num(k.length ?? a[0], 255),
      truthy(k.killwords ?? a[1] ?? false),
      typeof (k.end ?? a[2]) === 'string' ? ((k.end ?? a[2]) as string) : '…',
    ),
  pad: (v, a, k) => {
    if (v === null || v === '') return '';
    const width = num(k.width ?? a[0], 2);
    const fill = typeof (k.char ?? a[1]) === 'string' ? ((k.char ?? a[1]) as string) : '0';
    return str(v).padStart(width, fill || '0');
  },
  upper: (v) => str(v).toUpperCase(),
  lower: (v) => str(v).toLowerCase(),
  title: (v) => str(v).replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
  capitalize: (v) => {
    const s = str(v);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  },
  trim: (v) => str(v).trim(),
  replace: (v, a, k) =>
    str(v)
      .split(str(k.old ?? a[0] ?? ''))
      .join(str(k.new ?? a[1] ?? '')),
  default: (v) => v,
  join: (v, a, k) => {
    const attribute = k.attribute ?? a[1];
    const items =
      typeof attribute === 'string' ? list(v).map((x) => lookupValue(x, attribute)) : list(v);
    return items.map(str).join(str(k.d ?? a[0] ?? ''));
  },
  length: (v) => (isRecord(v) ? Object.keys(v).length : list(v).length),
  first: (v) => list(v)[0] ?? null,
  last: (v) => list(v).at(-1) ?? null,
  map: (v, a, k) => {
    if (typeof k.attribute === 'string') {
      return list(v).map((x) => lookupValue(x, k.attribute as string));
    }
    const name = a[0];
    const filter = typeof name === 'string' ? FILTERS[name] : undefined;
    return filter ? list(v).map((x) => filter(x, a.slice(1), {})) : list(v);
  },
  sort: (v) => list(v).toSorted(order),
  range: (v, a, k) => ranges(v, str(k.d ?? a[0] ?? ', ')),
  string: (v) => str(v),
  int: (v) => Math.trunc(num(v, 0)),
};
FILTERS.d = FILTERS.default as Filter;
FILTERS.count = FILTERS.length as Filter;

function lookupValue(v: Value, path: string): Value {
  let cur: Result = v;
  for (const part of path.split('.')) cur = lookup(cur, part);
  return cur === MISSING ? null : cur;
}

const TESTS: Record<string, (v: Result) => boolean> = {
  defined: (v) => v !== MISSING,
  undefined: (v) => v === MISSING,
  none: (v) => v === null,
  number: (v) => typeof v === 'number',
  string: (v) => typeof v === 'string',
  even: (v) => typeof v === 'number' && v % 2 === 0,
  odd: (v) => typeof v === 'number' && Math.abs(v % 2) === 1,
};

function compare(op: string, a: Value, b: Value): boolean {
  switch (op) {
    case '==':
      return JSON.stringify(a) === JSON.stringify(b);
    case '!=':
      return JSON.stringify(a) !== JSON.stringify(b);
    default: {
      const [x, y] = typeof a === 'number' && typeof b === 'number' ? [a, b] : [str(a), str(b)];
      if (op === '<') return x < y;
      if (op === '>') return x > y;
      if (op === '<=') return x <= y;
      return x >= y;
    }
  }
}

function arithmetic(op: string, a: Value, b: Value): Value {
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return str(a) + str(b);
  const x = num(a, NaN);
  const y = num(b, NaN);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  if (op === '+') return x + y;
  if (op === '-') return x - y;
  if (op === '*') return x * y;
  if (y === 0) return null;
  if (op === '/') return x / y;
  if (op === '//') return Math.floor(x / y);
  return x % y;
}

class Renderer {
  #out = '';
  #deadline: number;

  constructor(
    private readonly source: string,
    private readonly limits: RenderLimits,
  ) {
    this.#deadline = Date.now() + limits.maxMs;
  }

  #check(offset: number) {
    if (Date.now() > this.#deadline) {
      throw new TemplateError('the template takes too long to render', this.source, offset);
    }
  }

  #write(text: string, offset: number) {
    this.#out += text;
    if (this.#out.length > this.limits.maxOutput) {
      throw new TemplateError('the template renders too much text', this.source, offset);
    }
  }

  #missing(expr: Expr): never {
    const path = pathText(expr) ?? this.source.slice(expr.start, expr.end);
    throw new TemplateError(`there is no \`${path}\``, this.source, expr.start, expr.end);
  }

  value(expr: Expr, scope: Record<string, Value>): Value {
    const v = this.eval(expr, scope);
    if (v === MISSING) this.#missing(expr);
    return v;
  }

  eval(expr: Expr, scope: Record<string, Value>): Result {
    switch (expr.kind) {
      case 'literal':
        return expr.value;
      case 'list':
        return expr.items.map((i) => this.value(i, scope));
      case 'name':
        return Object.hasOwn(scope, expr.name) ? (scope[expr.name] as Value) : MISSING;
      case 'attr':
        return lookup(this.value(expr.target, scope), expr.name);
      case 'index': {
        const key = this.value(expr.key, scope);
        return lookup(this.value(expr.target, scope), typeof key === 'number' ? key : str(key));
      }
      case 'filter': {
        const filter = Object.hasOwn(FILTERS, expr.name) ? FILTERS[expr.name] : undefined;
        if (!filter) {
          throw new TemplateError(
            `there is no filter \`${expr.name}\``,
            this.source,
            expr.start,
            expr.end,
          );
        }
        const target = this.eval(expr.target, scope);
        const args = expr.args.map((a) => this.value(a, scope));
        const kwargs: Record<string, Value> = {};
        for (const [k, a] of Object.entries(expr.kwargs)) kwargs[k] = this.value(a, scope);
        if (expr.name === 'default' || expr.name === 'd') {
          const fallback = kwargs.default_value ?? args[0] ?? '';
          const boolean = truthy(kwargs.boolean ?? args[1] ?? false);
          if (target === MISSING || target === null || (boolean && !truthy(target))) {
            return fallback;
          }
          return target;
        }
        if (target === MISSING) this.#missing(expr.target);
        return filter(target, args, kwargs);
      }
      case 'test': {
        const test = Object.hasOwn(TESTS, expr.name) ? TESTS[expr.name] : undefined;
        if (!test) {
          throw new TemplateError(
            `there is no test \`${expr.name}\``,
            this.source,
            expr.start,
            expr.end,
          );
        }
        const target =
          expr.name === 'defined' || expr.name === 'undefined'
            ? this.eval(expr.target, scope)
            : this.value(expr.target, scope);
        return test(target) !== expr.negate;
      }
      case 'unary':
        if (expr.op === 'not') return !truthy(this.eval(expr.operand, scope));
        return arithmetic('-', 0, this.value(expr.operand, scope));
      case 'binary': {
        if (expr.op === 'and') {
          const left = this.eval(expr.left, scope);
          if (truthy(left)) return this.eval(expr.right, scope);
          return left === MISSING ? false : left;
        }
        if (expr.op === 'or') {
          const left = this.eval(expr.left, scope);
          return truthy(left) ? left : this.eval(expr.right, scope);
        }
        const left = this.value(expr.left, scope);
        const right = this.value(expr.right, scope);
        if (expr.op === '~') return str(left) + str(right);
        if (expr.op === 'in') {
          if (typeof right === 'string') return right.includes(str(left));
          if (Array.isArray(right)) return right.some((r) => compare('==', r, left));
          if (isRecord(right)) return Object.hasOwn(right, str(left));
          return false;
        }
        if (['==', '!=', '<', '>', '<=', '>='].includes(expr.op)) {
          return compare(expr.op, left, right);
        }
        return arithmetic(expr.op, left, right);
      }
    }
  }

  run(nodes: Node[], scope: Record<string, Value>): void {
    for (const node of nodes) {
      switch (node.kind) {
        case 'text':
          this.#write(node.value, 0);
          break;
        case 'output':
          this.#write(display(this.value(node.expr, scope)), node.expr.start);
          break;
        case 'if': {
          const branch = node.branches.find((b) => truthy(this.eval(b.test, scope)));
          this.run(branch ? branch.body : node.otherwise, scope);
          break;
        }
        case 'for': {
          const items = list(this.value(node.iter, scope));
          if (!items.length) this.run(node.otherwise, scope);
          items.forEach((item, index) => {
            this.#check(node.start);
            const loop: Value = {
              index: index + 1,
              index0: index,
              first: index === 0,
              last: index === items.length - 1,
              length: items.length,
            };
            this.run(node.body, { ...scope, [node.target]: item, loop });
          });
          break;
        }
      }
    }
  }

  get output(): string {
    return this.#out;
  }
}

export function renderNodes(
  source: string,
  nodes: Node[],
  context: Record<string, Value>,
  limits: RenderLimits = DEFAULT_LIMITS,
): string {
  const renderer = new Renderer(source, limits);
  renderer.run(nodes, context);
  return renderer.output;
}
