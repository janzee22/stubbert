import { randomUUID } from 'node:crypto';
import { ActivityLog } from './activity.js';
import { Batcher } from './batcher.js';
import { Composer, messageLabel, type ComposedMessage } from './compose.js';
import { Delivery } from './delivery.js';
import { DiscordError, type Attachment } from './discord.js';
import { Ingest } from './ingest.js';
import { announcedKeys, type NotifyItem } from './item.js';
import type { RenderedEmbed } from './message.js';
import type { PlannedMessage } from './plan.js';
import { Runtime, type NotifyDeps } from './runtime.js';
import { newToken, type StoredSettings } from './settings.js';
import type { ActivityEntry, NotifyStore, StoredMessage } from './store.js';
import type { Value } from './template/index.js';

export type { NotifyDeps, NotifyJellyfin } from './runtime.js';

export interface RecentContext {
  id: string;
  label: string;
  at: string;
  kind: PlannedMessage['kind'];
  context: Record<string, Value>;
  imageItemId: string | null;
}

const RECENT_CONTEXTS = 12;

export class RetryError extends Error {}

export class NotifyService {
  readonly activity: ActivityLog;
  readonly composer: Composer;
  readonly delivery: Delivery;
  readonly #rt: Runtime;
  readonly #ingest: Ingest;
  readonly #batcher: Batcher;
  readonly #tickMs: number;
  #recent: RecentContext[] = [];

