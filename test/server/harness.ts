import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, expect } from 'vitest';
import { DataDir } from '../../src/data.js';
import { JellyfinClient } from '../../src/jellyfin/client.js';
import { JellyfinHttp } from '../../src/jellyfin/http.js';
import { buildApp } from '../../src/server/app.js';
import { Auth, hashPassword } from '../../src/server/auth.js';
import { RunStore, type RunRecord } from '../../src/sync/run-store.js';
import { SyncService } from '../../src/sync/service.js';
import { CATEGORIES_LIBRARY_ID, FakeJellyfin } from '../fake-jellyfin.js';

export const API_KEY = 'secret-api-key-0123456789';
export const PASSWORD = 'correct horse';
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

export const config = {
  categoriesLibraryId: CATEGORIES_LIBRARY_ID,
  schedule: { enabled: false, intervalMinutes: 60 },
  categories: [
    {
      id: 'disney',
      name: 'Disney',
      rules: [{ type: 'studio', values: ['Walt Disney Pictures'] }],
      children: [{ id: 'pixar', name: 'Pixar', rules: [{ type: 'studio', values: ['Pixar'] }] }],
    },
    { id: 'horror', name: 'Horror', rules: [{ type: 'genre', values: ['Horror'] }] },
  ],
};

interface Harness {
  fake: FakeJellyfin;
  dir: string;
  data: DataDir;
  service: SyncService;
  app: FastifyInstance;
  cookie: string;
  logs: string[];
}

export const h = { logs: [] as string[] } as Harness;
const bodies: string[] = [];

export async function call(
  opts: InjectOptions & { auth?: boolean },
): Promise<LightMyRequestResponse> {
  const { auth = true, ...rest } = opts;
  const headers = { ...rest.headers, ...(auth && h.cookie ? { cookie: h.cookie } : {}) };
  const res = await h.app.inject({ ...rest, headers });
  bodies.push(res.body);
  return res;
}

export const get = (url: string, auth = true) => call({ method: 'GET', url, auth });
export const post = (url: string, payload: unknown = {}, auth = true) =>
  call({ method: 'POST', url, payload: payload as object, auth });

export async function finishedRun(id: string): Promise<RunRecord> {
  await h.service.idle();
  return (await get(`/api/runs/${id}`)).json();
}

export function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

beforeEach(async () => {
  h.fake = new FakeJellyfin();
  h.fake.addMedia('Movie', 'Frozen', { studios: ['Walt Disney Pictures'] });
  h.fake.addMedia('Movie', 'Toy Story', { studios: ['Pixar'] });
  h.fake.addMedia('Movie', 'Halloween', { Genres: ['Horror'] });
  await h.fake.start();
  h.dir = await mkdtemp(join(tmpdir(), 'stubbert-server-'));
  h.data = new DataDir(h.dir);
  await h.data.writeConfig(config);
  const client = new JellyfinClient(new JellyfinHttp(h.fake.url, API_KEY), {
    attempts: 2,
    baseDelayMs: 0,
  });
  h.logs.length = 0;
  const log = {
    info: (m: string) => h.logs.push(m),
    warn: (m: string) => h.logs.push(m),
    error: (m: string) => h.logs.push(m),
  };
  h.service = new SyncService({ data: h.data, client, runs: new RunStore(h.data.runsDir) }, log);
  h.app = buildApp({ service: h.service, auth: new Auth(hashPassword(PASSWORD)) });
  h.cookie = '';
  const login = await post('/api/login', { password: PASSWORD }, false);
  h.cookie = String(login.headers['set-cookie']).split(';')[0]!;
});

afterEach(async () => {
  await h.service.stop();
  await h.app.close();
  expect(h.fake.violations).toEqual([]);
  await h.fake.stop();
  await rm(h.dir, { recursive: true, force: true });
  for (const body of bodies.splice(0)) expect(body).not.toContain(API_KEY);
});
