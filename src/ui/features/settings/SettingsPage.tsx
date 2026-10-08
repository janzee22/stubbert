import {
  ErrorText,
  Field,
  Icon,
  Segmented,
  Select,
  SetRow,
  type IconName,
} from '../../components/index.js';
import { useLoad } from '../../hooks/useLoad.js';
import { api } from '../../lib/api.js';
import { useDraft } from '../../state/draft.js';
import { setThemePreference, useThemePreference, type ThemePreference } from '../../state/theme.js';
import { ConnectionChecks } from './ConnectionChecks.js';
import { JellyfinForm } from './JellyfinForm.js';
import { PasswordSection } from './PasswordSection.js';
import { ScheduleSection } from './ScheduleSection.js';
import { SetupForm } from './SetupForm.js';

const SECTIONS = [
  ['connection', 'Connection'],
  ['server', 'Jellyfin server'],
  ['library', 'Categories library'],
  ['schedule', 'Schedule'],
  ['password', 'Password and session'],
  ['appearance', 'Appearance'],
] as const;

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: IconName;
}

const THEMES: ThemeOption[] = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

export function SettingsPage({ onLogout, onSetup }: { onLogout: () => void; onSetup: () => void }) {
  const { draft, setDraft, issues } = useDraft();
  const theme = useThemePreference();
  const connection = useLoad(() => api.connection());
  const settings = useLoad(() => api.settings());
  const libraries = useLoad(() => api.libraries());
  const at = (path: string) =>
    issues.filter((i) => i.path === path || i.path.startsWith(`${path}.`)).map((i) => i.message);
  const knownLibrary = libraries.data?.find(
    (l) => l.id.toLowerCase() === draft.categoriesLibraryId.toLowerCase(),
  );
  const password = settings.data?.password;

  return (
    <>
      <div className="page-head">
        <div className="col gap-4 grow">
          <h1 className="display">Settings</h1>
          <p className="muted">Fields with a lock come from your environment variables.</p>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="col settings-nav" aria-label="Settings sections">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              className="nav__link"
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="settings-body">
          <SetRow
            id="connection"
            title="Connection"
            intro={connection.loading ? 'Checking…' : 'Checked when this page opened.'}
          >
            {connection.data && (
              <ConnectionChecks c={connection.data} configLibrary={draft.categoriesLibraryId} />
            )}
            <ErrorText error={connection.error} />
            <div className="row wrap gap-10">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => void connection.reload()}
                disabled={connection.loading}
              >
                <Icon name="refresh" />
                {connection.loading ? 'Testing…' : 'Test again'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={onSetup}>
                <Icon name="wand" />
                Run setup again
              </button>
            </div>
            <p className="help">
              Setup walks through Jellyfin, the plugin and the library again, for example after
              reinstalling Jellyfin. Your categories are kept.
            </p>
          </SetRow>

          <SetRow id="server" title="Jellyfin server" intro="Where the app finds Jellyfin.">
            {settings.data && (
              <JellyfinForm
                settings={settings.data.jellyfin}
                submitLabel="Test and save"
                onSaved={() => {
                  void connection.reload();
                  void libraries.reload();
                }}
              />
            )}
            <ErrorText error={settings.error} />
          </SetRow>

          <SetRow
            id="library"
            title="Categories library"
            intro="The boxsets library the plugin shows as folders."
          >
            <Field
              label="Library that holds the collections"
              help="Only boxsets libraries can be picked. Save with the bar at the bottom."
              errors={at('categoriesLibraryId')}
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={knownLibrary?.id ?? draft.categoriesLibraryId}
                  onChange={(e) => setDraft((d) => ({ ...d, categoriesLibraryId: e.target.value }))}
                >
                  <option value="">Choose…</option>
                  {draft.categoriesLibraryId && !knownLibrary && (
                    <option value={draft.categoriesLibraryId}>
                      {draft.categoriesLibraryId} (not found)
                    </option>
                  )}
                  {libraries.data?.map((l) => (
                    <option key={l.id} value={l.id} disabled={l.type !== 'boxsets'}>
                      {l.name} · {l.type}
                      {l.pluginLibrary ? ' · used by the plugin' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <ErrorText error={libraries.error} />
            <details className="disclosure">
              <summary>
                <Icon name="chevronRight" />
                Create a new library
              </summary>
              <SetupForm
                onApplied={(appliedId) => {
                  setDraft((d) => ({ ...d, categoriesLibraryId: appliedId }));
                  void libraries.reload();
                  void connection.reload();
                }}
              />
            </details>
          </SetRow>

          <ScheduleSection errorsAt={at} />
          <PasswordSection password={password} onLogout={onLogout} />

          <SetRow id="appearance" title="Appearance" intro="Only for this browser.">
            <Segmented
              label="Theme"
              large
              options={THEMES}
              value={theme}
              onChange={setThemePreference}
            />
            <p className="help">System follows your device’s light or dark mode.</p>
          </SetRow>
        </div>
      </div>
    </>
  );
}
