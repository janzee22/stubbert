import { useState } from 'react';
import { ErrorText, Field, Icon, Select, SetRow } from '../../../components/index.js';
import { api } from '../../../lib/api.js';
import { when } from '../../../lib/format.js';
import { useNotifyForm } from './form.js';
import { StoredSecretInput } from './StoredSecretInput.js';

export function DiscordSection({ onSent }: { onSent: () => void }) {
  const { view, draft, prefs: p, set, errorsFor, setSecret } = useNotifyForm();
  const [test, setTest] = useState<{ busy?: boolean; at?: string; error?: unknown }>({});
  const mention = p.mention.type;
  const roleId = p.mention.type === 'role' ? p.mention.roleId : '';

  const sendTest = async () => {
    setTest({ busy: true });
    try {
      const r = await api.testDiscord();
      setTest({ at: r.sentAt });
      onSent();
    } catch (err) {
      setTest({ error: err });
    }
  };

  return (
    <SetRow id="notif-discord" title="Discord" intro="Where the messages go.">
      <div className="field">
        <label className="label" htmlFor="notif-dwh">
          Discord webhook URL
        </label>
        <StoredSecretInput
          id="notif-dwh"
          name="discordWebhookUrl"
          set={view.discordWebhook.set}
          hint={view.discordWebhook.hint}
          value={draft.discordWebhookUrl}
          placeholder="https://discord.com/api/webhooks/…"
          describedBy="notif-dwh-help"
          invalid={errorsFor('discordWebhookUrl').length > 0}
          onChange={setSecret}
        />
        {errorsFor('discordWebhookUrl').map((e) => (
          <p key={e} className="error-msg">
            <Icon name="alert" size={16} strokeWidth={2.5} />
            {e}
          </p>
        ))}
        <p className="help" id="notif-dwh-help">
          In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
        </p>
      </div>
      <div className="two-col">
        <Field
          label="Post as"
          help="The avatar is the one you set on the webhook in Discord."
          errors={errorsFor('username')}
        >
          {({ id, describedBy, invalid }) => (
            <div className="row gap-10">
              <img className="dc-avatar" src="/stubbert-avatar.png" alt="" />
              <input
                id={id}
                className="input"
                value={p.username}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                onChange={(e) => set('username', e.target.value)}
              />
            </div>
          )}
        </Field>
        <Field
          label="Mention"
          help="Who gets pinged. It shows above the message. Pick a role so people can opt in."
          errors={errorsFor('mention.roleId')}
        >
          {({ id, describedBy }) => (
            <div className="col gap-8">
              <Select
                id={id}
                aria-describedby={describedBy}
                value={mention}
                onChange={(e) => {
                  const t = e.target.value;
                  set(
                    'mention',
                    t === 'role' ? { type: 'role', roleId } : { type: t as 'none' | 'everyone' },
                  );
                }}
              >
                <option value="none">Nobody</option>
                <option value="everyone">@everyone</option>
                <option value="role">A role…</option>
              </Select>
              {mention === 'role' && (
                <>
                  <input
                    className="input input--mono"
                    aria-label="Role tag"
                    placeholder="<@&123456789012345678>"
                    spellCheck={false}
                    value={/^\d+$/.test(roleId) ? `<@&${roleId}>` : roleId}
                    onChange={(e) =>
                      set('mention', { type: 'role', roleId: e.target.value.trim() })
                    }
                  />
                  <p className="help">
                    To get the tag, type <code>\@RoleName</code> in a Discord channel and send it:
                    Discord shows <code>{'<@&…>'}</code>. Copy that here. The role must allow
                    mentions.
                  </p>
                </>
              )}
            </div>
          )}
        </Field>
      </div>
      <Field
        label="Jellyfin address for links"
        optional
        help="The address people use to open Jellyfin. Used for the Jellyfin link in messages; posters are sent along with the message, so they work without it."
        errors={errorsFor('linkBase')}
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="input input--mono"
            value={p.linkBase ?? ''}
            placeholder={view.jellyfinUrl ?? 'https://jellyfin.example.com'}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(e) => set('linkBase', e.target.value.trim() ? e.target.value : null)}
          />
        )}
      </Field>
      <div className="row wrap gap-12">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => void sendTest()}
          disabled={test.busy || !view.discordWebhook.set || draft.discordWebhookUrl !== undefined}
        >
          <Icon name="message" />
          {test.busy ? 'Sending…' : 'Send test message'}
        </button>
        {draft.discordWebhookUrl !== undefined && (
          <span className="small muted">Save the new webhook first.</span>
        )}
        {test.at && (
          <span className="small row ok-line" role="status">
            <Icon name="check" size={16} strokeWidth={3} />
            Sent at {when(test.at)}
          </span>
        )}
      </div>
      <ErrorText error={test.error} />
    </SetRow>
  );
}
