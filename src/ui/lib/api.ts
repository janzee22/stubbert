import type {
  ConfigIssue,
  ConfigResponse,
  Connection,
  ErrorBody,
  Evaluation,
  JellyfinCheck,
  Library,
  ManagedCollection,
  NotifyIssue,
  NotifySettingsRequest,
  NotifySettingsView,
  NotifyStatusView,
  ActivityView,
  Poster,
  Preferences,
  PreviewRequest,
  PreviewResult,
  RunRecord,
  RunSummary,
  SampleView,
  Session,
  Settings,
  SetupResult,
  Status,
  SyncReport,
  Validation,
  ValueCount,
  ValueField,
} from '../../shared/api.js';
import type { MessageKind } from '../../shared/notify.js';

export type * from '../../shared/api.js';
export * from '../../shared/notify.js';
export { normId } from '../../shared/ids.js';

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: ConfigIssue[] = [],
  ) {
    super(message);
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  contentType = 'application/json',
): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (method !== 'GET') {
    init.headers = { 'Content-Type': contentType };
    init.body = contentType === 'application/json' ? JSON.stringify(body ?? {}) : (body as Blob);
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new RequestError(0, 'network', 'The server cannot be reached.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ErrorBody>;
    if (res.status === 401 && !path.endsWith('/login')) onUnauthorized();
    throw new RequestError(
      res.status,
      err.code ?? 'error',
      err.error ?? `HTTP ${res.status}`,
      err.issues,
    );
  }
  return data as T;
}

export const api = {
  session: () => request<Session>('GET', '/api/session'),
  setFirstPassword: (password: string) =>
    request<{ authenticated: boolean }>('POST', '/api/onboarding/password', { password }),
  login: (password: string) =>
    request<{ authenticated: boolean }>('POST', '/api/login', { password }),
  logout: () => request<{ authenticated: boolean }>('POST', '/api/logout'),

  status: () => request<Status>('GET', '/api/status'),
  runs: () => request<RunSummary[]>('GET', '/api/runs'),
  run: (id: string) => request<RunRecord>('GET', `/api/runs/${encodeURIComponent(id)}`),
  preview: (force: boolean) => request<SyncReport>('POST', '/api/sync/preview', { force }),
  sync: (force: boolean) => request<RunSummary>('POST', '/api/sync', { force }),

  config: () => request<ConfigResponse>('GET', '/api/config'),
  validateConfig: (config: unknown) => request<Validation>('POST', '/api/config/validate', config),
  saveConfig: (config: unknown) => request<Validation>('PUT', '/api/config', config),

  settings: () => request<Settings>('GET', '/api/settings'),
  testJellyfin: (url: string, apiKey?: string) =>
    request<JellyfinCheck>('POST', '/api/settings/jellyfin/test', { url, apiKey }),
  saveJellyfin: (url: string, apiKey?: string) =>
    request<JellyfinCheck>('PUT', '/api/settings/jellyfin', { url, apiKey }),
  changePassword: (current: string, password: string) =>
    request<{ changed: boolean }>('PUT', '/api/settings/password', { current, password }),

  connection: () => request<Connection>('GET', '/api/connection'),
  libraries: () => request<Library[]>('GET', '/api/libraries'),
  setup: (options: { name: string; path?: string; apply: boolean }) =>
    request<SetupResult>('POST', '/api/setup', options),
  values: (field: ValueField) => request<ValueCount[]>('GET', `/api/values/${field}`),
  evaluate: (match: unknown) => request<Evaluation>('POST', '/api/evaluate', match),

  posters: () => request<Poster[]>('GET', '/api/posters'),
  uploadPoster: (file: string, image: Blob) =>
    request<{ file: string; size: number }>(
      'PUT',
      `/api/posters/${encodeURIComponent(file)}`,
      image,
      image.type,
    ),
  deletePoster: (file: string) =>
    request<{ deleted: string }>('DELETE', `/api/posters/${encodeURIComponent(file)}`),
  posterUrl: (file: string, version?: string) =>
    `/api/posters/${encodeURIComponent(file)}${version ? `?v=${encodeURIComponent(version)}` : ''}`,

  notifySettings: () => request<NotifySettingsView>('GET', '/api/notifications/settings'),
  saveNotifySettings: (body: NotifySettingsRequest) =>
    request<NotifySettingsView>('PUT', '/api/notifications/settings', body),
  validateNotify: (preferences: Preferences) =>
    request<{ issues: NotifyIssue[] }>('POST', '/api/notifications/validate', { preferences }),
  rotateWebhook: () => request<NotifySettingsView>('POST', '/api/notifications/token/rotate'),
  notifyStatus: () => request<NotifyStatusView>('GET', '/api/notifications/status'),
  notifyActivity: () => request<ActivityView[]>('GET', '/api/notifications/activity'),
  sendBatchNow: () => request<{ sent: number }>('POST', '/api/notifications/batch/send'),
  retryNotification: (id: string) =>
    request<{ sent: boolean }>(
      'POST',
      `/api/notifications/activity/${encodeURIComponent(id)}/retry`,
    ),
  testDiscord: () => request<{ sentAt: string }>('POST', '/api/notifications/test'),
  notifySamples: (kind: MessageKind) =>
    request<SampleView[]>('GET', `/api/notifications/samples?kind=${kind}`),
  previewMessage: (body: PreviewRequest) =>
    request<PreviewResult>('POST', '/api/notifications/preview', body),
  sendPreview: (body: PreviewRequest) =>
    request<{ sent: boolean }>('POST', '/api/notifications/preview/send', body),

  managedCollection: (categoryId: string) =>
    request<ManagedCollection>(
      'GET',
      `/api/categories/${encodeURIComponent(categoryId)}/collection`,
    ),
  deleteCollection: (categoryId: string) =>
    request<{ deleted: ManagedCollection }>(
      'DELETE',
      `/api/categories/${encodeURIComponent(categoryId)}/collection`,
      { confirm: categoryId },
    ),
};
