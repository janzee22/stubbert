import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JellyfinHttp } from '../src/jellyfin/http.js';
import { VERSION } from '../src/version.js';

const DEV_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(DEV_DIR, '..', '.env.dev');
const BASE_URL = 'http://localhost:8096';
const USER = 'dev';
const PASSWORD = 'dev';
const KEY_APP = 'stubbert-dev';
const MOVIES = [
  'Metropolis (1927)',
  'Nosferatu (1922)',
  'The General (1926)',
  'Night of the Living Dead (1968)',
];

const compose = (...args: string[]) =>
  execFileSync('docker', ['compose', ...args], { cwd: DEV_DIR, stdio: 'inherit' });
const anon = new JellyfinHttp(BASE_URL, '');
const CLIENT = { name: 'Stubbert', device: 'dev-bootstrap', version: VERSION };
const clientAuth = `MediaBrowser Client="${CLIENT.name}", Device="${CLIENT.device}", DeviceId="stubbert-${CLIENT.device}", Version="${VERSION}"`;

async function publicInfo(): Promise<
  { Version: string; StartupWizardCompleted: boolean } | undefined
> {
  try {
    const res = await anon.request<{ Version: string; StartupWizardCompleted: boolean }>(
      'GET',
      '/System/Info/Public',
      { anonymous: true },
    );
    return res.ok && res.data?.Version ? res.data : undefined;
  } catch {
    return undefined;
  }
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    const info = await publicInfo();
    if (info) return info;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Jellyfin did not answer on ${BASE_URL} within 2 minutes (docker compose -f dev/compose.yaml logs)`,
  );
}

for (const dir of ['media/movies', 'media/categories', 'config/plugins']) {
  mkdirSync(join(DEV_DIR, 'data', dir), { recursive: true });
}
if (
  !existsSync(
    join(
      DEV_DIR,
      'data/config/plugins/Stubbert_' +
        JSON.parse(readFileSync(join(DEV_DIR, '../plugin/meta.json'), 'utf8')).version,
    ),
  )
) {
  execFileSync('bash', [join(DEV_DIR, 'install-plugin.sh')], { stdio: 'inherit' });
}
compose('up', '-d');
let info = await waitForServer();
console.log(`[OK] Jellyfin ${info.Version} on ${BASE_URL}`);

for (const movie of MOVIES) {
  if (existsSync(join(DEV_DIR, 'data/media/movies', movie, `${movie}.mkv`))) continue;
  mkdirSync(join(DEV_DIR, 'data/media/movies', movie), { recursive: true });
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'jellyfin',
      '/usr/lib/jellyfin-ffmpeg/ffmpeg',
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=5:size=320x180:rate=10',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=5',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-shortest',
      `/media/movies/${movie}/${movie}.mkv`,
    ],
    { cwd: DEV_DIR, stdio: 'inherit' },
  );
  console.log(`[OK] Generated ${movie}`);
}

if (!info.StartupWizardCompleted) {
  const wizard = async (method: string, path: string, json?: unknown) => {
    const res = await anon.request(method, path, { anonymous: true, json });
    if (!res.ok) {
      throw new Error(`${method} ${path} -> HTTP ${res.status} ${JSON.stringify(res.data)}`);
    }
  };
  await wizard('POST', '/Startup/Configuration', {
    UICulture: 'en-US',
    MetadataCountryCode: 'US',
    PreferredMetadataLanguage: 'en',
  });
  await wizard('GET', '/Startup/User');
  await wizard('POST', '/Startup/User', { Name: USER, Password: PASSWORD });
  await wizard('POST', '/Startup/RemoteAccess', { EnableRemoteAccess: true });
  await wizard('POST', '/Startup/Complete');
  info = await waitForServer();
  console.log(`[OK] Startup wizard completed (user ${USER} / password ${PASSWORD})`);
}

function envKey(): string | undefined {
  if (!existsSync(ENV_FILE)) return undefined;
  return /^JELLYFIN_API_KEY=(.+)$/m.exec(readFileSync(ENV_FILE, 'utf8'))?.[1]?.trim();
}

let apiKey = envKey();
if (apiKey && !(await new JellyfinHttp(BASE_URL, apiKey).request('GET', '/System/Info')).ok) {
  apiKey = undefined;
}
if (!apiKey) {
  const login = await fetch(`${BASE_URL}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { Authorization: clientAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: USER, Pw: PASSWORD }),
  });
  if (!login.ok) throw new Error(`Login as ${USER} -> HTTP ${login.status}`);
  const session = new JellyfinHttp(
    BASE_URL,
    ((await login.json()) as { AccessToken: string }).AccessToken,
    CLIENT,
  );
  await session.call('POST', '/Auth/Keys', { query: { app: KEY_APP } });
  const keys = await session.call<{
    Items: Array<{ AccessToken: string; AppName: string; DateCreated: string }>;
  }>('GET', '/Auth/Keys');
  apiKey = keys.Items.filter((k) => k.AppName === KEY_APP).toSorted((a, b) =>
    b.DateCreated.localeCompare(a.DateCreated),
  )[0]?.AccessToken;
  if (!apiKey) throw new Error('API key not found after creating it');
  console.log('[OK] Created API key');
} else {
  console.log('[OK] API key in .env.dev works');
}
mkdirSync(join(DEV_DIR, 'data/app/posters'), { recursive: true });
writeFileSync(
  ENV_FILE,
  `# Dev Jellyfin from dev/compose.yaml; written by npm run dev:up\nJELLYFIN_URL=${BASE_URL}\nJELLYFIN_API_KEY=${apiKey}\nDATA_DIR=dev/data/app\nUI_PASSWORD=dev\n`,
);

const http = new JellyfinHttp(BASE_URL, apiKey, CLIENT);
const folders = await http.call<Array<{ Name: string }>>('GET', '/Library/VirtualFolders');
if (!folders.some((f) => f.Name === 'Movies')) {
  await http.call('POST', '/Library/VirtualFolders', {
    query: {
      name: 'Movies',
      collectionType: 'movies',
      paths: ['/media/movies'],
      refreshLibrary: true,
    },
    json: {
      LibraryOptions: { TypeOptions: [{ Type: 'Movie', MetadataFetchers: [], ImageFetchers: [] }] },
    },
  });
  console.log('[OK] Created library Movies at /media/movies');
}
let count = 0;
for (let i = 0; i < 60 && count < MOVIES.length; i++) {
  const res = await http.call<{ TotalRecordCount: number }>('GET', '/Items', {
    query: { includeItemTypes: ['Movie'], recursive: true, limit: 0, enableTotalRecordCount: true },
  });
  count = res.TotalRecordCount;
  if (count < MOVIES.length) await new Promise((r) => setTimeout(r, 1000));
}
console.log(
  `[${count >= MOVIES.length ? 'OK' : 'WARN'}] ${count} of ${MOVIES.length} movies in the library`,
);

console.log(`
Ready: ${BASE_URL} (user ${USER} / password ${PASSWORD})
  API key: ${apiKey}

  npm run dev             the app (UI on http://localhost:5173, password dev), data in dev/data/app;
                          set up the Categories library in Settings with folder /media/categories
  npm run dev:onboarding  the app from scratch, to test onboarding with the API key above
  npm run dev:plugin      rebuild + reinstall the plugin, restart Jellyfin
  npm run dev:fresh       delete everything and start over`);
