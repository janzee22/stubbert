export interface DesiredCategory {
  id: string;
  name: string;
  sortName?: string;
  overview?: string;
  poster?: { file: string; hash: string };
  itemIds: readonly string[];
  childIds: readonly string[];
}

export interface CurrentCollection {
  boxSetId: string;
  name: string;
  forcedSortName?: string;
  overview?: string;
  memberIds: readonly string[];
  hasPrimaryImage: boolean;
}

export interface ExistingCollection {
  id: string;
  name: string;
}

interface StateEntry {
  boxSetId: string;
  posterHash?: string;
}
export type SyncState = Record<string, StateEntry>;

export interface Resolution {
  boxSetId: string;
  adopted: boolean;
}

export interface MetadataChange {
  field: 'Name' | 'ForcedSortName' | 'Overview';
  from?: string;
  to?: string;
}

export interface CategoryPlan {
  categoryId: string;
  name: string;
  boxSetId?: string;
  create: boolean;
  adopted: boolean;
  metadata: MetadataChange[];
  poster?: { file: string; hash: string };
  addItemIds: string[];
  addChildCategoryIds: string[];
  removeMemberIds: string[];
  matchedCount: number;
  skipped?: string;
}

export interface Plan {
  categories: CategoryPlan[];
  warnings: string[];
}

export function resolveCollections(
  categories: ReadonlyArray<{ id: string; name: string }>,
  state: SyncState,
  existing: readonly ExistingCollection[],
): Map<string, Resolution> {
  const byId = new Set(existing.map((c) => c.id));
  const out = new Map<string, Resolution>();
  const claimed = new Set<string>();
  for (const c of categories) {
    const id = state[c.id]?.boxSetId;
    if (id && byId.has(id) && !claimed.has(id)) {
      out.set(c.id, { boxSetId: id, adopted: false });
      claimed.add(id);
    }
  }
  for (const c of categories) {
    if (out.has(c.id)) continue;
    const match = existing.find(
      (e) => !claimed.has(e.id) && e.name.toLowerCase() === c.name.toLowerCase(),
    );
    if (match) {
      out.set(c.id, { boxSetId: match.id, adopted: true });
      claimed.add(match.id);
    }
  }
  return out;
}

const blank = (s: string | undefined) => (s === undefined || s.trim() === '' ? undefined : s);

export function guard(previousCount: number, matchedCount: number): string | undefined {
  if (previousCount > 0 && matchedCount === 0) return `matches 0 items (had ${previousCount})`;
  // Exactly half is allowed, so a category of 2 can lose 1 item.
  if (matchedCount < previousCount / 2) {
    return `drops from ${previousCount} to ${matchedCount} items (more than 50%)`;
  }
  return undefined;
}

export interface PlanInput {
  categories: readonly DesiredCategory[];
  resolutions: ReadonlyMap<string, Resolution>;
  current: ReadonlyMap<string, CurrentCollection>;
  state: SyncState;
  force?: boolean;
}

export function plan(input: PlanInput): Plan {
  const { categories, resolutions, current, state } = input;
  const categoryBoxSets = new Set([...resolutions.values()].map((r) => r.boxSetId));
  const warnings: string[] = [];
  const out: CategoryPlan[] = [];

  for (const desired of categories) {
    const resolution = resolutions.get(desired.id);
    const existing = resolution && current.get(resolution.boxSetId);
    const p: CategoryPlan = {
      categoryId: desired.id,
      name: desired.name,
      boxSetId: existing?.boxSetId,
      create: !existing,
      adopted: !!existing && !!resolution?.adopted,
      metadata: [],
      addItemIds: [],
      addChildCategoryIds: [],
      removeMemberIds: [],
      matchedCount: desired.itemIds.length,
    };

    const want = {
      Name: desired.name,
      ForcedSortName: blank(desired.sortName),
      Overview: blank(desired.overview),
    };
    const have = existing
      ? {
          Name: existing.name,
          ForcedSortName: blank(existing.forcedSortName),
          Overview: blank(existing.overview),
        }
      : { Name: desired.name, ForcedSortName: undefined, Overview: undefined };
    for (const field of ['Name', 'ForcedSortName', 'Overview'] as const) {
      if (want[field] !== have[field]) {
        p.metadata.push({ field, from: have[field], to: want[field] });
      }
    }

    if (desired.poster) {
      const uploaded =
        existing &&
        existing.hasPrimaryImage &&
        !p.adopted &&
        state[desired.id]?.posterHash === desired.poster.hash;
      if (!uploaded) p.poster = desired.poster;
    }

    const childBoxSets = new Set<string>();
    for (const childId of desired.childIds) {
      const r = resolutions.get(childId);
      const childExists = r && current.has(r.boxSetId);
      if (childExists) childBoxSets.add(r.boxSetId);
      if (!childExists || !existing?.memberIds.includes(r.boxSetId)) {
        p.addChildCategoryIds.push(childId);
      }
    }

    const wantItems = new Set(desired.itemIds);
    if (existing) {
      const members = new Set(existing.memberIds);
      p.addItemIds = desired.itemIds.filter((id) => !members.has(id));
      p.removeMemberIds = existing.memberIds.filter(
        (id) => !wantItems.has(id) && !childBoxSets.has(id),
      );
      const previousCount = existing.memberIds.filter((id) => !categoryBoxSets.has(id)).length;
      const reason = input.force ? undefined : guard(previousCount, desired.itemIds.length);
      if (
        reason &&
        (p.addItemIds.length || p.removeMemberIds.length || p.addChildCategoryIds.length)
      ) {
        p.skipped = reason;
        p.addItemIds = [];
        p.addChildCategoryIds = [];
        p.removeMemberIds = [];
        warnings.push(
          `Skipped members of "${desired.name}": ${reason}. Tick "Ignore safety guards" to apply anyway.`,
        );
      }
    } else {
      p.addItemIds = [...desired.itemIds];
    }
    out.push(p);
  }
  return { categories: out, warnings };
}

export function hasChanges(p: CategoryPlan): boolean {
  return (
    p.create ||
    p.metadata.length > 0 ||
    !!p.poster ||
    p.addItemIds.length > 0 ||
    p.addChildCategoryIds.length > 0 ||
    p.removeMemberIds.length > 0
  );
}

export function isEmpty({ categories }: Plan): boolean {
  return !categories.some(hasChanges);
}
