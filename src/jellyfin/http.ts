import { VERSION } from '../version.js';

type QueryValue = string | number | boolean | readonly string[] | undefined;
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  query?: Query;
  json?: unknown;
  body?: string | Uint8Array<ArrayBuffer>;
  contentType?: string;
  anonymous?: boolean;
  accept?: string;
}

export interface JfResponse<T = unknown> {
  method: string;
  url: string;
  status: number;
  ok: boolean;
  data: T;
  bytes?: Uint8Array;
  contentType: string;
}

export class JellyfinHttpError extends Error {
  constructor(readonly response: JfResponse) {
    super(
      `${response.method} ${response.url} -> HTTP ${response.status}${summarize(response.data)}`,
    );
  }
}

function summarize(data: unknown): string {
  if (data == null || data === '') return '';
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return `: ${text.slice(0, 300)}`;
}

function buildQuery(query: Query | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

function portOf(url: URL): string {
  return url.port || (url.protocol === 'https:' ? '443' : '80');
}

const NETWORK_REASONS: Record<string, (url: URL) => string> = {
  ENOTFOUND: (url) => `host ${url.hostname} not found`,
  EAI_AGAIN: (url) => `host ${url.hostname} not found (DNS lookup failed)`,
  ECONNREFUSED: (url) => `connection refused (nothing listens on port ${portOf(url)})`,
  ECONNRESET: () => 'the connection was reset',
  EHOSTUNREACH: (url) => `host ${url.hostname} is unreachable`,
  ETIMEDOUT: () => 'the connection timed out',
  UND_ERR_CONNECT_TIMEOUT: () => 'the connection timed out',
  'bad port': (url) => `port ${portOf(url)} is blocked by fetch as unsafe; use another port`,
};

export class JellyfinUnreachableError extends Error {
  readonly code?: string;

  constructor(url: string, error: unknown) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    const code = cause?.code ?? cause?.message;
    const reason = code && NETWORK_REASONS[code];
    super(reason ? reason(new URL(url)) : (error as Error).message, { cause: error });
    this.code = code;
  }
}

export class NotConfiguredError extends Error {
  constructor() {
    super('Jellyfin is not set up yet: enter its URL and API key in Settings.');
  }
}

export interface ClientInfo {
  name: string;
  device: string;
  version: string;
}

export class JellyfinHttp {
  #baseUrl = '';
  #authHeader = '';

  constructor(
    baseUrl?: string,
    apiKey?: string,
    readonly client: ClientInfo = {
      name: 'Stubbert',
      device: 'server',
      version: VERSION,
    },
  ) {
    if (baseUrl) this.configure(baseUrl, apiKey ?? '');
  }

  get baseUrl(): string {
    return this.#baseUrl;
  }

  get configured(): boolean {
    return !!this.#baseUrl;
  }

  configure(baseUrl: string, apiKey: string) {
    const { name, device, version } = this.client;
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#authHeader = `MediaBrowser Client="${name}", Device="${device}", DeviceId="stubbert-${device}", Version="${version}", Token="${apiKey}"`;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<JfResponse<T>> {
    if (!this.#baseUrl) throw new NotConfiguredError();
    const url = path + buildQuery(opts.query);
    const headers: Record<string, string> = { Accept: opts.accept ?? 'application/json' };
    if (!opts.anonymous) headers.Authorization = this.#authHeader;

    let body: string | Uint8Array<ArrayBuffer> | undefined;
    if (opts.json !== undefined) {
      body = JSON.stringify(opts.json);
      headers['Content-Type'] = 'application/json';
    } else if (opts.body !== undefined) {
      body = opts.body;
      if (opts.contentType) headers['Content-Type'] = opts.contentType;
    }

    let res: Response;
    try {
      res = await fetch(this.#baseUrl + url, { method, headers, body });
    } catch (err) {
      throw new JellyfinUnreachableError(this.#baseUrl, err);
    }
    const contentType = res.headers.get('content-type') ?? '';
    let data: unknown;
    let bytes: Uint8Array | undefined;
    if (contentType.includes('json')) {
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
    } else if (contentType.startsWith('text/') || contentType === '') {
      data = await res.text();
    } else {
      bytes = new Uint8Array(await res.arrayBuffer());
      data = null;
    }
    return { method, url, status: res.status, ok: res.ok, data: data as T, bytes, contentType };
  }

  async call<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.request<T>(method, path, opts);
    if (!res.ok) throw new JellyfinHttpError(res as JfResponse);
    return res.data;
  }
}
