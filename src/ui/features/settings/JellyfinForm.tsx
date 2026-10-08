import { useState, type FormEvent, type ReactNode } from 'react';
import { Banner, Field, Icon, SecretInput } from '../../components/index.js';
import { useAction } from '../../hooks/useAction.js';
import { api, type JellyfinCheck, type Settings } from '../../lib/api.js';
import { diagnose, DiagnosisBanner } from './diagnose.js';
import { Locked } from './Locked.js';

export function JellyfinForm({
  settings,
  onSaved,
  onFailed,
  submitLabel = 'Save',
  footer,
}: {
  settings: Settings['jellyfin'];
  onSaved: (check: JellyfinCheck) => void;
  onFailed?: (failed: boolean) => void;
  submitLabel?: string;
  footer?: ReactNode;
}) {
  const [url, setUrl] = useState(settings.url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [checked, setChecked] = useState<JellyfinCheck>();
  const action = useAction();

  if (settings.fromEnv) {
    return (
      <div className="two-col">
        <Field
          label="Server address"
          help={
            <>
              Set by <code>JELLYFIN_URL</code>. Change it there and restart the app.
            </>
          }
        >
          {() => <Locked>{settings.url}</Locked>}
        </Field>
        <Field
          label="API key"
          help={
            <>
              Set by <code>JELLYFIN_API_KEY</code>.
            </>
          }
        >
          {() => <Locked>••••••••</Locked>}
        </Field>
      </div>
    );
  }

  const key = apiKey.trim() || undefined;
  const message = action.error instanceof Error ? action.error.message : undefined;
  const diagnosis = message ? diagnose(message, url.trim()) : undefined;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setChecked(undefined);
    const res = await action.run(() => api.saveJellyfin(url.trim(), key));
    onFailed?.(!res);
    if (res) {
      setChecked(res);
      setApiKey('');
      onSaved(res);
    }
  };

  return (
    <form className="col gap-22" onSubmit={(e) => void submit(e)}>
      {diagnosis && <DiagnosisBanner diagnosis={diagnosis} />}
      <Field
        label="Server address"
        help="How this app reaches Jellyfin. From inside Docker, localhost is the container itself."
        errors={
          diagnosis?.field === 'url'
            ? ['Not reachable from this app. Change the address, then test again.']
            : undefined
        }
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="input"
            type="url"
            placeholder="http://192.168.1.10:8096"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              action.clear();
            }}
            autoComplete="off"
            spellCheck={false}
            required
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Field
        label="API key"
        help="In Jellyfin: Dashboard → API Keys → +. The key stays on this server and is never shown again."
        errors={diagnosis?.field === 'key' ? ['Paste a key that Jellyfin accepts.'] : undefined}
      >
        {({ id, describedBy, invalid }) => (
          <SecretInput
            id={id}
            value={apiKey}
            onChange={(v) => {
              setApiKey(v);
              action.clear();
            }}
            required={!settings.apiKeySet}
            placeholder={settings.apiKeySet ? 'Saved. Leave empty to keep it' : ''}
            describedBy={describedBy}
            invalid={invalid}
          />
        )}
      </Field>
      {checked && (
        <Banner kind="ok" icon="check" title={`Connected to Jellyfin ${checked.version}`}>
          {checked.serverName ?? url}
        </Banner>
      )}
      <div className="row wrap gap-12">
        {footer}
        <div className="spacer" />
        <button
          type="submit"
          className="btn btn--primary btn--lg"
          disabled={action.busy || !url.trim() || (!key && !settings.apiKeySet)}
        >
          <Icon name="refresh" size={20} />
          {action.busy ? 'Testing…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
