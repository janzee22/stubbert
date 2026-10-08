import type { IconName } from '../../../components/index.js';
import { plural, relative, when } from '../../../lib/format.js';
import type { NotifyStatusView } from '../../../lib/api.js';

export type StepKind = 'ok' | 'warn' | 'fail' | 'wait';

export interface StepState {
  kind: StepKind;
  line: string;
  detail: string;
}

export const STEP_ICONS: Record<StepKind, IconName> = {
  ok: 'check',
  warn: 'clock',
  fail: 'close',
  wait: 'clock',
};

export function jellyfinStep(wh: NotifyStatusView['webhook']): StepState {
  const detail = wh.lastEventSummary
    ? `Item Added · ${wh.lastEventSummary}`
    : 'Nothing received yet';
  if (wh.refused) {
    return { kind: 'fail', line: `${plural(wh.refused.count, 'event')} refused`, detail };
  }
  if (wh.lastEventAt) return { kind: 'ok', line: `Last event ${relative(wh.lastEventAt)}`, detail };
  return { kind: 'wait', line: 'Waiting for the first event…', detail };
}

export function middleStep(status: NotifyStatusView, enabled: boolean): StepState {
  const batch = status.batch;
  if (!enabled) {
    return { kind: 'wait', line: 'Notifications are off', detail: 'Events are logged, not sent' };
  }
  if (batch) {
    return {
      kind: 'warn',
      line: `${plural(batch.titles.length, 'title')} waiting: ${batch.titles.join(', ')}`,
      detail: `Sends at ${when(batch.flushAt)} if nothing new arrives`,
    };
  }
  if (status.webhook.lastEventAt) {
    return { kind: 'ok', line: 'Nothing waiting', detail: 'Ready for the next event' };
  }
  return { kind: 'wait', line: 'Nothing to do yet', detail: 'Starts when events come in' };
}

export function discordStep(d: NotifyStatusView['discord']): StepState {
  if (!d.set) return { kind: 'wait', line: 'Not set up yet', detail: 'Paste a webhook URL below' };
  if (d.notFound) {
    return { kind: 'fail', line: 'Webhook not found (404)', detail: 'Paste a new webhook URL' };
  }
  if (d.failing) return { kind: 'fail', line: 'Sending fails', detail: d.lastError ?? '' };
  if (d.lastSentAt) {
    return { kind: 'ok', line: `Last message ${when(d.lastSentAt)}`, detail: 'Webhook accepted' };
  }
  if (d.lastTestAt) {
    return {
      kind: 'ok',
      line: `Test message sent ${when(d.lastTestAt)}`,
      detail: 'Webhook accepted',
    };
  }
  return { kind: 'ok', line: 'Ready', detail: 'No message sent yet' };
}

export function tmdbState(rejected: boolean | undefined, set: boolean): StepKind {
  if (rejected) return 'fail';
  return set ? 'ok' : 'wait';
}
