import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type Poster } from '../lib/api.js';

interface PostersState {
  posters: Poster[];
  posterVersion: Record<string, string>;
  refreshPosters: () => Promise<void>;
  noteUpload: (file: string) => void;
}

const PostersContext = createContext<PostersState | null>(null);

export function usePosters(): PostersState {
  const state = useContext(PostersContext);
  if (!state) throw new Error('usePosters outside PostersProvider');
  return state;
}

export function PostersProvider({ children }: { children: ReactNode }) {
  const [posters, setPosters] = useState<Poster[]>([]);
  const [posterVersion, setPosterVersion] = useState<Record<string, string>>({});

  const refreshPosters = useCallback(async () => {
    setPosters(await api.posters());
  }, []);

  const noteUpload = useCallback((file: string) => {
    setPosterVersion((v) => ({ ...v, [file]: String(Date.now()) }));
  }, []);

  useEffect(() => {
    refreshPosters().catch(() => setPosters([]));
  }, [refreshPosters]);

  const value = useMemo(
    () => ({ posters, posterVersion, refreshPosters, noteUpload }),
    [posters, posterVersion, refreshPosters, noteUpload],
  );
  return <PostersContext.Provider value={value}>{children}</PostersContext.Provider>;
}
