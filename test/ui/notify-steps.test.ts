import { describe, expect, it } from 'vitest';
import {
  discordStep,
  jellyfinStep,
  middleStep,
  tmdbState,
} from '../../src/ui/features/notify/notifications/steps.js';
import type { NotifyStatusView } from '../../src/shared/api.js';

const discord: NotifyStatusView['discord'] = {
  set: true,
  lastSentAt: null,
  lastTestAt: null,
  lastError: null,
  lastErrorAt: null,
  notFound: false,
  failing: false,
};

const status: NotifyStatusView = {
  enabled: true,
  webhook: { lastEventAt: null, lastEventSummary: null, refused: null },
  batch: null,
  discord,
  tmdbRejected: false,
  jellyfinConfigured: true,
  announced: 0,
};

describe('notification pipeline steps', () => {
  it('shows refused webhook calls before anything else', () => {
    const step = jellyfinStep({
      lastEventAt: '2026-10-08T10:00:00Z',
      lastEventSummary: 'Dune (2021)',
      refused: { count: 3, since: null, hint: '…abcd' },
    });
    expect(step).toMatchObject({ kind: 'fail', line: '3 events refused' });
    expect(step.detail).toBe('Item Added · Dune (2021)');
  });

  it('waits until the first event arrives', () => {
    expect(jellyfinStep(status.webhook).kind).toBe('wait');
  });

  it('reports a waiting batch, or that notifications are off', () => {
    const batch = { titles: ['Dune', 'Andor'], items: 3, flushAt: '2026-10-08T10:10:00Z' };
    expect(middleStep({ ...status, batch }, true)).toMatchObject({
      kind: 'warn',
      line: '2 titles waiting: Dune, Andor',
    });
    expect(middleStep({ ...status, batch }, false).line).toBe('Notifications are off');
  });

  it('puts a 404 above other Discord failures', () => {
    expect(discordStep({ ...discord, set: false }).kind).toBe('wait');
    expect(discordStep({ ...discord, notFound: true, failing: true }).line).toBe(
      'Webhook not found (404)',
    );
    expect(discordStep({ ...discord, failing: true, lastError: 'boom' })).toMatchObject({
      kind: 'fail',
      detail: 'boom',
    });
    expect(discordStep(discord)).toMatchObject({ kind: 'ok', line: 'Ready' });
  });

  it('marks TMDb by key and rejection', () => {
    expect(tmdbState(true, true)).toBe('fail');
    expect(tmdbState(false, true)).toBe('ok');
    expect(tmdbState(undefined, false)).toBe('wait');
  });
});
