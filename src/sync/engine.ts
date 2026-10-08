import { createHash } from 'node:crypto';
import type { Category, Config } from '../config/schema.js';
import {
  hasChanges,
  plan as makePlan,
  resolveCollections,
  type CategoryPlan,
  type CurrentCollection,
  type DesiredCategory,
  type Plan,
  type Resolution,
  type SyncState,
} from '../core/planner.js';
import { evaluateCategory, type MediaItem } from '../core/rules.js';
import type { BaseItemDto, JellyfinClient } from '../jellyfin/client.js';
import { posterType } from '../posters.js';
import { preflight } from './preflight.js';

const READ_CONCURRENCY = 4;

export interface SyncDeps {
  client: JellyfinClient;
  readPoster: (file: string) => Promise<Uint8Array>;
  loadState: () => Promise<SyncState>;
  saveState: (state: SyncState) => Promise<void>;
  log?: (line: string) => void;
}

export interface SyncOptions {
  apply: boolean;
  force?: boolean;
}

export interface SyncResult {
  plan: Plan;
  items: ReadonlyMap<string, MediaItem>;
  applied: boolean;
  errors: string[];
  warnings: string[];
}

interface Desired {
  categories: DesiredCategory[];
  posters: Map<string, Uint8Array>;
}

interface Current {
  collections: Map<string, CurrentCollection>;
  dtos: Map<string, BaseItemDto>;
}

interface Apply {
  client: JellyfinClient;
  state: SyncState;
  boxSetIds: Map<string, string>;
  posters: ReadonlyMap<string, Uint8Array>;
  dtos: ReadonlyMap<string, BaseItemDto>;
  log: (line: string) => void;
}

function flatten(categories: readonly Category[]): Category[] {
  return categories.flatMap((c) => [...flatten(c.children), c]);
}

