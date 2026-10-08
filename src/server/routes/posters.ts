import type { FastifyInstance } from 'fastify';
import { walkCategories } from '../../config/validate.js';
import { detectPosterType, isPosterName, POSTER_NAME_RULE, posterType } from '../../posters.js';
import type { Poster } from '../../shared/api.js';
import { ApiError } from '../errors.js';
import type { RouteContext } from './context.js';

export const POSTER_LIMIT = 20 * 1024 * 1024;

type PosterParams = { Params: { file: string } };

function posterName(file: string): string {
  if (!isPosterName(file)) {
    throw new ApiError(400, 'bad-request', `A poster name must be ${POSTER_NAME_RULE}.`);
  }
  return file;
}

export function posterRoutes(app: FastifyInstance, { data }: RouteContext) {
  app.get('/api/posters', async (): Promise<Poster[]> => data.listPosters());

  app.get<PosterParams>('/api/posters/:file', async (req, reply) => {
    const file = posterName(req.params.file);
    const bytes = await data.readPoster(file).catch(() => {
      throw new ApiError(404, 'not-found', `No poster ${file}.`);
    });
    return reply
      .header('Content-Type', posterType(file))
      .header('Cache-Control', 'no-cache')
      .send(Buffer.from(bytes));
  });

  app.put<PosterParams>('/api/posters/:file', async (req) => {
    const file = posterName(req.params.file);
    const body = req.body;
    if (!Buffer.isBuffer(body)) {
      throw new ApiError(
        400,
        'bad-request',
        'Send the image as the request body with an image/* Content-Type.',
      );
    }
    const type = detectPosterType(body);
    if (!type) throw new ApiError(400, 'bad-request', 'Not a PNG, JPEG or WebP image.');
    if (type !== posterType(file)) {
      throw new ApiError(
        400,
        'bad-request',
        `The file is ${type}, but ${file} is named as ${posterType(file)}.`,
      );
    }
    await data.writePoster(file, body);
    return { file, size: body.length };
  });

  app.delete<PosterParams>('/api/posters/:file', async (req) => {
    const file = posterName(req.params.file);
    const config = await data.loadConfig();
    const user =
      config.ok &&
      [...walkCategories(config.config.categories)].find(
        ({ category }) => category.poster === file,
      );
    if (user) throw new ApiError(409, 'conflict', `"${user.category.name}" still uses ${file}.`);
    if (!(await data.deletePoster(file))) {
      throw new ApiError(404, 'not-found', `No poster ${file}.`);
    }
    return { deleted: file };
  });
}
