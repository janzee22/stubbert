import { type ReactNode } from 'react';
import { Icon, type IconName } from './Icon.js';

export type BannerKind = 'fail' | 'warn' | 'info' | 'ok';

export function Banner({
  kind,
  icon,
  title,
  children,
  actions,
}: {
  kind: BannerKind;
  icon: IconName;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`banner banner--${kind}`} role={kind === 'fail' ? 'alert' : 'status'}>
      <span className="banner__icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="banner__body">
        <div className="banner__title">{title}</div>
        {children && <div className="banner__text">{children}</div>}
      </div>
      {actions && <div className="banner__actions">{actions}</div>}
    </div>
  );
}
