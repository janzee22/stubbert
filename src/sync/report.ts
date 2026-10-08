import { hasChanges, type CategoryPlan, type MetadataChange } from '../core/planner.js';
import type { SyncResult } from './engine.js';

export interface ItemRef {
  id: string;
  name: string;
  type?: string;
}

type CategoryStatus = 'create' | 'adopt' | 'update' | 'ok' | 'skipped';

export interface CategoryReport {
  categoryId: string;
  name: string;
  boxSetId?: string;
  status: CategoryStatus;
  matchedCount: number;
  add: ItemRef[];
  remove: ItemRef[];
  metadata: MetadataChange[];
  poster?: string;
  skipped?: string;
}

export interface SyncReport {
  applied: boolean;
  categories: CategoryReport[];
  warnings: string[];
  errors: string[];
}

export interface ReportTotals {
  categories: number;
  changed: number;
  created: number;
  added: number;
  removed: number;
  skipped: number;
}

function status(p: CategoryPlan): CategoryStatus {
  if (p.create) return 'create';
  if (p.adopted) return 'adopt';
  if (p.skipped) return 'skipped';
  return hasChanges(p) ? 'update' : 'ok';
}

export function toReport(result: SyncResult): SyncReport {
  const byCategoryId = new Map(result.plan.categories.map((p) => [p.categoryId, p]));
  const byBoxSetId = new Map(
    result.plan.categories.flatMap((p) => (p.boxSetId ? [[p.boxSetId, p] as const] : [])),
  );
  const ref = (id: string): ItemRef => {
    const item = result.items.get(id);
    if (item) return { id, name: item.name, type: item.type };
    const category = byBoxSetId.get(id);
    if (category) return { id, name: category.name, type: 'Category' };
    return { id, name: id };
  };
  return {
    applied: result.applied,
    categories: result.plan.categories.map((p) => ({
      categoryId: p.categoryId,
      name: p.name,
      boxSetId: p.boxSetId,
      status: status(p),
      matchedCount: p.matchedCount,
      add: [
        ...p.addChildCategoryIds.map((id) => ({
          id: byCategoryId.get(id)?.boxSetId ?? id,
          name: byCategoryId.get(id)?.name ?? id,
          type: 'Category',
        })),
        ...p.addItemIds.map(ref),
      ],
      remove: p.removeMemberIds.map(ref),
      metadata: p.metadata,
      poster: p.poster?.file,
      skipped: p.skipped,
    })),
    warnings: [...result.plan.warnings, ...result.warnings],
    errors: result.errors,
  };
}

export function totals(report: SyncReport): ReportTotals {
  const c = report.categories;
  return {
    categories: c.length,
    changed: c.filter((r) =>
      r.status === 'skipped' ? r.metadata.length > 0 || !!r.poster : r.status !== 'ok',
    ).length,
    created: c.filter((r) => r.status === 'create').length,
    added: c.reduce((n, r) => n + r.add.length, 0),
    removed: c.reduce((n, r) => n + r.remove.length, 0),
    skipped: c.filter((r) => r.status === 'skipped').length,
  };
}
