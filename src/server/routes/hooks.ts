import type { FastifyInstance } from 'fastify';
import { PayloadError, parseEvent } from '../../notify/item.js';
import { ApiError } from '../errors.js';
import type { RouteContext } from './context.js';

export const HOOK_LIMIT = 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;

export function hookRoutes(app: FastifyInstance, { notify }: RouteContext) {
  if (!notify) return;
  const hits: number[] = [];

  app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      '*',
      { parseAs: 'string', bodyLimit: HOOK_LIMIT },
      (_req, body, done) => done(null, body),
    );

    scope.post<{ Params: { token: string } }>('/hooks/jellyfin/:token', async (req, reply) => {
      // Only refused calls count, so a stranger can't use up the budget of Jellyfin's real events.
      if (!notify.tokenMatches(req.params.token)) {
        const now = Date.now();
        while (hits.length && (hits[0] ?? 0) < now - RATE_WINDOW_MS) hits.shift();
        if (hits.length >= RATE_MAX) {
          throw new ApiError(429, 'rate-limited', 'Too many refused webhook calls; slow down.');
        }
        hits.push(now);
        await notify.refused(req.params.token);
        req.log.warn('Jellyfin webhook refused: unknown token');
        throw new ApiError(401, 'unauthorized', 'Unknown webhook URL.');
      }
      const raw = typeof req.body === 'string' ? req.body : '';
      req.log.debug({ payload: raw.slice(0, 4000) }, 'Jellyfin webhook payload');
      let body: unknown;
      try {
        body = JSON.parse(raw);
        parseEvent(body, new Date());
      } catch (err) {
        const reason = err instanceof PayloadError ? err.message : 'the body is not JSON';
        req.log.debug({ payload: raw.slice(0, 1000) }, `Jellyfin webhook rejected: ${reason}`);
        throw new ApiError(
          400,
          'bad-request',
          `Unreadable webhook payload: ${reason}. Turn on "Send All Properties".`,
        );
      }
      void notify.ingest(body).then(
        (outcome) => req.log.info(`Jellyfin webhook: ${outcome}`),
        (err: Error) => req.log.error(`Jellyfin webhook failed: ${err.message}`),
      );
      return reply.code(202).send({ accepted: true });
    });
  });
}
