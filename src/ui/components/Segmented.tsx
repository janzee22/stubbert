import { type ReactNode } from 'react';
import { Icon, type IconName } from './Icon.js';

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  large,
  block,
}: {
  label: string;
  options: ReadonlyArray<SegOption<T>>;
  value: T | readonly T[];
  onChange: (value: T) => void;
  large?: boolean;
  block?: boolean;
}) {
  const selected = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <div
      className={`seg${large ? ' seg--lg' : ''}${block ? ' seg--block' : ''}`}
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg__opt"
          aria-pressed={selected(o.value)}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
