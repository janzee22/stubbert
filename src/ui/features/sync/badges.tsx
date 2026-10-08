import type { CategoryReport, RunRecord, RunSummary } from '../../lib/api.js';
import { Badge, Spinner, type BadgeKind } from '../../components/index.js';
import { plural } from '../../lib/format.js';
import type { IconName } from '../../components/Icon.js';

type Status = CategoryReport['status'];

export const CATEGORY_STATUS: Record<Status, { kind: BadgeKind; icon: IconName; label: string }> = {
  create: { kind: 'create', icon: 'plus', label: 'Create' },
  adopt: { kind: 'adopt', icon: 'link', label: 'Adopt' },
  update: { kind: 'update', icon: 'pencil', label: 'Update' },
  skipped: { kind: 'skip', icon: 'skip', label: 'Skipped' },
  ok: { kind: 'same', icon: 'equal', label: 'Unchanged' },
};

export const STATUS_ORDER: readonly Status[] = ['create', 'adopt', 'update', 'skipped', 'ok'];

export function CategoryStatusBadge({ status }: { status: Status }) {
  const s = CATEGORY_STATUS[status];
  return (
    <Badge kind={s.kind} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

export function RunStatusBadge({
  run,
}: {
  run: Pick<RunSummary, 'status'> & { warnings?: number };
}) {
  if (run.status === 'running') {
    return (
      <span className="badge badge--brand">
        <Spinner />
        Running
      </span>
    );
  }
  if (run.status === 'failed') {
    return (
      <Badge kind="fail" icon="alert">
        Failed
      </Badge>
    );
  }
  if (run.status === 'warnings') {
    return (
      <Badge kind="warn" icon="warning">
        {run.warnings ? plural(run.warnings, 'warning') : 'Warnings'}
      </Badge>
    );
  }
  return (
    <Badge kind="ok" icon="check">
      OK
    </Badge>
  );
}

export const TRIGGERS: Record<RunRecord['trigger'], { label: string; icon: IconName }> = {
  schedule: { label: 'Scheduled', icon: 'clock' },
  startup: { label: 'At startup', icon: 'power' },
  manual: { label: 'Manual', icon: 'user' },
  webhook: { label: 'New in Jellyfin', icon: 'bell' },
};
