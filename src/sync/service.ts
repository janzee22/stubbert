import type { Config } from '../config/schema.js';
import type { DataDir } from '../data.js';
import type { JellyfinClient } from '../jellyfin/client.js';
import type { Logger } from '../log.js';
import { setupCategories, type SetupOptions, type SetupResult } from '../jellyfin/setup.js';
import { deleteManagedCollection, type ManagedCollection } from './collections.js';
import { sync, type SyncDeps } from './engine.js';
import { toReport, type SyncReport } from './report.js';
import { finalStatus, type RunRecord, type RunStore, type RunTrigger } from './run-store.js';

export class BusyError extends Error {}

const BUSY_RETRY_MS = 60_000;
const NEW_ITEMS_DELAY_MS = 2 * 60_000;

export interface SyncContext {
  data: DataDir;
  client: JellyfinClient;
  runs: RunStore;
}

export class SyncService {
  #busy?: string;
  #running?: RunRecord;
  #done: Promise<void> = Promise.resolve();
  #schedule?: Config['schedule'];
  #timer?: NodeJS.Timeout;
  #newItemsTimer?: NodeJS.Timeout;
  newItemsDelayMs = NEW_ITEMS_DELAY_MS;
  #nextRunAt?: Date;
  #stopped = false;

  constructor(
    readonly ctx: SyncContext,
    readonly log: Logger = console,
  ) {}

  get running(): RunRecord | undefined {
    return this.#running;
  }

  get nextRunAt(): Date | undefined {
    return this.#nextRunAt;
  }

  get schedule(): Config['schedule'] | undefined {
    return this.#schedule;
  }

  preview(force = false): Promise<SyncReport> {
    return this.#exclusive('a preview is running', async () => {
      const config = await this.ctx.data.requireConfig();
      return toReport(await sync(config, this.#deps(), { apply: false, force }));
    });
  }

  startApply(trigger: RunTrigger, force = false): Promise<RunRecord> {
    this.#enter('a sync is running');
    return new Promise<RunRecord>((resolve, reject) => {
      let started = false;
      this.#done = this.#apply(trigger, force, (run) => {
        started = true;
        this.#running = run;
        this.log.info(`Sync ${run.id} started (${trigger}${force ? ', force' : ''})`);
        resolve(run);
      })
        .then((run) => {
          const msg = `Sync ${run.id} finished: ${run.status}${run.error ? ` (${run.error})` : ''}`;
          if (run.status === 'failed') this.log.error(msg);
          else this.log.info(msg);
        })
        .catch((err: Error) => {
          if (started) this.log.error(`Sync failed: ${err.message}`);
          else reject(err);
        })
        .finally(() => {
          this.#running = undefined;
          this.#busy = undefined;
          if (started) this.#arm();
        });
    });
  }

  deleteCollection(categoryId: string): Promise<ManagedCollection> {
    return this.#exclusive('a collection is being deleted', () =>
      deleteManagedCollection(this.ctx, categoryId),
    );
  }

  setup(options: SetupOptions): Promise<SetupResult> {
    return this.#exclusive('the Categories library is being set up', () =>
      setupCategories(this.ctx.client, options),
    );
  }

  async syncOnStart(): Promise<RunRecord | undefined> {
    if (!this.#schedule?.enabled || !this.#schedule.syncOnStart) return undefined;
    return this.startApply('startup').catch((err: Error) => {
      this.log.warn(`Startup sync not started: ${err.message}`);
      return undefined;
    });
  }

  newItemsArrived(delayMs = this.newItemsDelayMs) {
    const schedule = this.#schedule;
    if (this.#stopped || !schedule?.enabled || !schedule.syncOnNewItems) return;
    clearTimeout(this.#newItemsTimer);
    this.#newItemsTimer = setTimeout(() => {
      this.#newItemsTimer = undefined;
      if (this.#busy) {
        this.log.info(`Sync for new items postponed: ${this.#busy}`);
        this.newItemsArrived(BUSY_RETRY_MS);
        return;
      }
      this.startApply('webhook').catch((err: Error) => {
        this.log.warn(`Sync for new items postponed: ${err.message}`);
        this.newItemsArrived(BUSY_RETRY_MS);
      });
    }, delayMs);
  }

  get newItemsPending(): boolean {
    return !!this.#newItemsTimer;
  }

  setSchedule(schedule: Config['schedule'] | undefined) {
    this.#schedule = schedule;
    this.#arm();
  }

  idle(): Promise<void> {
    return this.#done;
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    clearTimeout(this.#newItemsTimer);
    this.#newItemsTimer = undefined;
    this.#arm();
    await this.#done;
  }

  #enter(what: string) {
    if (this.#busy) throw new BusyError(`Busy: ${this.#busy}. Try again when it has finished.`);
    this.#busy = what;
  }

  async #exclusive<T>(what: string, task: () => Promise<T>): Promise<T> {
    this.#enter(what);
    try {
      return await task();
    } finally {
      this.#busy = undefined;
    }
  }

  #deps(log?: (line: string) => void): SyncDeps {
    const { data, client } = this.ctx;
    return {
      client,
      readPoster: (file) => data.readPoster(file),
      loadState: () => data.loadState(),
      saveState: (state) => data.saveState(state),
      log,
    };
  }

  async #apply(
    trigger: RunTrigger,
    force: boolean,
    onStart: (run: RunRecord) => void,
  ): Promise<RunRecord> {
    const { runs, data } = this.ctx;
    const run: RunRecord = {
      id: runs.newId(),
      trigger,
      force,
      startedAt: new Date().toISOString(),
      status: 'running',
      log: [],
    };
    await runs.save(run);
    onStart(run);
    const log = (line: string) => {
      run.log.push(line);
      this.log.info(`  ${line}`);
    };
    try {
      const result = await sync(await data.requireConfig(), this.#deps(log), {
        apply: true,
        force,
      });
      run.report = toReport(result);
    } catch (err) {
      run.error = (err as Error).message;
    }
    run.status = finalStatus(run.report, run.error);
    run.finishedAt = new Date().toISOString();
    await runs.save(run);
    return run;
  }

  #arm(delayMs?: number) {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#nextRunAt = undefined;
    if (this.#stopped || !this.#schedule?.enabled) return;
    const ms = delayMs ?? this.#schedule.intervalMinutes * 60_000;
    this.#nextRunAt = new Date(Date.now() + ms);
    this.#timer = setTimeout(() => this.#fire(), ms);
  }

  #fire() {
    if (this.#busy) {
      this.log.warn(`Scheduled sync postponed: ${this.#busy}`);
      this.#arm(BUSY_RETRY_MS);
      return;
    }
    this.startApply('schedule').catch((err: Error) => {
      this.log.warn(`Scheduled sync postponed: ${err.message}`);
      this.#arm(BUSY_RETRY_MS);
    });
  }
}
