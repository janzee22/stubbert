import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

type Schema = {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: Schema;
  properties?: Record<string, Schema>;
  allOf?: Schema[];
  additionalProperties?: unknown;
};
interface Param {
  name: string;
  in: string;
  required?: boolean;
  schema?: Schema;
}
interface Operation {
  parameters?: Param[];
  requestBody?: { content?: Record<string, unknown> };
  responses: Record<string, { content?: Record<string, { schema?: Schema }> }>;
}
interface Spec {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
}

const spec = JSON.parse(
  readFileSync(new URL('./fixtures/jellyfin-openapi-12.1.0.json', import.meta.url), 'utf8'),
) as Spec;

const PLUGIN_GUID = 'efa3a80a-43c3-4a51-900d-dffbd1bd0ce0';
export const CATEGORIES_LIBRARY_ID = 'e679087c0457e175fbaee597d5d107ff';
export const MOVIES_LIBRARY_ID = 'f137a2dd21bbc1b99aa5c0f6bf02a805';
const CATEGORIES_PATH = '/media/categories';
const ADMIN_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

export interface FakeItem {
  Id: string;
  Name: string;
  Type: 'Movie' | 'Series' | 'BoxSet';
  Path?: string;
  OriginalTitle?: string | null;
  ForcedSortName?: string | null;
  Overview?: string | null;
  LockData: boolean;
  Genres: string[];
  Studios: Array<{ Name: string; Id: string }>;
  Tags: string[];
  ImageTags: Record<string, string>;
  ProviderIds: Record<string, string>;
  members: string[];
  image?: Buffer;
}

export interface LoggedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
}

const id = () => randomUUID().replace(/-/g, '');

function resolve(schema: Schema | undefined): Schema | undefined {
  if (!schema) return undefined;
  if (schema.$ref) return resolve(spec.components.schemas[schema.$ref.split('/').pop()!]);
  if (schema.allOf?.length === 1) return resolve(schema.allOf[0]);
  return schema;
}

function findOperation(
  method: string,
  path: string,
): { template: string; op: Operation; pathParams: Record<string, string> } | undefined {
  for (const [template, ops] of Object.entries(spec.paths)) {
    const op = ops[method.toLowerCase()];
    if (!op) continue;
    const names: string[] = [];
    const re = new RegExp(
      `^${template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (_, n: string) => (names.push(n), '([^/]+)'))}$`,
      'i',
    );
    const m = re.exec(path);
    if (m) {
      return {
        template,
        op,
        pathParams: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1]!)])),
      };
    }
  }
  return undefined;
}

function checkValue(schema: Schema | undefined, value: string): string | undefined {
  const s = resolve(schema);
  if (!s) return undefined;
  if (s.type === 'array') {
    for (const v of value.split(',')) {
      const problem = checkValue(s.items, v);
      if (problem) return problem;
    }
    return undefined;
  }
  if (s.enum && !s.enum.includes(value)) return `"${value}" is not one of the enum values`;
  if (s.type === 'boolean' && value !== 'true' && value !== 'false') {
    return `"${value}" is not a boolean`;
  }
  if (s.type === 'integer' && !/^-?\d+$/.test(value)) return `"${value}" is not an integer`;
  if (
    s.format === 'uuid' &&
    !/^[0-9a-f]{32}$|^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
  ) {
    return `"${value}" is not a uuid`;
  }
  return undefined;
}

function checkResponse(
  schema: Schema | undefined,
  body: unknown,
  where: string,
  out: string[],
  depth = 0,
) {
  const s = resolve(schema);
  if (!s || body === null || body === undefined || depth > 4) return;
  if (s.type === 'array' && Array.isArray(body)) {
    for (const item of body) checkResponse(s.items, item, `${where}[]`, out, depth + 1);
    return;
  }
  if (!s.properties || typeof body !== 'object') return;
  for (const [key, value] of Object.entries(body)) {
    const prop = s.properties[key];
    if (!prop) out.push(`${where}: response field "${key}" is not in the spec`);
    else checkResponse(prop, value, `${where}.${key}`, out, depth + 1);
  }
}