async function mapConcurrent<T, R>(
  list: readonly T[],
  limit: number,
  fn: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < list.length; i = next++) {
      results[i] = await fn(list[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return results;
}

async function desiredCategories(
  categories: readonly Category[],
  items: readonly MediaItem[],
  readPoster: SyncDeps['readPoster'],
): Promise<Desired> {
  const posters = new Map<string, Uint8Array>();
  const desired: DesiredCategory[] = [];
  for (const c of categories) {
    let poster: DesiredCategory['poster'];
    if (c.poster) {
      const bytes = await readPoster(c.poster);
      posters.set(c.id, bytes);
      poster = { file: c.poster, hash: createHash('sha256').update(bytes).digest('hex') };
    }
    desired.push({
      id: c.id,
      name: c.name,
      sortName: c.sortName,
      overview: c.overview,
      poster,
      itemIds: evaluateCategory(c, items),
      childIds: c.children.map((child) => child.id),
    });
  }
  return { categories: desired, posters };
}

async function currentCollections(
  client: JellyfinClient,
  resolutions: ReadonlyMap<string, Resolution>,
): Promise<Current> {
  const boxSetIds = [...resolutions.values()].map((r) => r.boxSetId);
  const fetched = await mapConcurrent(boxSetIds, READ_CONCURRENCY, async (boxSetId) => {
    const [dto, memberIds] = await Promise.all([
      client.getItem(boxSetId),
      client.members(boxSetId),
    ]);
    const collection: CurrentCollection = {
      boxSetId,
      name: dto.Name,
      forcedSortName: dto.ForcedSortName ?? undefined,
      overview: dto.Overview ?? undefined,
      memberIds,
      hasPrimaryImage: !!dto.ImageTags?.Primary,
    };
    return { dto, collection };
  });
  return {
    collections: new Map(fetched.map((f) => [f.collection.boxSetId, f.collection])),
    dtos: new Map(fetched.map((f) => [f.collection.boxSetId, f.dto])),
  };
}

export async function sync(
  config: Config,
  deps: SyncDeps,
  options: SyncOptions,
): Promise<SyncResult> {
  const { client } = deps;
  const log = deps.log ?? (() => {});

  await preflight(client, config);
  const state = await deps.loadState();
  const items = await client.mediaItems();
  log(`Fetched ${items.length} movies and series`);

  const categories = flatten(config.categories);
  const desired = await desiredCategories(categories, items, deps.readPoster);
  const existing = (await client.categoryCollections()).map((e) => ({ id: e.Id, name: e.Name }));
  const resolutions = resolveCollections(categories, state, existing);
  const current = await currentCollections(client, resolutions);

  const plan = makePlan({
    categories: desired.categories,
    resolutions,
    current: current.collections,
    state,
    force: options.force,
  });
  const result: SyncResult = {
    plan,
    items: new Map(items.map((i) => [i.id, i])),
    applied: false,
    errors: [],
    warnings: [],
  };
  if (!options.apply) return result;

  const apply: Apply = {
    client,
    state,
    boxSetIds: new Map(),
    posters: desired.posters,
    dtos: current.dtos,
    log,
  };
  for (const p of plan.categories) {
    if (!p.boxSetId) continue;
    apply.boxSetIds.set(p.categoryId, p.boxSetId);
    state[p.categoryId] = { ...state[p.categoryId], boxSetId: p.boxSetId };
  }

  const created = await createCollections(apply, plan.categories, deps.saveState, result.errors);
  const updated = await updateCollections(apply, plan.categories, result.errors);
  await deps.saveState(state);
  if (created || updated) await refreshLibrary(client, config.categoriesLibraryId, log, result);

  result.applied = true;
  return result;
}

async function createCollections(
  apply: Apply,
  plans: readonly CategoryPlan[],
  saveState: SyncDeps['saveState'],
  errors: string[],
): Promise<boolean> {
  let created = false;
  for (const p of plans.filter((c) => c.create)) {
    try {
      const { Id } = await apply.client.createCategoryCollection(p.name);
      created = true;
      apply.boxSetIds.set(p.categoryId, Id);
      apply.state[p.categoryId] = { boxSetId: Id };
      await saveState(apply.state);
      apply.log(`Created "${p.name}"`);
    } catch (err) {
      errors.push(`Create "${p.name}": ${(err as Error).message}`);
    }
  }
  return created;
}

async function updateCollections(
  apply: Apply,
  plans: readonly CategoryPlan[],
  errors: string[],
): Promise<boolean> {
  let updated = false;
  for (const p of plans) {
    const boxSetId = apply.boxSetIds.get(p.categoryId);
    if (!boxSetId || !hasChanges(p)) continue;
    updated = true;
    try {
      await updateCollection(apply, p, boxSetId);
    } catch (err) {
      errors.push(`"${p.name}": ${(err as Error).message}`);
    }
  }
  return updated;
}

async function updateCollection(apply: Apply, p: CategoryPlan, boxSetId: string) {
  const { client, log } = apply;
  if (p.metadata.length) {
    const dto = apply.dtos.get(boxSetId);
    // Send the full DTO back: a partial one would reset LockData, which cascades to every member.
    const next: Record<string, unknown> = {
      ...(p.create || !dto ? await client.getItem(boxSetId) : dto),
    };
    for (const change of p.metadata) next[change.field] = change.to ?? null;
    await client.updateItem(next as BaseItemDto);
    log(`Updated ${p.metadata.map((m) => m.field).join(', ')} of "${p.name}"`);
  }

  const poster = apply.posters.get(p.categoryId);
  if (p.poster && poster) {
    await client.uploadPrimaryImage(boxSetId, poster, posterType(p.poster.file));
    apply.state[p.categoryId] = { boxSetId, posterHash: p.poster.hash };
    log(`Uploaded poster of "${p.name}"`);
  }

  const children = p.addChildCategoryIds.flatMap((id) => apply.boxSetIds.get(id) ?? []);
  const add = [...p.addItemIds, ...children];
  if (add.length) {
    await client.addToCollection(boxSetId, add);
    log(`Added ${add.length} to "${p.name}"`);
  }
  if (p.removeMemberIds.length) {
    await client.removeFromCollection(boxSetId, p.removeMemberIds);
    log(`Removed ${p.removeMemberIds.length} from "${p.name}"`);
  }
}

async function refreshLibrary(
  client: JellyfinClient,
  libraryId: string,
  log: (line: string) => void,
  result: SyncResult,
) {
  try {
    await client.refreshItem(libraryId);
    log('Asked Jellyfin to refresh the Categories library');
  } catch (err) {
    result.warnings.push(
      `Refreshing the Categories library failed (${(err as Error).message}); a library scan in Jellyfin shows the changes.`,
    );
  }
}
