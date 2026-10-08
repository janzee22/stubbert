import { Icon } from './Icon.js';

export function ErrorText({ error }: { error?: unknown }) {
  if (!error) return null;
  return (
    <p className="error-msg" role="alert">
      <Icon name="alert" size={16} strokeWidth={2.5} />
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}
