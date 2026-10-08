import { useId, useState, type FormEvent } from 'react';
import { Banner, ErrorText, Field, SecretInput } from '../../components/index.js';
import { useAction } from '../../hooks/useAction.js';

export function PasswordForm({
  current,
  onSubmit,
  submitLabel,
}: {
  current?: boolean;
  onSubmit: (password: string, current: string) => Promise<unknown>;
  submitLabel: string;
}) {
  const [old, setOld] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [done, setDone] = useState(false);
  const action = useAction();
  const oldId = useId();
  const mismatch = repeat.length > 0 && repeat !== password;
  const short = password.length > 0 && password.length < 8;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await action.run(async () => {
      await onSubmit(password, old);
      return true;
    });
    if (ok) {
      setOld('');
      setPassword('');
      setRepeat('');
      setDone(true);
    }
  };

  return (
    <form className="col gap-18" onSubmit={(e) => void submit(e)}>
      {current && (
        <div className="field">
          <label className="label" htmlFor={oldId}>
            Current password
          </label>
          <SecretInput
            id={oldId}
            value={old}
            onChange={setOld}
            autoComplete="current-password"
            required
          />
        </div>
      )}
      <Field
        label={current ? 'New password' : 'Password'}
        help="At least 8 characters. A short sentence works well."
        errors={short ? ['That’s shorter than 8 characters.'] : undefined}
      >
        {({ id, describedBy, invalid }) => (
          <SecretInput
            id={id}
            value={password}
            onChange={(v) => {
              setPassword(v);
              setDone(false);
            }}
            autoComplete="new-password"
            required
            minLength={8}
            describedBy={describedBy}
            invalid={invalid}
          />
        )}
      </Field>
      <Field label="Repeat it" errors={mismatch ? ['The passwords differ.'] : undefined}>
        {({ id, describedBy, invalid }) => (
          <SecretInput
            id={id}
            value={repeat}
            onChange={setRepeat}
            autoComplete="new-password"
            required
            describedBy={describedBy}
            invalid={invalid}
          />
        )}
      </Field>
      {done && current && (
        <Banner kind="ok" icon="check" title="Password changed">
          Other sessions are logged out.
        </Banner>
      )}
      <ErrorText error={action.error} />
      <div className="row">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={action.busy || password.length < 8 || password !== repeat || (current && !old)}
        >
          {action.busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
