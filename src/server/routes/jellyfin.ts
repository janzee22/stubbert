import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findCategoryPlugin } from '../../jellyfin/client.js';
import { normId } from '../../shared/ids.js';
import { preflight } from '../../sync/preflight.js';
import type { Connection, Library, SetupResult } from '../../shared/api.js';
import { parseBody } from '../errors.js';
import type { RouteContext } from './context.js';

const setupBody = z.object({
  name: z.string().trim().min(1).default('Categories'),
  path: z.string().optional(),
  apply: z.boolean().default(false),
});

const failure = (reason: unknown) => ({ ok: false as const, error: (reason as Error).message });

export function jellyfinRoutes(app: FastifyInstance, { service, data, client }: RouteContext) {
  app.get('/api/connection', async (): Promise<Connection> => {
    const url = client.http.baseUrl;
    const [info, plugins, pluginConfig, ready] = await Promise.allSettled([
      client.publicInfo(),
      client.plugins(),
      client.pluginConfiguration(),
      data.requireConfig().then((config) => preflight(client, config)),
    ]);
    const plugin = plugins.status === 'fulfilled' ? findCategoryPlugin(plugins.value) : undefined;
    return {
      jellyfin:
        info.status === 'fulfilled'
          ? {
              ok: true,
              url,
              version: info.value.Version,
              serverName: info.value.ServerName ?? null,
            }
          : { url, ...failure(info.reason) },
      apiKey: plugins.status === 'fulfilled' ? { ok: true } : failure(plugins.reason),
      plugin: plugin
        ? {
            installed: true,
            status: plugin.Status,
            version: plugin.Version,
            categoriesLibraryId:
              pluginConfig.status === 'fulfilled'
                ? (pluginConfig.value.CategoriesLibraryId ?? null)
                : null,
          }
        : { installed: false },
      preflight: ready.status === 'fulfilled' ? { ok: true } : failure(ready.reason),
    };
  });

  app.get('/api/libraries', async (): Promise<Library[]> => {
    const [folders, pluginLibrary] = await Promise.all([
      client.virtualFolders(),
      client.pluginConfiguration().then(
        (c) => normId(c.CategoriesLibraryId),
        () => undefined,
      ),
    ]);
    return folders.map((f) => ({
      id: f.ItemId,
      name: f.Name,
      type: f.CollectionType ?? 'mixed',
      locations: f.Locations ?? [],
      pluginLibrary: normId(f.ItemId) === pluginLibrary,
    }));
  });

  app.post('/api/setup', async (req): Promise<SetupResult> =>
    service.setup(parseBody(setupBody, req.body, 'setup request')),
  );
}
