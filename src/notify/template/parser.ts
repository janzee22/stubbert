import { TemplateError } from './errors.js';
import { chunk, tokenize, type Token } from './lexer.js';

interface Span {
  start: number;
  end: number;
}

export type Expr = Span &
  (
    | { kind: 'literal'; value: string | number | boolean | null }
    | { kind: 'list'; items: Expr[] }
    | { kind: 'name'; name: string }
    | { kind: 'attr'; target: Expr; name: string }
    | { kind: 'index'; target: Expr; key: Expr }
    | { kind: 'filter'; target: Expr; name: string; args: Expr[]; kwargs: Record<string, Expr> }
    | { kind: 'test'; target: Expr; name: string; negate: boolean }
    | { kind: 'unary'; op: 'not' | '-'; operand: Expr }
    | { kind: 'binary'; op: string; left: Expr; right: Expr }
  );

export type Node =
  | { kind: 'text'; value: string }
  | { kind: 'output'; expr: Expr }
  | { kind: 'if'; branches: Array<{ test: Expr; body: Node[] }>; otherwise: Node[] }
  | { kind: 'for'; target: string; iter: Expr; body: Node[]; otherwise: Node[]; start: number };

const KEYWORDS = new Set(['and', 'or', 'not', 'in', 'is', 'if', 'else']);
const LITERALS: Record<string, boolean | null> = {
  true: true,
  True: true,
  false: false,
  False: false,
  none: null,
  None: null,
};
const COMPARE = new Set(['==', '!=', '<', '>', '<=', '>=']);

class ExprParser {
  #pos = 0;

  constructor(
    private readonly source: string,
    private readonly tokens: Token[],
  ) {}

  get #peek(): Token {
    return this.tokens[this.#pos] ?? (this.tokens.at(-1) as Token);
  }

