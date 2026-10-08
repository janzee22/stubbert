import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { NotifyItem } from './item.js';
import type { RenderedEmbed } from './message.js';
import { DEFAULT_TEMPLATES } from './defaults.js';
import { MESSAGE_KINDS, type MessageKind } from '../shared/notify.js';
import type { SeasonSize } from './plan.js';
import { withDefaults, type StoredSettings } from './settings.js';

import type { ActivityReason, ActivityStatus } from '../shared/api.js';

export interface StoredMessage {
  kind: MessageKind;
  embed: RenderedEmbed;
  imageItemId: string | null;
}

export interface ActivityEntry {
  id: string;
  at: string;
  status: ActivityStatus;
  reason?: ActivityReason;
  title: string;
  detail?: string;
  kind?: MessageKind;
  titles?: string[];
  warnings?: string[];
  error?: string;
  keys?: string[];
  message?: StoredMessage;
}

export interface OpenBatch {
  id: string;
  createdAt: string;
  flushAt: string;
  items: NotifyItem[];
}

export interface IngestStats {
  lastEventAt: string | null;
  lastEventSummary: string | null;
  refusedCount: number;
  firstRefusedAt: string | null;
  lastRefusedAt: string | null;
  refusedTokenHint: string | null;
  ignored: Record<string, number>;
}

export interface DiscordStatus {
  lastSentAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  notFound: boolean;
  failures: number;
  lastTestAt: string | null;
}

export interface CachedSize extends SeasonSize {
  fetchedAt: string;
}

export interface NotifyState {
  version: 1;
  announced: Record<string, { title: string; at: string }>;
  batch: OpenBatch | null;
  activity: ActivityEntry[];
  ingest: IngestStats;
  discord: DiscordStatus;
  recentEvents: Record<string, string>;
  seasonCache: Record<string, CachedSize>;
  tmdbRejected: boolean;
  serverName: string | null;
}

export function emptyState(): NotifyState {
  return {
    version: 1,
    announced: {},
    batch: null,
    activity: [],
    ingest: {
      lastEventAt: null,
      lastEventSummary: null,
      refusedCount: 0,
      firstRefusedAt: null,
      lastRefusedAt: null,
      refusedTokenHint: null,
      ignored: {},
    },
    discord: {
      lastSentAt: null,
      lastError: null,
      lastErrorAt: null,
      notFound: false,
      failures: 0,
      lastTestAt: null,
    },
    recentEvents: {},
    seasonCache: {},
    tmdbRejected: false,
    serverName: null,
  };
}

async function writeAtomic(path: string, data: string, mode?: number) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, data, { mode });
  await rename(`${path}.tmp`, path);
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`cannot read ${path}: ${(err as Error).message}`, { cause: err });
  }
}

export class NotifyStore {
  #settings?: StoredSettings;
  #state?: NotifyState;
  #writes: Promise<void> = Promise.resolve();

  constructor(readonly dir: string) {}

  get settingsPath() {
    return join(this.dir, 'settings.json');
  }

  get statePath() {
    return join(this.dir, 'state.json');
  }

  async load(): Promise<void> {
    const rawSettings = await readJson(this.settingsPath);
    this.#settings = withDefaults(rawSettings);
    const rawState = (await readJson(this.statePath)) as Partial<NotifyState> | undefined;
    const base = emptyState();
    this.#state = {
      ...base,
      ...rawState,
      ingest: { ...base.ingest, ...rawState?.ingest },
      discord: { ...base.discord, ...rawState?.discord },
      version: 1,
    };
    if (
      !rawSettings ||
      (rawSettings as { webhookToken?: unknown }).webhookToken !== this.#settings.webhookToken
    ) {
      await this.saveSettings(this.#settings);
    }
  }

  get settings(): StoredSettings {
    if (!this.#settings) throw new Error('NotifyStore not loaded');
    return this.#settings;
  }

  get state(): NotifyState {
    if (!this.#state) throw new Error('NotifyStore not loaded');
    return this.#state;
  }

  #queue(write: () => Promise<void>): Promise<void> {
    const next = this.#writes.then(write, write);
    this.#writes = next.catch(() => undefined);
    return next;
  }

  saveSettings(settings: StoredSettings): Promise<void> {
    this.#settings = settings;
    const changed = Object.fromEntries(
      MESSAGE_KINDS.flatMap((kind) =>
        JSON.stringify(settings.templates[kind]) === JSON.stringify(DEFAULT_TEMPLATES[kind])
          ? []
          : [[kind, settings.templates[kind]]],
      ),
    );
    const text = `${JSON.stringify({ ...settings, templates: changed }, null, 2)}\n`;
    return this.#queue(() => writeAtomic(this.settingsPath, text, 0o600));
  }

  async update<T>(fn: (state: NotifyState) => T): Promise<T> {
    const result = fn(this.state);
    const text = `${JSON.stringify(this.state)}\n`;
    await this.#queue(() => writeAtomic(this.statePath, text));
    return result;
  }

  flushed(): Promise<void> {
    return this.#writes;
  }
}
