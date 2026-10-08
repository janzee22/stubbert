import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Banner, BrandMark, ErrorText, Icon, Stubbert } from '../../components/index.js';
import { useLoad } from '../../hooks/useLoad.js';
import { JellyfinForm } from '../settings/JellyfinForm.js';
import { PasswordForm } from '../settings/PasswordForm.js';
import { SetupForm } from '../settings/SetupForm.js';
import { compactConfig, normalizeConfig } from '../../lib/draft.js';

const STEPS = ['password', 'jellyfin', 'plugin', 'library'] as const;
export type Step = (typeof STEPS)[number];

const STEP_INFO: Record<Step, { short: string; title: string; intro: string }> = {
  password: {
    short: 'Password',
    title: 'Choose a password',
    intro:
      'This password protects this app. Anyone who opens this page before you could otherwise choose it.',
  },
  jellyfin: {
    short: 'Connect Jellyfin',
    title: 'Connect Jellyfin',
    intro:
      'The app manages collections through Jellyfin’s API. It needs an address it can reach and an API key with admin rights.',
  },
  plugin: {
    short: 'Check plugin',
    title: 'Check the plugin',
    intro: 'Jellyfin needs the Stubbert plugin to show categories as folders.',
  },
  library: {
    short: 'Categories library',
    title: 'Create the Categories library',
    intro:
      'Categories live in their own Jellyfin library. This step creates it, turns off online metadata for its collections (Jellyfin would otherwise replace your posters) and points the plugin at it.',
  },
};

interface StepProps {
  next: () => void;
  onFailed: (failed: boolean) => void;
}

function PasswordStep({ next }: StepProps) {
  return (
    <PasswordForm
      submitLabel="Continue"
      onSubmit={(password) => api.setFirstPassword(password).then(next)}
    />
  );
}

function JellyfinStep({ next, onFailed, back }: StepProps & { back?: () => void }) {
  const settings = useLoad(() => api.settings());
  if (!settings.data) return <ErrorText error={settings.error} />;
  const jellyfin = settings.data.jellyfin;
  const backButton = back && (
    <button type="button" className="btn btn--ghost" onClick={back}>
      <Icon name="chevronLeft" />
      Back
    </button>
  );
  if (jellyfin.fromEnv) {
    return (
      <div className="col gap-22">
        <JellyfinForm settings={jellyfin} onSaved={next} />
        <div className="row">
          {backButton}
          <div className="spacer" />
          <button type="button" className="btn btn--primary btn--lg" onClick={next}>
            Continue
          </button>
        </div>
      </div>
    );
  }
  return (
    <JellyfinForm
      settings={jellyfin}
      onSaved={next}
      onFailed={onFailed}
      submitLabel="Test connection"
      footer={backButton}
    />
  );
}

function PluginStep({ next, onFailed }: StepProps) {
  const connection = useLoad(() => api.connection());
  const plugin = connection.data?.plugin;
  const active = !!plugin?.installed && plugin.status === 'Active';
  const checked = !connection.loading && !!connection.data;
  useEffect(() => {
    if (checked) onFailed(!active);
  }, [checked, active, onFailed]);
  const version = connection.data?.jellyfin.ok ? connection.data.jellyfin.version : undefined;

  return (
    <div className="col gap-22">
      {checked && active && plugin?.installed && (
        <Banner kind="ok" icon="plug" title={`Stubbert ${plugin.version} is active`}>
          Jellyfin{version ? ` ${version}` : ''} is ready for categories.
        </Banner>
      )}
      {checked && !active && (
        <Banner
          kind="fail"
          icon="plug"
          title={
            plugin?.installed ? `The plugin is ${plugin.status}` : 'Plugin not found in Jellyfin'
          }
        >
          <span className="col gap-8">
            <span>
              Jellyfin{version ? ` ${version}` : ''} is connected, but the plugin isn’t installed or
              isn’t active yet.
            </span>
            <ol className="steps-list">
              <li>
                Build it with <code>bash plugin/pack.sh</code> in this app’s repository.
              </li>
              <li>
                Unzip it into Jellyfin’s <code>plugins</code> folder.
              </li>
              <li>Restart Jellyfin, then check again.</li>
            </ol>
          </span>
        </Banner>
      )}
      <ErrorText error={connection.error} />
      {active ? (
        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={next}>
          Continue
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={() => void connection.reload()}
          disabled={connection.loading}
        >
          <Icon name="refresh" size={20} />
          {connection.loading ? 'Checking…' : 'Check again'}
        </button>
      )}
    </div>
  );
}

