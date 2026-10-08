import { Icon, PosterThumb, Spinner } from '../../components/index.js';
import type { RunRecord, SyncReport } from '../../lib/api.js';
import { plural } from '../../lib/format.js';
import { usePlacements } from './ReportTable.js';

function logMentions(run: RunRecord, name: string): boolean {
  return run.log.some((line) => line.includes(`"${name}"`));
}

function progressStep(finished: boolean, skipped: boolean) {
  if (finished) return { kind: 'ok', icon: 'check', label: 'Done' } as const;
  if (skipped) return { kind: 'warn', icon: 'shield', label: 'Skipped' } as const;
  return { kind: 'wait', icon: 'clock', label: 'Waiting' } as const;
}

export function SyncProgress({ run, plan }: { run: RunRecord; plan?: SyncReport }) {
  const placements = usePlacements();
  const categories = (plan?.categories ?? []).filter((c) => c.status !== 'ok');
  const done = categories.filter((c) => logMentions(run, c.name)).length;
  const lastLine = run.log.at(-1);
  return (
    <div className="col gap-18">
      <div className="row">
        <span className="h3 num grow">
          {categories.length
            ? `${done} of ${plural(categories.length, 'category', 'categories')}`
            : 'Working…'}
        </span>
        <Spinner />
      </div>
      <div
        className={`progress${categories.length ? '' : ' progress--busy'}`}
        role="progressbar"
        aria-label="Sync progress"
        aria-valuemin={0}
        aria-valuemax={categories.length || undefined}
        aria-valuenow={categories.length ? done : undefined}
      >
        <div
          className="progress__bar"
          style={
            categories.length
              ? { width: `${Math.max(4, (done / categories.length) * 100)}%` }
              : undefined
          }
        />
      </div>
      {lastLine && (
        <p className="small" aria-live="polite">
          {lastLine}
        </p>
      )}
      {categories.length > 0 && (
        <ul className="col gap-0">
          {categories.map((c) => {
            const step = progressStep(logMentions(run, c.name), c.status === 'skipped');
            return (
              <li key={c.categoryId} className="check-row items-center">
                <span className={`check-ico check-ico--${step.kind}`}>
                  <Icon name={step.icon} size={16} strokeWidth={3} />
                </span>
                <PosterThumb file={placements.get(c.categoryId)?.poster} name={c.name} size="xs" />
                <span className="strong grow">{c.name}</span>
                <span className="small strong muted">{step.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
