# Using Stubbert

## Onboarding

Open `http://<host>:8080`. The first visit walks you through four steps:

1. **Choose a password** for the web UI. Until you do, anyone who can open the page could choose it, so do this
   right after starting the container (or set `UI_PASSWORD`, see [Environment](configuration.md#environment)).
2. **Connect Jellyfin:** the server address as this app reaches it (from inside Docker, `localhost` is the
   container itself; use the host's IP or the Jellyfin container's name) and an API key from jellyfin-web →
   **Dashboard → API Keys → +**. The key is tested before it is saved. It stays on the server: the browser never
   sees it again, and it is never logged.
3. **Check the plugin:** it must show as active.
4. **Create the Categories library.** jellyfin-web can't create the library type this needs (`boxsets`), so the app
   does. **Check** lists what it will do without changing anything; **Create** does it:
   - creates the folder `categories` in Jellyfin's data folder (for example `/config/data/categories` in the
     official Docker image), so a backup of Jellyfin's data includes your categories. To use another folder, enter
     it as Jellyfin sees it; it must already exist.
   - creates the library and turns off online metadata for its collections. Without that, Jellyfin would
     "identify" a category such as "Horror" as some unrelated film collection and overwrite its poster.
   - points the plugin at the library, and saves the library in the app's config.

   An existing library with the same name is reused, never deleted. If it has another type, delete it in
   jellyfin-web first.

You land on the Categories page and can add categories. Everything from onboarding can be changed later in
**Settings**. **Back** returns to an earlier step (the password is changed in Settings).

If Jellyfin later can't be used (unreachable, the key is rejected, the plugin or the library is gone, for example
after reinstalling Jellyfin), a bar at the top says so, with **Run setup again**. That repeats the Jellyfin, plugin
and library steps and keeps your categories; collections that no longer exist are created again on the next sync.
Settings has the same button.

> The Categories tile shows up in the apps after the first sync, once the library contains a collection. Every sync
> that changes something asks Jellyfin to refresh the Categories library, so no manual library scan is needed.

## Using the UI

- **Categories:** the tree of categories as a list or as a **poster wall**. Select one to edit:
  - name, sort name, overview and poster (upload PNG, JPEG or WebP; 2:3, e.g. 1000 × 1500)
  - movies, series or both
  - **rules**: genre, studio, tag or title. Genre, studio and tag values come from your library with item counts.
    A value no item has is shown dashed with a 0, which is usually a typo, because matching is exact.
  - the **live match count** and the matching titles
  - sub-categories, which show up as collections inside their parent
- **Preview & sync:** what a sync would change, per category, with the titles added and removed. Nothing is
  written until you press **Sync**.
- **Runs:** every sync that could write (scheduled, at startup, or from the UI), with its changes and log.
- **Notifications:** Discord messages for new movies and episodes, and their templates. See
  [Discord notifications](notifications.md).
- **Settings:** connection checks, the Jellyfin address and API key, the Categories library and its setup, the
  schedule, and the password.

Edits on Categories, Notifications and Settings form one draft. The bar at the bottom saves it; it stays disabled while the
server reports problems. Saving rewrites `config.yaml`, so comments in a hand-written file are lost.

**Removing** a category from the config never deletes anything in Jellyfin: its collection stays. To delete a
collection, use **Delete collection in Jellyfin…** in the editor and type the category id to confirm. Its movies
and series are not touched.

### Safety guards

A sync skips the membership changes of a category whose item count drops to 0, or by more than half, and reports a
warning. This protects against a bad fetch or a broken rule emptying a collection. If the change is intended, tick
**Ignore safety guards** on the Preview page. A sync is also aborted entirely if
Jellyfin returned fewer items than it reported.

Scheduled and startup syncs always keep the guards on.

## Known limits

- **Search, "Latest" and suggestions still show categories.** The plugin only filters library and collection
  listings. The same goes for Jellyfin's "group movies into collections" option.
- **Renaming a category renames the collection, not its folder.** A new category with the old name can't be created
  until the old `<name> [boxset]` folder is gone from the Categories library folder.
- **Saving from the UI drops comments** from a hand-written `config.yaml`.
