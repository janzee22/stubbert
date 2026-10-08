import { Icon, PosterThumb } from '../../components/index.js';
import { describeRules } from '../../lib/describe.js';
import { type Category, type Path } from '../../lib/tree.js';

export function SubCategoryList({
  category,
  path,
  onAdd,
  onSelect,
}: {
  category: Category;
  path: Path;
  onAdd: () => void;
  onSelect: (path: number[]) => void;
}) {
  return (
    <div className="section">
      <div className="row">
        <h3 className="h2 grow">Sub-categories</h3>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onAdd}>
          <Icon name="plus" />
          Sub-category
        </button>
      </div>
      {category.children.length ? (
        <ul className="col gap-4">
          {category.children.map((child, i) => (
            <li key={`${child.id}-${i}`}>
              <button type="button" className="child-row" onClick={() => onSelect([...path, i])}>
                <PosterThumb file={child.poster} name={child.name} size="xs" />
                <span className="col gap-0 grow min-w-0">
                  <span className="strong">{child.name || 'Unnamed'}</span>
                  <span className="small muted">{describeRules(child)}</span>
                </span>
                <Icon name="chevronRight" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">
          None yet. Sub-categories show up as collections inside this one, like Disney → Pixar.
        </p>
      )}
    </div>
  );
}
