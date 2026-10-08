import type { Category, Rule } from '../../shared/api.js';

function ruleVerb(r: Rule): string {
  if (r.type !== 'name') {
    const all = r.quantifier === 'all' ? ' all of' : '';
    return r.negate ? `is not${all}` : `is${all}`;
  }
  const verbs = {
    contains: ['contains', 'doesn’t contain'],
    exact: ['is', 'is not'],
    regex: ['matches', 'doesn’t match'],
  } as const;
  const verb = verbs[r.match][r.negate ? 1 : 0];
  return r.quantifier === 'all' ? `${verb} all of` : verb;
}

export function describeRule(r: Rule): string {
  const vals =
    r.values.length > 2
      ? `${r.values.slice(0, 2).join(', ')} +${r.values.length - 2}`
      : r.values.join(', ') || '…';
  return `${r.type === 'name' ? 'title' : r.type} ${ruleVerb(r)} ${vals}`;
}

export function describeRules(c: Category): string {
  if (!c.rules.length) return c.children.length ? 'Container only' : 'No rules';
  return c.rules.map(describeRule).join(c.combine === 'all' ? ' and ' : ' or ');
}
