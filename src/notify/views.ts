import type { ActivityView, NotifySettingsView, NotifyStatusView } from '../shared/api.js';
import { isRetryable } from './activity.js';
import { waitingPlan } from './compose.js';
import { DEFAULT_TEMPLATES } from './defaults.js';
import type { NotifyService } from './service.js';
import { hint } from './settings.js';

const ACTIVITY_SHOWN = 100;

export function settingsView(
  notify: NotifyService,
  jellyfinUrl: string | null,
): NotifySettingsView {
  const { webhookToken, discordWebhookUrl, tmdbApiKey, ...preferences } = notify.settings;
  return {
    preferences,
    discordWebhook: { set: !!discordWebhookUrl, hint: hint(discordWebhookUrl) },
    tmdbApiKey: { set: !!tmdbApiKey, hint: hint(tmdbApiKey) },
    webhookUrl: `${preferences.publicAddress}/hooks/jellyfin/${webhookToken}`,
    defaults: DEFAULT_TEMPLATES,
    jellyfinUrl,
  };
}

export function statusView(notify: NotifyService, jellyfinConfigured: boolean): NotifyStatusView {
  const { batch, ingest, discord, tmdbRejected, announced } = notify.store.state;
  const waiting = batch ? waitingPlan(batch.items) : [];
  return {
    enabled: notify.settings.enabled,
    webhook: {
      lastEventAt: ingest.lastEventAt,
      lastEventSummary: ingest.lastEventSummary,
      refused: ingest.refusedCount
        ? {
            count: ingest.refusedCount,
            since: ingest.firstRefusedAt,
            hint: ingest.refusedTokenHint,
          }
        : null,
    },
    batch:
      batch && waiting.length
        ? {
            titles: [...new Set(waiting.map((m) => m.title))],
            items: batch.items.length,
            flushAt: batch.flushAt,
          }
        : null,
    discord: {
      set: !!notify.settings.discordWebhookUrl,
      lastSentAt: discord.lastSentAt,
      lastTestAt: discord.lastTestAt,
      lastError: discord.lastError,
      lastErrorAt: discord.lastErrorAt,
      notFound: discord.notFound,
      failing: notify.delivery.failing,
    },
    tmdbRejected,
    jellyfinConfigured,
    announced: Object.keys(announced).length,
  };
}

export function activityView(notify: NotifyService, now = Date.now()): ActivityView[] {
  return notify.activity.entries.slice(0, ACTIVITY_SHOWN).map((a) => ({
    id: a.id,
    at: a.at,
    status: a.status,
    reason: a.reason ?? null,
    title: a.title,
    detail: a.detail ?? null,
    kind: a.kind ?? null,
    titles: a.titles ?? [],
    warnings: a.warnings ?? [],
    error: a.error ?? null,
    retryable: isRetryable(a, now),
  }));
}

export function failingMessage(notify: NotifyService | undefined): string | null {
  if (!notify?.delivery.failing) return null;
  return notify.store.state.discord.lastError ?? 'Sending to Discord fails';
}
