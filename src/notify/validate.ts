import type { NotifyIssue } from '../shared/api.js';
import { MESSAGE_KINDS } from '../shared/notify.js';
import { checkTemplate } from './message.js';
import { preferencesSchema, templateSchema, type Preferences } from './settings.js';

export function templateErrors(preferences: Preferences): NotifyIssue[] {
  return MESSAGE_KINDS.flatMap((kind) =>
    checkTemplate(kind, preferences.templates[kind]).issues.map((i) => ({
      path: `templates.${kind}`,
      message: i.message,
    })),
  );
}

export function validatePreferences(raw: unknown): NotifyIssue[] {
  const parsed = preferencesSchema.safeParse(raw);
  const issues: NotifyIssue[] = parsed.success
    ? []
    : parsed.error.issues
        .filter((i) => i.path[0] !== 'templates')
        .map((i) => ({ path: i.path.join('.'), message: i.message }));
  const templates = (raw as { templates?: Record<string, unknown> } | undefined)?.templates ?? {};
  for (const kind of MESSAGE_KINDS) {
    const t = templateSchema.safeParse(templates[kind]);
    if (!t.success) {
      issues.push({ path: `templates.${kind}`, kind, message: 'This template is incomplete.' });
      continue;
    }
    const check = checkTemplate(kind, t.data);
    for (const field of ['title', 'content'] as const) {
      for (const i of check[field]) {
        issues.push({ path: `templates.${kind}.${field}`, kind, field, message: i.message });
      }
    }
  }
  return issues;
}
