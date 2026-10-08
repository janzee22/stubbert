import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { summarize, type RunRecord, type RunSummary } from '../../sync/run-store.js';
import type { Status } from '../../shared/api.js';
import { ApiError, parseBody } from '../errors.js';
import { failingMessage } from '../../notify/views.js';
import type { RouteContext } from './context.js';

const syncBody = z.object({ force: z.boolean().default(false) });

export function syncRoutes(app: FastifyInstance, { service, data, runs, notify }: RouteContext) {
  const view = (run: RunRecord): RunRecord => {
    if (run.id === service.running?.id) return service.running;
    if (run.status !== 'running') return run;
    return {
      ...run,
      status: 'failed',
      error: run.error ?? 'Interrupted: the process stopped during the run.',
    };
  };

  app.get('/api/status', async (): Promise<Status> => {
    const last = (await runs.list()).find((r) => r.id !== service.running?.id);
    const config = await data.loadConfig();
    return {
      running: service.running ? summarize(service.running) : null,
      lastRun: last ? summarize(view(last)) : null,
      nextRunAt: service.nextRunAt?.toISOString() ?? null,
      schedule: service.schedule ?? null,
      config: config.ok ? { valid: true } : { valid: false, issues: config.issues },
      notifications: { failing: failingMessage(notify) },
    };
  });

  app.get('/api/runs', async (): Promise<RunSummary[]> =>
    (await runs.list()).map((r) => summarize(view(r))),
  );

  app.get<{ Params: { id: string } }>('/api/runs/:id', async (req): Promise<RunRecord> => {
    const run = await runs.get(req.params.id);
    if (!run) throw new ApiError(404, 'not-found', `No run ${req.params.id}.`);
    return view(run);
  });

  app.post('/api/sync/preview', async (req) => {
    const { force } = parseBody(syncBody, req.body, 'preview request');
    return service.preview(force);
  });

  app.post('/api/sync', async (req, reply) => {
    const { force } = parseBody(syncBody, req.body, 'sync request');
    const run = await service.startApply('manual', force);
    return reply.code(202).send(summarize(run));
  });
}
