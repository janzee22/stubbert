import type { ImageChoice } from '../shared/notify.js';
import { TEST_MESSAGE } from './defaults.js';
import {
  DiscordError,
  sendToDiscord,
  type Attachment,
  type DiscordEmbed,
  type DiscordPayload,
} from './discord.js';
import { mentionPayload, type RenderedEmbed } from './message.js';
import type { Runtime } from './runtime.js';
import type { StoredMessage } from './store.js';

// Discord's upload limit for a server without boosts.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_WIDTH = { poster: [600, 300], backdrop: [1280, 640] } as const;

export class Delivery {
  constructor(private readonly rt: Runtime) {}

  get failing(): boolean {
    const d = this.rt.store.state.discord;
    return this.rt.settings.enabled && (d.notFound || d.failures >= 3);
  }

  get paused(): boolean {
    return this.rt.store.state.discord.notFound || !this.rt.settings.discordWebhookUrl;
  }

  payloadFor(embed: RenderedEmbed, attachment: Attachment | undefined): DiscordPayload {
    const e: DiscordEmbed = { color: embed.color };
    if (embed.title) e.title = embed.title;
    if (embed.description) e.description = embed.description;
    const url = attachment && `attachment://${attachment.filename}`;
    if (url && embed.image === 'poster') e.thumbnail = { url };
    if (url && embed.image === 'backdrop') e.image = { url };
    return {
      username: this.rt.settings.username,
      ...mentionPayload(this.rt.settings.mention),
      embeds: [e],
    };
  }

  async deliver(message: StoredMessage, override?: Attachment): Promise<void> {
    const url = this.rt.settings.discordWebhookUrl;
    if (!url) throw new DiscordError('No Discord webhook is set', null);
    const attachment = override ?? (await this.#image(message.imageItemId, message.embed.image));
    await sendToDiscord(url, this.payloadFor(message.embed, attachment), attachment, {
      fetch: this.rt.fetch,
      sleep: this.rt.sleep,
    });
  }

  async test(): Promise<{ sentAt: string }> {
    const url = this.rt.settings.discordWebhookUrl;
    if (!url) throw new DiscordError('Enter a Discord webhook URL first.', null);
    const payload: DiscordPayload = {
      username: this.rt.settings.username,
      ...mentionPayload({ type: 'none' }),
      embeds: [{ ...TEST_MESSAGE, color: 0xffbe2e }],
    };
    try {
      await sendToDiscord(url, payload, undefined, {
        fetch: this.rt.fetch,
        sleep: this.rt.sleep,
        attempts: 1,
      });
    } catch (err) {
      await this.recordFailure(err as Error);
      throw err;
    }
    const sentAt = this.rt.isoNow();
    await this.rt.store.update((s) => {
      s.discord.lastTestAt = sentAt;
      s.discord.failures = 0;
      s.discord.notFound = false;
      s.discord.lastError = null;
    });
    return { sentAt };
  }

  async recordSent(at: string) {
    await this.rt.store.update((s) => {
      s.discord.lastSentAt = at;
      s.discord.failures = 0;
      s.discord.notFound = false;
      s.discord.lastError = null;
    });
  }

  async recordFailure(err: Error) {
    const notFound = err instanceof DiscordError && err.notFound;
    await this.rt.store.update((s) => {
      s.discord.failures++;
      s.discord.lastError = err.message;
      s.discord.lastErrorAt = this.rt.isoNow();
      if (notFound) s.discord.notFound = true;
    });
  }

  async webhookChanged() {
    await this.rt.store.update((s) => {
      s.discord.notFound = false;
      s.discord.failures = 0;
      s.discord.lastError = null;
    });
  }

  async #image(itemId: string | null, image: ImageChoice): Promise<Attachment | undefined> {
    const { jellyfin, log } = this.rt;
    if (!itemId || image === 'none' || !jellyfin.configured) return undefined;
    try {
      const type = image === 'poster' ? 'Primary' : 'Backdrop';
      const [width, smaller] = IMAGE_WIDTH[image];
      let got = await jellyfin.image(itemId, type, width);
      if (got && got.bytes.byteLength > MAX_IMAGE_BYTES) {
        got = await jellyfin.image(itemId, type, smaller);
      }
      if (!got || got.bytes.byteLength > MAX_IMAGE_BYTES) return undefined;
      return {
        filename: `${image}.jpg`,
        bytes: got.bytes,
        contentType: got.contentType || 'image/jpeg',
      };
    } catch (err) {
      log.warn(`Notifications: cannot fetch the ${image} of ${itemId}: ${(err as Error).message}`);
      return undefined;
    }
  }
}
