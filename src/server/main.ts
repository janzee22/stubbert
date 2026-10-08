import { mkdir } from 'node:fs/promises';
import { pino } from 'pino';
import { DataDir } from '../data.js';
import { JellyfinClient } from '../jellyfin/client.js';
import { JellyfinHttp } from '../jellyfin/http.js';
import { NotifyService } from '../notify/service.js';
import { NotifyStore } from '../notify/store.js';
import { RunStore } from '../sync/run-store.js';
import { buildApp, logSerializers } from './app.js';
import { Auth, hashPassword } from './auth.js';
import { SyncService } from '../sync/service.js';
import { loadUi } from './ui.js';

const env = process.env;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const envUrl = env.JELLYFIN_URL || undefined;
const envKey = env.JELLYFIN_API_KEY || undefined;
if (!envUrl !== !envKey) {
  fail('Set both JELLYFIN_URL and JELLYFIN_API_KEY, or neither (then set them in the UI).');
}
const envPassword = env.UI_PASSWORD || undefined;
const open = !envPassword && env.UI_ALLOW_NO_PASSWORD === 'true';
const port = Number(env.PORT ?? 8080);
const keep = Number(env.RUN_HISTORY ?? 50);
if (!Number.isInteger(port) || !Number.isInteger(keep) || keep < 1) {
  fail('PORT and RUN_HISTORY must be whole numbers.');
}

const log = pino({ level: env.LOG_LEVEL ?? 'info', serializers: logSerializers });
const data = new DataDir();
await mkdir(data.root, { recursive: true });
let saved;
try {
  saved = await data.loadSettings();
} catch (err) {
  fail((err as Error).message);
}
const url = envUrl ?? saved.jellyfinUrl;
const key = envKey ?? saved.jellyfinApiKey;
const client = new JellyfinClient(new JellyfinHttp(url && key ? url : undefined, key));
const service = new SyncService({ data, client, runs: new RunStore(data.runsDir, keep) }, log);
const notifyStore = new NotifyStore(data.notificationsDir);
try {
  await notifyStore.load();
} catch (err) {
  fail((err as Error).message);
}
const notify = new NotifyService({
  store: notifyStore,
  jellyfin: client,
  log,
  onNewItem: () => service.newItemsArrived(),
});
const ui = await loadUi(env.UI_DIR ?? 'dist/ui');
const app = buildApp({
  service,
  ui,
  auth: new Auth(envPassword ? hashPassword(envPassword) : saved.passwordHash, {
    secureCookie: env.COOKIE_SECURE === 'true',
    open,
  }),
  fromEnv: { jellyfin: !!envUrl, password: !!envPassword || open },
  logger: log,
  trustProxy: env.TRUST_PROXY === 'true',
  notify,
});
if (!ui) {
  app.log.warn(
    'No built UI found; serving the API only (npm run build, or npm run ui:dev in development).',
  );
}
if (open) app.log.warn('UI_ALLOW_NO_PASSWORD=true: the UI and API have no password.');
else if (!envPassword && !saved.passwordHash) {
  app.log.warn('First start: open the UI to set a password and connect Jellyfin.');
}
if (!client.http.configured) {
  app.log.warn('Jellyfin is not set up yet; syncs wait until it is (Settings or onboarding).');
}

const config = await data.loadConfig();
if (config.ok) {
  const { schedule } = config.config;
  service.setSchedule(schedule);
  app.log.info(
    schedule.enabled
      ? `Scheduled sync every ${schedule.intervalMinutes} min${schedule.syncOnStart ? ', and now' : ''}`
      : 'Scheduled sync is off',
  );
} else {
  app.log.warn(
    `No valid config (${config.issues.map((i) => `${i.path || 'file'}: ${i.message}`).join('; ')}); scheduler off until one is saved`,
  );
}

let closing = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal}: waiting for a running sync, then stopping`);
    notify.stop();
    await service.stop();
    await notifyStore.flushed();
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port, host: env.HOST ?? '0.0.0.0' });
void service.syncOnStart();
notify.start();
