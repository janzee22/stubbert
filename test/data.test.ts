import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataDir } from '../src/data.js';

let parent: string;
let data: DataDir;

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'stubbert-data-'));
  data = new DataDir(join(parent, 'missing', 'data'));
});

afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

describe('DataDir writes into a folder that does not exist (yet or anymore)', () => {
  it('saves settings', async () => {
    await data.saveSettings({ jellyfinUrl: 'http://jellyfin:8096' });
    expect(JSON.parse(await readFile(data.settingsPath, 'utf8'))).toEqual({
      jellyfinUrl: 'http://jellyfin:8096',
    });
  });

  it('saves state', async () => {
    await data.saveState({ horror: { boxSetId: 'abc' } });
    expect(await data.loadState()).toEqual({ horror: { boxSetId: 'abc' } });
  });
});
