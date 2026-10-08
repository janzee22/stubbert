import { normId } from '../shared/ids.js';
import type { JellyfinClient } from './client.js';
import { JellyfinHttpError } from './http.js';
import { boxSetFetchers, withoutBoxSetFetchers } from './library-options.js';

export interface SetupOptions {
  name?: string;
  path?: string;
  apply: boolean;
}

interface SetupStep {
  status: 'ok' | 'plan';
  text: string;
}

export interface SetupResult {
  steps: SetupStep[];
  libraryId: string | null;
  folder: string | null;
}

export class SetupError extends Error {}

export async function setupCategories(
  client: JellyfinClient,
  { name = 'Categories', path, apply }: SetupOptions,
): Promise<SetupResult> {
  const steps: SetupStep[] = [];
  const ok = (text: string) => steps.push({ status: 'ok', text });
  const plan = (text: string) => steps.push({ status: 'plan', text });

  const plugin = await client.categoryPlugin();
  if (!plugin || plugin.Status !== 'Active') {
    throw new SetupError(
      `The Stubbert plugin is ${plugin ? plugin.Status : 'not installed'}. Install plugin/dist/*.zip and restart Jellyfin.`,
    );
  }
  ok(`Plugin ${plugin.Name} ${plugin.Version} is active`);

  const find = async () => (await client.virtualFolders()).find((f) => f.Name === name);
  let library = await find();
  if (library && library.CollectionType !== 'boxsets') {
    throw new SetupError(
      `Library "${library.Name}" exists with type ${library.CollectionType ?? 'mixed'}, and a library's type cannot be changed. ` +
        'Delete it in jellyfin-web (Dashboard > Libraries), then try again.',
    );
  }
  let folder = library?.Locations?.[0] ?? null;
  if (library) {
    ok(`Library "${library.Name}" (boxsets) exists at ${(library.Locations ?? []).join(', ')}`);
  } else {
    folder = path?.trim() || null;
    if (!folder) {
      const fallback = await defaultFolder(client);
      folder = fallback.Path;
      if (fallback.Exists) ok(`Folder ${folder} exists`);
      else if (!apply) plan(`Create folder ${folder} (in Jellyfin's data folder)`);
      else {
        await client.createCategoriesFolder();
        ok(`Created folder ${folder}`);
      }
    }
    if (!apply) {
      plan(`Create library "${name}" of type boxsets at ${folder}`);
    } else {
      await client.createLibrary(name, 'boxsets', folder, withoutBoxSetFetchers({}));
      library = await find();
      if (!library) {
        throw new SetupError(
          `Jellyfin accepted the new library "${name}" but does not list it. Jellyfin itself has a problem (for example ` +
            'it cannot write its database or the folder); check the Jellyfin log.',
        );
      }
      ok(`Created library "${library.Name}" (boxsets) at ${folder}`);
    }
  }

  if (library) {
    const fetchers = boxSetFetchers(library.LibraryOptions);
    if (fetchers.length === 0) {
      ok('No remote metadata or image fetchers for collections');
    } else if (!apply) {
      plan(`Turn off remote fetchers for collections (now ${fetchers.join(', ')})`);
    } else {
      await client.setLibraryOptions(library.ItemId, withoutBoxSetFetchers(library.LibraryOptions));
      ok(`Turned off remote fetchers for collections (were ${fetchers.join(', ')})`);
    }
  }

  const config = await client.pluginConfiguration();
  if (library && normId(config.CategoriesLibraryId) === normId(library.ItemId)) {
    ok('Plugin already uses this library');
  } else if (!apply || !library) {
    plan(`Point the plugin at library "${name}"`);
  } else {
    await client.setPluginConfiguration({ ...config, CategoriesLibraryId: library.ItemId });
    ok(`Pointed the plugin at library "${name}"`);
  }

  return { steps, libraryId: library?.ItemId ?? null, folder };
}

async function defaultFolder(client: JellyfinClient) {
  try {
    return await client.categoriesFolder();
  } catch (err) {
    if (err instanceof JellyfinHttpError && err.response.status === 404) {
      throw new SetupError(
        'The plugin is older than 0.2 and cannot create the folder. Update the plugin, or enter a folder that exists.',
      );
    }
    throw err;
  }
}
