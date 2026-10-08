import { type ReactNode } from 'react';
import { Icon } from './Icon.js';

export function Checkbox({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="check__box" aria-hidden="true">
        {checked && <Icon name="check" size={16} strokeWidth={3.2} />}
      </span>
      {children}
    </label>
  );
}
