import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { totals, type ReportTotals, type SyncReport } from './report.js';

export type RunTrigger = 'schedule' | 'startup' | 'manual' | 'webhook';
export type RunStatus = 'running' | 'ok' | 'warnings' | 'failed';

export interface RunRecord {
  id: string;
  trigger: RunTrigger;
  force: boolean;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  log: string[];
  report?: SyncReport;
  error?: string;
}

export interface RunSummary extends Omit<RunRecord, 'log' | 'report'> {
  totals?: ReportTotals;
  warnings: number;
  errors: number;
}

export function summarize(run: RunRecord): RunSummary {
  const { log: _log, report, ...rest } = run;
  return {
    ...rest,
    totals: report && totals(report),
    warnings: report?.warnings.length ?? 0,
    errors: (report?.errors.length ?? 0) + (run.error ? 1 : 0),
  };
}

export function finalStatus(report: SyncReport | undefined, error: string | undefined): RunStatus {
  if (error || !report || report.errors.length) return 'failed';
  return report.warnings.length ? 'warnings' : 'ok';
}

const ID = /^\d{8}T\d{6}Z-[0-9a-f]{6}$/;

export class RunStore {
  constructor(
    readonly dir: string,
    readonly keep = 50,
  ) {}

  newId(now = new Date()): string {
    return `${now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;
  }

  async save(run: RunRecord): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const path = join(this.dir, `${run.id}.json`);
    await writeFile(`${path}.tmp`, JSON.stringify(run));
    await rename(`${path}.tmp`, path);
    await this.#prune();
  }

  async get(id: string): Promise<RunRecord | undefined> {
    if (!ID.test(id)) return undefined;
    try {
      return JSON.parse(await readFile(join(this.dir, `${id}.json`), 'utf8')) as RunRecord;
    } catch {
      return undefined;
    }
  }

  async list(): Promise<RunRecord[]> {
    const runs = await Promise.all((await this.#ids()).map((id) => this.get(id)));
    return runs.filter((r): r is RunRecord => !!r);
  }

  async #ids(): Promise<string[]> {
    try {
      return (await readdir(this.dir))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .filter((id) => ID.test(id))
        .toSorted()
        .toReversed();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  async #prune() {
    for (const id of (await this.#ids()).slice(this.keep)) {
      await unlink(join(this.dir, `${id}.json`)).catch(() => {});
    }
  }
}
