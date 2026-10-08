import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'stubbert-theme';
const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function stored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return PREFERENCES.find((p) => p === value) ?? 'system';
  } catch {
    return 'system';
  }
}

let preference = stored();

function apply() {
  const dark = preference === 'dark' || (preference === 'system' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function initTheme() {
  apply();
  darkQuery.addEventListener('change', apply);
}

function store(value: ThemePreference): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  store(next);
  apply();
  for (const listener of listeners) listener();
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  return PREFERENCES[(PREFERENCES.indexOf(current) + 1) % PREFERENCES.length] ?? 'system';
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference);
}