export class FakeJellyfin {
  readonly items = new Map<string, FakeItem>();
  readonly requests: LoggedRequest[] = [];
  readonly violations: string[] = [];
  pluginInstalled = true;
  apiKey?: string;
  categoriesLibrary = true;
  categoriesFolder = true;
  folderEndpoint = true;
  dropNewLibraries = false;
  pluginConfig: { CategoriesLibraryId?: string } = { CategoriesLibraryId: CATEGORIES_LIBRARY_ID };
  boxSetFetchers: string[] = [];
  totalRecordSkew = 0;
  #failures: Array<{ match: RegExp; method: string; status: number; times: number }> = [];
  #server?: Server;
  url = '';

  addMedia(
    type: 'Movie' | 'Series',
    name: string,
    fields: Partial<Pick<FakeItem, 'Genres' | 'Tags' | 'OriginalTitle'>> & {
      studios?: string[];
    } = {},
  ): FakeItem {
    const item = this.#newItem(type, name);
    Object.assign(item, {
      Genres: fields.Genres ?? [],
      Tags: fields.Tags ?? [],
      OriginalTitle: fields.OriginalTitle ?? null,
    });
    item.Studios = (fields.studios ?? []).map((s) => ({ Name: s, Id: id() }));
    return item;
  }

  addCollection(name: string, members: string[] = []): FakeItem {
    const item = this.#newItem('BoxSet', name);
    item.Path = `/config/data/collections/${name} [boxset]`;
    item.members = [...members];
    return item;
  }

  addCategory(name: string, members: string[] = []): FakeItem {
    const item = this.#newItem('BoxSet', name);
    item.Path = `${CATEGORIES_PATH}/${name} [boxset]`;
    item.members = [...members];
    return item;
  }

  failNext(method: string, match: RegExp, status: number, times = 1) {
    this.#failures.push({ method, match, status, times });
  }

  categories(): FakeItem[] {
    return [...this.items.values()].filter(
      (i) => i.Type === 'BoxSet' && i.Path?.startsWith(`${CATEGORIES_PATH}/`),
    );
  }

  refreshes(): string[] {
    return this.requests
      .filter((r) => r.method === 'POST' && r.path.endsWith('/Refresh'))
      .map((r) => r.path.split('/')[2]!);
  }

  writes(): LoggedRequest[] {
    return this.requests.filter((r) => r.method !== 'GET');
  }

