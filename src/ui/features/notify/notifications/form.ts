import type { NotifySettingsView, Preferences } from '../../../lib/api.js';
import { useNotifyDraft } from '../../../state/notify.js';

export type SetPreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;

export function useNotifyForm() {
  const ctx = useNotifyDraft();
  const { view, draft, issues, setPreferences } = ctx;
  if (!view || !draft) throw new Error('Notification settings are not loaded yet');
  const set: SetPreference = (key, value) => setPreferences((prev) => ({ ...prev, [key]: value }));
  const errorsFor = (path: string) => issues.filter((i) => i.path === path).map((i) => i.message);
  return {
    ...ctx,
    view,
    draft,
    prefs: draft.preferences,
    set,
    errorsFor,
  };
}

export function webhookUrlFor(view: NotifySettingsView, prefs: Preferences): string {
  const token = view.webhookUrl.split('/hooks/jellyfin/')[1] ?? '';
  const address = (prefs.publicAddress || view.preferences.publicAddress).replace(/\/+$/, '');
  return `${address}/hooks/jellyfin/${token}`;
}
