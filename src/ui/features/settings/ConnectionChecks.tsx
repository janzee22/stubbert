import { Icon, type IconName } from '../../components/index.js';
import { normId, type Connection } from '../../lib/api.js';

type CheckKind = 'ok' | 'warn' | 'fail' | 'wait';
const CHECK_ICONS: Record<CheckKind, IconName> = {
  ok: 'check',
  warn: 'warning',
  fail: 'close',
  wait: 'clock',
};

function CheckRow({ kind, title, detail }: { kind: CheckKind; title: string; detail?: string }) {
  return (
    <li className="check-row">
      <span className={`check-ico check-ico--${kind}`}>
        <Icon name={CHECK_ICONS[kind]} size={16} strokeWidth={3} />
        <span className="sr-only">{kind === 'ok' ? 'OK: ' : 'Problem: '}</span>
      </span>
      <div className="col gap-0 grow">
        <span className="strong">{title}</span>
        {detail && <span className="small muted">{detail}</span>}
      </div>
    </li>
  );
}

export function ConnectionChecks({ c, configLibrary }: { c: Connection; configLibrary: string }) {
  const plugin = c.plugin.installed ? c.plugin : undefined;
  const sameLibrary =
    !!configLibrary && normId(plugin?.categoriesLibraryId) === normId(configLibrary);
  return (
    <ul className="col gap-0">
      {c.jellyfin.ok ? (
        <CheckRow
          kind="ok"
          title="Jellyfin is reachable"
          detail={`${c.jellyfin.url} · version ${c.jellyfin.version}${c.jellyfin.serverName ? ` · ${c.jellyfin.serverName}` : ''}`}
        />
      ) : (
        <CheckRow kind="fail" title="Jellyfin isn’t reachable" detail={c.jellyfin.error} />
      )}
      {c.apiKey.ok ? (
        <CheckRow kind="ok" title="API key accepted" detail="Has admin rights" />
      ) : (
        <CheckRow kind="fail" title="API key rejected" detail={c.apiKey.error} />
      )}
      {plugin ? (
        <CheckRow
          kind={plugin.status === 'Active' ? 'ok' : 'fail'}
          title={`Stubbert plugin ${plugin.version}`}
          detail={plugin.status === 'Active' ? 'Active' : `${plugin.status}. Restart Jellyfin.`}
        />
      ) : (
        <CheckRow
          kind="fail"
          title="Stubbert plugin"
          detail="Not installed. Build it with bash plugin/pack.sh and restart Jellyfin."
        />
      )}
      {plugin && (
        <CheckRow
          kind={sameLibrary ? 'ok' : 'warn'}
          title="The plugin uses this app’s library"
          detail={sameLibrary ? undefined : 'Run the setup below, or pick the plugin’s library.'}
        />
      )}
      {c.preflight.ok ? (
        <CheckRow kind="ok" title="Ready to sync" detail="Checked against the saved config." />
      ) : (
        <CheckRow kind="fail" title="Not ready to sync" detail={c.preflight.error} />
      )}
    </ul>
  );
}
