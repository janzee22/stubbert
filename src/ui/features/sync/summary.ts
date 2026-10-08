import type { SyncReport } from '../../lib/api.js';
import { plural } from '../../lib/format.js';

export function summarize(report: SyncReport) {
  const c = report.categories;
  const changed = c.filter(
    (r) => r.status !== 'ok' && (r.status !== 'skipped' || r.metadata.length > 0 || !!r.poster),
  );
  return {
    changed: changed.length,
    created: c.filter((r) => r.status === 'create').length,
    added: c.reduce((n, r) => n + r.add.length, 0),
    removed: c.reduce((n, r) => n + r.remove.length, 0),
    posters: c.filter((r) => r.poster).length,
    skipped: c.filter((r) => r.status === 'skipped'),
  };
}

export function sentence(report: SyncReport): string {
  const t = summarize(report);
  const parts = [
    t.added && `adds ${plural(t.added, 'title')}`,
    t.removed && `removes ${plural(t.removed, 'title')}`,
    t.posters && `sets ${plural(t.posters, 'poster')}`,
    t.created && `makes ${plural(t.created, 'new collection')}`,
  ].filter(Boolean);
  const main = parts.length ? `${parts.join(', ')}.` : 'Updates details only.';
  const held = t.skipped.map((s) => s.name);
  const guard = held.length
    ? ` ${held.join(', ')} ${held.length === 1 ? 'is' : 'are'} left alone.`
    : '';
  return main.charAt(0).toUpperCase() + main.slice(1) + guard;
}
