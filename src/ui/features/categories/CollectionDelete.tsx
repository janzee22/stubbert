import { useEffect, useId, useState } from 'react';
import { Dialog, ErrorText, Icon } from '../../components/index.js';
import { api, RequestError, type ManagedCollection } from '../../lib/api.js';
import { plural } from '../../lib/format.js';

export function CollectionDelete({ categoryId }: { categoryId: string }) {
  const [collection, setCollection] = useState<ManagedCollection | null>();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<unknown>();
  const [deleted, setDeleted] = useState<string>();
  const inputId = useId();

  useEffect(() => {
    let cancelled = false;
    api.managedCollection(categoryId).then(
      (c) => !cancelled && setCollection(c),
      (err) => {
        if (cancelled) return;
        const notManaged =
          err instanceof RequestError && (err.status === 404 || err.code === 'not-managed');
        if (notManaged) setCollection(null);
        else setError(err);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const remove = async () => {
    setError(undefined);
    try {
      const res = await api.deleteCollection(categoryId);
      setDeleted(res.deleted.name);
      setCollection(null);
      setOpen(false);
    } catch (err) {
      setError(err);
    }
  };

  if (deleted) {
    return (
      <p className="small" role="status">
        Deleted the collection “{deleted}”. The next sync creates it again while the category is
        here.
      </p>
    );
  }
  if (!collection) return <ErrorText error={error} />;
  return (
    <div className="danger-row">
      <div className="col">
        <span className="strong">Delete the collection in Jellyfin</span>
        <span className="small muted">
          “{collection.name}” · {plural(collection.memberCount, 'member')}. Happens right away and
          can’t be undone.
        </span>
      </div>
      <button type="button" className="btn btn--danger-quiet btn--sm" onClick={() => setOpen(true)}>
        <Icon name="trash" />
        Delete in Jellyfin…
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        icon="trash"
        title="Delete the Jellyfin collection?"
        actions={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={typed !== categoryId}
              onClick={() => void remove()}
            >
              <Icon name="trash" />
              Delete collection
            </button>
          </>
        }
      >
        <ul className="consequences">
          <li>
            <Icon name="arrowRight" size={16} />“{collection.name}” and its{' '}
            {plural(collection.memberCount, 'member')} leave Jellyfin right away.
          </li>
          <li>
            <Icon name="arrowRight" size={16} />
            The movies and series themselves are not touched.
          </li>
          <li>
            <Icon name="arrowRight" size={16} />
            The next sync creates it again while the category is here.
          </li>
        </ul>
        <div className="field">
          <label className="label" htmlFor={inputId}>
            Type <code>{categoryId}</code> to confirm
          </label>
          <input
            id={inputId}
            className="input input--mono"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <ErrorText error={error} />
      </Dialog>
    </div>
  );
}
