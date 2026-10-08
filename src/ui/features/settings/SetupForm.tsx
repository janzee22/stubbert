import { useState } from 'react';
import { ErrorText, Field, Icon } from '../../components/index.js';
import { useAction } from '../../hooks/useAction.js';
import { api, type SetupResult } from '../../lib/api.js';

function SetupSteps({ result }: { result: SetupResult }) {
  return (
    <ul className="col gap-0">
      {result.steps.map((s) => (
        <li key={s.text} className="check-row items-center">
          <span className={`check-ico ${s.status === 'ok' ? 'check-ico--ok' : 'check-ico--wait'}`}>
            <Icon name={s.status === 'ok' ? 'check' : 'arrowRight'} size={16} strokeWidth={3} />
          </span>
          <span className="grow">
            {s.text}
            {s.status === 'plan' && <span className="sr-only"> (not done yet)</span>}
          </span>
          <span className="small strong muted">{s.status === 'ok' ? 'Done' : 'To do'}</span>
        </li>
      ))}
    </ul>
  );
}

export function SetupForm({
  onApplied,
  applyLabel = 'Set up',
}: {
  onApplied: (libraryId: string) => void | Promise<void>;
  applyLabel?: string;
}) {
  const [name, setName] = useState('Categories');
  const [path, setPath] = useState('');
  const [result, setResult] = useState<SetupResult>();
  const action = useAction();

  const run = async (apply: boolean) => {
    const res = await action.run(async () => {
      const r = await api.setup({ name: name.trim(), path: path.trim() || undefined, apply });
      if (apply && r.libraryId) await onApplied(r.libraryId);
      return r;
    });
    setResult(res);
  };
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setResult(undefined);
  };
  const pending = result?.steps.some((s) => s.status === 'plan');

  return (
    <div className="col gap-18">
      <div className="two-col">
        <Field label="Library name">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={name}
              onChange={(e) => edit(setName)(e.target.value)}
            />
          )}
        </Field>
        <Field label="Folder" optional help="Leave empty to use Jellyfin’s own data folder.">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input input--mono"
              value={path}
              placeholder="/media/categories"
              aria-describedby={describedBy}
              onChange={(e) => edit(setPath)(e.target.value)}
            />
          )}
        </Field>
      </div>
      <p className="help">
        A folder in Jellyfin’s data folder is included in Jellyfin backups. Another folder must
        exist already, written as Jellyfin sees it. An existing library with this name is reused,
        never deleted.
      </p>
      {result && <SetupSteps result={result} />}
      <ErrorText error={action.error} />
      <div className="row wrap gap-12">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => void run(false)}
          disabled={action.busy || !name.trim()}
        >
          <Icon name="eye" />
          {action.busy ? 'Working…' : 'Check first'}
        </button>
        {result && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void run(true)}
            disabled={action.busy}
          >
            <Icon name={pending ? 'wand' : 'check'} />
            {pending ? applyLabel : 'Use this library'}
          </button>
        )}
      </div>
    </div>
  );
}
