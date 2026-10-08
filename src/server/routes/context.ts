import type { MediaItem } from '../../core/rules.js';
import type { DataDir } from '../../data.js';
import type { JellyfinClient } from '../../jellyfin/client.js';
import type { NotifyService } from '../../notify/service.js';
import type { RunStore } from '../../sync/run-store.js';
import type { Auth } from '../auth.js';
import type { UiFile } from '../ui.js';
import type { SyncService } from '../../sync/service.js';

// Value pickers and live match counts fire on every keystroke; one library fetch a minute is enough.
const MEDIA_CACHE_MS = 60_000;

export class MediaCache {
  #cached?: { at: number; items: Promise<MediaItem[]> };

  constructor(private readonly client: JellyfinClient) {}

  items(): Promise<MediaItem[]> {
    if (!this.#cached || Date.now() - this.#cached.at > MEDIA_CACHE_MS) {
      const items = this.client.mediaItems();
      this.#cached = { at: Date.now(), items };
      items.catch(() => this.clear());
    }
    return this.#cached.items;
  }

  clear() {
    this.#cached = undefined;
  }
}

export interface RouteContext {
  service: SyncService;
  auth: Auth;
  data: DataDir;
  client: JellyfinClient;
  runs: RunStore;
  media: MediaCache;
  fromEnv: { jellyfin: boolean; password: boolean };
  notify?: NotifyService;
  ui?: Map<string, UiFile>;
}
