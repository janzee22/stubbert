import { checkNames } from './check.js';
import { TemplateError } from './errors.js';
import { parse, type Node } from './parser.js';
import { pathText, renderNodes, type Value } from './render.js';

export { TemplateError } from './errors.js';
export type { Value } from './render.js';

export interface TemplateIssue {
  kind: 'syntax' | 'unknown';
  line: number;
  message: string;
  start: number;
  end: number;
  found?: string;
  suggestion?: string;
}

const cache = new Map<string, Node[]>();

export function compile(source: string): Node[] {
  const hit = cache.get(source);
  if (hit) return hit;
  const nodes = parse(source);
  if (cache.size > 200) cache.clear();
  cache.set(source, nodes);
  return nodes;
}

function issueOf(err: TemplateError, kind: TemplateIssue['kind']): TemplateIssue {
  return { kind, line: err.line, message: err.message, start: err.offset, end: err.end };
}

export function validate(source: string, shape: Record<string, Value>): TemplateIssue[] {
  let nodes: Node[];
  try {
    nodes = compile(source);
  } catch (err) {
    if (err instanceof TemplateError) return [issueOf(err, 'syntax')];
    throw err;
  }
  return checkNames(source, nodes, shape).map((p) => ({
    ...issueOf(p.error, 'unknown'),
    found: p.found,
    suggestion: p.suggestion,
  }));
}

export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = text.slice(0, max);
  const space = room.search(/\s\S*$/);
  const cut = space > max / 2 ? room.slice(0, space) : text.slice(0, max - 1);
  return `${cut.replace(/[\s.,;:]+$/, '')}…`;
}

export function render(source: string, context: Record<string, Value>): string {
  return tidy(renderNodes(source, compile(source), context));
}

function collectIfPaths(nodes: Node[], loopNames: ReadonlySet<string>, out: Set<string>) {
  for (const node of nodes) {
    if (node.kind === 'if') {
      const first = node.branches[0];
      const path = first && pathText(first.test);
      if (path && !loopNames.has(path.split('.')[0] ?? '')) out.add(path);
      for (const branch of node.branches) collectIfPaths(branch.body, loopNames, out);
      collectIfPaths(node.otherwise, loopNames, out);
    } else if (node.kind === 'for') {
      collectIfPaths(node.body, new Set([...loopNames, node.target, 'loop']), out);
      collectIfPaths(node.otherwise, loopNames, out);
    }
  }
}

export function ifConditions(source: string): string[] {
  const out = new Set<string>();
  collectIfPaths(compile(source), new Set(), out);
  return [...out];
}
