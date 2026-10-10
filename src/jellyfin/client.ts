import { MEDIA_TYPES, type MediaType } from '../config/schema.js';
import type { MediaItem } from '../core/rules.js';
import type { LibraryOptions } from './library-options.js';
import {
  JellyfinHttpError,
  JellyfinUnreachableError,
  NotConfiguredError,
  type JellyfinHttp,
  type JfResponse,
  type Query,
  type RequestOptions,
} from './http.js';
import { normId } from '../shared/ids.js';

const PLUGIN_ID = 'efa3a80a43c34a51900ddffbd1bd0ce0';
const PAGE_SIZE = 500;
const ID_CHUNK = 100;

export function findCategoryPlugin(plugins: readonly PluginInfo[]): PluginInfo | undefined {
  return plugins.find((p) => normId(p.Id) === PLUGIN_ID);
}

export interface BaseItemDto {
  Id: string;
  Name: string;
  Type?: string;
  OriginalTitle?: string | null;
  ForcedSortName?: string | null;
  Overview?: string | null;
  LockData?: boolean | null;
  Genres?: string[] | null;
  Studios?: Array<{ Name?: string | null; Id?: string }> | null;
  Tags?: string[] | null;
  ImageTags?: Record<string, string | null> | null;
  [key: string]: unknown;
}
interface QueryResult<T> {
  Items: T[];
  TotalRecordCount: number;
}
interface VirtualFolder {
  Name: string;
  CollectionType?: string | null;
  ItemId: string;
  Locations?: string[] | null;
  LibraryOptions?: LibraryOptions | null;
}
interface PluginInfo {
  Id: string;
  Name: string;
  Version: string;
  Status: string;
}
export interface PluginConfiguration {
  CategoriesLibraryId?: string | null;
  [key: string]: unknown;
}
interface CategoryCollectionDto {
  Id: string;
  Name: string;
  Path: string;
  IsChild: boolean;
}
interface CategoriesFolderDto {
  Path: string;
  Exists: boolean;
}

export class IncompleteFetchError extends Error {}

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
}

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
// A create may have gone through on any other error, so creates only retry these.
const NOT_PROCESSED = new Set([429, 503]);

export class JellyfinClient {
  #adminUserId?: string;

  constructor(
    readonly http: JellyfinHttp,
    readonly retry: RetryPolicy = { attempts: 4, baseDelayMs: 500 },
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  async send<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
    idempotent = true,
  ): Promise<JfResponse<T>> {
    for (let attempt = 1; ; attempt++) {
      let res: JfResponse<T>;
      try {
        res = await this.http.request<T>(method, path, opts);
      } catch (err) {
        if (
          err instanceof NotConfiguredError ||
          attempt >= this.retry.attempts ||
          !(idempotent || isConnectionRefused(err))
        ) {
          throw err;
        }
        await this.sleep(this.retry.baseDelayMs * 2 ** (attempt - 1));
        continue;
      }
      if (
        res.ok ||
        attempt >= this.retry.attempts ||
        !(idempotent ? TRANSIENT : NOT_PROCESSED).has(res.status)
      ) {
        return res;
      }
      await this.sleep(this.retry.baseDelayMs * 2 ** (attempt - 1));
    }
  }

