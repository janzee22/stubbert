import { useId, useState, type FormEvent } from 'react';
import { ErrorText, SecretInput, Stubbert } from '../components/index.js';
import { api } from '../lib/api.js';

export function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const id = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api.login(password);
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return (
    <main className="login">
      <form className="sheet col" onSubmit={(e) => void submit(e)}>
        <div className="row justify-center">
          <Stubbert mood={error ? 'worried' : 'smile'} />
        </div>
        <div className="col gap-4 items-center text-center">
          <h1 className="h1">Welcome back</h1>
          <p className="muted">Stubbert</p>
        </div>
        <div className="field">
          <label className="label" htmlFor={id}>
            Password
          </label>
          <SecretInput
            id={id}
            autoComplete="current-password"
            autoFocus
            value={password}
            invalid={!!error}
            onChange={setPassword}
          />
          <ErrorText error={error} />
        </div>
        <button
          type="submit"
          className="btn btn--primary btn--lg btn--block"
          disabled={busy || !password}
        >
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <p className="micro muted text-center">
          After 5 wrong tries, wait a few minutes before trying again.
        </p>
      </form>
    </main>
  );
}
