import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { readCookie, SESSION_COOKIE, type Auth } from './auth.js';
import { ApiError, toApiError } from './errors.js';
import { catalogRoutes } from './routes/catalog.js';
import { collectionRoutes } from './routes/collections.js';
import { configRoutes } from './routes/config.js';
import { MediaCache, type RouteContext } from './routes/context.js';
import { hookRoutes } from './routes/hooks.js';
import { jellyfinRoutes } from './routes/jellyfin.js';
import { notificationRoutes } from './routes/notifications.js';
import { POSTER_LIMIT, posterRoutes } from './routes/posters.js';
import { sessionRoutes } from './routes/session.js';
import { settingsRoutes } from './routes/settings.js';
import { syncRoutes } from './routes/sync.js';
import type { NotifyService } from '../notify/service.js';
import type { SyncService } from '../sync/service.js';
import type { UiFile } from './ui.js';

export interface AppOptions {
  service: SyncService;
  auth: Auth;
  logger?: FastifyBaseLogger;
  trustProxy?: boolean;
  ui?: Map<string, UiFile>;
  fromEnv?: { jellyfin: boolean; password: boolean };
  notify?: NotifyService;
}

const PUBLIC = new Set(['/api/health', '/api/session', '/api/login', '/api/onboarding/password']);
const CSP =
  "default-src 'self'; img-src 'self' blob: data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const READ_METHODS = new Set(['GET', 'HEAD']);
const HOOK_TOKEN = /^(\/hooks\/jellyfin\/)[^/?]+/;

export function redactUrl(url: string): string {
  return url.replace(HOOK_TOKEN, '$1…');
}

export const logSerializers = {
  req: (req: FastifyRequest) => ({
    method: req.method,
    url: redactUrl(req.url),
    host: req.host,
    remoteAddress: req.ip,
    remotePort: req.socket?.remotePort,
  }),
  res: (reply: FastifyReply) => ({ statusCode: reply.statusCode }),
};

function pathOf(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}

function sendError(reply: FastifyReply, error: ApiError) {
  return reply.code(error.status).send(error.body);
}

export function buildApp({
  service,
  auth,
  logger,
  trustProxy = false,
  ui,
  fromEnv = { jellyfin: false, password: false },
  notify,
}: AppOptions): FastifyInstance {
  const app = Fastify({ ...(logger ? { loggerInstance: logger } : { logger: false }), trustProxy });
  const { data, client, runs } = service.ctx;
  const ctx: RouteContext = {
    service,
    auth,
    data,
    client,
    runs,
    media: new MediaCache(client),
    fromEnv,
    notify,
    ui,
  };

  app.removeContentTypeParser('text/plain');
  app.addContentTypeParser(
    /^image\//,
    { parseAs: 'buffer', bodyLimit: POSTER_LIMIT },
    (_req, body, done) => done(null, body),
  );

  let warnedProxy = false;
  app.addHook('onRequest', async (req, reply) => {
    if (!trustProxy && !warnedProxy && req.headers['x-forwarded-for']) {
      warnedProxy = true;
      app.log.warn(
        'Requests come through a reverse proxy, but TRUST_PROXY is off: login throttling sees every client as the proxy. Set TRUST_PROXY=true when Stubbert is only reachable through the proxy.',
      );
    }
    if (!req.url.startsWith('/api/')) return;
    if (!READ_METHODS.has(req.method)) {
      const type = req.headers['content-type'] ?? '';
      if (!type.startsWith('application/json') && !type.startsWith('image/')) {
        const message = 'Send a JSON body (Content-Type: application/json).';
        return sendError(reply, new ApiError(415, 'bad-request', message));
      }
    }
    const loggedIn = auth.valid(readCookie(req.headers.cookie, SESSION_COOKIE));
    if (!PUBLIC.has(pathOf(req.url)) && !loggedIn) {
      return sendError(reply, new ApiError(401, 'unauthorized', 'Not logged in.'));
    }
  });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Content-Security-Policy', CSP);
  });

  app.setErrorHandler((err, req, reply) => {
    const error = toApiError(err);
    if (error.status >= 500) req.log.error(err);
    return sendError(reply, error);
  });

  app.setNotFoundHandler((req, reply) => {
    const path = pathOf(req.url);
    if (!ui || path.startsWith('/api/') || !READ_METHODS.has(req.method)) {
      return sendError(reply, new ApiError(404, 'not-found', 'Not found.'));
    }
    const file = ui.get(path) ?? (path.startsWith('/assets/') ? undefined : ui.get('/index.html'));
    if (!file) return reply.code(404).type('text/plain').send('Not found.');
    return reply
      .type(file.type)
      .header('Cache-Control', file.immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
      .send(file.body);
  });

  for (const routes of [
    sessionRoutes,
    syncRoutes,
    configRoutes,
    settingsRoutes,
    jellyfinRoutes,
    catalogRoutes,
    posterRoutes,
    collectionRoutes,
    notificationRoutes,
    hookRoutes,
  ]) {
    routes(app, ctx);
  }

  return app;
}
