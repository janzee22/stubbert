import type { ConfigIssue } from '../../lib/api.js';

export function friendly(issue: ConfigIssue): string {
  if (issue.path.endsWith('.values') && /too small/i.test(issue.message)) {
    return 'Add at least one value, or remove this rule.';
  }
  if (issue.path.endsWith('.name') && /too small/i.test(issue.message)) {
    return 'Give the category a name.';
  }
  if (/duplicate name/.test(issue.message)) {
    return 'Another category already has this name. Names must be unique in Jellyfin.';
  }
  return issue.message;
}
