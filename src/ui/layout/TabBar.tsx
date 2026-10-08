import { Icon } from '../components/index.js';
import { useStatus } from '../state/status.js';
import { NAV, runsAlert, type PageName } from './nav.js';

export function TabBar({ page }: { page: PageName }) {
  const { status } = useStatus();
  return (
    <nav className="tabbar" aria-label="Main">
      {NAV.map((n) => (
        <a
          key={n.name}
          className="tabbar__link"
          href={`#/${n.name}`}
          aria-current={page === n.name ? 'page' : undefined}
        >
          <Icon name={n.icon} size={22} />
          {n.short}
          {n.name === 'runs' && runsAlert(status) && (
            <span className="sr-only">, 1 failed run</span>
          )}
        </a>
      ))}
    </nav>
  );
}
