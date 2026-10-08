import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon.js';

export function Dialog({
  open,
  onClose,
  icon,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  icon?: IconName;
  title: ReactNode;
  children: ReactNode;
  actions: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
    >
      {open && (
        <>
          <div className="dialog__head">
            {icon && (
              <span className="dialog__icon">
                <Icon name={icon} size={28} />
              </span>
            )}
            <h2 className="h2 self-center" id={titleId}>
              {title}
            </h2>
          </div>
          {children}
          <div className="dialog__actions">{actions}</div>
        </>
      )}
    </dialog>
  );
}