  async call<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
    idempotent = true,
  ): Promise<T> {
    const res = await this.send<T>(method, path, opts, idempotent);
    if (!res.ok) throw new JellyfinHttpError(res as JfResponse);
    return res.data;
  }

  get configured(): boolean {
    return this.http.configured;
  }

  configure(baseUrl: string, apiKey: string) {
    this.http.configure(baseUrl, apiKey);
    this.#adminUserId = undefined;
  }

  publicInfo() {
    return this.call<{ Version: string; ServerName?: string; StartupWizardCompleted?: boolean }>(
      'GET',
      '/System/Info/Public',
      { anonymous: true },
    );
  }

  async adminUserId(): Promise<string> {
    if (!this.#adminUserId) {
      const users = await this.call<
        Array<{ Id: string; Policy?: { IsAdministrator?: boolean } | null }>
      >('GET', '/Users');
      const admin = users.find((u) => u.Policy?.IsAdministrator);
      if (!admin) {
        throw new Error(
          'No administrator user found (GET /Users). The API key must belong to the server.',
        );
      }
      this.#adminUserId = admin.Id;
    }
    return this.#adminUserId;
  }

  virtualFolders() {
    return this.call<VirtualFolder[]>('GET', '/Library/VirtualFolders');
  }

  plugins() {
    return this.call<PluginInfo[]>('GET', '/Plugins');
  }

  async categoryPlugin(): Promise<PluginInfo | undefined> {
    return findCategoryPlugin(await this.plugins());
  }

  pluginConfiguration() {
    return this.call<PluginConfiguration>('GET', `/Plugins/${PLUGIN_ID}/Configuration`);
  }

  async setPluginConfiguration(config: PluginConfiguration) {
    await this.call('POST', `/Plugins/${PLUGIN_ID}/Configuration`, { json: config });
  }

  async createLibrary(name: string, collectionType: string, path: string, options: LibraryOptions) {
    await this.call(
      'POST',
      '/Library/VirtualFolders',
      {
        query: { name, collectionType, paths: [path], refreshLibrary: true },
        json: { LibraryOptions: options },
      },
      false,
    );
  }

  async setLibraryOptions(libraryId: string, options: LibraryOptions) {
    await this.call('POST', '/Library/VirtualFolders/LibraryOptions', {
      json: { Id: libraryId, LibraryOptions: options },
    });
  }

  async mediaItems(types: readonly MediaType[] = ['Movie', 'Series']): Promise<MediaItem[]> {
    const { items, total } = await this.#allItems<BaseItemDto>({
      includeItemTypes: types,
      recursive: true,
      // Otherwise Jellyfin answers with the BoxSets instead of the movies in them.
      collapseBoxSetItems: false,
      fields: ['Genres', 'Studios', 'Tags', 'OriginalTitle'],
      sortBy: ['SortName'],
    });
    if (items.length !== total) {
      throw new IncompleteFetchError(`Fetched ${items.length} of ${total} items`);
    }
    return items.flatMap((dto) => {
      const type = MEDIA_TYPES.find((t) => t === dto.Type && types.includes(t));
      return type ? [toMediaItem(dto, type)] : [];
    });
  }

  // Movies, series and episodes with the fields notification keys need; series give episodes their ids.
  async libraryItems(): Promise<BaseItemDto[]> {
    const { items } = await this.#allItems<BaseItemDto>({
      includeItemTypes: ['Movie', 'Series', 'Episode'],
      recursive: true,
      collapseBoxSetItems: false,
      fields: ['ProviderIds'],
    });
    return items;
  }

  async getItem(id: string) {
    const userId = await this.adminUserId();
    return this.call<BaseItemDto>('GET', `/Items/${id}`, { query: { userId } });
  }

  async updateItem(dto: BaseItemDto) {
    await this.call('POST', `/Items/${dto.Id}`, { json: dto });
  }

  async members(boxSetId: string): Promise<string[]> {
    const { items } = await this.#allItems<{ Id: string }>({ parentId: boxSetId });
    return items.map((i) => i.Id);
  }

  async #allItems<T>(query: Query): Promise<{ items: T[]; total: number }> {
    // Without an admin userId, /Items?parentId=<boxset> returns no members.
    const userId = await this.adminUserId();
    const items: T[] = [];
    for (let start = 0; ; start += PAGE_SIZE) {
      const page = await this.call<QueryResult<T>>('GET', '/Items', {
        query: {
          ...query,
          userId,
          startIndex: start,
          limit: PAGE_SIZE,
          enableTotalRecordCount: true,
          enableImages: false,
          enableUserData: false,
        },
      });
      items.push(...page.Items);
      if (page.Items.length < PAGE_SIZE || items.length >= page.TotalRecordCount) {
        return { items, total: page.TotalRecordCount };
      }
    }
  }

  async addToCollection(boxSetId: string, ids: readonly string[]) {
    for (const chunk of chunks(ids, ID_CHUNK)) {
      await this.call('POST', `/Collections/${boxSetId}/Items`, { query: { ids: chunk } });
    }
  }

  async removeFromCollection(boxSetId: string, ids: readonly string[]) {
    for (const chunk of chunks(ids, ID_CHUNK)) {
      await this.call('DELETE', `/Collections/${boxSetId}/Items`, { query: { ids: chunk } });
    }
  }

  async uploadPrimaryImage(id: string, bytes: Uint8Array, contentType: string) {
    await this.call('POST', `/Items/${id}/Images/Primary`, {
      body: Buffer.from(bytes).toString('base64'),
      contentType,
    });
  }

  async refreshItem(id: string) {
    await this.call('POST', `/Items/${id}/Refresh`, {
      query: {
        metadataRefreshMode: 'Default',
        imageRefreshMode: 'Default',
        replaceAllMetadata: false,
        replaceAllImages: false,
      },
    });
  }

  async deleteItem(id: string) {
    await this.call('DELETE', `/Items/${id}`);
  }

  categoryCollections() {
    return this.call<CategoryCollectionDto[]>('GET', '/CategoryCollections');
  }

  createCategoryCollection(name: string) {
    return this.call<CategoryCollectionDto>(
      'POST',
      '/CategoryCollections',
      { query: { name } },
      false,
    );
  }

  categoriesFolder() {
    return this.call<CategoriesFolderDto>('GET', '/CategoryCollections/Folder');
  }

  createCategoriesFolder() {
    return this.call<CategoriesFolderDto>('POST', '/CategoryCollections/Folder');
  }

  async itemsByIds(ids: readonly string[]): Promise<BaseItemDto[]> {
    if (!ids.length) return [];
    const userId = await this.adminUserId();
    const page = await this.call<QueryResult<BaseItemDto>>('GET', '/Items', {
      query: {
        userId,
        ids,
        fields: ['ProviderIds', 'Overview'],
        enableImages: false,
        enableUserData: false,
      },
    });
    return page.Items;
  }

  async ancestors(id: string): Promise<BaseItemDto[]> {
    const userId = await this.adminUserId();
    return this.call<BaseItemDto[]>('GET', `/Items/${id}/Ancestors`, { query: { userId } });
  }

  async seasonEpisodes(seriesId: string, season: number): Promise<BaseItemDto[]> {
    const userId = await this.adminUserId();
    const page = await this.call<QueryResult<BaseItemDto>>('GET', `/Shows/${seriesId}/Episodes`, {
      query: { userId, season, enableImages: false, enableUserData: false },
    });
    return page.Items;
  }

  async image(
    id: string,
    type: 'Primary' | 'Backdrop',
    maxWidth: number,
  ): Promise<{ bytes: Uint8Array; contentType: string } | undefined> {
    const res = await this.send('GET', `/Items/${id}/Images/${type}`, {
      query: { maxWidth, quality: 85, format: 'Jpg' },
      accept: 'image/*',
    });
    if (res.status === 404 || !res.bytes) return undefined;
    if (!res.ok) throw new JellyfinHttpError(res as JfResponse);
    return { bytes: res.bytes, contentType: res.contentType };
  }
}

function toMediaItem(dto: BaseItemDto, type: MediaType): MediaItem {
  return {
    id: dto.Id,
    type,
    name: dto.Name,
    originalTitle: dto.OriginalTitle ?? undefined,
    genres: dto.Genres ?? [],
    studios: (dto.Studios ?? []).flatMap((s) => (s.Name ? [s.Name] : [])),
    tags: dto.Tags ?? [],
  };
}

function* chunks<T>(list: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < list.length; i += size) yield list.slice(i, i + size);
}

function isConnectionRefused(err: unknown): boolean {
  return err instanceof JellyfinUnreachableError && err.code === 'ECONNREFUSED';
}
