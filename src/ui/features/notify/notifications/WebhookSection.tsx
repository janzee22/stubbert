import { useState, type ReactNode } from 'react';
import { CopyField, Dialog, ErrorText, Field, Icon, SetRow } from '../../../components/index.js';
import { api } from '../../../lib/api.js';
import { useNotifyForm, webhookUrlFor } from './form.js';

const JELLYFIN_STEPS: ReactNode[] = [
  <>
    Install the <b>Webhook</b> plugin: Dashboard → Plugins → Catalog. Restart Jellyfin.
  </>,
  <>
    Open Dashboard → Plugins → <b>Webhook</b> and choose <b>Add Generic Destination</b>.
  </>,
  <>Paste the webhook URL above. Leave Jellyfin’s template field empty.</>,
  <>
    Notification type: tick only <b>Item Added</b>. Item type: <b>Movies</b>, <b>Episodes</b>,{' '}
    <b>Seasons</b>.
  </>,
  <>
    Turn on <b>Send All Properties</b> and save.
  </>,
  <>
    Add or rescan something. The Jellyfin step at the top turns green when the first event arrives.
  </>,
];

export function WebhookSection({
  lastEventAt,
  onRotated,
}: {
  lastEventAt: string | null | undefined;
  onRotated: () => void;
}) {
  const { view, prefs: p, set, errorsFor, setView } = useNotifyForm();
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateError, setRotateError] = useState<unknown>();
  const webhookUrl = webhookUrlFor(view, p);

  const rotate = async () => {
    setRotateError(undefined);
    try {
      setView(await api.rotateWebhook());
      setRotateOpen(false);
      onRotated();
    } catch (err) {
      setRotateError(err);
    }
  };

  return (
    <>
      <SetRow
        id="notif-webhook"
        title="Jellyfin webhook"
        intro="Jellyfin tells Stubbert when something is added. You set this up once, in Jellyfin."
      >
        <Field
          label="Stubbert’s address, as Jellyfin sees it"
          help="Not always the address in your browser. Inside Docker, use the service name."
          errors={errorsFor('publicAddress')}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input input--mono"
              value={p.publicAddress}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => set('publicAddress', e.target.value)}
            />
          )}
        </Field>
        <div className="field">
          <span className="label">Webhook URL</span>
          <CopyField value={webhookUrl} label="Webhook URL" />
          <div className="row wrap justify-between">
            <p className="help">The last part is a secret. Anyone with this URL can send events.</p>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setRotateOpen(true)}
            >
              <Icon name="refresh" />
              New URL…
            </button>
          </div>
        </div>
        <details className="disclosure" open={!lastEventAt}>
          <summary>
            <Icon name="chevronRight" />
            How to set it up in Jellyfin
          </summary>
          <ol className="steps-list small">
            {JELLYFIN_STEPS.map((s, i) => (
              <li key={i}>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </details>
        {!lastEventAt && (
          <div className="sunken small col gap-6">
            <b>Still nothing after adding something?</b>
            <span>
              Check that Jellyfin can reach <code>{p.publicAddress}</code>. From inside Jellyfin’s
              container, <code>localhost</code> is Jellyfin itself.
            </span>
          </div>
        )}
      </SetRow>
      <Dialog
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        icon="refresh"
        title="Make a new webhook URL?"
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setRotateOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn--danger" onClick={() => void rotate()}>
              Make a new URL
            </button>
          </>
        }
      >
        <p>
          The current URL stops working right away. Until you paste the new one into Jellyfin’s
          Webhook plugin, new items are not announced.
        </p>
        <ErrorText error={rotateError} />
      </Dialog>
    </>
  );
}
