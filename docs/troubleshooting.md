# Troubleshooting

| Symptom | Cause and fix |
|---|---|
| *The Stubbert plugin is not installed* / *not Active* | Check Dashboard → Plugins. The plugin folder must contain the `.dll` and `meta.json`. Restart Jellyfin after copying. A Jellyfin version other than 12.1 needs a rebuild. |
| *Library … has type …, not boxsets* | The library was created in jellyfin-web. Delete it there and run the setup in Settings. |
| *… fetches remote metadata for collections* | Run the setup in Settings again: it turns the fetchers off. |
| *The plugin is configured for library …* | The plugin and `config.yaml` point at different libraries. Pick the plugin's library in Settings, or run the setup. |
| No Categories tile in the apps | It appears once the library holds at least one collection. Run a sync. |
| Creating a category fails: folder already exists | A category was renamed: that renames the collection, not its folder. A new category with the old name then collides. Delete the old `Name [boxset]` folder (or its collection) first. |
| *Cannot write to …* | Jellyfin needs write access to the Categories folder. |
| A category shows up in search or "Latest" | Known limit: the plugin only filters library and collection listings. |
| *Busy: a sync is running* | One operation runs at a time. Wait for it to finish; a scheduled sync that hits this tries again a minute later. |
| Logged out after an update | Sessions are kept in memory. Log in again. |
| Forgot the password | Stop the container, remove `passwordHash` from `data/settings.json` (or set `UI_PASSWORD`), start it, and choose a new one. |
| *Cannot reach Jellyfin at …* | The address is resolved inside this app's container. Use the host's IP, or put both containers on one Docker network and use the Jellyfin container's name. |
| *The plugin is older than 0.2* | The default folder needs plugin 0.2. Install the new build, or enter a folder that exists. |
| Notifications: the Jellyfin step stays grey | Jellyfin can't reach Stubbert's address, or the Webhook plugin isn't set up. Use an address Jellyfin's container can resolve, and tick *Item Added* and *Send All Properties*. |
| Other events arrive, but new items never do | Another plugin crashes on new items, and Jellyfin then skips the Webhook plugin. Look for *Error in ItemAdded event handler* in the Jellyfin log: the stack trace names the plugin (seen with Streamyfin's push notifications). Update or disable that plugin. |
| *N events refused* | Jellyfin calls an old webhook URL. Copy the current one into the Webhook plugin. |
| *Discord doesn't know this webhook (404)* | The webhook was deleted in Discord. Make a new one and paste it; held messages are sent then. |
| *Unreadable webhook payload* | *Send All Properties* is off in the Webhook plugin, or a custom template is set. Turn it on and clear the template. |
| A whole season arrived but got an Episodes message | No source knew the season's size. Turn on TVmaze, or add a TMDb key. |
| Can't write to `/data` | Make `./data` writable for `PUID:PGID` (default 1000:1000). |

The server logs to stdout: `docker compose logs -f stubbert`.

## Updating

- **This app:** `docker compose pull && docker compose up -d`. A running sync finishes first.
- **Jellyfin:** the plugin targets Jellyfin 12.1 and also loads on newer versions, such as 12.2. After a Jellyfin
  upgrade, check that it still shows as *Active* under **Dashboard → Plugins** and that the Categories library
  lists only your categories. If not, the new Jellyfin version needs a new plugin release.
