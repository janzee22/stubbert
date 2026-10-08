import { BusyError } from '../../src/sync/service.js';
import { type RunSummary } from '../../src/sync/run-store.js';
import { finishedRun, get, h, post } from './harness.js';
import { describe, expect, it } from 'vitest';

describe('sync', () => {
  it('preview shows titles and writes nothing', async () => {
    const res = await post('/api/sync/preview');
    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.applied).toBe(false);
    expect(
      report.categories.map((c: { name: string; status: string }) => [c.name, c.status]),
    ).toEqual([
      ['Pixar', 'create'],
      ['Disney', 'create'],
      ['Horror', 'create'],
    ]);
    const disney = report.categories[1];
    expect(disney.add).toEqual([
      { id: 'pixar', name: 'Pixar', type: 'Category' },
      { id: expect.any(String), name: 'Frozen', type: 'Movie' },
    ]);
    expect(h.fake.writes()).toEqual([]);
    expect(await h.service.ctx.runs.list()).toEqual([]);
  });

  it('runs a sync in the background and logs it', async () => {
    const started = await post('/api/sync');
    expect(started.statusCode).toBe(202);
    const summary: RunSummary = started.json();
    expect(summary).toMatchObject({ trigger: 'manual', status: 'running' });

    const run = await finishedRun(summary.id);
    expect(run.status).toBe('ok');
    expect(run.log).toContain('Created "Disney"');
    expect(run.report!.categories.every((c) => c.status === 'create')).toBe(true);
    expect(
      h.fake
        .categories()
        .map((c) => c.Name)
        .toSorted(),
    ).toEqual(['Disney', 'Horror', 'Pixar']);

    const status = (await get('/api/status')).json();
    expect(status).toMatchObject({
      running: null,
      lastRun: { id: summary.id, status: 'ok', totals: { created: 3 } },
      nextRunAt: null,
    });
    expect((await get('/api/runs')).json()).toHaveLength(1);

    const again = (await post('/api/sync/preview')).json();
    expect(again.categories.every((c: { status: string }) => c.status === 'ok')).toBe(true);
  });

  it('runs one operation at a time', async () => {
    const first = h.service.startApply('manual');
    await expect(h.service.preview()).rejects.toThrow(BusyError);
    expect(() => h.service.startApply('manual')).toThrow(BusyError);
    await first;
    await h.service.idle();
  });

  it('answers 409 while a sync is running', async () => {
    await h.service.startApply('manual');
    const res = await post('/api/sync');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'busy' });
    await h.service.idle();
  });

  it('records a failed preflight as a failed run', async () => {
    h.fake.pluginInstalled = false;
    expect((await post('/api/sync/preview')).json()).toMatchObject({ code: 'preflight' });
    const run = await finishedRun((await post('/api/sync')).json().id);
    expect(run).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('not installed'),
    });
  });

  it('shows a run cut off by a restart as failed', async () => {
    const runs = h.service.ctx.runs;
    const id = runs.newId();
    await runs.save({
      id,
      trigger: 'manual',
      force: false,
      startedAt: new Date().toISOString(),
      status: 'running',
      log: [],
    });
    expect((await get(`/api/runs/${id}`)).json()).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Interrupted'),
    });
  });
});

describe('scheduler', () => {
  it('applies on the interval, then waits another interval', async () => {
    h.service.setSchedule({
      enabled: true,
      intervalMinutes: 0.0005,
      syncOnStart: false,
      syncOnNewItems: false,
    });
    for (let i = 0; i < 100 && !h.service.running; i++) await new Promise((r) => setTimeout(r, 10));
    const run = h.service.running!;
    expect(run.trigger).toBe('schedule');
    await h.service.idle();
    expect(h.service.nextRunAt).toBeDefined();
    h.service.setSchedule({
      enabled: false,
      intervalMinutes: 60,
      syncOnStart: false,
      syncOnNewItems: false,
    });
    expect(h.service.nextRunAt).toBeUndefined();
    expect((await h.service.ctx.runs.get(run.id))!.status).toBe('ok');
  });

  it('postpones a scheduled run while another operation is busy', async () => {
    const preview = h.service.preview();
    h.service.setSchedule({
      enabled: true,
      intervalMinutes: 0,
      syncOnStart: false,
      syncOnNewItems: false,
    });
    await preview;
    expect(h.logs.some((l) => l.includes('postponed'))).toBe(true);
    expect(h.service.nextRunAt!.getTime() - Date.now()).toBeGreaterThan(50_000);
    expect(h.fake.writes()).toEqual([]);
  });

  it('syncs at startup only when syncOnStart and the schedule are on', async () => {
    h.service.setSchedule({
      enabled: false,
      intervalMinutes: 60,
      syncOnStart: true,
      syncOnNewItems: false,
    });
    expect(await h.service.syncOnStart()).toBeUndefined();

    h.service.setSchedule({
      enabled: true,
      intervalMinutes: 60,
      syncOnStart: true,
      syncOnNewItems: false,
    });
    const run = (await h.service.syncOnStart())!;
    expect(run.trigger).toBe('startup');
    await h.service.idle();
    expect((await h.service.ctx.runs.get(run.id))!.status).toBe('ok');
    expect(h.service.nextRunAt!.getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
  });
});

describe('sync on new items', () => {
  it('syncs once, a while after the last new item', async () => {
    h.service.setSchedule({
      enabled: true,
      intervalMinutes: 60,
      syncOnStart: false,
      syncOnNewItems: true,
    });
    h.service.newItemsDelayMs = 30;
    h.service.newItemsArrived();
    await new Promise((r) => setTimeout(r, 15));
    h.service.newItemsArrived();
    expect(h.service.newItemsPending).toBe(true);
    for (let i = 0; i < 100 && !h.service.running; i++) await new Promise((r) => setTimeout(r, 5));
    expect(h.service.running?.trigger).toBe('webhook');
    await h.service.idle();
    expect(h.service.newItemsPending).toBe(false);
    expect((await h.service.ctx.runs.list()).filter((r) => r.trigger === 'webhook')).toHaveLength(
      1,
    );
  });

  it('does nothing when it or the schedule is off', () => {
    h.service.setSchedule({
      enabled: true,
      intervalMinutes: 60,
      syncOnStart: false,
      syncOnNewItems: false,
    });
    h.service.newItemsArrived();
    expect(h.service.newItemsPending).toBe(false);
    h.service.setSchedule({
      enabled: false,
      intervalMinutes: 60,
      syncOnStart: false,
      syncOnNewItems: true,
    });
    h.service.newItemsArrived();
    expect(h.service.newItemsPending).toBe(false);
  });
});
