import { useEffect, useState } from 'react';

export function usePoll<T>(load: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const run = () =>
      load().then(
        (d) => {
          if (cancelled) return;
          setData(d);
          setError(undefined);
        },
        (err: unknown) => {
          if (!cancelled) setError(err);
        },
      );
    void run();
    const timer = setInterval(() => void run(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load, intervalMs, tick]);
  return { data, error, refresh: () => setTick((t) => t + 1) };
}
