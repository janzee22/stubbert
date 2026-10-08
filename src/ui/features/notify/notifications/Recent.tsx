import { useState } from 'react';
import {
  Badge,
  ErrorText,
  Icon,
  Stubbert,
  type BadgeKind,
  type IconName,
} from '../../../components/index.js';
import { api, type ActivityView, type NotifyStatusView } from '../../../lib/api.js';
import { plural, when } from '../../../lib/format.js';
import { KIND_LABELS } from '../../../state/notify.js';

const ACTIVITY_BADGES: Record<
  ActivityView['status'],
  { kind: BadgeKind; icon: IconName; label: string }
> = {
  sent: { kind: 'ok', icon: 'check', label: 'Sent' },
  skipped: { kind: 'same', icon: 'skip', label: 'Skipped' },
  failed: { kind: 'fail', icon: 'alert', label: 'Failed' },
  off: { kind: 'same', icon: 'power', label: 'Off' },
};

function ActivityRow({
  entry,
  onRetry,
}: {
  entry: ActivityView;
  onRetry: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const badge = ACTIVITY_BADGES[entry.status];
  const what = entry.kind ? `${KIND_LABELS[entry.kind]} · ` : '';
  const line =
    entry.error ?? entry.detail ?? (entry.status === 'sent' ? `${what}${when(entry.at)}` : '');
  return (
    <li className="list-row act-row">
      <span>
        <Badge kind={badge.kind} icon={badge.icon}>
          {badge.label}
        </Badge>
      </span>
      <div className="col gap-2 min-w-0 grow">
        <span className="strong">{entry.title}</span>
        <span className="small muted">
          {line}
          {entry.status !== 'sent' && ` · ${when(entry.at)}`}
        </span>
        {entry.warnings.map((w) => (
          <span key={w} className="micro muted">
            {w}
          </span>
        ))}
        {entry.titles.length > 0 && (
          <details className="disclosure">
            <summary className="small">
              <Icon name="chevronRight" size={16} />
              Show titles
            </summary>
            <ul className="small titles-list">
              {entry.titles.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </details>
        )}
        <ErrorText error={error} />
      </div>
      {entry.retryable && (
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            onRetry(entry.id).then(
              () => setBusy(false),
              (err: unknown) => {
                setError(err);
                setBusy(false);
              },
            );
          }}
        >
          <Icon name="refresh" />
          {busy ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </li>
  );
}

export function Recent({
  status,
  activity,
  onChanged,
}: {
  status: NotifyStatusView | undefined;
  activity: ActivityView[] | undefined;
  onChanged: () => void;
}) {
  const [all, setAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>();
  const batch = status?.batch;
  const list = activity ?? [];
  const shown = all ? list : list.slice(0, 8);
  return (
    <aside className="sheet card--pad col notif-recent" aria-labelledby="h-recent">
      <div className="row justify-between">
        <h2 className="h2" id="h-recent">
          Recent
        </h2>
        {list.length > 8 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setAll((a) => !a)}
          >
            {all ? 'Show less' : 'All activity'}
          </button>
        )}
      </div>
      <ul className="col gap-0" aria-label="Recent notifications">
        {batch && (
          <li className="list-row act-row">
            <span>
              <Badge kind="warn" icon="clock">
                Waiting
              </Badge>
            </span>
            <div className="col gap-2 min-w-0 grow">
              <span className="strong">{batch.titles.join(', ')}</span>
              <span className="small muted">
                {plural(batch.items, 'item')} so far · sends at {when(batch.flushAt)} if nothing new
                arrives
              </span>
              <ErrorText error={error} />
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={sending}
              onClick={() => {
                setSending(true);
                setError(undefined);
                api.sendBatchNow().then(
                  () => {
                    setSending(false);
                    onChanged();
                  },
                  (err: unknown) => {
                    setError(err);
                    setSending(false);
                  },
                );
              }}
            >
              {sending ? 'Sending…' : 'Send now'}
            </button>
          </li>
        )}
        {shown.map((entry) => (
          <ActivityRow
            key={entry.id}
            entry={entry}
            onRetry={async (id) => {
              await api.retryNotification(id);
              onChanged();
            }}
          />
        ))}
      </ul>
      {!batch && list.length === 0 && (
        <div className="empty-state" style={{ margin: 'var(--s-5) auto' }}>
          <Stubbert mood="sleepy" width={110} />
          <h3 className="h3">All quiet</h3>
          <p className="small muted">
            The first message goes out when something new lands in Jellyfin. Events sent while
            Stubbert was down are not picked up later.
          </p>
        </div>
      )}
    </aside>
  );
}
