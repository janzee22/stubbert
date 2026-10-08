import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { managedCollection, type ManagedCollection } from '../../sync/collections.js';
import { ApiError, parseBody } from '../errors.js';
import type { RouteContext } from './context.js';

type CollectionParams = { Params: { id: string } };

const deleteBody = z.object({ confirm: z.string().optional() });

export function collectionRoutes(app: FastifyInstance, { service, data, client }: RouteContext) {
  app.get<CollectionParams>(
    '/api/categories/:id/collection',
    async (req): Promise<ManagedCollection> => managedCollection({ data, client }, req.params.id),
  );

  app.delete<CollectionParams>('/api/categories/:id/collection', async (req) => {
    const { id } = req.params;
    const { confirm } = parseBody(deleteBody, req.body, 'delete request');
    if (confirm !== id) {
      throw new ApiError(400, 'bad-request', `Confirm by sending { "confirm": "${id}" }.`);
    }
    return { deleted: await service.deleteCollection(id) };
  });
}
