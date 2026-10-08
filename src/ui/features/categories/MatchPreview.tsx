import { Icon, Stubbert } from '../../components/index.js';
import { useEffect, useState, type ReactNode } from 'react';
import { api, type Evaluation, type ValueCount } from '../../lib/api.js';
import { plural } from '../../lib/format.js';
import type { Category } from '../../lib/tree.js';
import { useKnownValues } from './ValuePicker.js';

const DELAY_MS = 500;
const SHOWN = 12;

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] ?? 0;
      row[j] = Math.min(current + 1, (row[j - 1] ?? 0) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = current;
    }
  }
  return row[b.length] ?? Infinity;
}

function closest(value: string, known: readonly ValueCount[] | undefined): string | undefined {
  const v = value.toLowerCase();
  return known?.find((k) => distance(k.name.toLowerCase(), v) <= 2)?.name;
}

function useHints(category: Category, fix: (hint: string, replace: string) => void): ReactNode[] {
  const genres = useKnownValues('genres');
  const studios = useKnownValues('studios');
  const tags = useKnownValues('tags');
  const known = { genre: genres, studio: studios, tag: tags };
  const hints: ReactNode[] = [];
  for (const rule of category.rules) {
    if (rule.type === 'name' || rule.negate) continue;
    const list = known[rule.type];
    if (!list) continue;
    const names = new Set(list.map((k) => k.name.toLowerCase()));
    for (const value of rule.values.filter((v) => !names.has(v.toLowerCase()))) {
      const suggestion = closest(value, list);
      hints.push(
        <>
          “{value}” isn’t a {rule.type} in your library.
          {suggestion && (
            <>
              {' '}
              Did you mean{' '}
              <button type="button" className="link-button" onClick={() => fix(value, suggestion)}>
                {suggestion}
              </button>
              ?
            </>
          )}
        </>,
      );
    }
  }
  if (!category.mediaTypes.includes('Series')) {
    hints.push('Series is off. Turn it on to include TV shows.');
  }
  if (category.combine === 'all' && category.rules.length > 1) {
    hints.push(
      <>
        Rules are combined with <b>all</b>. Try <b>any</b>.
      </>,
    );
  }
  return hints;
}

export function MatchPreview({
  category,
  onReplaceValue,
}: {
  category: Category;
  onReplaceValue: (from: string, to: string) => void;
}) {
  const [result, setResult] = useState<Evaluation>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { mediaTypes, combine, rules } = category;
  const key = JSON.stringify({ mediaTypes, combine, rules });
  const hints = useHints(category, onReplaceValue);

  useEffect(() => {
    const match = JSON.parse(key) as Pick<Category, 'mediaTypes' | 'combine' | 'rules'>;
    const usable = { ...match, rules: match.rules.filter((r) => r.values.length) };
    if (!usable.rules.length) {
      setResult(undefined);
      setError(undefined);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api.evaluate(usable).then(
        (r) => {
          if (cancelled) return;
          setResult(r);
          setError(undefined);
          setLoading(false);
        },
        (err: Error) => {
          if (cancelled) return;
          setError(err.message);
          setLoading(false);
        },
      );
    }, DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  if (!rules.some((r) => r.values.length)) return null;
  if (error) {
    return (
      <div className="sunken" role="status">
        <p className="error-msg">
          <Icon name="alert" size={16} strokeWidth={2.5} />
          {error}
        </p>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="sunken" aria-busy="true">
        <span className="muted small">Counting matches…</span>
      </div>
    );
  }
  if (result.count === 0) {
    return (
      <div className="sunken match-empty" aria-live="polite">
        <Stubbert mood="searching" width={96} />
        <div className="col gap-6">
          <span className="h3">No titles match yet</span>
          {hints.length > 0 && (
            <ul className="hint-list small">
              {hints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }
  const shown = showAll ? result.items : result.items.slice(0, SHOWN);
  return (
    <div className={`sunken matches${loading ? ' is-stale' : ''}`} aria-live="polite">
      <div className="row wrap gap-10">
        <span className="h3 num">{plural(result.count, 'match', 'matches')}</span>
        <span className="muted small">
          {plural(result.movies, 'movie')} · {result.series} series
        </span>
        <span className="spacer" />
        <span className="micro muted">Updated as you type</span>
      </div>
      <ul className="col gap-0">
        {shown.map((i) => (
          <li key={i.id} className="match-row">
            <span className="match-row__art">
              <Icon name={i.type === 'Series' ? 'tv' : 'film'} />
            </span>
            <span className="col gap-0 grow">
              <span className="strong">{i.name}</span>
              <span className="micro muted">{i.type === 'Series' ? 'Series' : 'Movie'}</span>
            </span>
          </li>
        ))}
      </ul>
      {result.items.length > SHOWN && (
        <button
          type="button"
          className="btn btn--ghost btn--sm self-start"
          onClick={() => setShowAll((s) => !s)}
        >
          {showAll ? 'Show fewer' : `Show all ${result.items.length}`}
        </button>
      )}
      {result.count > result.items.length && showAll && (
        <p className="micro muted">
          Showing the first {result.items.length} of {result.count}.
        </p>
      )}
    </div>
  );
}
