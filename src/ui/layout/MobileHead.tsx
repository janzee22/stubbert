import type { ReactNode } from 'react';
import { BrandMark, Icon } from '../components/index.js';
import { StatusPill } from './StatusPill.js';
import { ThemeButton } from './ThemeButton.js';

export function MobileHead({
  title,
  back,
  action,
}: {
  title: string;
  back?: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="mobile-head">
      <div className="mobile-head__row">
        {back ? (
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Back"
            onClick={back}
          >
            <Icon name="chevronLeft" size={20} />
          </button>
        ) : (
          <span className="row">
            <BrandMark size={30} />
          </span>
        )}
        <h1 className="h2 mobile-head__title">{title}</h1>
        <ThemeButton />
        {action}
      </div>
      <div className="row">
        <StatusPill withNext={false} />
      </div>
    </header>
  );
}
