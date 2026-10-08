import type { IconName } from '../components/index.js';
import type { Status } from '../lib/api.js';

export type PageName = 'categories' | 'preview' | 'runs' | 'notifications' | 'settings';

export interface NavItem {
  name: PageName;
  label: string;
  short: string;
  icon: IconName;
}

export const NAV: NavItem[] = [
  { name: 'categories', label: 'Categories', short: 'Categories', icon: 'ticket' },
  { name: 'preview', label: 'Preview & sync', short: 'Preview', icon: 'eye' },
  { name: 'runs', label: 'Runs', short: 'Runs', icon: 'runs' },
  { name: 'notifications', label: 'Notifications', short: 'Notify', icon: 'bell' },
  { name: 'settings', label: 'Settings', short: 'Settings', icon: 'settings' },
];

export function runsAlert(status: Status | undefined): boolean {
  return !status?.running && status?.lastRun?.status === 'failed';
}
