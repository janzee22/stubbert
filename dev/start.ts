import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const ENV_FILE = join(ROOT, '.env.dev');
const ONBOARDING_DATA = join(ROOT, 'dev/data/app-onboarding');
const API_PORT = '8090';
const onboarding = process.argv.includes('--onboarding');

const serverArgs = ['--watch', '--import', 'tsx', 'src/server/main.ts'];
const serverEnv: NodeJS.ProcessEnv = { ...process.env, PORT: API_PORT };

if (onboarding) {
  rmSync(ONBOARDING_DATA, { recursive: true, force: true });
  Object.assign(serverEnv, { DATA_DIR: ONBOARDING_DATA });
  for (const name of ['JELLYFIN_URL', 'JELLYFIN_API_KEY', 'UI_PASSWORD']) delete serverEnv[name];
} else if (existsSync(ENV_FILE)) {
  serverArgs.unshift(`--env-file=${ENV_FILE}`);
} else {
  console.error('No .env.dev yet. Run npm run dev:up (or dev:fresh) first.');
  process.exit(1);
}

const children: ChildProcess[] = [
  spawn(process.execPath, serverArgs, { cwd: ROOT, env: serverEnv, stdio: 'inherit' }),
  spawn(join(ROOT, 'node_modules/.bin/vite'), ['--open'], {
    cwd: ROOT,
    env: { ...process.env, API_URL: `http://localhost:${API_PORT}` },
    stdio: 'inherit',
  }),
];

let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}

for (const child of children) child.on('exit', (code) => stop(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => stop(0));

if (onboarding) {
  console.log(
    'Onboarding from scratch: app data in dev/data/app-onboarding (wiped on every start).',
  );
  console.log(
    'Server address: http://localhost:8096 (this app runs on the host, not in Docker). API key: see .env.dev.',
  );
}
