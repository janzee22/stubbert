import { useEffect, useState } from 'react';
import { Icon, SetRow } from '../../../components/index.js';
import {
  api,
  MESSAGE_KINDS,
  type ActivityView,
  type MessageKind,
  type Preferences,
  type PreviewResult,
} from '../../../lib/api.js';
import { when } from '../../../lib/format.js';
import { KIND_LABELS } from '../../../state/notify.js';
import { DiscordPreview } from '../DiscordPreview.js';
import { useNotifyForm } from './form.js';

const SUBTITLES: Record<MessageKind, string> = {
  movie: 'A new movie',
  episode: 'A single new episode',
  episodes: '2 or more episodes, not a whole season',
  season: 'A whole season is in',
};

function MessageRow({
  kind,
  preview,
  lastSent,
}: {
  kind: MessageKind;
  preview: PreviewResult | undefined;
  lastSent: string | undefined;
}) {
  return (
    <li className="list-row msg-row">
      <div className="msg-row__mini">
        {preview?.embed ? (
          <DiscordPreview preview={preview} theme="dark" posterName="" mini />
        ) : (
          <div className="dc dc--mini dc--empty" data-dtheme="dark" />
        )}
      </div>
      <div className="col gap-2 min-w-0 grow">
        <span className="strong">{KIND_LABELS[kind]}</span>
        <span className="small muted">{SUBTITLES[kind]}</span>
        <span className="micro muted">
          {lastSent ? `Last sent ${when(lastSent)}` : 'Never sent yet'}
        </span>
      </div>
      <a className="btn btn--secondary btn--sm" href={`#/notifications/template/${kind}`}>
        <Icon name="pencil" />
        Edit
      </a>
    </li>
  );
}

function useMiniPreviews(templates: Preferences['templates'] | undefined) {
  const [previews, setPreviews] = useState<Partial<Record<MessageKind, PreviewResult>>>({});
  useEffect(() => {
    if (!templates) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      for (const kind of MESSAGE_KINDS) {
        api.previewMessage({ kind, template: templates[kind], sampleId: 'sample' }).then(
          (p) => {
            if (!cancelled) setPreviews((prev) => ({ ...prev, [kind]: p }));
          },
          () => undefined,
        );
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [templates]);
  return previews;
}

export function MessagesSection({ activity }: { activity: ActivityView[] | undefined }) {
  const { prefs } = useNotifyForm();
  const previews = useMiniPreviews(prefs.templates);
  const lastSent = (kind: MessageKind) =>
    activity?.find((a) => a.status === 'sent' && a.kind === kind)?.at;
  return (
    <SetRow
      id="notif-messages"
      title="Messages"
      intro="One template per kind of message, with Jinja variables."
    >
      <ul className="col gap-0">
        {(['season', 'episodes', 'episode', 'movie'] as const).map((kind) => (
          <MessageRow key={kind} kind={kind} preview={previews[kind]} lastSent={lastSent(kind)} />
        ))}
      </ul>
    </SetRow>
  );
}