  constructor(deps: NotifyDeps) {
    this.#rt = new Runtime(deps);
    this.#tickMs = deps.tickMs ?? 15_000;
    this.activity = new ActivityLog(this.#rt);
    this.composer = new Composer(this.#rt);
    this.delivery = new Delivery(this.#rt);
    this.#ingest = new Ingest(this.#rt, this.activity, deps.onNewItem);
    this.#batcher = new Batcher(this.#rt, this.activity, (items) => this.#send(items));
  }

  get store(): NotifyStore {
    return this.#rt.store;
  }

  get settings(): StoredSettings {
    return this.#rt.settings;
  }

  get recent(): readonly RecentContext[] {
    return this.#recent;
  }

  start() {
    this.#batcher.start(this.#tickMs);
  }

  stop() {
    this.#batcher.stop();
  }

  tick(): Promise<void> {
    return this.#batcher.tick();
  }

  tokenMatches(token: string): boolean {
    return this.#ingest.tokenMatches(token);
  }

  refused(token: string): Promise<void> {
    return this.#ingest.refused(token);
  }

  async rotateToken(): Promise<string> {
    const token = newToken();
    await this.store.saveSettings({ ...this.settings, webhookToken: token });
    await this.#ingest.clearRefused();
    return token;
  }

  async ingest(body: unknown): Promise<string> {
    const accepted = await this.#ingest.accept(body);
    return typeof accepted === 'string' ? accepted : this.#batcher.add(accepted);
  }

  sendNow(): Promise<number> {
    return this.#batcher.flush();
  }

  async #send(items: NotifyItem[]): Promise<number> {
    if (!this.settings.enabled) {
      await this.activity.add({
        status: 'off',
        reason: 'disabled',
        title: `${items.length} waiting item${items.length === 1 ? '' : 's'}`,
        detail: 'Notifications were turned off, so nothing was sent.',
      });
      return 0;
    }
    const plan = await this.composer.plan(items);
    if (plan.bulk) {
      await this.#announce(items.flatMap(announcedKeys), 'bulk');
      await this.activity.add({
        status: 'skipped',
        reason: 'bulk',
        title: `${plan.titles.length} titles at once`,
        detail: 'Looks like a rescan or big import, so nothing was sent.',
        titles: plan.titles,
      });
      return 0;
    }
    let sent = 0;
    for (const message of await this.composer.compose(plan.messages)) {
      this.#remember(message);
      if (await this.#sendOne(message)) sent++;
    }
    return sent;
  }

  async #sendOne(message: ComposedMessage): Promise<boolean> {
    const { label, keys, warnings } = message;
    const kind = message.plan.kind;
    const stored: StoredMessage = { kind, embed: message.embed, imageItemId: message.imageItemId };
    const entry = { title: label, kind, keys, warnings, message: stored };
    if (this.delivery.paused) {
      await this.activity.add({
        ...entry,
        status: 'failed',
        reason: 'discord-404',
        error: this.settings.discordWebhookUrl
          ? "Discord doesn't know this webhook (404). Waiting for a new URL."
          : 'No Discord webhook is set.',
      });
      return false;
    }
    try {
      await this.delivery.deliver(stored);
    } catch (err) {
      await this.delivery.recordFailure(err as Error);
      const notFound = err instanceof DiscordError && err.notFound;
      await this.activity.add({
        ...entry,
        status: 'failed',
        reason: notFound ? 'discord-404' : 'discord',
        error: (err as Error).message,
      });
      return false;
    }
    await this.delivery.recordSent(this.#rt.isoNow());
    await this.#announce(keys, label);
    await this.activity.add({ ...entry, status: 'sent' });
    return true;
  }

  #announce(keys: string[], title: string): Promise<void> {
    const at = this.#rt.isoNow();
    return this.store.update((s) => {
      for (const k of keys) s.announced[k] = { title, at };
    });
  }

  #remember({ plan, context, imageItemId }: ComposedMessage) {
    this.#recent.unshift({
      id: randomUUID(),
      label: messageLabel(plan),
      at: this.#rt.isoNow(),
      kind: plan.kind,
      context,
      imageItemId,
    });
    this.#recent.splice(RECENT_CONTEXTS);
  }

  retry(activityId: string): Promise<ActivityEntry> {
    return this.#batcher.exclusive(async () => {
      const entry = this.activity.find(activityId);
      if (!entry || entry.status !== 'failed' || !entry.message) {
        throw new RetryError('This message can no longer be retried.');
      }
      try {
        await this.delivery.deliver(entry.message);
      } catch (err) {
        await this.delivery.recordFailure(err as Error);
        await this.store.update(() => {
          entry.error = (err as Error).message;
          entry.reason = err instanceof DiscordError && err.notFound ? 'discord-404' : 'discord';
        });
        throw new RetryError((err as Error).message);
      }
      const now = this.#rt.isoNow();
      await this.delivery.recordSent(now);
      await this.#announce(entry.keys ?? [], entry.title);
      await this.store.update(() => {
        entry.status = 'sent';
        entry.at = now;
        delete entry.error;
        delete entry.reason;
      });
      return entry;
    });
  }

  async resendHeld(): Promise<number> {
    let sent = 0;
    for (const entry of this.activity.heldForDiscord().toReversed()) {
      try {
        await this.retry(entry.id);
        sent++;
      } catch (err) {
        this.#rt.log.warn(
          `Notifications: resending ${entry.title} failed: ${(err as Error).message}`,
        );
        if (this.store.state.discord.notFound) break;
      }
    }
    return sent;
  }

  test(): Promise<{ sentAt: string }> {
    return this.delivery.test();
  }

  async sendPreview(
    embed: RenderedEmbed,
    imageItemId: string | null,
    attachment?: Attachment,
  ): Promise<void> {
    await this.delivery.deliver({ kind: 'movie', embed, imageItemId }, attachment);
  }

  async updateSettings(next: StoredSettings): Promise<void> {
    const prev = this.settings;
    await this.store.saveSettings(next);
    if (next.discordWebhookUrl !== prev.discordWebhookUrl) {
      await this.delivery.webhookChanged();
      if (next.discordWebhookUrl) void this.resendHeld();
    }
    if (next.tmdbApiKey !== prev.tmdbApiKey) {
      await this.store.update((s) => {
        s.tmdbRejected = false;
      });
    }
    if (!next.enabled && prev.enabled && this.store.state.batch) {
      await this.#batcher.flush();
    }
  }
}
