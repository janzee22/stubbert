import { createContext, useContext } from 'react';

const OpenCategoryContext = createContext<(id: string) => void>(() => undefined);

export const OpenCategoryProvider = OpenCategoryContext.Provider;

export function useOpenCategory(): (id: string) => void {
  return useContext(OpenCategoryContext);
}
