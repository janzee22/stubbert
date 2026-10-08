export type TokenClass = 'tk-text' | 'tk-var' | 'tk-tag' | 'tk-filter' | 'tk-md' | 'tk-err';

export interface Segment {
  c: TokenClass;
  t: string;
}

interface Span {
  start: number;
  end: number;
  c: TokenClass;
}

function closeOf(source: string, from: number, close: string): number {
  const at = source.indexOf(close, from);
  return at === -1 ? source.length : at + close.length;
}

function outputSpans(source: string, start: number, end: number): Span[] {
  const found: Span[] = [];
  const inner = source.slice(start, end);
  let cursor = 0;
  let mode: TokenClass = 'tk-var';
  let quote: string | undefined;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '|') {
      if (i > cursor) found.push({ start: start + cursor, end: start + i, c: mode });
      cursor = i;
      mode = 'tk-filter';
    }
    if (ch === '}' && inner[i + 1] === '}' && mode === 'tk-filter') {
      found.push({ start: start + cursor, end: start + i, c: mode });
      cursor = i;
      mode = 'tk-var';
    }
  }
  if (cursor < inner.length) found.push({ start: start + cursor, end, c: mode });
  return found;
}

const MARKDOWN = /\[|\]\(|\)|\*\*|__|~~|`/g;

function textSpans(source: string, start: number, end: number): Span[] {
  const found: Span[] = [];
  let cursor = start;
  MARKDOWN.lastIndex = 0;
  const text = source.slice(start, end);
  for (let m = MARKDOWN.exec(text); m; m = MARKDOWN.exec(text)) {
    const at = start + m.index;
    if (at > cursor) found.push({ start: cursor, end: at, c: 'tk-text' });
    found.push({ start: at, end: at + m[0].length, c: 'tk-md' });
    cursor = at + m[0].length;
  }
  if (cursor < end) found.push({ start: cursor, end, c: 'tk-text' });
  return found;
}

export function tokenSpans(source: string): Span[] {
  const out: Span[] = [];
  const open = /\{\{|\{%|\{#/g;
  let cursor = 0;
  for (let m = open.exec(source); m; m = open.exec(source)) {
    if (m.index > cursor) out.push(...textSpans(source, cursor, m.index));
    let end: number;
    if (m[0] === '{{') {
      end = closeOf(source, m.index + 2, '}}');
      out.push(...outputSpans(source, m.index, end));
    } else if (m[0] === '{%') {
      end = closeOf(source, m.index + 2, '%}');
      out.push({ start: m.index, end, c: 'tk-tag' });
    } else {
      end = closeOf(source, m.index + 2, '#}');
      out.push({ start: m.index, end, c: 'tk-md' });
    }
    cursor = end;
    open.lastIndex = end;
  }
  if (cursor < source.length) out.push(...textSpans(source, cursor, source.length));
  return out;
}

export function highlight(
  source: string,
  errors: ReadonlyArray<{ start: number; end: number }> = [],
): Segment[][] {
  const bounds = new Set<number>([0, source.length]);
  const base = tokenSpans(source);
  for (const s of base) bounds.add(s.start).add(s.end);
  for (const e of errors) bounds.add(Math.max(0, e.start)).add(Math.min(source.length, e.end));
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') bounds.add(i).add(i + 1);
  const cuts = [...bounds].toSorted((a, b) => a - b);
  const lines: Segment[][] = [[]];
  let spanIndex = 0;
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i] as number;
    const end = cuts[i + 1] as number;
    if (end <= start) continue;
    const text = source.slice(start, end);
    if (text === '\n') {
      lines.push([]);
      continue;
    }
    while (spanIndex < base.length && (base[spanIndex] as Span).end <= start) spanIndex++;
    const span = base[spanIndex];
    const inError = errors.some((e) => e.start <= start && end <= e.end && e.end > e.start);
    const c: TokenClass = inError ? 'tk-err' : (span?.c ?? 'tk-text');
    const line = lines.at(-1) as Segment[];
    const last = line.at(-1);
    if (last && last.c === c) last.t += text;
    else line.push({ c, t: text });
  }
  return lines;
}
