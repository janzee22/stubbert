import { Banner, Icon } from '../components/index.js';
import { useLoad } from '../hooks/useLoad.js';
import { api, type Connection } from '../lib/api.js';

function connectionProblem(c: Connection): { title: string; text: string } | undefined {
  if (!c.jellyfin.ok) {
    return {
      title: 'Can’t reach Jellyfin',
      text: `${c.jellyfin.error}. Your categories are safe; syncs wait until Jellyfin is back.`,
    };
  }
  if (!c.apiKey.ok) return { title: 'Jellyfin rejects the API key', text: c.apiKey.error };
  if (!c.plugin.installed) {
    return {
      title: 'The Stubbert plugin is missing',
      text: 'Install it in Jellyfin and restart Jellyfin.',
    };
  }
  if (c.plugin.status !== 'Active') {
    return {
      title: `The Stubbert plugin is ${c.plugin.status}`,
      text: 'Restart Jellyfin, or reinstall the plugin.',
    };
  }
  if (!c.preflight.ok && !c.preflight.error.startsWith('Invalid config')) {
    return { title: 'Not ready to sync', text: c.preflight.error };
  }
  return undefined;
}

export function ConnectionBanner({ onSetup }: { onSetup: () => void }) {
  const connection = useLoad(() => api.connection());
  const problem = connection.data && connectionProblem(connection.data);
  if (!problem) return null;
  return (
    <Banner
      kind="fail"
      icon="offline"
      title={problem.title}
      actions={
        <>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => void connection.reload()}
            disabled={connection.loading}
          >
            <Icon name="refresh" />
            {connection.loading ? 'Checking…' : 'Try again'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onSetup}>
            <Icon name="wand" />
            Run setup again
          </button>
        </>
      }
    >
      {problem.text}
    </Banner>
  );
}
