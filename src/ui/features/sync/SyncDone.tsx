import { Icon, Stubbert } from '../../components/index.js';
import type { RunRecord } from '../../lib/api.js';
import { plural } from '../../lib/format.js';
import { summarize } from './summary.js';

export function SyncDone({ run, onAgain }: { run: RunRecord; onAgain: () => void }) {
  const failed = run.status === 'failed';
  const t = run.report && summarize(run.report);
  return (
    <div className="sheet done-card col">
      <Stubbert mood={failed ? 'worried' : 'party'} width={150} />
      <h2 className="h1">{failed ? 'The sync didn’t finish' : 'All synced. Grab the popcorn.'}</h2>
      {failed && run.error && <p className="muted">{run.error}</p>}
      {t && (
        <p className="muted">
          {plural(t.changed, 'category', 'categories')} updated
          {t.added ? `, +${plural(t.added, 'title')}` : ''}
          {t.removed ? `, −${plural(t.removed, 'title')}` : ''}.
          {t.skipped.length
            ? ` ${t.skipped.map((s) => s.name).join(', ')} skipped by a safety guard.`
            : ''}
        </p>
      )}
      {run.report?.errors.map((e) => (
        <p key={e} className="error-msg">
          <Icon name="alert" size={16} strokeWidth={2.5} />
          {e}
        </p>
      ))}
      <div className="row wrap gap-10 justify-center">
        <a className="btn btn--primary" href={`#/runs/${run.id}`}>
          <Icon name="runs" />
          View report
        </a>
        <button type="button" className="btn btn--ghost" onClick={onAgain}>
          Preview again
        </button>
      </div>
    </div>
  );
}
