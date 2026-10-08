import { TemplateError } from './errors.js';

export type Chunk =
  | { type: 'text'; value: string; start: number }
  | { type: 'output'; source: string; start: number; end: number }
  | { type: 'tag'; source: string; start: number; end: number };

export type TokenType = 'name' | 'number' | 'string' | 'op' | 'end';

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

const OPEN = /\{\{|\{%|\{#/g;
const CLOSE: Record<string, string> = { '{{': '}}', '{%': '%}', '{#': '#}' };
const UNCLOSED: Record<string, string> = {
  '{{': '`{{` has no closing `}}`',
  '{%': '`{%` has no closing `%}`',
  '{#': 'a comment has no closing `#}`',
};
const ESCAPES: Record<string, string> = { n: '\n', t: '\t' };
const OPERATORS = [
  '==',
  '!=',
  '<=',
  '>=',
  '//',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '~',
  '|',
  '.',
  ',',
  '(',
  ')',
  '[',
  ']',
  '=',
  ':',
];

function findClose(source: string, from: number, close: string): number {
  let quote: string | undefined;
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (source.startsWith(close, i)) {
      return i;
    }
  }
  return -1;
}

function tagOnlyLines(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = 0;
  for (const line of source.split('\n')) {
    const end = start + line.length;
    const hasTag = /\{%|\{#/.test(line) && !line.includes('{{');
    if (hasTag && !line.replace(/\{%.*?%\}|\{#.*?#\}/g, '').trim()) {
      ranges.push([start, Math.min(end + 1, source.length)]);
    }
    start = end + 1;
  }
  return ranges;
}

function dropRanges(value: string, start: number, ranges: Array<[number, number]>): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const at = start + i;
    if (!ranges.some(([a, b]) => at >= a && at < b)) out += value[i];
  }
  return out;
}

export function chunk(source: string): Chunk[] {
  const chunks: Chunk[] = [];
  const blockLines = tagOnlyLines(source);
  let pos = 0;
  let trimNext = false;
  const pushText = (value: string, start: number) => {
    const trimmed = trimNext ? value.replace(/^\s+/, '') : value;
    trimNext = false;
    const offset = start + (value.length - trimmed.length);
    const text = blockLines.length ? dropRanges(trimmed, offset, blockLines) : trimmed;
    if (text) chunks.push({ type: 'text', value: text, start: offset });
  };
  OPEN.lastIndex = 0;
  for (let m = OPEN.exec(source); m; m = OPEN.exec(source)) {
    const open = m[0];
    const start = m.index;
    const close = CLOSE[open] ?? '}}';
    const endAt =
      open === '{#' ? source.indexOf('#}', start + 2) : findClose(source, start + 2, close);
    if (endAt === -1) {
      const what = UNCLOSED[open] ?? 'a tag is not closed';
      throw new TemplateError(what, source, start);
    }
    let text = source.slice(pos, start);
    let innerStart = start + 2;
    let innerEnd = endAt;
    if (source[innerStart] === '-') {
      text = text.replace(/\s+$/, '');
      innerStart++;
    }
    pushText(text, pos);
    const trimAfter = source[innerEnd - 1] === '-' && innerEnd - 1 >= innerStart;
    if (trimAfter) innerEnd--;
    if (open !== '{#') {
      chunks.push({
        type: open === '{{' ? 'output' : 'tag',
        source: source.slice(innerStart, innerEnd),
        start: innerStart,
        end: innerEnd,
      });
    }
    trimNext = trimAfter;
    pos = endAt + 2;
    OPEN.lastIndex = pos;
  }
  pushText(source.slice(pos), pos);
  return chunks;
}

export function tokenize(source: string, from: number, to: number): Token[] {
  const tokens: Token[] = [];
  let i = from;
  while (i < to) {
    const c = source[i] ?? '';
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < to && /\w/.test(source[j] ?? '')) j++;
      tokens.push({ type: 'name', value: source.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (/\d/.test(c)) {
      let j = i + 1;
      while (j < to && /[\d.]/.test(source[j] ?? '')) j++;
      if (source[j - 1] === '.') j--;
      tokens.push({ type: 'number', value: source.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let value = '';
      while (j < to && source[j] !== c) {
        if (source[j] === '\\' && j + 1 < to) {
          const n = source[j + 1];
          value += ESCAPES[n ?? ''] ?? n;
          j += 2;
        } else {
          value += source[j];
          j++;
        }
      }
      if (j >= to) throw new TemplateError('a text in quotes is not closed', source, i);
      tokens.push({ type: 'string', value, start: i, end: j + 1 });
      i = j + 1;
      continue;
    }
    const op = OPERATORS.find((o) => source.startsWith(o, i));
    if (!op) throw new TemplateError(`\`${c}\` is not allowed here`, source, i);
    tokens.push({ type: 'op', value: op, start: i, end: i + op.length });
    i += op.length;
  }
  tokens.push({ type: 'end', value: '', start: to, end: to });
  return tokens;
}
