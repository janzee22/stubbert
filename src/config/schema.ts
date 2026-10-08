import { z } from 'zod';
import { isPosterName, POSTER_NAME_RULE } from '../posters.js';

export const MEDIA_TYPES = ['Movie', 'Series'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

const listRule = z.strictObject({
  type: z.enum(['genre', 'studio', 'tag']),
  values: z.array(z.string().min(1)).min(1),
  quantifier: z.enum(['any', 'all']).default('any'),
  negate: z.boolean().default(false),
});

const nameRule = z.strictObject({
  type: z.literal('name'),
  match: z.enum(['contains', 'exact', 'regex']).default('contains'),
  values: z.array(z.string().min(1)).min(1),
  quantifier: z.enum(['any', 'all']).default('any'),
  negate: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
});

export const ruleSchema = z.discriminatedUnion('type', [listRule, nameRule]);
export type Rule = z.infer<typeof ruleSchema>;
export type NameRule = z.infer<typeof nameRule>;

export interface Category {
  id: string;
  name: string;
  sortName?: string;
  overview?: string;
  poster?: string;
  mediaTypes: MediaType[];
  combine: 'any' | 'all';
  rules: Rule[];
  children: Category[];
}

const categorySchema: z.ZodType<Category, unknown> = z.lazy(() =>
  z.strictObject({
    id: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9-]*$/,
        'lowercase letters, digits and hyphens, starting with a letter or digit',
      ),
    name: z.string().trim().min(1),
    sortName: z.string().trim().min(1).optional(),
    overview: z.string().optional(),
    poster: z.string().refine(isPosterName, POSTER_NAME_RULE).optional(),
    mediaTypes: z.array(z.enum(MEDIA_TYPES)).min(1).default(['Movie', 'Series']),
    combine: z.enum(['any', 'all']).default('any'),
    rules: z.array(ruleSchema).default([]),
    children: z.array(categorySchema).default([]),
  }),
);

export const configSchema = z.strictObject({
  categoriesLibraryId: z.string().regex(/^[0-9a-f]{32}$|^[0-9a-f-]{36}$/i, 'a Jellyfin ItemId'),
  schedule: z
    .strictObject({
      enabled: z.boolean().default(true),
      intervalMinutes: z.number().int().min(5).default(60),
      syncOnStart: z.boolean().default(false),
      syncOnNewItems: z.boolean().default(true),
    })
    .default({ enabled: true, intervalMinutes: 60, syncOnStart: false, syncOnNewItems: true }),
  categories: z.array(categorySchema).default([]),
});
export type Config = z.infer<typeof configSchema>;
