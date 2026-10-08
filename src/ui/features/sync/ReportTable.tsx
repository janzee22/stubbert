import { Fragment, useMemo, useState } from 'react';
import type { CategoryReport, ItemRef, SyncReport } from '../../lib/api.js';
import { Badge, Checkbox, Icon, PosterThumb } from '../../components/index.js';
import { plural } from '../../lib/format.js';
import { useOpenCategory } from '../../app/openCategory.js';
import { useDraft } from '../../state/draft.js';
import { flatten, type Category } from '../../lib/tree.js';
import { CategoryStatusBadge } from './badges.js';

const TITLES_SHOWN = 60;
const FIELD_LABELS: Record<string, string> = {
  Name: 'Name',
  ForcedSortName: 'Sort name',
  Overview: 'Overview',
};

export interface Placement {
  poster?: string;
  parent?: string;
}

export function usePlacements(): Map<string, Placement> {
  const { saved } = useDraft();
  return useMemo(() => {
    const byPath = new Map<string, Category>();
    const out = new Map<string, Placement>();
    for (const n of flatten(saved.categories)) {
      byPath.set(n.path.join('.'), n.category);
      out.set(n.category.id, {
        poster: n.category.poster,
        parent: byPath.get(n.path.slice(0, -1).join('.'))?.name,
      });
    }
    return out;
  }, [saved.categories]);
}

const items = (refs: readonly ItemRef[]) => refs.filter((r) => r.type !== 'Category');

export function previousCount(c: CategoryReport): number {
  return c.matchedCount - items(c.add).length + items(c.remove).length;
}

function Titles({ refs, sign }: { refs: ItemRef[]; sign: '+' | '−' }) {
  if (!refs.length) return null;
  const add = sign === '+';
  return (
    <div className="col gap-6">
      <span className="eyebrow">
        {add ? 'Added' : 'Removed'} ({refs.length})
      </span>
      <ul className="title-list">
        {refs.slice(0, TITLES_SHOWN).map((r) => (
          <li key={r.id} className="row gap-8">
            <span className={add ? 'delta-add' : 'delta-rem'} aria-hidden="true">
              {sign}
            </span>
            {r.type === 'Category' ? <strong>{r.name}</strong> : r.name}
            {r.type === 'Category' && <span className="micro muted">category</span>}
            {r.type === 'Series' && <span className="micro muted">series</span>}
          </li>
        ))}
        {refs.length > TITLES_SHOWN && (
          <li className="micro muted">and {refs.length - TITLES_SHOWN} more</li>
        )}
      </ul>
    </div>
  );
}

function Detail({ c }: { c: CategoryReport }) {
  const openCategory = useOpenCategory();
  return (
    <div className="col gap-12">
      {c.skipped && (
        <div className="row wrap gap-12">
          <span className="small row gap-6">
            <Icon name="shield" size={16} />
            <span>
              <b>Safety guard:</b> {c.name} {c.skipped}. Probably a rule changed. The collection
              stays as it is.
            </span>
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => openCategory(c.categoryId)}
          >
            Check the rules
          </button>
        </div>
      )}
      <div className="report__detail-grid">
        <Titles refs={c.add} sign="+" />
        <Titles refs={c.remove} sign="−" />
        {c.metadata.length > 0 && (
          <div className="col gap-6">
            <span className="eyebrow">Details</span>
            {c.metadata.map((m) => (
              <span key={m.field}>
                <span className="muted">{FIELD_LABELS[m.field] ?? m.field}</span>{' '}
                {m.from ? `“${m.from}”` : 'empty'} → <b>{m.to ? `“${m.to}”` : 'empty'}</b>
              </span>
            ))}
          </div>
        )}
        {c.poster && (
          <div className="col gap-6">
            <span className="eyebrow">Poster</span>
            <span className="row gap-10">
              <PosterThumb file={c.poster} name={c.name} size="sm" />
              <span className="micro muted">{c.poster}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function OtherChanges({ c }: { c: CategoryReport }) {
  const labels = [
    ...c.metadata.map((m) => FIELD_LABELS[m.field] ?? m.field),
    ...(c.poster ? ['Poster'] : []),
    ...(c.status === 'adopt' ? ['Linked by name'] : []),
  ];
  if (!labels.length) return <span className="muted">—</span>;
  return (
    <div className="row wrap gap-6">
      {labels.map((l) => (
        <Badge key={l} kind="same">
          {l}
        </Badge>
      ))}
    </div>
  );
}

export function ReportTable({
  report,
  filter,
  onlyChangesDefault = true,
}: {
  report: SyncReport;
  filter?: ReadonlySet<CategoryReport['status']>;
  onlyChangesDefault?: boolean;
}) {
  const placements = usePlacements();
  const [onlyChanges, setOnlyChanges] = useState(onlyChangesDefault);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(report.categories.filter((c) => c.status === 'skipped').map((c) => c.categoryId)),
  );
  const unchanged = report.categories.filter((c) => c.status === 'ok').length;
  const rows = report.categories.filter((c) => {
    if (filter?.size) return filter.has(c.status);
    return !onlyChanges || c.status !== 'ok';
  });
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <div className="row wrap" style={{ padding: '12px 0' }}>
        <h2 className="h2 grow">Report</h2>
        {!filter?.size && unchanged > 0 && (
          <Checkbox checked={onlyChanges} onChange={setOnlyChanges}>
            Only show changes{' '}
            <span className="muted" style={{ fontWeight: 500 }}>
              ({unchanged} unchanged hidden)
            </span>
          </Checkbox>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="muted">Every category is up to date.</p>
      ) : (
        <div className="table-scroll">
          <table className="report report--cards">
            <thead>
              <tr>
                <th style={{ width: 56 }}>
                  <span className="sr-only">Details</span>
                </th>
                <th>Category</th>
                <th>Action</th>
                <th className="r">Titles</th>
                <th className="r">Added</th>
                <th className="r">Removed</th>
                <th>Other changes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const place = placements.get(c.categoryId);
                const expandable =
                  c.add.length > 0 ||
                  c.remove.length > 0 ||
                  c.metadata.length > 0 ||
                  !!c.skipped ||
                  !!c.poster;
                const isOpen = expandable && open.has(c.categoryId);
                return (
                  <Fragment key={c.categoryId}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td>
                        {expandable && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--icon"
                            aria-expanded={isOpen}
                            aria-label={`Details for ${c.name}`}
                            onClick={() => toggle(c.categoryId)}
                          >
                            <Icon
                              name={isOpen ? 'chevronDown' : 'chevronRight'}
                              strokeWidth={2.5}
                            />
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="row gap-10">
                          <PosterThumb file={place?.poster} name={c.name} size="xs" />
                          <div className="col gap-0">
                            <span className="strong">{c.name}</span>
                            <span className="micro muted">{place?.parent ?? 'Top level'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <CategoryStatusBadge status={c.status} />
                      </td>
                      <td className="r num" data-label="Titles">
                        {previousCount(c)} → <b>{c.matchedCount}</b>
                      </td>
                      <td className="r" data-label="Added">
                        {c.add.length ? (
                          <span className="delta-add">+{c.add.length}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="r" data-label="Removed">
                        {c.remove.length ? (
                          <span className="delta-rem">−{c.remove.length}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <OtherChanges c={c} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="is-open report__detail">
                        <td />
                        <td colSpan={6}>
                          <Detail c={c} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {report.categories.length > 0 && (
        <p className="micro muted" style={{ marginTop: 8 }}>
          {plural(report.categories.length, 'category', 'categories')} in total.
        </p>
      )}
    </div>
  );
}
