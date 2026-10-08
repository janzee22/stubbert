import { Fragment } from 'react';
import type { ConfigIssue } from '../../lib/api.js';
import { Checkbox, Icon, type IconName, Select } from '../../components/index.js';
import { newRule } from '../../lib/draft.js';
import { type Rule } from '../../lib/tree.js';
import { ValuePicker } from './ValuePicker.js';

type RuleType = Rule['type'];
type NameRule = Extract<Rule, { type: 'name' }>;
type ListRule = Exclude<Rule, NameRule>;

interface TypeOption {
  type: RuleType;
  label: string;
  icon: IconName;
}

const TYPES: TypeOption[] = [
  { type: 'genre', label: 'Genre', icon: 'ticket' },
  { type: 'studio', label: 'Studio', icon: 'film' },
  { type: 'tag', label: 'Tag', icon: 'link' },
  { type: 'name', label: 'Title', icon: 'pencil' },
];
const FIELDS = { genre: 'genres', studio: 'studios', tag: 'tags' } as const;

const LIST_OPERATORS = {
  any: { label: 'is any of', quantifier: 'any', negate: false },
  all: { label: 'is all of', quantifier: 'all', negate: false },
  none: { label: 'is none of', quantifier: 'any', negate: true },
  notAll: { label: 'is not all of', quantifier: 'all', negate: true },
} as const;
type ListOperator = keyof typeof LIST_OPERATORS;

const NAME_OPERATORS = {
  contains: { label: 'contains', match: 'contains', negate: false },
  notContains: { label: 'doesn’t contain', match: 'contains', negate: true },
  exact: { label: 'is exactly', match: 'exact', negate: false },
  notExact: { label: 'isn’t exactly', match: 'exact', negate: true },
  regex: { label: 'matches regex', match: 'regex', negate: false },
  notRegex: { label: 'doesn’t match regex', match: 'regex', negate: true },
} as const;
type NameOperator = keyof typeof NAME_OPERATORS;

function listOperator(rule: ListRule): ListOperator {
  const found = (Object.keys(LIST_OPERATORS) as ListOperator[]).find(
    (k) =>
      LIST_OPERATORS[k].quantifier === rule.quantifier && LIST_OPERATORS[k].negate === rule.negate,
  );
  return found ?? 'any';
}

function nameOperator(rule: NameRule): NameOperator {
  const found = (Object.keys(NAME_OPERATORS) as NameOperator[]).find(
    (k) => NAME_OPERATORS[k].match === rule.match && NAME_OPERATORS[k].negate === rule.negate,
  );
  return found ?? 'contains';
}

function placeholder(rule: Rule): string {
  if (rule.type !== 'name') return `Search ${FIELDS[rule.type]} in your library`;
  return rule.match === 'regex' ? 'Regular expression, Enter to add' : 'Title text, Enter to add';
}

function OperatorSelect({
  rule,
  n,
  onChange,
}: {
  rule: Rule;
  n: number;
  onChange: (r: Rule) => void;
}) {
  if (rule.type === 'name') {
    const current = nameOperator(rule);
    return (
      <Select
        aria-label={`Rule ${n}: how the title matches`}
        value={current}
        onChange={(e) => {
          const op = NAME_OPERATORS[e.target.value as NameOperator];
          onChange({ ...rule, match: op.match, negate: op.negate });
        }}
      >
        {(Object.keys(NAME_OPERATORS) as NameOperator[]).map((k) => (
          <option key={k} value={k}>
            {NAME_OPERATORS[k].label}
          </option>
        ))}
      </Select>
    );
  }
  const current = listOperator(rule);
  const options = (Object.keys(LIST_OPERATORS) as ListOperator[]).filter(
    (k) => k !== 'notAll' || current === 'notAll',
  );
  return (
    <Select
      aria-label={`Rule ${n}: how values match`}
      value={current}
      onChange={(e) => {
        const op = LIST_OPERATORS[e.target.value as ListOperator];
        onChange({ ...rule, quantifier: op.quantifier, negate: op.negate });
      }}
    >
      {options.map((k) => (
        <option key={k} value={k}>
          {LIST_OPERATORS[k].label}
        </option>
      ))}
    </Select>
  );
}

