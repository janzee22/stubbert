import { useCallback, useEffect, useState } from 'react';
import { ErrorText, Icon, Spinner, Stubbert } from '../components/index.js';
import { Onboarding, type Step } from '../features/onboarding/Onboarding.js';
import { api, setUnauthorizedHandler } from '../lib/api.js';
import { AppState } from '../state/AppState.js';
import { Login } from './Login.js';
import { Shell } from './Shell.js';

type Boot =
  | { state: 'loading' }
  | { state: 'login' }
  | { state: 'onboarding'; start: Step; cancelable?: boolean }
  | { state: 'error'; error: unknown }
  | { state: 'ready'; config: unknown; key: number };

const hasLibrary = (config: unknown) =>
  !!config &&
  typeof config === 'object' &&
  !!(config as { categoriesLibraryId?: unknown }).categoriesLibraryId;

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const start = useCallback(async () => {
    try {
      const session = await api.session();
      if (session.needsPassword) {
        setBoot({ state: 'onboarding', start: 'password' });
        return;
      }
      if (!session.authenticated) {
        setBoot({ state: 'login' });
        return;
      }
      const [settings, { config }] = await Promise.all([api.settings(), api.config()]);
      if (!settings.jellyfin.url) setBoot({ state: 'onboarding', start: 'jellyfin' });
      else if (!hasLibrary(config)) setBoot({ state: 'onboarding', start: 'plugin' });
      else setBoot({ state: 'ready', config, key: Date.now() });
    } catch (err) {
      setBoot({ state: 'error', error: err });
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setBoot({ state: 'login' }));
    void start();
  }, [start]);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    setBoot({ state: 'login' });
  };

  switch (boot.state) {
    case 'loading':
      return (
        <div className="boot" aria-busy="true">
          <span className="row muted">
            <Spinner /> Loading…
          </span>
        </div>
      );
    case 'login':
      return <Login onDone={() => void start()} />;
    case 'onboarding':
      return (
        <Onboarding
          start={boot.start}
          onDone={() => void start()}
          onCancel={boot.cancelable ? () => void start() : undefined}
        />
      );
    case 'error':
      return (
        <main className="boot">
          <div className="empty-state">
            <Stubbert mood="worried" />
            <h1 className="h1">The app didn’t load</h1>
            <ErrorText error={boot.error} />
            <button type="button" className="btn btn--primary" onClick={() => void start()}>
              <Icon name="refresh" />
              Try again
            </button>
          </div>
        </main>
      );
    case 'ready':
      return (
        <AppState key={boot.key} initialConfig={boot.config}>
          <Shell
            onLogout={() => void logout()}
            onSetup={() => setBoot({ state: 'onboarding', start: 'jellyfin', cancelable: true })}
          />
        </AppState>
      );
  }
}
