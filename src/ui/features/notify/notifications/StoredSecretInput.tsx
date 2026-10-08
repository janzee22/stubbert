import { Icon, SecretInput } from '../../../components/index.js';
import type { SecretName } from '../../../state/notify.js';

export function StoredSecretInput({
  id,
  name,
  set,
  hint,
  value,
  placeholder,
  describedBy,
  invalid,
  onChange,
}: {
  id: string;
  name: SecretName;
  set: boolean;
  hint: string | null;
  value: string | undefined;
  placeholder: string;
  describedBy?: string;
  invalid?: boolean;
  onChange: (name: SecretName, value: string | undefined) => void;
}) {
  return (
    <div className="col gap-6">
      <SecretInput
        id={id}
        mono
        value={value ?? ''}
        placeholder={
          set ? `Saved (${hint ?? 'hidden'}). Paste a new one to replace it.` : placeholder
        }
        describedBy={describedBy}
        invalid={invalid}
        onChange={(v) => onChange(name, v === '' && !set ? undefined : v)}
      />
      {set && value === undefined && (
        <button
          type="button"
          className="btn btn--ghost btn--sm self-start"
          onClick={() => onChange(name, '')}
        >
          <Icon name="trash" />
          Remove saved value
        </button>
      )}
      {set && value === '' && <span className="small muted">Will be removed when you save.</span>}
    </div>
  );
}
