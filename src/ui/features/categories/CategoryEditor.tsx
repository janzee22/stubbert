import { useState } from 'react';
import { Icon, Segmented } from '../../components/index.js';
import type { ConfigIssue } from '../../lib/api.js';
import { categoryEdited, slug } from '../../lib/draft.js';
import { issuePath, type Category, type Path } from '../../lib/tree.js';
import { CollectionDelete } from './CollectionDelete.js';
import { friendly } from './friendly.js';
import { IdentityFields } from './IdentityFields.js';
import { MatchPreview } from './MatchPreview.js';
import { RemoveDialog } from './RemoveDialog.js';
import { RuleEditor } from './RuleEditor.js';
import { SubCategoryList } from './SubCategoryList.js';

export interface EditorActions {
  change: (fn: (c: Category) => Category) => void;
  addChild: () => void;
  move: (delta: -1 | 1) => void;
  remove: () => void;
  select: (path: number[]) => void;
}

const MEDIA_OPTIONS = [
  { value: 'Movie', label: 'Movies', icon: 'film' },
  { value: 'Series', label: 'Series', icon: 'tv' },
] as const;

export function CategoryEditor({
  category,
  saved,
  parentName,
  path,
  siblings,
  savedIds,
  draftIds,
  issues,
  actions,
}: {
  category: Category;
  saved?: Category;
  parentName?: string;
  path: Path;
  siblings: number;
  savedIds: ReadonlySet<string>;
  draftIds: ReadonlySet<string>;
  issues: ConfigIssue[];
  actions: EditorActions;
}) {
  const prefix = issuePath(path);
  const own = issues.filter(
    (i) =>
      i.path === prefix ||
      (i.path.startsWith(`${prefix}.`) && !i.path.startsWith(`${prefix}.children`)),
  );
  const at = (field: string) => own.filter((i) => i.path === `${prefix}.${field}`).map(friendly);
  const set = <K extends keyof Category>(key: K, value: Category[K]) =>
    actions.change((c) => ({ ...c, [key]: value }));
  const rename = (name: string) =>
    actions.change((c) => {
      const others = new Set([...draftIds].filter((id) => id !== c.id));
      const generated = !savedIds.has(c.id) && c.id === slug(c.name, others);
      return { ...c, name, id: generated ? slug(name, others) : c.id };
    });
  const replaceValue = (from: string, to: string) =>
    set(
      'rules',
      category.rules.map((r) => ({ ...r, values: r.values.map((v) => (v === from ? to : v)) })),
    );
  const index = path.at(-1) ?? 0;
  const [confirmRemove, setConfirmRemove] = useState(false);
  const edited = categoryEdited(saved, category);
  const title = category.name || 'Unnamed category';

  return (
    <section className="sheet editor" aria-label={`Edit ${title}`}>
      <div className="row wrap gap-16 items-end">
        <div className="col gap-2 grow min-w-0">
          {parentName && (
            <span className="small muted row gap-4">
              {parentName} <Icon name="chevronRight" size={14} />
            </span>
          )}
          <div className="row gap-12">
            <h2 className="h1" style={{ overflowWrap: 'anywhere' }}>
              {title}
            </h2>
            {edited && <span className="edited-dot">{saved ? 'Edited' : 'New'}</span>}
          </div>
        </div>
        <div className="row gap-8">
          <button
            type="button"
            className="btn btn--secondary btn--icon"
            aria-label="Move up"
            title="Move up (Alt+↑)"
            onClick={() => actions.move(-1)}
            disabled={index === 0}
          >
            <Icon name="arrowUp" />
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--icon"
            aria-label="Move down"
            title="Move down (Alt+↓)"
            onClick={() => actions.move(1)}
            disabled={index === siblings - 1}
          >
            <Icon name="arrowDown" />
          </button>
        </div>
      </div>

      <IdentityFields
        category={category}
        errorsAt={at}
        set={set}
        rename={rename}
        saved={savedIds.has(category.id)}
      />

      <div className="section">
        <div className="row wrap gap-10">
          <h3 className="h2 basis-full">What goes in</h3>
          <Segmented
            label="Media types"
            options={MEDIA_OPTIONS}
            value={category.mediaTypes}
            onChange={(t) => {
              const has = category.mediaTypes.includes(t);
              if (has && category.mediaTypes.length === 1) return;
              set(
                'mediaTypes',
                has
                  ? category.mediaTypes.filter((x) => x !== t)
                  : MEDIA_OPTIONS.map((o) => o.value).filter(
                      (x) => x === t || category.mediaTypes.includes(x),
                    ),
              );
            }}
          />
        </div>
        <RuleEditor
          rules={category.rules}
          combine={category.combine}
          onChange={(rules) => set('rules', rules)}
          onCombine={(combine) => set('combine', combine)}
          issues={own.map((i) => ({ ...i, message: friendly(i) }))}
          issuePrefix={prefix}
        />
        <MatchPreview category={category} onReplaceValue={replaceValue} />
      </div>

      <SubCategoryList
        category={category}
        path={path}
        onAdd={actions.addChild}
        onSelect={actions.select}
      />

      <div className="section">
        <h3 className="h2">Remove</h3>
        <div className="danger-row">
          <div className="col">
            <span className="strong">Remove this category</span>
            <span className="small muted">
              Leaves this app when you save. The Jellyfin collection stays.
            </span>
          </div>
          <button
            type="button"
            className="btn btn--danger-quiet btn--sm"
            onClick={() => setConfirmRemove(true)}
          >
            <Icon name="trash" />
            Remove category…
          </button>
        </div>
        {savedIds.has(category.id) && (
          <CollectionDelete key={category.id} categoryId={category.id} />
        )}
      </div>
      <RemoveDialog
        category={category}
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          actions.remove();
        }}
      />
    </section>
  );
}
