import type { BaseItemDto } from '../jellyfin/client.js';
import type { Logger } from '../log.js';
import type { StoredSettings } from './settings.js';
import type { Fetch } from './sources.js';
import type { NotifyStore } from './store.js';

export interface NotifyJellyfin {
  readonly configured: boolean;
  itemsByIds(ids: readonly string[]): Promise<BaseItemDto[]>;
  ancestors(id: string): Promise<BaseItemDto[]>;
  seasonEpisodes(seriesId: string, season: number): Promise<BaseItemDto[]>;
  libraryItems(): Promise<BaseItemDto[]>;
  image(
    id: string,
    type: 'Primary' | 'Backdrop',
    maxWidth: number,
  ): Promise<{ bytes: Uint8Array; contentType: string } | undefined>;
}

export interface NotifyDeps {
  store: NotifyStore;
  jellyfin: NotifyJellyfin;
  fetch?: Fetch;
  now?: () => Date;
  log?: Logger;
  sleep?: (ms: number) => Promise<void>;
  tickMs?: number;
  onNewItem?: () => void;
}

export class Runtime {
  readonly store: NotifyStore;
  readonly jellyfin: NotifyJellyfin;
  readonly fetch: Fetch;
  readonly now: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
  readonly log: Logger;

  constructor(deps: NotifyDeps) {
    this.store = deps.store;
    this.jellyfin = deps.jellyfin;
    this.fetch = deps.fetch ?? fetch;
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.log = deps.log ?? console;
  }

  get settings(): StoredSettings {
    return this.store.settings;
  }

  isoNow(): string {
    return this.now().toISOString();
  }
}