  #boxSetFetchersOf(options: unknown): string[] {
    return (
      (
        options as
          { TypeOptions?: Array<{ Type: string; MetadataFetchers?: string[] }> } | undefined
      )?.TypeOptions?.find((t) => t.Type === 'BoxSet')?.MetadataFetchers ?? []
    );
  }

  episodes = new Map<
    string,
    Array<{ Id: string; Name: string; IndexNumber: number; LocationType: string }>
  >();

  imageRequests: string[] = [];
  #raw: (bytes: Buffer, type: string) => void = () => undefined;

  #newItem(type: FakeItem['Type'], name: string): FakeItem {
    const item: FakeItem = {
      Id: id(),
      Name: name,
      Type: type,
      LockData: false,
      Genres: [],
      Studios: [],
      Tags: [],
      ImageTags: {},
      ProviderIds: {},
      members: [],
    };
    this.items.set(item.Id, item);
    return item;
  }

  async start(): Promise<string> {
    this.#server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => this.#handle(req, Buffer.concat(chunks), res));
    });
    await new Promise<void>((r) => this.#server!.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this.url;
  }

  async stop() {
    await new Promise((r) => this.#server?.close(r));
  }

  #handle(req: IncomingMessage, body: Buffer, res: ServerResponse) {
    const url = new URL(req.url!, 'http://x');
    const method = req.method!;
    this.requests.push({ method, path: url.pathname, query: url.searchParams });
    this.#raw = (bytes: Buffer, type: string) => {
      res.writeHead(200, { 'Content-Type': type });
      res.end(bytes);
    };
    const send = (status: number, data?: unknown, schema?: Schema) => {
      if (data !== undefined && schema) {
        checkResponse(schema, data, `${method} ${url.pathname}`, this.violations);
      }
      res.writeHead(
        status,
        data === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' },
      );
      res.end(data === undefined ? undefined : JSON.stringify(data));
    };

    const found = findOperation(method, url.pathname);
    if (!found) {
      this.violations.push(`${method} ${url.pathname} is not in the spec`);
      return send(404);
    }
    const { template, op, pathParams } = found;
    const where = `${method} ${template}`;
    const params = op.parameters ?? [];
    for (const key of url.searchParams.keys()) {
      const p = params.find((x) => x.in === 'query' && x.name.toLowerCase() === key.toLowerCase());
      if (!p) this.violations.push(`${where}: query parameter "${key}" is not in the spec`);
      else {
        const problem = checkValue(p.schema, url.searchParams.get(key)!);
        if (problem) this.violations.push(`${where}: ${key}: ${problem}`);
      }
    }
    for (const p of params.filter((x) => x.required && x.in === 'query')) {
      if (!url.searchParams.has(p.name)) {
        this.violations.push(`${where}: required query parameter "${p.name}" missing`);
      }
    }
    for (const p of params.filter((x) => x.in === 'path')) {
      const problem = checkValue(p.schema, pathParams[p.name] ?? '');
      if (problem) this.violations.push(`${where}: path ${p.name}: ${problem}`);
    }
    if (body.length) {
      const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      const allowed = Object.keys(op.requestBody?.content ?? {});
      if (where === 'POST /Plugins/{pluginId}/Configuration') allowed.push('application/json');
      if (
        !allowed.some((a) => a === type || (a.endsWith('/*') && type.startsWith(a.slice(0, -1))))
      ) {
        this.violations.push(
          `${where}: content type "${type}" not accepted (${allowed.join(', ') || 'no body'})`,
        );
      }
    }
    const token = /Token="([^"]*)"/.exec(String(req.headers.authorization ?? ''))?.[1];
    if ((!token || (this.apiKey && token !== this.apiKey)) && template !== '/System/Info/Public') {
      return send(401);
    }

    const failure = this.#failures.find(
      (f) => f.method === method && f.match.test(url.pathname) && f.times > 0,
    );
    if (failure) {
      failure.times--;
      return send(failure.status);
    }

    const ok = Object.entries(op.responses).find(([code]) => code.startsWith('2'));
    const schema = ok?.[1].content?.['application/json']?.schema;
    const reply = (data: unknown) => send(Number(ok?.[0] ?? 200), data, schema);
    const q = (name: string) => url.searchParams.get(name) ?? undefined;
    const list = (name: string) => q(name)?.split(',').filter(Boolean) ?? [];
    this.#route(template, method, pathParams, q, list, body, reply, send);
  }

  #route(
    template: string,
    method: string,
    p: Record<string, string>,
    q: (name: string) => string | undefined,
    list: (name: string) => string[],
    body: Buffer,
    reply: (data?: unknown) => void,
    send: (status: number, data?: unknown) => void,
  ) {
    const key = `${method} ${template}`;
    switch (key) {
      case 'GET /System/Info/Public':
        return reply({ Version: '12.1.0', ServerName: 'fake', StartupWizardCompleted: true });
      case 'GET /Users':
        return reply([{ Id: ADMIN_ID, Name: 'admin', Policy: { IsAdministrator: true } }]);
      case 'GET /Library/VirtualFolders':
        return reply([
          {
            Name: 'Movies',
            CollectionType: 'movies',
            ItemId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            Locations: ['/media/movies'],
            LibraryOptions: { TypeOptions: [] },
          },
          ...(this.categoriesLibrary
            ? [
                {
                  Name: 'Categories',
                  CollectionType: 'boxsets',
                  ItemId: CATEGORIES_LIBRARY_ID,
                  Locations: [CATEGORIES_PATH],
                  LibraryOptions: {
                    TypeOptions: [
                      {
                        Type: 'BoxSet',
                        MetadataFetchers: this.boxSetFetchers,
                        ImageFetchers: this.boxSetFetchers,
                      },
                    ],
                  },
                },
              ]
            : []),
        ]);
      case 'GET /CategoryCollections/Folder':
      case 'POST /CategoryCollections/Folder':
        if (!this.folderEndpoint) return send(404);
        if (method === 'POST') this.categoriesFolder = true;
        return reply({ Path: CATEGORIES_PATH, Exists: this.categoriesFolder });
      case 'POST /Library/VirtualFolders': {
        if (
          q('name') !== 'Categories' ||
          q('collectionType') !== 'boxsets' ||
          list('paths').join() !== CATEGORIES_PATH ||
          !this.categoriesFolder
        ) {
          return send(400);
        }
        if (this.dropNewLibraries) return reply();
        this.categoriesLibrary = true;
        this.boxSetFetchers = this.#boxSetFetchersOf(JSON.parse(body.toString()).LibraryOptions);
        return reply();
      }
      case 'POST /Library/VirtualFolders/LibraryOptions': {
        const dto = JSON.parse(body.toString()) as { Id: string; LibraryOptions: unknown };
        if (dto.Id !== CATEGORIES_LIBRARY_ID || !this.categoriesLibrary) return send(404);
        this.boxSetFetchers = this.#boxSetFetchersOf(dto.LibraryOptions);
        return reply();
      }
      case 'GET /Plugins':
        return reply(
          this.pluginInstalled
            ? [
                {
                  Id: PLUGIN_GUID,
                  Name: 'Stubbert',
                  Version: '0.2.0.0',
                  Status: 'Active',
                },
              ]
            : [],
        );
      case 'GET /Plugins/{pluginId}/Configuration':
        return this.pluginInstalled &&
          p.pluginId!.replace(/-/g, '') === PLUGIN_GUID.replace(/-/g, '')
          ? reply(this.pluginConfig)
          : send(404);
      case 'POST /Plugins/{pluginId}/Configuration':
        if (
          !this.pluginInstalled ||
          p.pluginId!.replace(/-/g, '') !== PLUGIN_GUID.replace(/-/g, '')
        ) {
          return send(404);
        }
        this.pluginConfig = JSON.parse(body.toString());
        return reply();
      case 'GET /CategoryCollections': {
        const cats = this.categories();
        const childIds = new Set(cats.flatMap((c) => c.members));
        return reply(
          cats.map((c) => ({ Id: c.Id, Name: c.Name, Path: c.Path, IsChild: childIds.has(c.Id) })),
        );
      }
      case 'POST /CategoryCollections': {
        const name = q('name')!.trim();
        if (this.categories().some((c) => c.Name.toLowerCase() === name.toLowerCase())) {
          return send(409, `A category named "${name}" already exists.`);
        }
        const c = this.addCategory(name);
        return reply({ Id: c.Id, Name: c.Name, Path: c.Path, IsChild: false });
      }
      case 'GET /Items':
        return this.#getItems(q, list, reply);
      case 'GET /Items/{itemId}/Ancestors':
        return reply([
          { Id: MOVIES_LIBRARY_ID, Name: 'Movies', Type: 'CollectionFolder' },
          { Id: 'a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0', Name: 'root', Type: 'AggregateFolder' },
        ]);
      case 'GET /Shows/{seriesId}/Episodes': {
        const eps = this.episodes.get(`${p.seriesId}#${q('season')}`) ?? [];
        return reply({
          Items: eps.map((e) => ({ ...e, Type: 'Episode' })),
          TotalRecordCount: eps.length,
          StartIndex: 0,
        });
      }
      case 'GET /Items/{itemId}/Images/{imageType}': {
        if (!this.items.has(p.itemId!)) return send(404);
        this.imageRequests.push(`${p.itemId}/${p.imageType}`);
        return this.#raw(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg');
      }
      case 'GET /Items/{itemId}': {
        const item = this.items.get(p.itemId!);
        if (!item || (item.Type === 'BoxSet' && !q('userId'))) return send(404);
        return reply(this.#dto(item, true));
      }
      case 'POST /Items/{itemId}': {
        const item = this.items.get(p.itemId!);
        if (!item) return send(404);
        if (item.Type !== 'BoxSet') {
          this.violations.push(`media item "${item.Name}" was written to (POST /Items/{itemId})`);
        }
        const dto = JSON.parse(body.toString()) as Partial<FakeItem>;
        if (dto.LockData !== undefined && dto.LockData !== item.LockData) {
          this.violations.push(
            `LockData of "${item.Name}" changed: this cascades to every member on the real server`,
          );
        }
        item.Name = dto.Name ?? item.Name;
        item.ForcedSortName = dto.ForcedSortName ?? null;
        item.Overview = dto.Overview ?? null;
        return reply();
      }
      case 'POST /Items/{itemId}/Refresh':
        return p.itemId === CATEGORIES_LIBRARY_ID || this.items.has(p.itemId!)
          ? reply()
          : send(404);
      case 'DELETE /Items/{itemId}': {
        const item = this.items.get(p.itemId!);
        if (!item) return send(404);
        if (item.Type !== 'BoxSet') this.violations.push(`media item "${item.Name}" was deleted`);
        this.items.delete(item.Id);
        for (const other of this.items.values()) {
          other.members = other.members.filter((m) => m !== item.Id);
        }
        return reply();
      }
      case 'POST /Collections/{collectionId}/Items':
      case 'DELETE /Collections/{collectionId}/Items': {
        const box = this.items.get(p.collectionId!);
        if (!box || box.Type !== 'BoxSet') return send(404);
        const ids = list('ids');
        if (method === 'POST') {
          for (const i of ids) {
            if (!box.members.includes(i) && this.items.has(i)) box.members.push(i);
          }
        }
        if (method === 'DELETE') box.members = box.members.filter((m) => !ids.includes(m));
        return reply();
      }
      case 'POST /Items/{itemId}/Images/{imageType}': {
        const item = this.items.get(p.itemId!);
        if (!item) return send(404);
        if (item.Type !== 'BoxSet') {
          this.violations.push(`image uploaded to media item "${item.Name}"`);
        }
        const bytes = Buffer.from(body.toString('latin1'), 'base64');
        item.image = bytes;
        item.ImageTags[p.imageType!] = createHash('md5').update(bytes).digest('hex');
        return reply();
      }
      default:
        this.violations.push(`${key} is in the spec but the fake does not implement it`);
        return send(501);
    }
  }

  #getItems(
    q: (name: string) => string | undefined,
    list: (name: string) => string[],
    reply: (data: unknown) => void,
  ) {
    const userId = q('userId');
    let result: FakeItem[];
    const parentId = q('parentId');
    const ids = list('ids');
    if (ids.length) {
      result = ids.flatMap((i) => this.items.get(i) ?? []);
    } else if (parentId) {
      const parent = this.items.get(parentId);
      result =
        parent && userId ? parent.members.map((m) => this.items.get(m)!).filter(Boolean) : [];
    } else {
      const types = list('includeItemTypes');
      result = [...this.items.values()].filter((i) => types.length === 0 || types.includes(i.Type));
      if (q('collapseBoxSetItems') !== 'false' || !userId) {
        const grouped = new Set<string>();
        result = result.flatMap((i) => {
          const box = [...this.items.values()].find(
            (b) => b.Type === 'BoxSet' && b.members.includes(i.Id),
          );
          if (!box) return [i];
          if (grouped.has(box.Id)) return [];
          grouped.add(box.Id);
          return [box];
        });
      }
      if (q('sortBy')) result.sort((a, b) => a.Name.localeCompare(b.Name));
    }
    const start = Number(q('startIndex') ?? 0);
    const limit = q('limit') ? Number(q('limit')) : result.length;
    const fields = new Set(list('fields'));
    const media = !parentId;
    reply({
      Items: result.slice(start, start + limit).map((i) => this.#dto(i, false, fields)),
      TotalRecordCount: result.length + (media ? this.totalRecordSkew : 0),
      StartIndex: start,
    });
  }

  #dto(item: FakeItem, full: boolean, fields = new Set<string>()) {
    const dto: Record<string, unknown> = {
      Id: item.Id,
      Name: item.Name,
      Type: item.Type,
      ImageTags: item.ImageTags,
      LockData: item.LockData,
    };
    const want = (f: string) => full || fields.has(f);
    if (want('Genres')) dto.Genres = item.Genres;
    if (want('Studios')) dto.Studios = item.Studios;
    if (want('Tags')) dto.Tags = item.Tags;
    if (want('OriginalTitle')) dto.OriginalTitle = item.OriginalTitle ?? null;
    if (want('Overview')) dto.Overview = item.Overview ?? null;
    if (want('Path')) dto.Path = item.Path ?? null;
    if (want('ProviderIds')) dto.ProviderIds = item.ProviderIds;
    if (full) dto.ForcedSortName = item.ForcedSortName ?? null;
    return dto;
  }
}
