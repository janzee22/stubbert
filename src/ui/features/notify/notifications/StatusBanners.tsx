import { Banner, CopyField } from '../../../components/index.js';
import type { NotifyStatusView } from '../../../lib/api.js';
import { plural, when } from '../../../lib/format.js';

export function StatusBanners({ st, webhookUrl }: { st: NotifyStatusView; webhookUrl: string }) {
  return (
    <>
      {st.webhook.refused && (
        <Banner
          kind="fail"
          icon="plug"
          title={`${plural(st.webhook.refused.count, 'event')} refused since ${when(st.webhook.refused.since)}`}
          actions={<CopyField value={webhookUrl} label="Current webhook URL" />}
        >
          Jellyfin is calling a webhook URL that ends in {st.webhook.refused.hint}. That one stopped
          working when a new URL was made. Copy the current one into Jellyfin.
        </Banner>
      )}
      {st.discord.notFound && (
        <Banner
          kind="fail"
          icon="message"
          title="Discord doesn’t know this webhook (404)"
          actions={
            <a className="btn btn--secondary btn--sm" href="#notif-discord">
              Change webhook
            </a>
          }
        >
          It was probably deleted in Discord. Messages are kept for 24 hours; paste a new webhook
          URL to send them.
        </Banner>
      )}
      {!st.discord.notFound && st.discord.failing && (
        <Banner kind="warn" icon="warning" title="Sending to Discord keeps failing">
          {st.discord.lastError}
        </Banner>
      )}
    </>
  );
}
