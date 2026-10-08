import { BrandMark, Icon } from '../components/index.js';
import { useStatus } from '../state/status.js';
import { NAV, runsAlert, type PageName } from './nav.js';
import { StatusPill } from './StatusPill.js';
import { ThemeButton } from './ThemeButton.js';

export function TopBar({ page }: { page: PageName }) {
  const { status } = useStatus();
  return (
    <header className="topbar">
      <a className="brandmark" href="#/categories">
        <BrandMark />
        Stubbert
      </a>
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <a
            key={n.name}
            className="nav__link"
            href={`#/${n.name}`}
            aria-current={page === n.name ? 'page' : undefined}
          >
            <Icon name={n.icon} />
            <span className="nav__label">{n.label}</span>
            {n.name === 'runs' && runsAlert(status) && (
              <span className="nav__count" aria-label="1 failed run">
                1
              </span>
            )}
          </a>
        ))}
      </nav>
      <div className="spacer" />
      <StatusPill />
      <ThemeButton />
    </header>
  );
}
