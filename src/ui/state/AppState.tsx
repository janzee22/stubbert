import type { ReactNode } from 'react';
import { DraftProvider } from './draft.js';
import { NotifyDraftProvider } from './notify.js';
import { PostersProvider } from './posters.js';
import { StatusProvider } from './status.js';
import { ValuesProvider } from './values.js';

export function AppState({
  children,
  initialConfig,
}: {
  children: ReactNode;
  initialConfig: unknown;
}) {
  return (
    <StatusProvider>
      <PostersProvider>
        <ValuesProvider>
          <DraftProvider initialConfig={initialConfig}>
            <NotifyDraftProvider>{children}</NotifyDraftProvider>
          </DraftProvider>
        </ValuesProvider>
      </PostersProvider>
    </StatusProvider>
  );
}
