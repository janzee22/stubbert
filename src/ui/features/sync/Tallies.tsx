import { Icon } from '../../components/index.js';
import type { CategoryReport, SyncReport } from '../../lib/api.js';
import { CATEGORY_STATUS, STATUS_ORDER } from './badges.js';

type Status = CategoryReport['status'];

export function Tallies({
  report,
  filter,
  onToggle,
}: {
  report: SyncReport;
  filter: ReadonlySet<Status>;
  onToggle: (s: Status) => void;
}) {
  return (
    <div className="tallies" role="group" aria-label="Filter by action">
      {STATUS_ORDER.map((s) => {
        const count = report.categories.filter((c) => c.status === s).length;
        const info = CATEGORY_STATUS[s];
        return (
          <button
            key={s}
            type="button"
            className="tally"
            aria-pressed={filter.has(s)}
            disabled={count === 0}
            onClick={() => onToggle(s)}
          >
            <span className="tally__n">{count}</span>
            <span className="tally__l">
              <span className={`badge badge--${info.kind}`}>
                <Icon name={info.icon} size={15} strokeWidth={2.75} />
              </span>
              {info.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
