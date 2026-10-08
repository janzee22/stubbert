import { useEffect, useState } from 'react';
import { ErrorText, Icon, Segmented, Stubbert } from '../../components/index.js';
import { useLoad } from '../../hooks/useLoad.js';
import { api, type RunSummary } from '../../lib/api.js';
import { duration, relative, when } from '../../lib/format.js';
import { useStatus } from '../../state/status.js';
import { RunStatusBadge, TRIGGERS } from './badges.js';
import { RunDetail } from './RunDetail.js';

type Filter = 'all' | 'warnings' | 'failed';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'warnings', label: 'Warnings', icon: 'warning' },
  { value: 'failed', label: 'Failed', icon: 'alert' },
] as const;

function matchesFilter(run: RunSummary, filter: Filter): boolean {
  if (filter === 'failed') return run.status === 'failed';
  if (filter === 'warnings') return run.status === 'warnings';
  return true;
}

export function RunsPage({ id }: { id?: string }) {
  const { status } = useStatus();
  const { data: runs, error, reload } = useLoad(() => api.runs());
  const [filter, setFilter] = useState<Filter>('all');
  const runningId = status?.running?.id;
  const lastId = status?.lastRun?.id;
  useEffect(() => {
    void reload();
  }, [runningId, lastId, reload]);
  const shown = runs?.filter((r) => matchesFilter(r, filter)) ?? [];

  if (runs?.length === 0) {
    return (
      <div className="empty-state">
        <Stubbert mood="sleepy" />
        <h1 className="h1">No runs yet</h1>
        <p className="muted">
          Nothing has been written to Jellyfin. Preview a sync first to see what would happen, so
          there are no surprises.
        </p>
        <a className="btn btn--primary btn--lg" href="#/preview">
          <Icon name="eye" size={20} />
          Preview first sync
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div className="col gap-4 grow">
          <h1 className="display">Runs</h1>
          <p className="muted">
            Every sync that could write, newest first.{' '}
            {status?.nextRunAt
              ? `Next scheduled sync ${when(status.nextRunAt)}.`
              : 'Scheduled syncs are off.'}
          </p>
        </div>
        <Segmented
          label="Filter runs"
          large
          options={FILTERS}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <ErrorText error={error} />
      <div className={`runs-layout${id ? ' has-selection' : ''}`}>
        <div className="runs-list table-scroll">
          <table className="report report--cards">
            <thead>
              <tr>
                <th>Started</th>
                <th>Trigger</th>
                <th>Result</th>
                <th className="r">Changed</th>
                <th className="r">+/−</th>
                <th className="r">Took</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const trigger = TRIGGERS[r.trigger];
                const selected = r.id === id;
                return (
                  <tr
                    key={r.id}
                    className={`is-link${selected ? ' is-selected' : ''}`}
                    onClick={() => {
                      location.hash = `#/runs/${r.id}`;
                    }}
                  >
                    <td>
                      <a
                        href={`#/runs/${r.id}`}
                        className="strong"
                        style={{ color: 'var(--ink)' }}
                        aria-current={selected ? 'page' : undefined}
                      >
                        {when(r.startedAt)}
                      </a>
                      <div className="micro muted">{relative(r.startedAt)}</div>
                      {r.error && (
                        <div className="micro" style={{ color: 'var(--fail)', fontWeight: 700 }}>
                          {r.error.slice(0, 60)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="row gap-6">
                        <Icon name={trigger.icon} size={15} />
                        {trigger.label}
                      </span>
                    </td>
                    <td>
                      <RunStatusBadge run={r} />
                    </td>
                    <td className="r num" data-label="Changed">
                      {r.totals?.changed ?? '—'}
                    </td>
                    <td className="r num" data-label="+/−">
                      {r.totals?.added ? (
                        <span className="delta-add">+{r.totals.added} </span>
                      ) : null}
                      {r.totals?.removed ? (
                        <span className="delta-rem">−{r.totals.removed}</span>
                      ) : null}
                      {!r.totals?.added && !r.totals?.removed && <span className="muted">—</span>}
                    </td>
                    <td className="r num muted" data-label="Took">
                      {duration(r.startedAt, r.finishedAt) || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {runs && shown.length === 0 && (
            <p className="muted" style={{ padding: 16 }}>
              No runs with {filter}.
            </p>
          )}
        </div>
        {id ? (
          <div className="col gap-12">
            <a className="btn btn--ghost back-link" href="#/runs">
              <Icon name="chevronLeft" />
              All runs
            </a>
            <RunDetail id={id} />
          </div>
        ) : (
          runs && (
            <div className="empty-state">
              <Stubbert mood="smile" width={100} />
              <p className="muted">Pick a run to see its changes and log.</p>
            </div>
          )
        )}
      </div>
    </>
  );
}
