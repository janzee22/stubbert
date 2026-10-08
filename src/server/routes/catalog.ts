import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MEDIA_TYPES, ruleSchema } from '../../config/schema.js';
import { compileCategory, type MediaItem } from '../../core/rules.js';
import {
  VALUE_FIELDS,
  type Evaluation,
  type ValueCount,
  type ValueField,
} from '../../shared/api.js';
import { ApiError, parseBody } from '../errors.js';
import type { RouteContext } from './context.js';

const EVALUATE_SAMPLE = 200;

const matchBody = z.object({
  mediaTypes: z.array(z.enum(MEDIA_TYPES)).min(1).default(['Movie', 'Series']),
  combine: z.enum(['any', 'all']).default('any'),
  rules: z.array(ruleSchema).default([]),
});

function countValues(items: readonly MediaItem[], field: ValueField): ValueCount[] {
  const counts = new Map<string, Omit<ValueCount, 'count'>>();
  for (const item of items) {
    for (const value of item[field]) {
      const key = value.toLowerCase();
      const entry = counts.get(key) ?? { name: value, movies: 0, series: 0 };
      if (item.type === 'Movie') entry.movies++;
      else entry.series++;
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .map((v) => ({ ...v, count: v.movies + v.series }))
    .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function compile(match: z.infer<typeof matchBody>) {
  try {
    return compileCategory(match);
  } catch (err) {
    throw new ApiError(400, 'config', `Invalid rules: ${(err as Error).message}`);
  }
}

export function catalogRoutes(app: FastifyInstance, { media }: RouteContext) {
  app.get<{ Params: { field: string } }>(
    '/api/values/:field',
    async (req): Promise<ValueCount[]> => {
      const field = VALUE_FIELDS.find((f) => f === req.params.field);
      if (!field) throw new ApiError(404, 'not-found', 'Use genres, studios or tags.');
      return countValues(await media.items(), field);
    },
  );

  app.post('/api/evaluate', async (req): Promise<Evaluation> => {
    const match = compile(parseBody(matchBody, req.body, 'rules', 'config'));
    const matched = (await media.items()).filter(match);
    return {
      count: matched.length,
      movies: matched.filter((i) => i.type === 'Movie').length,
      series: matched.filter((i) => i.type === 'Series').length,
      items: matched
        .map((i) => ({ id: i.id, name: i.name, type: i.type }))
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .slice(0, EVALUATE_SAMPLE),
    };
  });
}
