import type { Category, Config, MediaType, Rule } from '../config/schema.js';
import type { ConfigIssue } from '../config/validate.js';
import type { SetupResult } from '../jellyfin/setup.js';
import type { Mention, RenderedEmbed } from '../notify/message.js';
import type { TemplateIssue } from '../notify/template/index.js';
import type { Preferences } from '../notify/settings.js';
import type { ManagedCollection } from '../sync/collections.js';
import type { CategoryReport, ItemRef, SyncReport } from '../sync/report.js';
import type { RunRecord, RunSummary } from '../sync/run-store.js';
import type { MessageKind, MessageTemplate } from './notify.js';

export type {
  Category,
  CategoryReport,
  ConfigIssue,
  ItemRef,
  ManagedCollection,
  Mention,
  MessageKind,
  MessageTemplate,
  Preferences,
  RenderedEmbed,
  Rule,
  RunRecord,
  RunSummary,
  SetupResult,
  SyncReport,
};

export type ErrorCode =
  | 'bad-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'rate-limited'
  | 'busy'
  | 'config'
  | 'preflight'
  | 'setup'
  | 'jellyfin'
  | 'upstream'
  | 'not-configured'
  | 'not-managed'
  | 'internal';

export interface ErrorBody {
  error: string;
  code: ErrorCode;
  issues?: ConfigIssue[];
}

export interface Session {
  authRequired: boolean;
  authenticated: boolean;
  needsPassword: boolean;
}

export interface Status {
  running: RunSummary | null;
  lastRun: RunSummary | null;
  nextRunAt: string | null;
  schedule: Config['schedule'] | null;
  config: { valid: boolean; issues?: ConfigIssue[] };
  notifications: { failing: string | null };
}

export interface ConfigResponse {
  config: unknown;
  valid: boolean;
  issues: ConfigIssue[];
}

export interface Validation {
  valid: boolean;
  issues: ConfigIssue[];
  warnings: string[];
}

export interface Settings {
  jellyfin: { url: string | null; apiKeySet: boolean; fromEnv: boolean };
  password: { fromEnv: boolean; open: boolean };
}

export interface JellyfinCheck {
  ok: true;
  version: string;
  serverName: string | null;
}

type Check = { ok: true } | { ok: false; error: string };

export interface Connection {
  jellyfin:
    | { ok: true; url: string; version: string; serverName: string | null }
    | { ok: false; url: string; error: string };
  apiKey: Check;
  plugin:
    | { installed: false }
    | { installed: true; status: string; version: string; categoriesLibraryId: string | null };
  preflight: Check;
}

export interface Library {
  id: string;
  name: string;
  type: string;
  locations: string[];
  pluginLibrary: boolean;
}

export const VALUE_FIELDS = ['genres', 'studios', 'tags'] as const;
export type ValueField = (typeof VALUE_FIELDS)[number];

export interface ValueCount {
  name: string;
  movies: number;
  series: number;
  count: number;
}

export interface Evaluation {
  count: number;
  movies: number;
  series: number;
  items: Array<{ id: string; name: string; type: MediaType }>;
}

export interface Poster {
  file: string;
  size: number;
  modified: string;
}

export interface SecretView {
  set: boolean;
  hint: string | null;
}

export interface NotifySettingsView {
  preferences: Preferences;
  discordWebhook: SecretView;
  tmdbApiKey: SecretView;
  webhookUrl: string;
  defaults: Record<MessageKind, MessageTemplate>;
  jellyfinUrl: string | null;
}

export interface NotifySettingsRequest {
  preferences: Preferences;
  discordWebhookUrl?: string | null;
  tmdbApiKey?: string | null;
}

export interface NotifyStatusView {
  enabled: boolean;
  webhook: {
    lastEventAt: string | null;
    lastEventSummary: string | null;
    refused: { count: number; since: string | null; hint: string | null } | null;
  };
  batch: { titles: string[]; items: number; flushAt: string } | null;
  discord: {
    set: boolean;
    lastSentAt: string | null;
    lastTestAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    notFound: boolean;
    failing: boolean;
  };
  tmdbRejected: boolean;
  jellyfinConfigured: boolean;
  announced: number;
}

export interface MarkExistingResult {
  movies: number;
  episodes: number;
}

export type ActivityStatus = 'sent' | 'skipped' | 'failed' | 'off';
export type ActivityReason =
  'announced' | 'bulk' | 'disabled' | 'filtered' | 'discord' | 'discord-404';

export interface ActivityView {
  id: string;
  at: string;
  status: ActivityStatus;
  reason: ActivityReason | null;
  title: string;
  detail: string | null;
  kind: MessageKind | null;
  titles: string[];
  warnings: string[];
  error: string | null;
  retryable: boolean;
}

export interface NotifyIssue {
  path: string;
  message: string;
  kind?: MessageKind;
  field?: 'title' | 'content';
}

export interface SampleView {
  id: string;
  label: string;
}

export interface PreviewRequest {
  kind: MessageKind;
  template: MessageTemplate;
  sampleId: string;
}

export interface PreviewIssue extends TemplateIssue {
  field: 'title' | 'content';
}

export interface Variable {
  path: string;
  value: string;
}

export interface PreviewResult {
  embed: RenderedEmbed | null;
  issues: PreviewIssue[];
  warnings: string[];
  notes: string[];
  error: string | null;
  imageUrl: string | null;
  username: string;
  mention: string | null;
  variables: Variable[];
}
