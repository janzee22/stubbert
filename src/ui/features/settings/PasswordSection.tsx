import { Field, Icon, SetRow } from '../../components/index.js';
import { api, type Settings } from '../../lib/api.js';
import { Locked } from './Locked.js';
import { PasswordForm } from './PasswordForm.js';

export function PasswordSection({
  password,
  onLogout,
}: {
  password: Settings['password'] | undefined;
  onLogout: () => void;
}) {
  return (
    <SetRow id="password" title="Password and session" intro="Who can open this app.">
      {password?.open && (
        <Locked>
          <span>
            No password: <code>UI_ALLOW_NO_PASSWORD</code> is set
          </span>
        </Locked>
      )}
      {password?.fromEnv && !password.open && (
        <Field
          label="Password"
          help="Change it in your environment and restart the app. Everyone gets logged out."
        >
          {() => (
            <Locked>
              <span>
                Set by <code>UI_PASSWORD</code>
              </span>
            </Locked>
          )}
        </Field>
      )}
      {password && !password.fromEnv && (
        <PasswordForm
          current
          submitLabel="Change password"
          onSubmit={(next, current) => api.changePassword(current, next)}
        />
      )}
      <div className="row">
        <button type="button" className="btn btn--secondary" onClick={onLogout}>
          <Icon name="logout" />
          Log out
        </button>
      </div>
    </SetRow>
  );
}
