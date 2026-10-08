import { type ReactNode } from 'react';
import { Icon, type IconName } from './Icon.js';

export type BadgeKind =
  'create' | 'adopt' | 'update' | 'same' | 'skip' | 'fail' | 'ok' | 'warn' | 'brand';

export function Badge({
  kind,
  icon,
  children,
}: {
  kind: BadgeKind;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge--${kind}`}>
      {icon && <Icon name={icon} size={15} strokeWidth={2.75} />}
      {children}
    </span>
  );
}
