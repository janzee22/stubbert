import { Icon, Spinner, type IconName } from '../components/index.js';
import type { Status } from '../lib/api.js';
import { relative, when } from '../lib/format.js';
import { useStatus } from '../state/status.js';

interface PillState {
  kind: 'ok' | 'sync' | 'fail' | 'warn';
  icon: IconName | 'spinner';
  text: string;
  href: string;
}

function pillState(status: Status): PillState {
  if (status.running) {
    return { kind: 'sync', icon: 'spinner', text: 'Syncing…', href: `#/runs/${status.running.id}` };
  }
  if (status.notifications.failing) {
    return { kind: 'fail', icon: 'bell', text: 'Notifications failing', href: '#/notifications' };
  }
  const last = status.lastRun;
  if (!last) return { kind: 'warn', icon: 'clock', text: 'Never synced', href: '#/preview' };
  const href = `#/runs/${last.id}`;
  if (last.status === 'failed') {
    return { kind: 'fail', icon: 'alert', text: 'Last sync failed', href };
  }
  const text = `Synced ${relative(last.finishedAt ?? last.startedAt)}`;
  if (last.status === 'warnings') return { kind: 'warn', icon: 'warning', text, href };
  return { kind: 'ok', icon: 'check', text, href };
}

export function StatusPill({ withNext = true }: { withNext?: boolean }) {
  const { status } = useStatus();
  if (!status) return null;
  const pill = pillState(status);
  const next = status.nextRunAt ? `Next ${when(status.nextRunAt)}` : 'Auto sync off';
  return (
    <a className={`status status--${pill.kind}`} href={pill.href}>
      <span className="status__dot">
        {pill.icon === 'spinner' ? (
          <Spinner />
        ) : (
          <Icon name={pill.icon} size={16} strokeWidth={3} />
        )}
      </span>
      <span className="status__text">
        {pill.text}
        {withNext && !status.running && (
          <>
            <span className="status__sep" />
            <span className="muted">{next}</span>
          </>
        )}
      </span>
    </a>
  );
}
