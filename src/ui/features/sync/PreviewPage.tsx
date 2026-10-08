import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Checkbox, ErrorText, Icon, Spinner, Stubbert } from '../../components/index.js';
import { api, type CategoryReport, type RunRecord, type SyncReport } from '../../lib/api.js';
import { plural, when } from '../../lib/format.js';
import { useDraft } from '../../state/draft.js';
import { useStatus } from '../../state/status.js';
import { ReportTable } from './ReportTable.js';
import { RunningSync } from './RunningSync.js';
import { sentence, summarize } from './summary.js';
import { Tallies } from './Tallies.js';

type Status = CategoryReport['status'];

export function PreviewPage() {
  const { dirty, save, saving } = useDraft();
  const { status, refreshStatus } = useStatus();
  const [force, setForce] = useState(false);
  const [report, setReport] = useState<SyncReport>();
  const [previewedAt, setPreviewedAt] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>();
  const [run, setRun] = useState<RunRecord>();
  const [plan, setPlan] = useState<SyncReport>();
  const [filter, setFilter] = useState<Set<Status>>(new Set());
  const started = useRef(false);

  const preview = useCallback(async (withForce: boolean) => {
    setLoading(true);
    setError(undefined);
    setRun(undefined);
    try {
      setReport(await api.preview(withForce));
      setPreviewedAt(new Date().toISOString());
      setFilter(new Set());
    } catch (err) {
      setError(err);
      setReport(undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  const other = status?.running && status.running.id !== run?.id ? status.running : undefined;

  useEffect(() => {
    if (started.current || !status || other) return;
    started.current = true;
    void preview(false);
  }, [status, other, preview]);

  const sync = async () => {
    setError(undefined);
    try {
      const begun = await api.sync(force);
      setPlan(report);
      setReport(undefined);
      setRun({ ...begun, log: [] });
      void refreshStatus();
    } catch (err) {
      setError(err);
    }
  };

  const runId = run?.id;
  const runDone = !!run && run.status !== 'running';
  useEffect(() => {
    if (!runId || runDone) return;
    const timer = setInterval(() => {
      api.run(runId).then(
        (r) => {
          setRun(r);
          if (r.status !== 'running') void refreshStatus();
        },
        () => undefined,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [runId, runDone, refreshStatus]);

  const saveAndPreview = async () => {
    if (await save()) await preview(force);
  };

  const toggleForce = (next: boolean) => {
    setForce(next);
    void preview(next);
  };
  const toggleFilter = (s: Status) =>
    setFilter((f) => {
      const next = new Set(f);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  if (run) return <RunningSync run={run} plan={plan} onAgain={() => void preview(force)} />;

  const t = report && summarize(report);

  return (
    <>
      <div className="page-head">
        <div className="col gap-4 grow">
          <h1 className="display">Preview &amp; sync</h1>
          <p className="muted">
            A dry run: this is what Jellyfin would get. Nothing changes until you press Sync.
          </p>
        </div>
        {previewedAt && <span className="small muted">Previewed {when(previewedAt)}</span>}
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => void preview(force)}
          disabled={loading || !!other}
        >
          {loading ? <Spinner /> : <Icon name="refresh" />}
          {loading ? 'Checking…' : 'Preview again'}
        </button>
      </div>

      {dirty && (
        <Banner
          kind="info"
          icon="info"
          title="You have unsaved changes"
          actions={
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => void saveAndPreview()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save and preview'}
            </button>
          }
        >
          The preview uses your saved categories. Save first if you want to include them.
        </Banner>
      )}
      {other && (
        <Banner
          kind="info"
          icon="refresh"
          title={`A ${other.trigger === 'schedule' ? 'scheduled' : other.trigger} sync is running`}
          actions={
            <a className="btn btn--secondary btn--sm" href={`#/runs/${other.id}`}>
              Follow it
            </a>
          }
        >
          Preview again when it has finished.
        </Banner>
      )}
      {error !== undefined && (
        <div className="empty-state">
          <Stubbert mood="worried" />
          <h2 className="h1">The preview didn’t finish</h2>
          <ErrorText error={error} />
          <div className="row wrap gap-10 justify-center">
            <a className="btn btn--primary" href="#/settings">
              <Icon name="key" />
              Check the connection
            </a>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void preview(force)}
            >
              <Icon name="refresh" />
              Try again
            </button>
          </div>
        </div>
      )}
      {loading && !report && (
        <div className="col gap-12" aria-busy="true" aria-label="Loading preview">
          <div className="skel" style={{ height: 96 }} />
          <div className="skel" style={{ height: 56 }} />
          <div className="skel" style={{ height: 240 }} />
        </div>
      )}

      {report && t && (
        <>
          <Tallies report={report} filter={filter} onToggle={toggleFilter} />
          {t.skipped.map((s) => (
            <Banner
              key={s.categoryId}
              kind="warn"
              icon="shield"
              title={`${s.name} is skipped by a safety guard`}
            >
              It {s.skipped}. The guard stops any category that loses more than half its titles, or
              all of them.
            </Banner>
          ))}
          {t.changed === 0 && t.skipped.length === 0 ? (
            <Banner kind="ok" icon="check" title="Everything is in sync">
              Every collection in Jellyfin already matches its rules.
            </Banner>
          ) : (
            <div className="ready-row">
              <div className="col">
                <span className="h3">
                  {t.changed
                    ? `Ready to sync ${plural(t.changed, 'category', 'categories')}`
                    : 'Nothing to sync while the guards are on'}
                </span>
                <span className="small muted">{sentence(report)}</span>
              </div>
              <div className="col gap-0">
                <Checkbox checked={force} onChange={toggleForce} disabled={loading}>
                  <Icon name="shield" /> Ignore safety guards
                </Checkbox>
                {t.skipped.length > 0 && !force && (
                  <span className="micro muted" style={{ marginLeft: 36, maxWidth: 300 }}>
                    Also syncs {t.skipped.map((s) => s.name).join(', ')}.
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={() => void sync()}
                disabled={!t.changed || !!other || loading}
              >
                <Icon name="refresh" size={20} />
                {t.changed
                  ? `Sync ${plural(t.changed, 'category', 'categories')}`
                  : 'Nothing to sync'}
              </button>
            </div>
          )}
          {report.errors.map((e) => (
            <p key={e} className="error-msg">
              <Icon name="alert" size={16} strokeWidth={2.5} />
              {e}
            </p>
          ))}
          <ReportTable report={report} filter={filter} />
        </>
      )}
    </>
  );
}
