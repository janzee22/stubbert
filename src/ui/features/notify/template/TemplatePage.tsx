import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon, Segmented, Spinner } from '../../../components/index.js';
import {
  api,
  MESSAGE_KINDS,
  type MessageKind,
  type MessageTemplate,
  type PreviewIssue,
  type SampleView,
} from '../../../lib/api.js';
import { KIND_LABELS, KIND_NAMES, useNotifyDraft } from '../../../state/notify.js';
import { CodeEditor, type EditorHandle } from '../CodeEditor.js';
import { IssueList } from './IssueList.js';
import { LookFields } from './LookFields.js';
import { PreviewPanel } from './PreviewPanel.js';
import { usePreview } from './usePreview.js';
import { VariablesPanel } from './VariablesPanel.js';

const KINDS = MESSAGE_KINDS.map((value) => ({ value, label: KIND_NAMES[value] }));

const WHEN: Record<MessageKind, string> = {
  movie: 'Sent for every new movie',
  episode: 'Sent when a single new episode of a series is in',
  episodes: 'Sent when 2 or more episodes of one season are in, but not the whole season',
  season: 'Sent when a whole season is in',
};

const LIMITS = { title: 256, content: 4096 };

type Field = 'title' | 'content';

export function TemplatePage({ kind }: { kind: MessageKind }) {
  const { draft, view, setPreferences, saveError } = useNotifyDraft();
  const template = draft?.preferences.templates[kind];
  const [sampleId, setSampleId] = useState('sample');
  const [samples, setSamples] = useState<SampleView[]>([]);
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const [field, setField] = useState<Field>('content');
  const titleRef = useRef<EditorHandle>(null);
  const contentRef = useRef<EditorHandle>(null);
  const ids = { title: useId(), content: useId(), titleErr: useId(), contentErr: useId() };
  const { preview, error } = usePreview(kind, template, sampleId);

  useEffect(() => {
    let cancelled = false;
    api.notifySamples(kind).then(
      (s) => {
        if (cancelled) return;
        setSamples(s);
        setSampleId((current) =>
          s.some((x) => x.id === current) ? current : (s[0]?.id ?? 'sample'),
        );
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const issues = useMemo(() => preview?.issues ?? [], [preview]);
  const titleIssues = useMemo(() => issues.filter((i) => i.field === 'title'), [issues]);
  const contentIssues = useMemo(() => issues.filter((i) => i.field === 'content'), [issues]);

  if (!template || !view) {
    return (
      <p className="row muted">
        <Spinner /> Loading…
      </p>
    );
  }

  const update = (changes: Partial<MessageTemplate>) =>
    setPreferences((p) => ({
      ...p,
      templates: { ...p.templates, [kind]: { ...p.templates[kind], ...changes } },
    }));

  const fix = (issue: PreviewIssue) => {
    if (!issue.suggestion) return;
    const source = template[issue.field];
    update({
      [issue.field]: source.slice(0, issue.start) + issue.suggestion + source.slice(issue.end),
    });
  };

  const editor = () => (field === 'title' ? titleRef.current : contentRef.current);
  const insert = (text: string, caret?: number) => editor()?.insert(text, caret);
  const insertVariable = (path: string, value: string) => {
    if (field === 'content' && /\d+ items?$/.test(value)) {
      const snippet = `{% for e in ${path} %}{{ e.number }} {% endfor %}`;
      insert(snippet, snippet.indexOf('{{ e.number }}') + 3);
    } else {
      insert(`{{ ${path} }}`);
    }
  };

  const reset = () => update(view.defaults[kind]);
  const isDefault = JSON.stringify(template) === JSON.stringify(view.defaults[kind]);
  const titleLength = preview?.embed?.title.length ?? 0;
  const contentLength = preview?.embed?.description.length ?? 0;

  return (
    <div className="tpl">
      <div className="page-head tpl-head">
        <a className="small row back-to gap-4" href="#/notifications">
          <Icon name="chevronLeft" size={16} />
          Notifications
        </a>
        <h1 className="display">{KIND_LABELS[kind]}</h1>
        <p className="muted tpl-when">
          {WHEN[kind]}, after Jellyfin has been quiet for {draft.preferences.quietMinutes}{' '}
          {draft.preferences.quietMinutes === 1 ? 'minute' : 'minutes'}.
        </p>
        <div className="tpl-actions">
          <Segmented
            label="Template"
            large
            options={KINDS}
            value={kind}
            onChange={(k) => {
              location.hash = `#/notifications/template/${k}`;
            }}
          />
          <button type="button" className="btn btn--ghost" onClick={reset} disabled={isDefault}>
            <Icon name="refresh" />
            Reset to default
          </button>
        </div>
      </div>

      <div className="tpl-tabs">
        <Segmented
          label="Template view"
          block
          options={[
            { value: 'edit', label: 'Edit', icon: 'pencil' },
            { value: 'preview', label: 'Preview', icon: 'eye' },
          ]}
          value={pane}
          onChange={setPane}
        />
      </div>

      <div className={`tpl-layout tpl-layout--${pane}`}>
        <div className="col tpl-edit gap-20 min-w-0">
          <div className="field">
            <div className="label">
              <label htmlFor={ids.title}>Title</label>
              <span className="field__count">
                {titleLength} / {LIMITS.title}
              </span>
            </div>
            <CodeEditor
              ref={titleRef}
              id={ids.title}
              label="Title"
              single
              value={template.title}
              onChange={(title) => update({ title })}
              errors={titleIssues}
              describedBy={titleIssues.length ? ids.titleErr : undefined}
              onFocus={() => setField('title')}
            />
            <IssueList issues={titleIssues} id={ids.titleErr} onFix={fix} />
          </div>

          <div className="field">
            <div className="label">
              <label htmlFor={ids.content}>Content</label>
              <span className="field__count">
                {contentLength} / {LIMITS.content}
              </span>
            </div>
            <div className="toolbar">
              <details className="menu-wrap">
                <summary className="btn btn--secondary btn--sm">
                  <Icon name="braces" />
                  Variable
                  <Icon name="chevronDown" size={16} />
                </summary>
                <div className="menu" role="menu">
                  {(preview?.variables ?? []).map((v) => (
                    <button
                      key={v.path}
                      type="button"
                      role="menuitem"
                      className="menu__item"
                      onClick={(e) => {
                        insertVariable(v.path, v.value);
                        (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                      }}
                    >
                      <code>{v.path}</code>
                    </button>
                  ))}
                </div>
              </details>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setField('content');
                  const snippet = '{% if item.overview %}\n\n{% endif %}';
                  contentRef.current?.insert(snippet, snippet.indexOf('\n') + 1);
                }}
              >
                <Icon name="code" />
                If-block
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setField('content');
                  contentRef.current?.insert('[TMDb]({{ links.tmdb }})', 1);
                }}
              >
                <Icon name="link" />
                Link
              </button>
            </div>
            <CodeEditor
              ref={contentRef}
              id={ids.content}
              label="Content"
              value={template.content}
              onChange={(content) => update({ content })}
              errors={contentIssues}
              describedBy={contentIssues.length ? ids.contentErr : undefined}
              onFocus={() => setField('content')}
            />
            <IssueList issues={contentIssues} id={ids.contentErr} onFix={fix} />
            <p className="help">
              Jinja. Discord Markdown works too: **bold**, [text](link). Empty lines left by an
              if-block are removed.
            </p>
          </div>

          <LookFields template={template} update={update} />
          <VariablesPanel all={preview?.variables ?? []} onInsert={insertVariable} />
        </div>

        <PreviewPanel
          kind={kind}
          template={template}
          samples={samples}
          sampleId={sampleId}
          onSample={setSampleId}
          preview={preview}
          error={error}
          webhookSet={view.discordWebhook.set}
          saveError={saveError}
        />
      </div>
    </div>
  );
}
