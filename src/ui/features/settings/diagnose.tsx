import type { ReactNode } from 'react';
import { Banner, Icon } from '../../components/index.js';

export interface Diagnosis {
  title: string;
  text: string;
  tips: ReactNode[];
  field: 'url' | 'key';
}

const LAN_TIP = (
  <>
    Use Jellyfin’s LAN address, for example <code>http://192.168.1.20:8096</code>.
  </>
);
const SERVICE_TIP = (
  <>
    Same Docker network? Use the service name, for example <code>http://jellyfin:8096</code>.
  </>
);

export function diagnose(message: string, url: string): Diagnosis {
  const host = /host (\S+) not found/.exec(message)?.[1];
  if (host) {
    const dockerHost = host === 'host.docker.internal';
    return {
      title: `Can’t find the host “${host}”`,
      text: `The app looked for Jellyfin at ${url}, but that name doesn’t exist where this app runs. The API key hasn’t been tested yet.`,
      field: 'url',
      tips: [
        dockerHost && (
          <>
            Running this app outside Docker (npm)? Use <code>http://localhost:8096</code>.
          </>
        ),
        LAN_TIP,
        SERVICE_TIP,
        dockerHost && (
          <>
            On Linux, add <code>extra_hosts: ["host.docker.internal:host-gateway"]</code> to this
            app in <code>docker-compose.yml</code> and restart it.
          </>
        ),
      ].filter(Boolean),
    };
  }
  if (/connection refused/.test(message)) {
    return {
      title: 'Nothing answers at that address',
      text: `The host exists, but no Jellyfin listens at ${url}.`,
      field: 'url',
      tips: [
        'Check that Jellyfin is running and that the port is right (8096 by default).',
        <>
          In Docker, <code>localhost</code> is this app’s own container, not Jellyfin.
        </>,
        LAN_TIP,
      ],
    };
  }
  if (/rejected the API key/.test(message)) {
    return {
      title: 'Jellyfin rejected the API key',
      text: 'Jellyfin is reachable, but it doesn’t accept this key.',
      field: 'key',
      tips: [
        'In Jellyfin: Dashboard → API Keys → + makes a new key. Paste all of it.',
        'A key removed in Jellyfin stops working right away.',
      ],
    };
  }
  return {
    title: 'Can’t connect to Jellyfin',
    text: message,
    field: 'url',
    tips: [LAN_TIP],
  };
}

export function DiagnosisBanner({ diagnosis }: { diagnosis: Diagnosis }) {
  return (
    <Banner kind="fail" icon="server" title={diagnosis.title}>
      <span className="col gap-8">
        <span>{diagnosis.text}</span>
        <strong>Try one of these:</strong>
        <ul className="tip-list">
          {diagnosis.tips.map((tip, i) => (
            <li key={i}>
              <Icon name="arrowRight" size={16} strokeWidth={2.5} />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </span>
    </Banner>
  );
}
