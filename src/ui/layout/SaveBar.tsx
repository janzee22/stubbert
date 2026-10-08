import { Icon } from '../components/index.js';
import { draftChanges } from '../lib/draft.js';
import { pathFromIssue } from '../lib/tree.js';
import { useDraft } from '../state/draft.js';
import { useNotifyDraft } from '../state/notify.js';

export function SaveBar({ onShowIssue }: { onShowIssue: (path: number[] | undefined) => void }) {
  const config = useDraft();
  const notify = useNotifyDraft();
  if (!config.dirty && !config.saveError && !notify.dirty && !notify.saveError) return null;
  const changes = [
    ...(config.dirty
      ? draftChanges(config.saved, config.draft).map((c) => `${c.label}: ${c.detail}`)
      : []),
    ...notify.changes,
  ];
  const count = changes.length || 1;
  const summary = changes.slice(0, 2).join(' · ');
  const more = changes.length > 2 ? ` · +${changes.length - 2} more` : '';
  const configIssues = config.dirty ? config.issues : [];
  const notifyIssues = notify.dirty ? notify.issues : [];
  const problems = configIssues.length + notifyIssues.length;
  const saving = config.saving || notify.saving;
  const saveError = config.saveError ?? notify.saveError;
  const showFirst = () => {
    const first = configIssues[0];
    if (first) {
      onShowIssue(pathFromIssue(first.path));
      return;
    }
    const kind = notifyIssues[0]?.kind;
    location.hash = kind ? `#/notifications/template/${kind}` : '#/notifications';
  };
  const save = async () => {
    if (config.dirty && !(await config.save())) return;
    if (notify.dirty) await notify.save();
  };
  const discard = () => {
    config.discard();
    notify.discard();
  };
  return (
    <div className="dock__savebar">
      <div className="savebar" role="region" aria-label="Unsaved changes">
        <div className="savebar__main">
          <span className="savebar__title">
            {count} unsaved {count === 1 ? 'change' : 'changes'}
          </span>
          {saveError && <span className="savebar__sub">{saveError}</span>}
          {!saveError && problems === 0 && (
            <span className="savebar__sub">{config.warnings[0] ?? `${summary}${more}`}</span>
          )}
          {problems > 0 && (
            <button type="button" className="savebar__problem" onClick={showFirst}>
              <Icon name="alert" size={16} strokeWidth={2.5} />
              Fix {problems} {problems === 1 ? 'problem' : 'problems'}
            </button>
          )}
        </div>
        <button type="button" className="btn btn--ghost" onClick={discard} disabled={saving}>
          Discard
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void save()}
          disabled={saving || problems > 0}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
