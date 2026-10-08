import type { ReactNode } from 'react';
import { Icon, Stubbert } from '../../../components/index.js';

export function PageHead({ children }: { children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="col gap-4">
        <h1 className="display">Notifications</h1>
        <p className="muted">
          Stubbert listens to Jellyfin and posts a tidy message in Discord when something new
          arrives.
        </p>
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <>
      <PageHead />
      <div className="empty-state">
        <Stubbert mood="searching" />
        <h2 className="h1">No notifications yet</h2>
        <p className="muted">
          Pick a Discord channel, then point Jellyfin’s webhook at Stubbert. Takes about five
          minutes.
        </p>
        <button type="button" className="btn btn--primary btn--lg" onClick={onStart}>
          <Icon name="bell" size={20} />
          Set up notifications
        </button>
      </div>
    </>
  );
}