async function saveLibrary(libraryId: string) {
  const { config } = await api.config();
  await api.saveConfig(
    compactConfig({ ...normalizeConfig(config), categoriesLibraryId: libraryId }),
  );
}

function LibraryStep({ done }: { done: () => void }) {
  return (
    <SetupForm
      applyLabel="Create the library"
      onApplied={async (id) => {
        await saveLibrary(id);
        done();
      }}
    />
  );
}

function stepClass(i: number, current: number, failed: boolean): string {
  if (i < current) return 'step step--done';
  if (i === current) return failed ? 'step step--error' : 'step step--current';
  return 'step';
}

function StepMark({ i, current, failed }: { i: number; current: number; failed: boolean }) {
  if (i < current) return <Icon name="check" size={15} strokeWidth={3.2} />;
  if (i === current && failed) return <>!</>;
  return <>{i + 1}</>;
}

export function Onboarding({
  start,
  onDone,
  onCancel,
}: {
  start: Step;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<Step>(start);
  const [failed, setFailed] = useState(false);
  const index = STEPS.indexOf(step);
  const info = STEP_INFO[step];
  const goTo = (i: number) => {
    setFailed(false);
    setStep(STEPS[i] ?? step);
  };
  const next = () => goTo(index + 1);
  const back = index > STEPS.indexOf('jellyfin') ? () => goTo(index - 1) : undefined;
  useEffect(() => {
    document.title = `${info.title} · Stubbert`;
  }, [info.title]);

  return (
    <main className="page-center">
      <div className="row gap-12">
        <BrandMark size={40} />
        <span className="brandmark" style={{ fontSize: 22 }}>
          Stubbert
        </span>
      </div>
      <div className="page-center__inner">
        <div className="col gap-6">
          <span className="eyebrow">
            Setup · step {index + 1} of {STEPS.length}
          </span>
          <h1 className="h1">{info.title}</h1>
          <p className="muted">{info.intro}</p>
        </div>
        <ol className="steps" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={stepClass(i, index, failed)}
              aria-current={i === index ? 'step' : undefined}
            >
              <span className="step__n">
                <StepMark i={i} current={index} failed={failed} />
              </span>
              {STEP_INFO[s].short}
            </li>
          ))}
        </ol>
        <section className="sheet sheet--form col gap-22" style={{ padding: 40 }}>
          {step === 'password' && <PasswordStep next={next} onFailed={setFailed} />}
          {step === 'jellyfin' && <JellyfinStep next={next} onFailed={setFailed} back={back} />}
          {step === 'plugin' && <PluginStep next={next} onFailed={setFailed} />}
          {step === 'library' && <LibraryStep done={onDone} />}
          {(step === 'plugin' || step === 'library') && back && (
            <div className="row">
              <button type="button" className="btn btn--ghost" onClick={back}>
                <Icon name="chevronLeft" />
                Back
              </button>
            </div>
          )}
        </section>
        <div className="row gap-16 justify-center">
          <Stubbert mood={failed ? 'worried' : 'smile'} width={88} />
          <p className="small muted" style={{ maxWidth: 420 }}>
            {failed
              ? 'Docker networking trips up almost everyone. You can always come back through Settings → Run setup again.'
              : 'Each step is saved as soon as it passes, so you can stop and pick up where you left off.'}
          </p>
        </div>
        {onCancel && (
          <button type="button" className="btn btn--ghost self-center" onClick={onCancel}>
            Cancel and return to the app
          </button>
        )}
      </div>
    </main>
  );
}
