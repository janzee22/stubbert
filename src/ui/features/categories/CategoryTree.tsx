import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, PosterThumb } from '../../components/index.js';
import { describeRules } from '../../lib/describe.js';
import { categoryEdited } from '../../lib/draft.js';
import { flatten, type Category, type FlatNode, type Path } from '../../lib/tree.js';

export type TreeAction = 'up' | 'down' | 'indent' | 'outdent';

const keyOf = (path: Path) => path.join('.');

export function matchesQuery(category: Category, query: string): boolean {
  if (category.name.toLowerCase().includes(query)) return true;
  return category.rules.some((r) => r.values.some((v) => v.toLowerCase().includes(query)));
}

function visibleNodes(
  nodes: readonly FlatNode[],
  collapsed: ReadonlySet<string>,
  query: string,
): FlatNode[] {
  if (query) {
    const keep = new Set<string>();
    for (const n of nodes) {
      if (!matchesQuery(n.category, query)) continue;
      for (let i = 1; i <= n.path.length; i++) keep.add(keyOf(n.path.slice(0, i)));
    }
    return nodes.filter((n) => keep.has(keyOf(n.path)));
  }
  return nodes.filter(
    (n) => !n.path.slice(0, -1).some((_, i) => collapsed.has(keyOf(n.path.slice(0, i + 1)))),
  );
}

export function CategoryTree({
  categories,
  saved,
  selected,
  issueCount,
  query,
  onSelect,
  onAction,
}: {
  categories: readonly Category[];
  saved: ReadonlyMap<string, Category>;
  selected?: Path;
  issueCount: (path: Path) => number;
  query: string;
  onSelect: (path: number[]) => void;
  onAction: (path: number[], action: TreeAction) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string>();
  const items = useRef(new Map<string, HTMLLIElement>());
  const nodes = useMemo(() => flatten(categories), [categories]);
  const q = query.trim().toLowerCase();
  const visible = visibleNodes(nodes, collapsed, q);
  const selectedKey = selected && keyOf(selected);
  const tabStop = focused && visible.some((n) => keyOf(n.path) === focused) ? focused : undefined;
  const current = tabStop ?? selectedKey ?? (visible[0] && keyOf(visible[0].path));

  useEffect(() => {
    if (focused) items.current.get(focused)?.focus();
  }, [focused, categories]);

  const toggle = (key: string, open?: boolean) =>
    setCollapsed((c) => {
      const next = new Set(c);
      const shouldOpen = open ?? next.has(key);
      if (shouldOpen) next.delete(key);
      else next.add(key);
      return next;
    });

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>, node: FlatNode) => {
    const key = keyOf(node.path);
    const index = visible.findIndex((n) => keyOf(n.path) === key);
    const hasChildren = node.category.children.length > 0;
    const isOpen = hasChildren && (!!q || !collapsed.has(key));
    const focusAt = (i: number) => {
      const target = visible[Math.max(0, Math.min(visible.length - 1, i))];
      if (target) setFocused(keyOf(target.path));
    };
    const act = (action: TreeAction) => {
      e.preventDefault();
      onAction(node.path, action);
    };
    if (e.altKey && e.key === 'ArrowUp') return act('up');
    if (e.altKey && e.key === 'ArrowDown') return act('down');
    if (e.altKey && e.key === 'ArrowRight') return act('indent');
    if (e.altKey && e.key === 'ArrowLeft') return act('outdent');
    const handlers: Record<string, () => void> = {
      ArrowDown: () => focusAt(index + 1),
      ArrowUp: () => focusAt(index - 1),
      Home: () => focusAt(0),
      End: () => focusAt(visible.length - 1),
      ArrowRight: () => {
        if (hasChildren && !isOpen) toggle(key, true);
        else if (isOpen) focusAt(index + 1);
      },
      ArrowLeft: () => {
        if (isOpen) toggle(key, false);
        else if (node.path.length > 1) setFocused(keyOf(node.path.slice(0, -1)));
      },
      Enter: () => onSelect(node.path),
      ' ': () => onSelect(node.path),
    };
    const handler = handlers[e.key];
    if (!handler) return;
    e.preventDefault();
    handler();
  };

  if (!visible.length) return null;

  return (
    <ul className="tree" role="tree" aria-label="Categories">
      {visible.map((node) => {
        const key = keyOf(node.path);
        const { category } = node;
        const hasChildren = category.children.length > 0;
        const isOpen = hasChildren && (!!q || !collapsed.has(key));
        const isSelected = key === selectedKey;
        const edited = categoryEdited(saved.get(category.id), category);
        const problems = issueCount(node.path);
        return (
          <li
            key={key}
            ref={(el) => {
              if (el) items.current.set(key, el);
              else items.current.delete(key);
            }}
            className={`tree-item${isSelected ? ' is-selected' : ''}`}
            role="treeitem"
            aria-level={node.depth + 1}
            aria-selected={isSelected}
            aria-expanded={hasChildren ? isOpen : undefined}
            tabIndex={key === current ? 0 : -1}
            style={{ marginLeft: node.depth * 40 }}
            onClick={() => {
              setFocused(key);
              onSelect(node.path);
            }}
            onKeyDown={(e) => onKeyDown(e, node)}
          >
            {hasChildren ? (
              <button
                type="button"
                className="tree-item__twist"
                tabIndex={-1}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${category.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(key);
                }}
              >
                <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} strokeWidth={2.5} />
              </button>
            ) : (
              <span className="tree-item__twist tree-item__twist--none" />
            )}
            <PosterThumb file={category.poster} name={category.name} size="xs" />
            <div className="tree-item__main">
              <span className="tree-item__name">{category.name || 'Unnamed'}</span>
              <span className="tree-item__meta">{describeRules(category)}</span>
            </div>
            {problems > 0 && (
              <span className="tree-item__issues">
                <Icon name="alert" size={14} strokeWidth={2.5} /> {problems}
                <span className="sr-only"> to fix</span>
              </span>
            )}
            {edited && problems === 0 && (
              <span className="edited-dot">{saved.has(category.id) ? 'Edited' : 'New'}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
