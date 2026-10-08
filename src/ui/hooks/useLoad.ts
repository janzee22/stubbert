import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useLoad<T>(load: () => Promise<T>, key?: unknown) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const latestLoad = useRef(load);
  useLayoutEffect(() => {
    latestLoad.current = load;
  });
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await latestLoad.current());
      setError(undefined);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload, key]);
  return { data, error, loading, reload };
}
