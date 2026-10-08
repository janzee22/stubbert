import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { DEFAULT_TEMPLATES } from './defaults.js';

export const DISCORD_WEBHOOK =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a color like #FFBE2E');

export const templateSchema = z.object({
  title: z.string().max(2000),
  content: z.string().max(8000),
  image: z.enum(['poster', 'backdrop', 'none']),
  color: hex,
});

export const mentionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('everyone') }),
  z.object({
    type: z.literal('role'),
    roleId: z
      .string()
      .trim()
      .transform((v) => /^<@&(\d+)>$/.exec(v)?.[1] ?? v)
      .pipe(z.string().regex(/^\d{5,25}$/, 'Paste a role tag like <@&123456789012345678>.')),
  }),
]);

const username = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (u) => !/discord|clyde/i.test(u),
    'Discord does not allow "discord" or "clyde" in the name',
  )
  .refine((u) => !/[@#:]|```/.test(u), 'Discord does not allow @, #, : or ``` in the name');

const address = z
  .string()
  .trim()
  .regex(/^https?:\/\/[^/\s]+/i, 'an http:// or https:// address')
  .transform((u) => u.replace(/\/+$/, ''));

export const preferencesSchema = z.object({
  enabled: z.boolean(),
  movies: z.boolean(),
  episodes: z.boolean(),
  libraryIds: z.array(z.string().regex(/^[0-9a-f]{32}$/)).max(200),
  quietMinutes: z
    .number()
    .int('Use 1 to 120 minutes.')
    .min(1, 'Use 1 to 120 minutes.')
    .max(120, 'Use 1 to 120 minutes.'),
  bulkThreshold: z
    .number()
    .int('Use 2 to 100 titles.')
    .min(2, 'Use 2 to 100 titles.')
    .max(100, 'Use 2 to 100 titles.'),
  skipAnnounced: z.boolean(),
  tvmaze: z.boolean(),
  publicAddress: address,
  username,
  mention: mentionSchema,
  linkBase: address.nullable(),
  templates: z.object({
    movie: templateSchema,
    episode: templateSchema,
    episodes: templateSchema,
    season: templateSchema,
  }),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export interface Secrets {
  webhookToken: string;
  discordWebhookUrl: string | null;
  tmdbApiKey: string | null;
}

export type StoredSettings = Preferences & Secrets;

export const DEFAULT_PREFERENCES: Preferences = {
  enabled: false,
  movies: true,
  episodes: true,
  libraryIds: [],
  quietMinutes: 10,
  bulkThreshold: 5,
  skipAnnounced: true,
  tvmaze: true,
  publicAddress: 'http://stubbert:8080',
  username: 'Stubbert',
  mention: { type: 'none' },
  linkBase: null,
  templates: DEFAULT_TEMPLATES,
};

export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export function withDefaults(raw: unknown): StoredSettings {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...DEFAULT_PREFERENCES };
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (key === 'templates') continue;
    const parsed = preferencesSchema.shape[key as keyof Preferences].safeParse(obj[key]);
    if (parsed.success) merged[key] = parsed.data;
  }
  const rawTemplates = (obj.templates ?? {}) as Record<string, unknown>;
  merged.templates = Object.fromEntries(
    Object.entries(DEFAULT_TEMPLATES).map(([kind, def]) => {
      const parsed = templateSchema.safeParse(rawTemplates[kind]);
      return [kind, parsed.success ? parsed.data : def];
    }),
  );
  return {
    ...(merged as Preferences),
    webhookToken: str(obj.webhookToken) ?? newToken(),
    discordWebhookUrl: str(obj.discordWebhookUrl),
    tmdbApiKey: str(obj.tmdbApiKey),
  };
}

export function hint(secret: string | null): string | null {
  return secret ? `…${secret.slice(-4)}` : null;
}
