import type { ReactNode } from 'react';
import { Icon } from '../../components/index.js';

export function Locked({ children }: { children: ReactNode }) {
  return (
    <div className="locked">
      <Icon name="lock" />
      {children}
    </div>
  );
}
