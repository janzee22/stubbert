import { useEffect, useMemo, useState } from 'react';
import { ErrorText, Spinner, Toggle } from '../../../components/index.js';
import { usePoll } from '../../../hooks/usePoll.js';
import { api, type Library } from '../../../lib/api.js';
import { useNotifyDraft } from '../../../state/notify.js';
import { DiscordSection } from './DiscordSection.js';
import { EmptyState, PageHead } from './EmptyState.js';
import { useNotifyForm, webhookUrlFor } from './form.js';
import { MessagesSection } from './MessagesSection.js';
import { Pipeline } from './Pipeline.js';
import { Recent } from './Recent.js';
import { RulesSection } from './RulesSection.js';
import { StatusBanners } from './StatusBanners.js';
import { WebhookSection } from './WebhookSection.js';

const POLL_MS = 10_000;

export function NotificationsPage() {
  const { view, draft, loadError } = useNotifyDraft();
  if (loadError) return <ErrorText error={loadError} />;
  if (!view || !draft) {
    return (
      <p className="row muted">
        <Spinner /> Loading…
      </p>
    );
  }
  return <LoadedNotificationsPage />;
}

function LoadedNotificationsPage() {
  const { view, prefs, set, dirty } = useNotifyForm();
  const loadStatus = useMemo(() => () => api.notifyStatus(), []);
  const loadActivity = useMemo(() => () => api.notifyActivity(), []);
  const status = usePoll(loadStatus, POLL_MS);
  const activity = usePoll(loadActivity, POLL_MS);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    api.libraries().then(setLibraries, () => undefined);
  }, []);

  const st = status.data;
  const refresh = () => {
    status.refresh();
    activity.refresh();
  };

  const fresh =
    !view.discordWebhook.set && !view.preferences.enabled && !st?.webhook.lastEventAt && !dirty;
  if (fresh && !setupOpen) return <EmptyState onStart={() => setSetupOpen(true)} />;

  return (
    <div className="notif">
      <PageHead>
        <Toggle checked={prefs.enabled} onChange={(v) => set('enabled', v)}>
          Send notifications
        </Toggle>
      </PageHead>
      {st && <StatusBanners st={st} webhookUrl={webhookUrlFor(view, prefs)} />}
      <ErrorText error={status.error} />
      {st && <Pipeline status={st} enabled={view.preferences.enabled} />}
      <div className="notif-layout">
        <div className="col gap-0 min-w-0">
          <WebhookSection lastEventAt={st?.webhook.lastEventAt} onRotated={refresh} />
          <RulesSection libraries={libraries} tmdbRejected={st?.tmdbRejected} />
          <MessagesSection activity={activity.data} />
          <DiscordSection onSent={refresh} />
        </div>
        <Recent status={st} activity={activity.data} onChanged={refresh} />
      </div>
    </div>
  );
}
