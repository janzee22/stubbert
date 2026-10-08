import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';
import { api, type ValueCount, type ValueField } from '../lib/api.js';

type LoadValues = (field: ValueField) => Promise<ValueCount[]>;

const ValuesContext = createContext<LoadValues | null>(null);

export function useValues(): LoadValues {
  const load = useContext(ValuesContext);
  if (!load) throw new Error('useValues outside ValuesProvider');
  return load;
}

export function ValuesProvider({ children }: { children: ReactNode }) {
  const cache = useRef(new Map<ValueField, Promise<ValueCount[]>>());

  const load = useCallback((field: ValueField) => {
    const cached = cache.current.get(field);
    if (cached) return cached;
    const values = api.values(field);
    values.catch(() => cache.current.delete(field));
    cache.current.set(field, values);
    return values;
  }, []);

  return <ValuesContext.Provider value={load}>{children}</ValuesContext.Provider>;
}
