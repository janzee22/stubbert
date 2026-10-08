import type { DataDir } from '../data.js';
import type { JellyfinClient } from '../jellyfin/client.js';

export class NotManagedError extends Error {}

export interface ManagedCollection {
  categoryId: string;
  boxSetId: string;
  name: string;
  memberCount: number;
}

interface Deps {
  data: DataDir;
  client: JellyfinClient;
}

export async function managedCollection(
  { data, client }: Deps,
  categoryId: string,
): Promise<ManagedCollection> {
  const entry = (await data.loadState())[categoryId];
  if (!entry) {
    throw new NotManagedError(
      `"${categoryId}" is not in the state file. Only collections created or adopted by sync can be deleted.`,
    );
  }
  const [item, members] = await Promise.all([
    client.getItem(entry.boxSetId),
    client.members(entry.boxSetId),
  ]);
  return { categoryId, boxSetId: entry.boxSetId, name: item.Name, memberCount: members.length };
}

export async function deleteManagedCollection(
  deps: Deps,
  categoryId: string,
): Promise<ManagedCollection> {
  const collection = await managedCollection(deps, categoryId);
  await deps.client.deleteItem(collection.boxSetId);
  const state = await deps.data.loadState();
  delete state[categoryId];
  await deps.data.saveState(state);
  return collection;
}
