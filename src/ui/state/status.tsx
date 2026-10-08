import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type Status } from '../lib/api.js';

const POLL_MS = 10_000;
const POLL_WHILE_RUNNING_MS = 2_000;

interface StatusState {
  status?: Status;
  refreshStatus: () => Promise<void>;
}

const StatusContext = createContext<StatusState | null>(null);

export function useStatus(): StatusState {
  const state = useContext(StatusContext);
  if (!state) throw new Error('useStatus outside StatusProvider');
  return state;
}

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>();

  const refreshStatus = useCallback(async () => {
    const next = await api.status().catch(() => undefined);
    if (next) setStatus(next);
  }, []);

  const running = !!status?.running;
  useEffect(() => {
    void refreshStatus();
    const timer = setInterval(
      () => void refreshStatus(),
      running ? POLL_WHILE_RUNNING_MS : POLL_MS,
    );
    return () => clearInterval(timer);
  }, [refreshStatus, running]);

  const value = useMemo(() => ({ status, refreshStatus }), [status, refreshStatus]);
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}
