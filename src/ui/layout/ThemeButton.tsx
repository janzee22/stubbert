import { Icon, type IconName } from '../components/index.js';
import {
  nextThemePreference,
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from '../state/theme.js';

const THEME_LABELS: Record<ThemePreference, { label: string; icon: IconName }> = {
  system: { label: 'Theme: follows system', icon: 'monitor' },
  light: { label: 'Theme: light', icon: 'sun' },
  dark: { label: 'Theme: dark', icon: 'moon' },
};

export function ThemeButton() {
  const preference = useThemePreference();
  const { label, icon } = THEME_LABELS[preference];
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon"
      aria-label={`${label}. Change theme`}
      title={label}
      onClick={() => setThemePreference(nextThemePreference(preference))}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}
