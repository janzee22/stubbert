import { useState } from 'react';
import { ErrorText, Icon, Segmented, Select } from '../../../components/index.js';
import {
  api,
  type MessageKind,
  type MessageTemplate,
  type PreviewResult,
  type SampleView,
} from '../../../lib/api.js';
import { DiscordPreview, type DiscordTheme } from '../DiscordPreview.js';

export function PreviewPanel({
  kind,
  template,
  samples,
  sampleId,
  onSample,
  preview,
  error,
  webhookSet,
  saveError,
}: {
  kind: MessageKind;
  template: MessageTemplate;
  samples: SampleView[];
  sampleId: string;
  onSample: (id: string) => void;
  preview: PreviewResult | undefined;
  error: unknown;
  webhookSet: boolean;
  saveError: string | undefined;
}) {
  const [theme, setTheme] = useState<DiscordTheme>('dark');
  const [sendState, setSendState] = useState<{ busy?: boolean; ok?: string; error?: unknown }>({});
  const issues = preview?.issues ?? [];
  const sendTest = async () => {
    setSendState({ busy: true });
    try {
      await api.sendPreview({ kind, template, sampleId });
      setSendState({ ok: new Date().toISOString() });
    } catch (err) {
      setSendState({ error: err });
    }
  };

  const posterName =
    preview?.variables.find((v) => v.path === 'series.name')?.value ??
    preview?.variables.find((v) => v.path === 'item.name')?.value ??
    'Poster';
  return (
    <aside className="sheet card--pad tpl-preview" aria-labelledby="h-preview">
      <div className="col gap-16">
        <div className="row wrap gap-10">
          <h2 className="h2 basis-full" id="h-preview">
            Preview
          </h2>
          <Select
            aria-label="Preview with"
            value={sampleId}
            onChange={(e) => onSample(e.target.value)}
            style={{ flex: '1 1 220px' }}
          >
            {samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            {!samples.length && <option value="sample">Sample data</option>}
          </Select>
          <Segmented
            label="Discord theme"
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
            value={theme}
            onChange={setTheme}
          />
        </div>
        {preview?.embed ? (
          <DiscordPreview preview={preview} theme={theme} posterName={posterName} />
        ) : (
          <div className="dc dc--empty" data-dtheme={theme}>
            <span className="small">
              {issues.length ? 'Fix the template to see the message.' : 'Rendering…'}
            </span>
          </div>
        )}
        <ul className="col small gap-6">
          {issues.length === 0 && !preview?.error && preview && (
            <li className="row ok-line">
              <Icon name="check" size={16} strokeWidth={3} />
              Template is valid
            </li>
          )}
          {issues.length > 0 && (
            <li className="row fail-line">
              <Icon name="alert" size={16} strokeWidth={2.5} />
              {issues.length} {issues.length === 1 ? 'problem' : 'problems'} to fix
            </li>
          )}
          {preview?.error && (
            <li className="row fail-line">
              <Icon name="alert" size={16} strokeWidth={2.5} />
              {preview.error}
            </li>
          )}
          {[...(preview?.warnings ?? []), ...(preview?.notes ?? [])].map((n) => (
            <li key={n} className="row muted note-line">
              <Icon name="info" size={16} strokeWidth={2.5} />
              <span>{n}</span>
            </li>
          ))}
          <li className="row muted note-line">
            <Icon name="info" size={16} strokeWidth={2.5} />
            <span>Close to Discord, not pixel-perfect. Fonts and widths differ per device.</span>
          </li>
        </ul>
        <ErrorText error={error} />
        <div className="col gap-6 items-start">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void sendTest()}
            disabled={sendState.busy || !preview?.embed || !webhookSet}
          >
            <Icon name="send" />
            {sendState.busy ? 'Sending…' : 'Send test to Discord'}
          </button>
          {!webhookSet && <span className="small muted">Save a Discord webhook first.</span>}
          {sendState.ok && (
            <span className="small row ok-line" role="status">
              <Icon name="check" size={16} strokeWidth={3} />
              Sent. Check the channel.
            </span>
          )}
          <ErrorText error={sendState.error} />
          {saveError && <ErrorText error={saveError} />}
        </div>
      </div>
    </aside>
  );
}
