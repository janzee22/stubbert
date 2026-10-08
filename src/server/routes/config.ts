import type { FastifyInstance } from 'fastify';
import { parseConfig, walkCategories } from '../../config/validate.js';
import type { DataDir } from '../../data.js';
import type { ConfigResponse, Validation } from '../../shared/api.js';
import { ApiError } from '../errors.js';
import type { RouteContext } from './context.js';

async function validate(data: DataDir, raw: unknown) {
  const res = parseConfig(raw);
  if (!res.ok) return { ...res, warnings: [] };
  const posters = new Set((await data.listPosters()).map((p) => p.file));
  const warnings = [...walkCategories(res.config.categories)]
    .filter(({ category }) => category.poster && !posters.has(category.poster))
    .map(
      ({ category, path }) => `${path}.poster: "${category.poster}" is not in the posters folder`,
    );
  return { ...res, warnings };
}

export function configRoutes(app: FastifyInstance, { service, data }: RouteContext) {
  app.get('/api/config', async (): Promise<ConfigResponse> => {
    let raw: unknown;
    try {
      raw = await data.readRawConfig();
    } catch (err) {
      return {
        config: null,
        valid: false,
        issues: [{ path: '', message: (err as Error).message }],
      };
    }
    if (raw === undefined) {
      return { config: null, valid: false, issues: [{ path: '', message: 'No config yet.' }] };
    }
    const res = parseConfig(raw);
    return { config: raw, valid: res.ok, issues: res.ok ? [] : res.issues };
  });

  app.post('/api/config/validate', async (req): Promise<Validation> => {
    const res = await validate(data, req.body);
    return { valid: res.ok, issues: res.ok ? [] : res.issues, warnings: res.warnings };
  });

  app.put('/api/config', async (req): Promise<Validation> => {
    const res = await validate(data, req.body);
    if (!res.ok) throw new ApiError(400, 'config', 'Invalid config.', res.issues);
    await data.writeConfig(req.body);
    service.setSchedule(res.config.schedule);
    return { valid: true, issues: [], warnings: res.warnings };
  });
}
