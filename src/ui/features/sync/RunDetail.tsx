import { useEffect, useState } from 'react';
import { useOpenCategory } from '../../app/openCategory.js';
import { Banner, ErrorText, Icon, PosterThumb, Segmented } from '../../components/index.js';
import { useLoad } from '../../hooks/useLoad.js';
import { api, type RunRecord } from '../../lib/api.js';
import { duration, plural, when } from '../../lib/format.js';
import { CategoryStatusBadge, RunStatusBadge, TRIGGERS } from './badges.js';
import { usePlacements } from './ReportTable.js';
import { summarize } from './summary.js';

function headline(run: RunRecord): string {
  if (run.status === 'running') return 'Syncing…';
  if (!run.report) return 'The sync failed';
  const t = summarize(run.report);
  if (!t.changed && !t.skipped.length) return 'Nothing changed';
  const parts = [
    t.changed && `${t.changed} changed`,
    t.skipped.length && `${t.skipped.length} skipped`,
  ];
  return parts.filter(Boolean).join(', ');
}

function RunReport({ run }: { run: RunRecord }) {
  const placements = usePlacements();
  const rows = (run.report?.categories ?? []).filter((c) => c.status !== 'ok');
  if (!rows.length) return <p className="muted small">No category changed in this run.</p>;
  return (
    <ul className="col gap-0">
      {rows.map((c) => (
        <li key={c.categoryId} className="check-row items-center">
          <PosterThumb file={placements.get(c.categoryId)?.poster} name={c.name} size="xs" />
          <span className="strong grow">{c.name}</span>
          <CategoryStatusBadge status={c.status} />
          <span className="small num text-right" style={{ minWidth: 64 }}>
            {c.add.length > 0 && <span className="delta-add">+{c.add.length} </span>}
            {c.remove.length > 0 && <span className="delta-rem">−{c.remove.length}</span>}
            {!c.add.length && !c.remove.length && (
              <span className="muted">{plural(c.matchedCount, 'title')}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RunLog({ run }: { run: RunRecord }) {
  const [copied, setCopied] = useState(false);
  const text = run.log.join('\n');
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-${run.id}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="col gap-10">
      <div className="row">
        <span className="h3 grow">Log</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={download}>
          <Icon name="download" />
          Download
        </button>
      </div>
      <div className="log" role="log" aria-label="Run log">
        {run.log.length ? run.log.map((line, i) => <div key={i}>{line}</div>) : 'No log lines.'}
      </div>
    </div>
  );
}

export function RunDetail({ id }: { id: string }) {
  const openCategory = useOpenCategory();
  const { data: run, error, reload } = useLoad(() => api.run(id), id);
  const [tab, setTab] = useState<'report' | 'log'>('report');
  const running = run?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void reload(), 1500);
    return () => clearInterval(timer);
  }, [running, reload]);

  if (error) return <ErrorText error={error} />;
  if (!run) return <div className="skel" style={{ height: 320 }} aria-busy="true" />;
  const trigger = TRIGGERS[run.trigger];
  const skipped = run.report?.categories.filter((c) => c.status === 'skipped') ?? [];
  return (
    <section className="sheet col" aria-label="Run details">
      <div className="row wrap gap-12">
        <div className="col gap-2 grow">
          <span className="eyebrow">
            {trigger.label} · {when(run.startedAt)}
            {run.finishedAt && ` · ${duration(run.startedAt, run.finishedAt)}`}
            {run.force && ' · guards off'}
          </span>
          <h2 className="h1">{headline(run)}</h2>
        </div>
        <RunStatusBadge run={{ status: run.status, warnings: run.report?.warnings.length }} />
      </div>
      {run.error && (
        <Banner kind="fail" icon="alert" title="The sync stopped">
          {run.error}
        </Banner>
      )}
      {run.report?.errors.map((e) => (
        <Banner key={e} kind="fail" icon="alert" title="A category failed">
          {e}
        </Banner>
      ))}
      {skipped.map((c) => (
        <Banner
          key={c.categoryId}
          kind="warn"
          icon="shield"
          title={`${c.name} was skipped`}
          actions={
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => openCategory(c.categoryId)}
            >
              Check {c.name}
            </button>
          }
        >
          It {c.skipped}. If that’s what you want, sync once with “Ignore safety guards”.
        </Banner>
      ))}
      <Segmented
        label="Run details"
        options={[
          { value: 'report', label: 'Report', icon: 'runs' },
          { value: 'log', label: 'Log', icon: 'terminal' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'report' ? <RunReport run={run} /> : <RunLog run={run} />}
    </section>
  );
}
