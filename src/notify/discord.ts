import { DISCORD_WEBHOOK } from './settings.js';
import type { Fetch } from './sources.js';

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  thumbnail?: { url: string };
  image?: { url: string };
}

export interface DiscordPayload {
  username?: string;
  content?: string;
  embeds: DiscordEmbed[];
  allowed_mentions: { parse: string[]; roles?: string[] };
}

export interface Attachment {
  filename: string;
  bytes: Uint8Array;
  contentType: string;
}

export class DiscordError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }

  get notFound(): boolean {
    return this.status === 404;
  }
}

export interface SendOptions {
  fetch?: Fetch;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export function isDiscordWebhook(url: string): boolean {
  return DISCORD_WEBHOOK.test(url);
}

function retryAfterMs(res: Response, body: unknown): number {
  const fromBody = (body as { retry_after?: unknown } | null)?.retry_after;
  const seconds = typeof fromBody === 'number' ? fromBody : Number(res.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 60_000) : 1000;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function describe(status: number, body: unknown): string {
  const message = (body as { message?: unknown } | null)?.message;
  const detail = typeof message === 'string' ? `: ${message}` : '';
  if (status === 404) return "Discord doesn't know this webhook (404)";
  if (status === 401 || status === 403) return `Discord refused the webhook (${status})`;
  if (status === 429) return 'Discord answered 429: too many messages';
  return `Discord answered ${status}${detail}`;
}

export async function sendToDiscord(
  url: string,
  payload: DiscordPayload,
  attachment: Attachment | undefined,
  opts: SendOptions = {},
): Promise<void> {
  if (!isDiscordWebhook(url)) throw new DiscordError('This is not a Discord webhook URL', null);
  const f = opts.fetch ?? fetch;
  const attempts = opts.attempts ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const target = `${url.replace(/\/+$/, '')}?wait=true`;
  let last = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let body: BodyInit;
    const headers: Record<string, string> = {};
    if (attachment) {
      const form = new FormData();
      form.append(
        'payload_json',
        JSON.stringify({ ...payload, attachments: [{ id: 0, filename: attachment.filename }] }),
      );
      form.append(
        'files[0]',
        new Blob([attachment.bytes as Uint8Array<ArrayBuffer>], { type: attachment.contentType }),
        attachment.filename,
      );
      body = form;
    } else {
      body = JSON.stringify(payload);
      headers['Content-Type'] = 'application/json';
    }
    let res: Response;
    try {
      res = await f(target, {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
    } catch (err) {
      last = `Cannot reach Discord: ${(err as Error).message}`;
      if (attempt < attempts) await sleep(1000 * 2 ** (attempt - 1));
      continue;
    }
    if (res.ok) return;
    const data = await readBody(res);
    last = describe(res.status, data);
    if (res.status === 429) {
      if (attempt < attempts) await sleep(retryAfterMs(res, data));
      continue;
    }
    if (res.status >= 500) {
      if (attempt < attempts) await sleep(1000 * 2 ** (attempt - 1));
      continue;
    }
    throw new DiscordError(`${last}.`, res.status);
  }
  throw new DiscordError(`${last}. Tried ${attempts} times.`, null);
}
