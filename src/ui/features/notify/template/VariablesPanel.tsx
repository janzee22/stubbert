import { useMemo, useState } from 'react';
import { Icon } from '../../../components/index.js';
import type { Variable } from '../../../lib/api.js';

export function VariablesPanel({
  all,
  onInsert,
}: {
  all: Variable[];
  onInsert: (path: string, value: string) => void;
}) {
  const [search, setSearch] = useState('');
  const variables = useMemo(
    () => all.filter((v) => v.path.toLowerCase().includes(search.trim().toLowerCase())),
    [all, search],
  );
  return (
    <section className="col rule-top gap-12" aria-labelledby="h-vars">
      <div className="row wrap justify-between">
        <h2 className="h2" id="h-vars">
          Variables
        </h2>
        <span className="small muted">Values from the selected preview item</span>
      </div>
      <div className="input-wrap">
        <input
          className="input"
          aria-label="Search variables"
          placeholder="Search variables"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Icon name="search" />
      </div>
      <ul className="vars">
        {variables.map((v) => (
          <li key={v.path} className="var">
            <span className="var__name">{v.path}</span>
            <span className="var__val">{v.value || '(empty for this item)'}</span>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label={`Insert ${v.path}`}
              onClick={() => onInsert(v.path, v.value)}
            >
              <Icon name="plus" />
            </button>
          </li>
        ))}
      </ul>
      <p className="help">
        Loop over episodes with <code>{'{% for e in episodes %}…{% endfor %}'}</code>. Filters:
        truncate, pad, upper, lower, default, join, map, length.
      </p>
    </section>
  );
}
