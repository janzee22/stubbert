import { useMemo, useState } from 'react';
import { Banner, Icon, Segmented, Stubbert } from '../../components/index.js';
import { plural } from '../../lib/format.js';
import { newCategory, newRule } from '../../lib/draft.js';
import {
  allIds,
  appendAt,
  flatten,
  getAt,
  indent,
  issuePath,
  move,
  outdent,
  pathKey,
  removeAt,
  updateAt,
  type Category,
  type Path,
  type Rule,
} from '../../lib/tree.js';
import { useDraft } from '../../state/draft.js';
import { CategoryEditor } from './CategoryEditor.js';
import { CategoryTree, matchesQuery, type TreeAction } from './CategoryTree.js';
import { EmptyCinema } from './EmptyCinema.js';
import { Wall } from './Wall.js';

export type CategoryView = 'list' | 'wall';

const VIEWS = [
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'wall', label: 'Wall', icon: 'wall' },
] as const;

function siblingCount(categories: readonly Category[], path: Path | undefined): number {
  if (!path) return 0;
  if (path.length === 1) return categories.length;
  return getAt(categories, path.slice(0, -1))?.children.length ?? 0;
}

export function CategoriesPage({
  selected,
  onSelect,
  view,
  onView,
}: {
  selected?: number[];
  onSelect: (path: number[] | undefined) => void;
  view: CategoryView;
  onView: (v: CategoryView) => void;
}) {
  const { draft, setDraft, saved, issues } = useDraft();
  const [query, setQuery] = useState('');
  const savedById = useMemo(
    () => new Map(flatten(saved.categories).map((n) => [n.category.id, n.category])),
    [saved.categories],
  );
  const savedIds = useMemo(() => allIds(saved.categories), [saved.categories]);
  const draftIds = useMemo(() => allIds(draft.categories), [draft.categories]);
  const total = draftIds.size;
  const current = selected && getAt(draft.categories, selected);
  const parent =
    selected && selected.length > 1 ? getAt(draft.categories, selected.slice(0, -1)) : undefined;
  const q = query.trim().toLowerCase();
  const noMatches = !!q && !flatten(draft.categories).some((n) => matchesQuery(n.category, q));
  const createFromQuery = () => {
    const res = appendAt(draft.categories, [], newCategory(query.trim(), draftIds));
    setDraft((d) => ({ ...d, categories: res.categories }));
    setQuery('');
    onSelect(res.path);
  };
  const issueCount = (p: Path) =>
    issues.filter(
      (i) =>
        i.path.startsWith(issuePath(p)) &&
        !i.path.slice(issuePath(p).length).startsWith('.children'),
    ).length;

  const add = (parentPath: Path, rule?: Rule['type']) => {
    const category = newCategory('New category', allIds(draft.categories));
    const res = appendAt(draft.categories, parentPath, {
      ...category,
      rules: rule ? [newRule(rule)] : [],
    });
    setDraft((d) => ({ ...d, categories: res.categories }));
    onSelect(res.path);
    onView('list');
  };

  const treeAction = (path: number[], action: TreeAction) => {
    const ops = {
      up: () => move(draft.categories, path, -1),
      down: () => move(draft.categories, path, 1),
      indent: () => indent(draft.categories, path),
      outdent: () => outdent(draft.categories, path),
    };
    const res = ops[action]();
    setDraft((d) => ({ ...d, categories: res.categories }));
    onSelect(res.path);
  };

  return (
    <>
      <div className="page-head">
        <div className="col gap-4 grow">
          <h1 className="display">Categories</h1>
          <p className="muted">
            {total
              ? `${plural(total, 'category becomes a collection', 'categories become collections')} in Jellyfin.`
              : 'Each category becomes a collection in Jellyfin.'}
          </p>
        </div>
        {total > 0 && (
          <>
            <Segmented label="View" large options={VIEWS} value={view} onChange={onView} />
            <button type="button" className="btn btn--secondary" onClick={() => add([])}>
              <Icon name="plus" size={20} />
              New category
            </button>
          </>
        )}
      </div>

      {!draft.categoriesLibraryId && (
        <Banner
          kind="warn"
          icon="warning"
          title="No Categories library chosen"
          actions={
            <a className="btn btn--secondary btn--sm" href="#/settings">
              Open Settings
            </a>
          }
        >
          Pick the library in Settings before the first sync.
        </Banner>
      )}

      {total === 0 && <EmptyCinema onCreate={(rule) => add([], rule)} />}

      {total > 0 && view === 'wall' && (
        <Wall
          categories={draft.categories}
          onOpen={(path) => {
            onSelect(path);
            onView('list');
          }}
        />
      )}

      {total > 0 && view === 'list' && (
        <div className={`categories-layout${current ? ' has-selection' : ''}`}>
          <aside className="categories-aside" aria-label="Category tree">
            <div className="input-wrap input-wrap--search">
              <Icon name="search" />
              <input
                className="input"
                type="search"
                placeholder="Filter by name or rule"
                aria-label="Filter categories"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <CategoryTree
              categories={draft.categories}
              saved={savedById}
              selected={selected}
              issueCount={issueCount}
              query={query}
              onSelect={onSelect}
              onAction={treeAction}
            />
            {noMatches && (
              <div className="tree-empty">
                <h2 className="h3">No category called “{query}”</h2>
                <p className="small muted">The filter looks at names and rule values.</p>
                <div className="row wrap gap-8 justify-center">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={createFromQuery}
                  >
                    <Icon name="plus" />
                    Create “{query.trim()}”
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setQuery('')}
                  >
                    Clear filter
                  </button>
                </div>
              </div>
            )}
            <p className="micro muted row wrap tree-keys gap-6">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> move focus <span className="kbd">Alt</span>+
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> reorder <span className="kbd">Alt</span>+
              <span className="kbd">→</span> nest
            </p>
          </aside>
          <div className="categories-main">
            <button
              type="button"
              className="btn btn--ghost back-link"
              onClick={() => onSelect(undefined)}
            >
              <Icon name="chevronLeft" />
              All categories
            </button>
            {current && selected ? (
              <CategoryEditor
                key={pathKey(selected)}
                category={current}
                saved={savedById.get(current.id)}
                parentName={parent?.name}
                path={selected}
                siblings={siblingCount(draft.categories, selected)}
                savedIds={savedIds}
                draftIds={draftIds}
                issues={issues}
                actions={{
                  change: (fn) =>
                    setDraft((d) => ({ ...d, categories: updateAt(d.categories, selected, fn) })),
                  addChild: () => add(selected),
                  move: (delta) => treeAction(selected, delta < 0 ? 'up' : 'down'),
                  remove: () => {
                    setDraft((d) => ({ ...d, categories: removeAt(d.categories, selected) }));
                    onSelect(selected.length > 1 ? selected.slice(0, -1) : undefined);
                  },
                  select: onSelect,
                }}
              />
            ) : (
              <div className="empty-state">
                <Stubbert mood="smile" width={100} />
                <p className="muted">Pick a category on the left to edit it.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
