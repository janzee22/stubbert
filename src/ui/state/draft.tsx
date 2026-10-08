import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, RequestError, type ConfigIssue } from '../lib/api.js';
import { compactConfig, normalizeConfig, sameDraft, type Draft } from '../lib/draft.js';
import { usePosters } from './posters.js';
import { useStatus } from './status.js';

const VALIDATE_DELAY_MS = 400;

interface DraftState {
  saved: Draft;
  draft: Draft;
  dirty: boolean;
  setDraft: (fn: (d: Draft) => Draft) => void;
  discard: () => void;
  save: () => Promise<boolean>;
  saving: boolean;
  saveError?: string;
  issues: ConfigIssue[];
  warnings: string[];
}

const DraftContext = createContext<DraftState | null>(null);

export function useDraft(): DraftState {
  const state = useContext(DraftContext);
  if (!state) throw new Error('useDraft outside DraftProvider');
  return state;
}

function useValidation(draft: Draft) {
  const { posters } = usePosters();
  const [issues, setIssues] = useState<ConfigIssue[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api.validateConfig(compactConfig(draft)).then(
        (v) => {
          if (cancelled) return;
          setIssues(v.issues);
          setWarnings(v.warnings);
        },
        () => undefined,
      );
    }, VALIDATE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, posters]);

  return { issues, setIssues, warnings, setWarnings };
}

function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}

export function DraftProvider({
  children,
  initialConfig,
}: {
  children: ReactNode;
  initialConfig: unknown;
}) {
  const { refreshStatus } = useStatus();
  const [saved, setSaved] = useState(() => normalizeConfig(initialConfig));
  const [draft, setDraftState] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const { issues, setIssues, warnings, setWarnings } = useValidation(draft);
  const dirty = useMemo(() => !sameDraft(saved, draft), [saved, draft]);
  useLeaveWarning(dirty);

  const setDraft = useCallback((fn: (d: Draft) => Draft) => setDraftState(fn), []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      const res = await api.saveConfig(compactConfig(draft));
      setSaved(draft);
      setWarnings(res.warnings);
      setIssues([]);
      void refreshStatus();
      return true;
    } catch (err) {
      if (err instanceof RequestError && err.issues.length) setIssues(err.issues);
      setSaveError((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, refreshStatus, setIssues, setWarnings]);

  const discard = useCallback(() => {
    setDraftState(saved);
    setSaveError(undefined);
  }, [saved]);

  const value = useMemo(
    () => ({
      saved,
      draft,
      dirty,
      setDraft,
      discard,
      save,
      saving,
      saveError,
      issues,
      warnings,
    }),
    [saved, draft, dirty, setDraft, discard, save, saving, saveError, issues, warnings],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}
