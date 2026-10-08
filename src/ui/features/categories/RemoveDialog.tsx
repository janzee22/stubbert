import { Dialog, Icon } from '../../components/index.js';
import { plural } from '../../lib/format.js';
import { flatten, type Category } from '../../lib/tree.js';

export function RemoveDialog({
  category,
  open,
  onClose,
  onConfirm,
}: {
  category: Category;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const descendants = flatten(category.children).length;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="trash"
      title={`Remove “${category.name || 'Unnamed'}”?`}
      actions={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Keep it
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            <Icon name="trash" />
            Remove category
          </button>
        </>
      }
    >
      <ul className="consequences">
        <li>
          <Icon name="arrowRight" size={16} />
          It leaves this app when you save.
        </li>
        {descendants > 0 && (
          <li>
            <Icon name="arrowRight" size={16} />
            {plural(descendants, 'sub-category', 'sub-categories')} go with it.
          </li>
        )}
        <li>
          <Icon name="arrowRight" size={16} />
          The collection in Jellyfin stays. Delete it separately if you want it gone.
        </li>
      </ul>
    </Dialog>
  );
}
