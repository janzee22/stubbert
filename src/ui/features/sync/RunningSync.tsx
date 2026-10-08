import type { RunRecord, SyncReport } from '../../lib/api.js';
import { when } from '../../lib/format.js';
import { SyncDone } from './SyncDone.js';
import { SyncProgress } from './SyncProgress.js';

export function RunningSync({
  run,
  plan,
  onAgain,
}: {
  run: RunRecord;
  plan: SyncReport | undefined;
  onAgain: () => void;
}) {
  const runDone = run.status !== 'running';
  return (
    <>
      <div className="page-head">
        <div className="col gap-4 grow">
          <h1 className="display">{runDone ? 'Sync finished' : 'Syncing…'}</h1>
          <p className="muted">
            Started {when(run.startedAt)} by you.
            {!runDone && ' You can leave this page; the sync keeps going.'}
          </p>
        </div>
      </div>
      <div className="sync-layout">
        <SyncProgress run={run} plan={plan} />
        {runDone ? (
          <SyncDone run={run} onAgain={onAgain} />
        ) : (
          <div className="sheet done-card col">
            <span className="eyebrow self-start">Log</span>
            <div className="log self-stretch text-left" role="log" aria-label="Sync log">
              {run.log.length ? run.log.map((l, i) => <div key={i}>{l}</div>) : 'Starting…'}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
