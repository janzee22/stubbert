import { Banner, Icon, PosterThumb } from '../../components/index.js';
import { plural } from '../../lib/format.js';
import { describeRules } from '../../lib/describe.js';
import { flatten, pathKey, type Category, type FlatNode } from '../../lib/tree.js';

function WallTile({ node, large, onOpen }: { node: FlatNode; large: boolean; onOpen: () => void }) {
  const { category } = node;
  const rules = describeRules(category);
  return (
    <button type="button" className="walltile" onClick={onOpen}>
      <PosterThumb file={category.poster} name={category.name} size={large ? 'xl' : 'lg'}>
        {!category.poster && (
          <span className="btn btn--secondary btn--sm walltile__add">
            <Icon name="upload" size={16} />
            Add poster
          </span>
        )}
      </PosterThumb>
      <span className="col gap-0">
        <span className="walltile__name">{category.name || 'Unnamed'}</span>
        <span className="walltile__meta" title={rules}>
          {rules}
        </span>
      </span>
    </button>
  );
}

const atRoot =
  (i: number) =>
  (n: FlatNode): FlatNode => ({
    ...n,
    path: [i, ...n.path.slice(2)],
    depth: n.depth - 1,
  });

export function Wall({
  categories,
  onOpen,
}: {
  categories: readonly Category[];
  onOpen: (path: number[]) => void;
}) {
  const shelves = categories
    .map((root, i) => ({ root, i }))
    .filter(({ root }) => root.children.length > 0);
  const singles = categories
    .map((root, i) => ({ root, i }))
    .filter(({ root }) => root.children.length === 0);
  const missing = flatten(categories).filter((n) => !n.category.poster);
  const shelf = (label: string, nodes: FlatNode[], key: string) => (
    <section key={key} className="col gap-18" aria-label={label}>
      <div className="row gap-12">
        <span className="shelf__label">
          <Icon name="ticket" size={20} />
          {label}
        </span>
        <span className="small muted">{plural(nodes.length, 'collection')}</span>
      </div>
      <div className="shelf-wrap">
        <div className="shelf">
          {nodes.map((node) => (
            <WallTile
              key={pathKey(node.path)}
              node={node}
              large={node.depth === 0}
              onOpen={() => onOpen(node.path)}
            />
          ))}
        </div>
      </div>
    </section>
  );
  return (
    <div className="wall">
      {missing.length > 0 && (
        <Banner
          kind="info"
          icon="image"
          title={`${plural(missing.length, 'category has', 'categories have')} no poster`}
        >
          {missing
            .slice(0, 3)
            .map((n) => n.category.name)
            .join(', ')}
          {missing.length > 3 ? ` and ${missing.length - 3} more` : ''} show a placeholder in
          Jellyfin until you add one.
        </Banner>
      )}
      {shelves.map(({ root, i }) =>
        shelf(root.name || 'Unnamed', flatten([root], [i]).map(atRoot(i)), `shelf-${i}`),
      )}
      {singles.length > 0 &&
        shelf(
          'Singles',
          singles.map(({ root, i }) => ({ category: root, path: [i], depth: 0 })),
          'singles',
        )}
    </div>
  );
}