  #next(): Token {
    const token = this.#peek;
    if (token.type !== 'end') this.#pos++;
    return token;
  }

  #is(value: string, type: Token['type'] = 'op'): boolean {
    return this.#peek.type === type && this.#peek.value === value;
  }

  #accept(value: string, type: Token['type'] = 'op'): boolean {
    if (!this.#is(value, type)) return false;
    this.#next();
    return true;
  }

  #fail(reason: string, token = this.#peek): never {
    throw new TemplateError(reason, this.source, token.start, token.end);
  }

  #expect(value: string): Token {
    if (!this.#is(value)) {
      this.#fail(
        this.#peek.type === 'end'
          ? `\`${value}\` is missing`
          : `expected \`${value}\`, found \`${this.#peek.value}\``,
      );
    }
    return this.#next();
  }

  #name(): Token {
    const token = this.#peek;
    if (token.type !== 'name') {
      this.#fail(
        token.type === 'end' ? 'a name is missing' : `expected a name, found \`${token.value}\``,
      );
    }
    return this.#next();
  }

  get done(): boolean {
    return this.#peek.type === 'end';
  }

  get rest(): Token {
    return this.#peek;
  }

  finish(): void {
    if (!this.done) this.#fail(`unexpected \`${this.#peek.value}\``);
  }

  takeName(): Token {
    return this.#name();
  }

  acceptKeyword(word: string): boolean {
    return this.#accept(word, 'name');
  }

  expression(): Expr {
    return this.#or();
  }

  #or(): Expr {
    let left = this.#and();
    while (this.#accept('or', 'name')) {
      const right = this.#and();
      left = { kind: 'binary', op: 'or', left, right, start: left.start, end: right.end };
    }
    return left;
  }

  #and(): Expr {
    let left = this.#not();
    while (this.#accept('and', 'name')) {
      const right = this.#not();
      left = { kind: 'binary', op: 'and', left, right, start: left.start, end: right.end };
    }
    return left;
  }

  #not(): Expr {
    const token = this.#peek;
    if (this.#accept('not', 'name')) {
      const operand = this.#not();
      return { kind: 'unary', op: 'not', operand, start: token.start, end: operand.end };
    }
    return this.#compare();
  }

  #compare(): Expr {
    let left = this.#concat();
    for (;;) {
      const token = this.#peek;
      if (token.type === 'op' && COMPARE.has(token.value)) {
        this.#next();
        const right = this.#concat();
        left = { kind: 'binary', op: token.value, left, right, start: left.start, end: right.end };
      } else if (this.#is('in', 'name')) {
        this.#next();
        const right = this.#concat();
        left = { kind: 'binary', op: 'in', left, right, start: left.start, end: right.end };
      } else if (this.#is('not', 'name') && this.tokens[this.#pos + 1]?.value === 'in') {
        this.#next();
        this.#next();
        const right = this.#concat();
        const inside: Expr = {
          kind: 'binary',
          op: 'in',
          left,
          right,
          start: left.start,
          end: right.end,
        };
        left = { kind: 'unary', op: 'not', operand: inside, start: left.start, end: right.end };
      } else if (this.#accept('is', 'name')) {
        const negate = this.#accept('not', 'name');
        const name = this.#name();
        left = {
          kind: 'test',
          target: left,
          name: name.value,
          negate,
          start: left.start,
          end: name.end,
        };
      } else {
        return left;
      }
    }
  }

  #concat(): Expr {
    let left = this.#add();
    while (this.#accept('~')) {
      const right = this.#add();
      left = { kind: 'binary', op: '~', left, right, start: left.start, end: right.end };
    }
    return left;
  }

  #add(): Expr {
    let left = this.#mul();
    while (this.#is('+') || this.#is('-')) {
      const op = this.#next().value;
      const right = this.#mul();
      left = { kind: 'binary', op, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  #mul(): Expr {
    let left = this.#unary();
    while (this.#is('*') || this.#is('/') || this.#is('//') || this.#is('%')) {
      const op = this.#next().value;
      const right = this.#unary();
      left = { kind: 'binary', op, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  #unary(): Expr {
    const token = this.#peek;
    if (this.#accept('-')) {
      const operand = this.#unary();
      return { kind: 'unary', op: '-', operand, start: token.start, end: operand.end };
    }
    return this.#postfix();
  }

  #postfix(): Expr {
    let target = this.#primary();
    for (;;) {
      if (this.#accept('.')) {
        const name = this.#peek.type === 'number' ? this.#next() : this.#name();
        target = { kind: 'attr', target, name: name.value, start: target.start, end: name.end };
      } else if (this.#accept('[')) {
        const key = this.expression();
        const close = this.#expect(']');
        target = { kind: 'index', target, key, start: target.start, end: close.end };
      } else if (this.#accept('|')) {
        const name = this.#name();
        const args: Expr[] = [];
        const kwargs: Record<string, Expr> = {};
        let end = name.end;
        if (this.#accept('(')) {
          if (!this.#is(')')) {
            do {
              const next = this.tokens[this.#pos + 1];
              if (this.#peek.type === 'name' && next?.type === 'op' && next.value === '=') {
                const key = this.#next().value;
                this.#next();
                kwargs[key] = this.expression();
              } else {
                args.push(this.expression());
              }
            } while (this.#accept(','));
          }
          end = this.#expect(')').end;
        }
        target = {
          kind: 'filter',
          target,
          name: name.value,
          args,
          kwargs,
          start: target.start,
          end,
        };
      } else {
        return target;
      }
    }
  }

  #primary(): Expr {
    const token = this.#peek;
    if (token.type === 'string') {
      this.#next();
      return { kind: 'literal', value: token.value, start: token.start, end: token.end };
    }
    if (token.type === 'number') {
      this.#next();
      return { kind: 'literal', value: Number(token.value), start: token.start, end: token.end };
    }
    if (token.type === 'name') {
      if (token.value in LITERALS) {
        this.#next();
        return {
          kind: 'literal',
          value: LITERALS[token.value] ?? null,
          start: token.start,
          end: token.end,
        };
      }
      if (KEYWORDS.has(token.value)) this.#fail(`\`${token.value}\` can't start a value`);
      this.#next();
      return { kind: 'name', name: token.value, start: token.start, end: token.end };
    }
    if (this.#accept('(')) {
      const inner = this.expression();
      this.#expect(')');
      return inner;
    }
    if (this.#accept('[')) {
      const items: Expr[] = [];
      if (!this.#is(']')) {
        do items.push(this.expression());
        while (this.#accept(','));
      }
      const close = this.#expect(']');
      return { kind: 'list', items, start: token.start, end: close.end };
    }
    this.#fail(token.type === 'end' ? 'a value is missing' : `unexpected \`${token.value}\``);
  }
}

type Frame =
  | { tag: 'root'; body: Node[] }
  | { tag: 'if'; node: Extract<Node, { kind: 'if' }>; body: Node[]; inElse: boolean; start: number }
  | {
      tag: 'for';
      node: Extract<Node, { kind: 'for' }>;
      body: Node[];
      inElse: boolean;
      start: number;
    };

export function parseExpression(source: string, start: number, end: number): Expr {
  const parser = new ExprParser(source, tokenize(source, start, end));
  if (parser.done) throw new TemplateError('`{{ }}` is empty', source, start);
  const expr = parser.expression();
  parser.finish();
  return expr;
}

export function parse(source: string): Node[] {
  const root: Frame = { tag: 'root', body: [] };
  const stack: Frame[] = [root];
  const top = () => stack.at(-1) as Frame;

  for (const c of chunk(source)) {
    if (c.type === 'text') {
      top().body.push({ kind: 'text', value: c.value });
      continue;
    }
    if (c.type === 'output') {
      if (!c.source.trim()) throw new TemplateError('`{{ }}` is empty', source, c.start);
      top().body.push({ kind: 'output', expr: parseExpression(source, c.start, c.end) });
      continue;
    }
    const parser = new ExprParser(source, tokenize(source, c.start, c.end));
    if (parser.done) throw new TemplateError('`{% %}` is empty', source, c.start);
    const word = parser.takeName();
    const frame = top();
    switch (word.value) {
      case 'if': {
        const test = parser.expression();
        parser.finish();
        const node: Extract<Node, { kind: 'if' }> = {
          kind: 'if',
          branches: [{ test, body: [] }],
          otherwise: [],
        };
        frame.body.push(node);
        stack.push({
          tag: 'if',
          node,
          body: node.branches[0]?.body ?? [],
          inElse: false,
          start: word.start,
        });
        break;
      }
      case 'elif': {
        if (frame.tag !== 'if' || frame.inElse) {
          throw new TemplateError('`{% elif %}` without an open `{% if %}`', source, word.start);
        }
        const test = parser.expression();
        parser.finish();
        const branch = { test, body: [] as Node[] };
        frame.node.branches.push(branch);
        frame.body = branch.body;
        break;
      }
      case 'else': {
        parser.finish();
        if ((frame.tag !== 'if' && frame.tag !== 'for') || frame.inElse) {
          throw new TemplateError('`{% else %}` without an open `{% if %}`', source, word.start);
        }
        frame.inElse = true;
        frame.body = frame.node.otherwise;
        break;
      }
      case 'endif':
        parser.finish();
        if (frame.tag !== 'if') {
          throw new TemplateError('`{% endif %}` without an open `{% if %}`', source, word.start);
        }
        stack.pop();
        break;
      case 'for': {
        const target = parser.takeName();
        if (!parser.acceptKeyword('in')) {
          throw new TemplateError('write `{% for x in list %}`', source, parser.rest.start);
        }
        const iter = parser.expression();
        parser.finish();
        const node: Extract<Node, { kind: 'for' }> = {
          kind: 'for',
          target: target.value,
          iter,
          body: [],
          otherwise: [],
          start: word.start,
        };
        frame.body.push(node);
        stack.push({ tag: 'for', node, body: node.body, inElse: false, start: word.start });
        break;
      }
      case 'endfor':
        parser.finish();
        if (frame.tag !== 'for') {
          throw new TemplateError('`{% endfor %}` without an open `{% for %}`', source, word.start);
        }
        stack.pop();
        break;
      default:
        throw new TemplateError(
          `\`{% ${word.value} %}\` is not supported`,
          source,
          word.start,
          word.end,
        );
    }
  }

  const open = top();
  if (open.tag !== 'root') {
    const close = open.tag === 'if' ? '{% endif %}' : '{% endfor %}';
    throw new TemplateError(
      `\`{% ${open.tag} %}\` is never closed with \`${close}\``,
      source,
      open.start,
    );
  }
  return root.body;
}
