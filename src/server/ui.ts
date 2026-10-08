import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

export interface UiFile {
  type: string;
  body: Buffer;
  immutable: boolean;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.woff': 'font/woff',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

export async function loadUi(dir: string): Promise<Map<string, UiFile> | undefined> {
  let entries: string[];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const files = new Map<string, UiFile>();
  for (const entry of entries) {
    const type = TYPES[extname(entry).toLowerCase()];
    if (!type) continue;
    const path = `/${relative(dir, join(dir, entry)).split(sep).join('/')}`;
    files.set(path, {
      type,
      body: await readFile(join(dir, entry)),
      immutable: path.startsWith('/assets/'),
    });
  }
  return files.has('/index.html') ? files : undefined;
}
