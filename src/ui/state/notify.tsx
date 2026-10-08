import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  MESSAGE_KINDS,
  RequestError,
  type MessageKind,
  type NotifyIssue,
  type NotifySettingsView,
  type Preferences,
} from '../lib/api.js';

const VALIDATE_DELAY_MS = 400;

export const KIND_NAMES: Record<MessageKind, string> = {
  movie: 'Movie',
  episode: 'Episode',
  episodes: 'Episodes',
  season: 'Season',
};

export const KIND_LABELS = Object.fromEntries(
  MESSAGE_KINDS.map((kind) => [kind, `${KIND_NAMES[kind]} message`]),
) as Record<MessageKind, string>;

export type SecretName = 'discordWebhookUrl' | 'tmdbApiKey';

export interface NotifyForm {
  preferences: Preferences;
  discordWebhookUrl?: string;
  tmdbApiKey?: string;
}

interface NotifyDraftState {
  view?: NotifySettingsView;
  loadError?: unknown;
  draft?: NotifyForm;
  dirty: boolean;
  changes: string[];
  issues: NotifyIssue[];
  saving: boolean;
  saveError?: string;
  setPreferences: (fn: (p: Preferences) => Preferences) => void;
  setSecret: (name: SecretName, value: string | undefined) => void;
  save: () => Promise<boolean>;
  discard: () => void;
  setView: (view: NotifySettingsView) => void;
}

const NotifyContext = createContext<NotifyDraftState | null>(null);

export function useNotifyDraft(): NotifyDraftState {
  const state = useContext(NotifyContext);
  if (!state) throw new Error('useNotifyDraft outside NotifyDraftProvider');
  return state;
}

const PREFERENCE_LABELS: Partial<Record<keyof Preferences, string>> = {
  enabled: 'send notifications',
  movies: 'movies',
  episodes: 'episodes',
  libraryIds: 'libraries',
  quietMinutes: 'quiet period',
  bulkThreshold: 'bulk limit',
  skipAnnounced: 'skip announced titles',
  tvmaze: 'TVmaze',
  publicAddress: 'Stubbert’s address',
  username: 'post as',
  mention: 'mention',
  linkBase: 'Jellyfin address for links',
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function describeChanges(saved: Preferences, draft: NotifyForm): string[] {
  const out: string[] = [];
  for (const [key, label] of Object.entries(PREFERENCE_LABELS)) {
    const k = key as keyof Preferences;
    if (!same(saved[k], draft.preferences[k])) out.push(`Notifications: ${label}`);
  }
  for (const kind of MESSAGE_KINDS) {
    const a = saved.templates[kind];
    const b = draft.preferences.templates[kind];
    const fields = (['title', 'content', 'image', 'color'] as const).filter((f) => a[f] !== b[f]);
    if (fields.length) out.push(`${KIND_LABELS[kind]}: ${fields.join(', ')}`);
  }
  if (draft.discordWebhookUrl !== undefined) out.push('Notifications: Discord webhook');
  if (draft.tmdbApiKey !== undefined) out.push('Notifications: TMDb key');
  return out;
}

export function NotifyDraftProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<NotifySettingsView>();
  const [loadError, setLoadError] = useState<unknown>();
  const [draft, setDraft] = useState<NotifyForm>();
  const [issues, setIssues] = useState<NotifyIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  useEffect(() => {
    api.notifySettings().then(
      (v) => {
        setView(v);
        setDraft({ preferences: v.preferences });
      },
      (err: unknown) => setLoadError(err),
    );
  }, []);

  const changes = useMemo(
    () => (view && draft ? describeChanges(view.preferences, draft) : []),
    [view, draft],
  );
  const dirty = changes.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const preferences = draft?.preferences;
  useEffect(() => {
    if (!preferences) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.validateNotify(preferences).then(
        (v) => {
          if (!cancelled) setIssues(v.issues);
        },
        () => undefined,
      );
    }, VALIDATE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [preferences]);

  const setPreferences = useCallback((fn: (p: Preferences) => Preferences) => {
    setDraft((d) => (d ? { ...d, preferences: fn(d.preferences) } : d));
  }, []);

  const setSecret = useCallback((name: SecretName, value: string | undefined) => {
    setDraft((d) => (d ? { ...d, [name]: value } : d));
  }, []);

  const save = useCallback(async () => {
    if (!draft) return true;
    setSaving(true);
    setSaveError(undefined);
    try {
      const next = await api.saveNotifySettings({
        preferences: draft.preferences,
        ...(draft.discordWebhookUrl !== undefined && {
          discordWebhookUrl: draft.discordWebhookUrl || null,
        }),
        ...(draft.tmdbApiKey !== undefined && { tmdbApiKey: draft.tmdbApiKey || null }),
      });
      setView(next);
      setDraft({ preferences: next.preferences });
      return true;
    } catch (err) {
      if (err instanceof RequestError && err.issues.length) {
        setIssues(err.issues.map((i) => ({ path: i.path, message: i.message })));
      }
      setSaveError((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const discard = useCallback(() => {
    if (view) setDraft({ preferences: view.preferences });
    setSaveError(undefined);
  }, [view]);

  const value = useMemo(
    () => ({
      view,
      loadError,
      draft,
      dirty,
      changes,
      issues,
      saving,
      saveError,
      setPreferences,
      setSecret,
      save,
      discard,
      setView,
    }),
    [
      view,
      loadError,
      draft,
      dirty,
      changes,
      issues,
      saving,
      saveError,
      setPreferences,
      setSecret,
      save,
      discard,
    ],
  );
  return <NotifyContext.Provider value={value}>{children}</NotifyContext.Provider>;
}
