import { Field, Icon } from '../../components/index.js';
import type { Category } from '../../lib/tree.js';
import { PosterField } from './PosterField.js';

export function IdentityFields({
  category,
  errorsAt,
  set,
  rename,
  saved,
}: {
  category: Category;
  errorsAt: (field: string) => string[];
  set: <K extends keyof Category>(key: K, value: Category[K]) => void;
  rename: (name: string) => void;
  saved: boolean;
}) {
  const at = errorsAt;
  return (
    <div className="section">
      <div className="editor__identity">
        <PosterField
          categoryId={category.id}
          name={category.name}
          poster={category.poster}
          onChange={(p) => set('poster', p)}
        />
        <div className="editor__fields">
          <Field label="Name" help="Shown in Jellyfin. Must be unique." errors={at('name')}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="input"
                value={category.name}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                onChange={(e) => rename(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Sort name"
            optional
            help="Controls the order in Jellyfin, like “01 Disney”."
            errors={at('sortName')}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                className="input"
                value={category.sortName ?? ''}
                aria-describedby={describedBy}
                onChange={(e) => set('sortName', e.target.value || undefined)}
              />
            )}
          </Field>
          <Field label="Overview" optional errors={at('overview')}>
            {({ id }) => (
              <textarea
                id={id}
                className="input"
                rows={3}
                value={category.overview ?? ''}
                onChange={(e) => set('overview', e.target.value || undefined)}
              />
            )}
          </Field>
          <details className="disclosure" open={at('id').length > 0 || undefined}>
            <summary>
              <Icon name="chevronRight" />
              Advanced
              <span className="muted small" style={{ fontWeight: 500 }}>
                · collection id <code>{category.id}</code>
              </span>
            </summary>
            <Field
              label="Collection id"
              errors={at('id')}
              help={
                saved
                  ? 'Links this category to its Jellyfin collection. Changing it makes sync find the collection by name instead.'
                  : 'Lowercase letters, digits and hyphens. Made from the name.'
              }
            >
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  className="input input--mono"
                  value={category.id}
                  spellCheck={false}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onChange={(e) => set('id', e.target.value)}
                />
              )}
            </Field>
          </details>
        </div>
      </div>
    </div>
  );
}
