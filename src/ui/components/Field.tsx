import { useId, type ReactNode } from 'react';
import { Icon } from './Icon.js';

export function Field({
  label,
  optional,
  help,
  errors,
  children,
}: {
  label: ReactNode;
  optional?: boolean;
  help?: ReactNode;
  errors?: string[];
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const invalid = !!errors?.length;
  const describedBy = [invalid && errorId, help && helpId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
        {optional && <span className="opt">optional</span>}
      </label>
      {children({ id, describedBy, invalid })}
      {errors?.map((e) => (
        <p key={e} className="error-msg" id={errorId}>
          <Icon name="alert" size={16} strokeWidth={2.5} />
          {e}
        </p>
      ))}
      {help && (
        <p className="help" id={helpId}>
          {help}
        </p>
      )}
    </div>
  );
}
