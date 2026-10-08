import type { Config } from '../config/schema.js';
import type { JellyfinClient } from '../jellyfin/client.js';
import { normId } from '../shared/ids.js';
import { boxSetFetchers } from '../jellyfin/library-options.js';

export class PreflightError extends Error {}

export async function preflight(client: JellyfinClient, config: Config): Promise<void> {
  const plugin = await client.categoryPlugin();
  if (!plugin) {
    throw new PreflightError('The Stubbert plugin is not installed. See plugin/pack.sh.');
  }
  if (plugin.Status !== 'Active') {
    throw new PreflightError(`The Stubbert plugin is ${plugin.Status}, not Active.`);
  }

  const library = (await client.virtualFolders()).find(
    (f) => normId(f.ItemId) === normId(config.categoriesLibraryId),
  );
  if (!library) {
    throw new PreflightError(
      `No library with id ${config.categoriesLibraryId} (categoriesLibraryId). Pick the library in Settings.`,
    );
  }
  if (library.CollectionType !== 'boxsets') {
    throw new PreflightError(
      `Library "${library.Name}" has type ${library.CollectionType ?? 'mixed'}, not boxsets. Run the setup in Settings.`,
    );
  }

  const fetchers = boxSetFetchers(library.LibraryOptions);
  if (fetchers.length) {
    throw new PreflightError(
      `Library "${library.Name}" fetches remote metadata for collections (${fetchers.join(', ')}), which overwrites categories. Run the setup in Settings.`,
    );
  }

  const pluginLibrary = (await client.pluginConfiguration()).CategoriesLibraryId;
  if (normId(pluginLibrary) !== normId(config.categoriesLibraryId)) {
    throw new PreflightError(
      `The plugin is configured for library "${pluginLibrary ?? ''}", the config for ${config.categoriesLibraryId}. Run the setup in Settings.`,
    );
  }
}