function RuleRow({
  rule,
  index,
  onChange,
  onRemove,
  issues,
}: {
  rule: Rule;
  index: number;
  onChange: (r: Rule) => void;
  onRemove: () => void;
  issues: ConfigIssue[];
}) {
  const n = index + 1;
  const label = TYPES.find((t) => t.type === rule.type)?.label ?? rule.type;
  const changeType = (type: RuleType) => {
    const next = newRule(type);
    const keepValues = (type === 'name') === (rule.type === 'name');
    onChange({ ...next, values: keepValues ? rule.values : [], negate: rule.negate } as Rule);
  };
  return (
    <div
      className={`rule${rule.negate ? ' rule--negated' : ''}${issues.length ? ' is-error' : ''}`}
    >
      <Select
        aria-label={`Rule ${n}: field`}
        value={rule.type}
        onChange={(e) => changeType(e.target.value as RuleType)}
      >
        {TYPES.map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </Select>
      <OperatorSelect rule={rule} n={n} onChange={onChange} />
      <ValuePicker
        values={rule.values}
        onChange={(values) => onChange({ ...rule, values })}
        field={rule.type === 'name' ? undefined : FIELDS[rule.type]}
        label={`Rule ${n}: ${label.toLowerCase()} values`}
        placeholder={placeholder(rule)}
        invalid={issues.length > 0}
      />
      <button
        type="button"
        className="btn btn--ghost btn--icon rule__remove"
        aria-label={`Remove ${label.toLowerCase()} rule`}
        onClick={onRemove}
      >
        <Icon name="trash" />
      </button>
      {rule.type === 'name' && (
        <div className="rule__more">
          <Checkbox
            checked={rule.caseSensitive}
            onChange={(caseSensitive) => onChange({ ...rule, caseSensitive })}
          >
            Match case
          </Checkbox>
          {(rule.values.length > 1 || rule.quantifier === 'all') && (
            <Checkbox
              checked={rule.quantifier === 'all'}
              onChange={(all) => onChange({ ...rule, quantifier: all ? 'all' : 'any' })}
            >
              Every value must match
            </Checkbox>
          )}
        </div>
      )}
      {issues.length > 0 && (
        <div className="rule__issues">
          {issues.map((i) => (
            <p key={i.path + i.message} className="error-msg">
              <Icon name="alert" size={16} strokeWidth={2.5} />
              {i.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function RuleEditor({
  rules,
  combine,
  onChange,
  onCombine,
  issues,
  issuePrefix,
}: {
  rules: Rule[];
  combine: 'any' | 'all';
  onChange: (rules: Rule[]) => void;
  onCombine: (c: 'any' | 'all') => void;
  issues: ConfigIssue[];
  issuePrefix: string;
}) {
  return (
    <div className="col rules-box gap-16">
      {rules.length > 1 && (
        <div className="row wrap gap-10">
          <span className="strong">Include titles that match</span>
          <Select
            aria-label="Combine rules"
            style={{ width: 110 }}
            value={combine}
            onChange={(e) => onCombine(e.target.value as 'any' | 'all')}
          >
            <option value="any">any</option>
            <option value="all">all</option>
          </Select>
          <span className="strong">of these rules</span>
        </div>
      )}
      {rules.length ? (
        <div className="rules">
          {rules.map((rule, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="rule__joiner">{combine === 'all' ? 'and' : 'or'}</span>}
              <RuleRow
                rule={rule}
                index={i}
                onChange={(r) => onChange(rules.map((x, j) => (j === i ? r : x)))}
                onRemove={() => onChange(rules.filter((_, j) => j !== i))}
                issues={issues.filter((x) => x.path.startsWith(`${issuePrefix}.rules[${i}]`))}
              />
            </Fragment>
          ))}
        </div>
      ) : (
        <p className="muted small">
          No rules yet. Without rules this category matches nothing itself, but it can still hold
          sub-categories.
        </p>
      )}
      <div className="add-rule">
        <span className="small muted self-center">Add a rule:</span>
        {TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => onChange([...rules, newRule(t.type)])}
          >
            <Icon name="plus" />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
