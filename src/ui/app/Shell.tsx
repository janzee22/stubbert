import { useEffect, useState } from 'react';
import { CategoriesPage, type CategoryView } from '../features/categories/CategoriesPage.js';
import { NotificationsPage } from '../features/notify/notifications/NotificationsPage.js';
import { TemplatePage } from '../features/notify/template/TemplatePage.js';
import { SettingsPage } from '../features/settings/SettingsPage.js';
import { PreviewPage } from '../features/sync/PreviewPage.js';
import { RunsPage } from '../features/sync/RunsPage.js';
import { ConnectionBanner, MobileHead, NAV, SaveBar, TabBar, TopBar } from '../layout/index.js';
import { findPath } from '../lib/tree.js';
import { useDraft } from '../state/draft.js';
import { KIND_LABELS } from '../state/notify.js';
import { OpenCategoryProvider } from './openCategory.js';
import { useHashPage } from './router.js';

export function Shell({ onLogout, onSetup }: { onLogout: () => void; onSetup: () => void }) {
  const page = useHashPage();
  const [selected, setSelected] = useState<number[]>();
  const [view, setView] = useState<CategoryView>('list');
  const template = page.name === 'notifications' ? page.template : undefined;
  const label = template
    ? KIND_LABELS[template]
    : (NAV.find((n) => n.name === page.name)?.label ?? 'Categories');
  useEffect(() => {
    document.title = `${label} · Stubbert`;
  }, [label]);

  const { draft } = useDraft();
  const showIssue = (path: number[] | undefined) => {
    if (!path) {
      location.hash = '#/settings';
      return;
    }
    setSelected(path);
    setView('list');
    location.hash = '#/categories';
  };

  const openCategory = (id: string) => {
    const path = findPath(draft.categories, id);
    if (path) showIssue(path);
    else location.hash = '#/categories';
  };

  return (
    <OpenCategoryProvider value={openCategory}>
      <div className="shell">
        <a className="skip-link btn btn--primary" href="#main">
          Skip to content
        </a>
        <TopBar page={page.name} />
        <MobileHead
          title={label}
          back={
            template
              ? () => {
                  location.hash = '#/notifications';
                }
              : undefined
          }
        />
        <main id="main" className="page" tabIndex={-1}>
          <ConnectionBanner onSetup={onSetup} />
          {page.name === 'categories' && (
            <CategoriesPage
              selected={selected}
              onSelect={setSelected}
              view={view}
              onView={setView}
            />
          )}
          {page.name === 'preview' && <PreviewPage />}
          {page.name === 'runs' && <RunsPage id={page.id} />}
          {page.name === 'notifications' &&
            (page.template ? <TemplatePage kind={page.template} /> : <NotificationsPage />)}
          {page.name === 'settings' && <SettingsPage onLogout={onLogout} onSetup={onSetup} />}
        </main>
        <div className="dock">
          <SaveBar onShowIssue={showIssue} />
          <TabBar page={page.name} />
        </div>
      </div>
    </OpenCategoryProvider>
  );
}
