import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { SyncState } from './core/planner.js';
import type { Config } from './config/schema.js';
import { ConfigError, parseConfig, type ParseResult } from './config/validate.js';
import { isPosterName, POSTER_NAME_RULE } from './posters.js';
import type { Poster } from './shared/api.js';

export interface SavedSettings {
  jellyfinUrl?: string;
  jellyfinApiKey?: string;
  passwordHash?: string;
}

async function writeAtomic(path: string, data: string | Uint8Array, mode?: number) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, data, { mode });
  await rename(`${path}.tmp`, path);
}

export class DataDir {
  constructor(readonly root = process.env.DATA_DIR ?? 'data') {}

  get configPath() {
    return join(this.root, 'config.yaml');
  }

  get statePath() {
    return join(this.root, 'state.json');
  }

  get postersDir() {
    return join(this.root, 'posters');
  }

  get runsDir() {
    return join(this.root, 'runs');
  }

  get notificationsDir() {
    return join(this.root, 'notifications');
  }

  get settingsPath() {
    return join(this.root, 'settings.json');
  }

  async loadSettings(): Promise<SavedSettings> {
    let text: string;
    try {
      text = await readFile(this.settingsPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw new Error(`cannot read ${this.settingsPath}: ${(err as Error).message}`, {
        cause: err,
      });
    }
    try {
      return JSON.parse(text) as SavedSettings;
    } catch (err) {
      throw new Error(`${this.settingsPath} is not valid JSON: ${(err as Error).message}`, {
        cause: err,
      });
    }
  }

  async saveSettings(changes: SavedSettings): Promise<void> {
    const next = { ...(await this.loadSettings()), ...changes };
    await writeAtomic(this.settingsPath, `${JSON.stringify(next, null, 2)}\n`, 0o600);
  }

  async readRawConfig(): Promise<unknown> {
    let text: string;
    try {
      text = await readFile(this.configPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new Error(`cannot read ${this.configPath}: ${(err as Error).message}`, { cause: err });
    }
    try {
      return parse(text, { maxAliasCount: 100 });
    } catch (err) {
      throw new Error(`${this.configPath} is not valid YAML: ${(err as Error).message}`, {
        cause: err,
      });
    }
  }

  async loadConfig(): Promise<ParseResult> {
    let raw: unknown;
    try {
      raw = await this.readRawConfig();
    } catch (err) {
      return { ok: false, issues: [{ path: '', message: (err as Error).message }] };
    }
    if (raw === undefined) {
      return { ok: false, issues: [{ path: '', message: `${this.configPath} does not exist` }] };
    }
    return parseConfig(raw);
  }

  async requireConfig(): Promise<Config> {
    const res = await this.loadConfig();
    if (!res.ok) throw new ConfigError(res.issues);
    return res.config;
  }

  async writeConfig(raw: unknown): Promise<void> {
    await writeAtomic(this.configPath, stringify(raw, { lineWidth: 0 }));
  }

  async loadState(): Promise<SyncState> {
    try {
      const data = JSON.parse(await readFile(this.statePath, 'utf8')) as { categories?: SyncState };
      return data.categories ?? {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw new Error(`cannot read ${this.statePath}: ${(err as Error).message}`, { cause: err });
    }
  }

  async saveState(state: SyncState): Promise<void> {
    await writeAtomic(
      this.statePath,
      `${JSON.stringify({ version: 1, categories: state }, null, 2)}\n`,
    );
  }

  #posterPath(file: string): string {
    if (!isPosterName(file)) throw new Error(`"${file}" is not ${POSTER_NAME_RULE}`);
    return join(this.postersDir, file);
  }

  readPoster(file: string): Promise<Uint8Array> {
    return readFile(this.#posterPath(file));
  }

  async writePoster(file: string, bytes: Uint8Array): Promise<void> {
    const path = this.#posterPath(file);
    await writeAtomic(path, bytes);
  }

  async deletePoster(file: string): Promise<boolean> {
    try {
      await unlink(this.#posterPath(file));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  async listPosters(): Promise<Poster[]> {
    let files: string[];
    try {
      files = await readdir(this.postersDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const out: Poster[] = [];
    for (const file of files.filter(isPosterName).toSorted()) {
      const s = await stat(join(this.postersDir, file));
      if (s.isFile()) out.push({ file, size: s.size, modified: s.mtime.toISOString() });
    }
    return out;
  }
}
