import { Icon } from '../../../components/index.js';
import type { PreviewIssue } from '../../../lib/api.js';

export function IssueList({
  issues,
  id,
  onFix,
}: {
  issues: PreviewIssue[];
  id: string;
  onFix: (issue: PreviewIssue) => void;
}) {
  if (!issues.length) return null;
  return (
    <div id={id}>
      {issues.map((issue) => (
        <p key={`${issue.start}-${issue.message}`} className="error-msg" role="alert">
          <Icon name="alert" size={16} strokeWidth={2.5} />
          <span>
            {issue.message}
            {issue.suggestion && (
              <button
                type="button"
                className="btn btn--ghost btn--sm fix-btn"
                onClick={() => onFix(issue)}
              >
                Fix it
              </button>
            )}
          </span>
        </p>
      ))}
    </div>
  );
}
