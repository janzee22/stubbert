# Configuration

## Environment

All optional. The first three override what onboarding and Settings save; the UI then shows them but can't
change them.

| Variable | Default | |
|---|---|---|
| `JELLYFIN_URL` | — | How this app reaches Jellyfin, e.g. `http://192.168.1.10:8096`. Set together with `JELLYFIN_API_KEY`. |
| `JELLYFIN_API_KEY` | — | An API key from Dashboard → API Keys. |
| `UI_PASSWORD` | — | Password for the web UI. Skips choosing one on the first visit. |
| `UI_ALLOW_NO_PASSWORD` | — | `true` runs without a password. Only behind your own authentication. |
| `COOKIE_SECURE` | `false` | `true` when the UI is served over HTTPS. |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy, so login throttling uses the real client address. Only when Stubbert is reachable through the proxy alone: otherwise anyone can fake `X-Forwarded-For` and skip the throttling. Left off behind a proxy, five wrong passwords from anyone lock everyone out for 15 minutes. |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Listen address. |
| `DATA_DIR` | `/data` in Docker, `./data` otherwise | See below. |
| `RUN_HISTORY` | `50` | Number of runs kept in the run log. |
| `LOG_LEVEL` | `info` | Server log level (`debug`, `info`, `warn`, `error`). |
| `PUID` / `PGID` | `1000` | docker-compose only: the user the container runs as. |

Sessions are kept in memory, so a restart logs you out. After 5 wrong passwords a client has to wait 15 minutes.

## Data folder

| Path | |
|---|---|
| `settings.json` | Jellyfin address, API key and the password (as a scrypt hash). Readable only by the container user. Keep it private: it holds the API key in plain text, because the app needs it to call Jellyfin. |
| `config.yaml` | Categories, the library and the schedule. Edited by the UI; can also be edited by hand. |
| `state.json` | Which Jellyfin collection belongs to which category id. If it is lost, sync finds the collections again by name. |
| `posters/` | Poster images. |
| `runs/` | One JSON file per run. |
| `notifications/settings.json` | Notification settings and templates, the Jellyfin webhook token, the Discord webhook URL and the TMDb key. Readable only by the container user: the secrets are in plain text. |
| `notifications/state.json` | Titles announced before, the batch that is waiting, recent activity and cached season sizes. |

## config.yaml

```yaml
categoriesLibraryId: e679087c0457e175fbaee597d5d107ff
schedule: { enabled: true, intervalMinutes: 60, syncOnStart: false, syncOnNewItems: true }
categories:
  - id: disney
    name: Disney
    sortName: "01 Disney"
    overview: "Walt Disney and Pixar."
    poster: disney.jpg
    mediaTypes: [Movie, Series]
    combine: any
    rules:
      - type: studio
        values: ["Walt Disney Pictures", "Walt Disney Animation Studios"]
    children:
      - id: pixar
        name: Pixar
        rules:
          - type: studio
            values: ["Pixar"]
  - id: horror
    name: Horror
    mediaTypes: [Movie]
    combine: all
    rules:
      - type: genre
        values: ["Horror"]
      - type: name
        match: regex
        values: ["^Scary Movie"]
        negate: true
```

Top level:

| Key | Default | |
|---|---|---|
| `categoriesLibraryId` | — | Required. Id of the Categories library. Settings picks it for you. |
| `schedule.enabled` | `true` | Sync automatically. Scheduled syncs **apply** their changes, with the guards on. |
| `schedule.intervalMinutes` | `60` | Minutes between syncs, at least 5. The first one runs one interval after startup. |
| `schedule.syncOnStart` | `false` | Also apply a sync as soon as the server starts (only with `enabled`). The next one follows an interval later. |
| `schedule.syncOnNewItems` | `true` | Also apply a sync two minutes after Jellyfin reports new movies or episodes (only with `enabled`). Needs the Jellyfin webhook from [Discord notifications](notifications.md); the Discord messages can stay off. |
| `categories` | `[]` | The category tree. |

A category:

| Key | Default | |
|---|---|---|
| `id` | — | Required. Stable slug: lowercase letters, digits, hyphens. Links the category to its collection, so don't reuse it for something else. |
| `name` | — | Required. Shown in Jellyfin. Unique across **all** categories (case-insensitive), because they share one folder. |
| `sortName` | — | Optional sort title, e.g. `01 Disney` to put it first. |
| `overview` | — | Optional description. |
| `poster` | — | A file in `posters/` (`.png`, `.jpg`, `.jpeg`, `.webp`). Uploaded again when the file changes. |
| `mediaTypes` | `[Movie, Series]` | Which items the rules consider. |
| `combine` | `any` | `any`: an item matching one rule is included. `all`: it must match every rule. |
| `rules` | `[]` | See below. A category without rules matches nothing, but can hold sub-categories. |
| `children` | `[]` | Sub-categories, same shape. They become members of their parent collection. |

A rule:

| Key | Default | |
|---|---|---|
| `type` | — | `genre`, `studio`, `tag` or `name` (the title). |
| `values` | — | One or more values. Genre, studio and tag: exact match, case-insensitive. |
| `quantifier` | `any` | `any`: at least one value matches. `all`: every value matches. |
| `negate` | `false` | Inverts the rule ("exclude" in the UI). |
| `match` | `contains` | `name` rules only: `contains`, `exact` or `regex`. Checked against the title and the original title. |
| `caseSensitive` | `false` | `name` rules only. |

A collection is fully managed: its members are exactly the matched items plus its sub-categories. Anything added by
hand in Jellyfin is removed on the next sync, and name, sort name, overview and poster are set back.

## Streamyfin home row

The Categories library is a normal library tile in every app. If you also want a row of categories on the
Streamyfin home screen, add a section to the **Streamyfin** plugin's home YAML in jellyfin-web. This needs the
Streamyfin Jellyfin plugin.

```yaml
home:
  sections:
    - title: "Categories"
      orientation: vertical
      items:
        parentId: <categoriesLibraryId>
        includeItemTypes: [BoxSet]
        sortBy: [SortName]
        limit: 50
```

The layout follows the example in the [Streamyfin plugin README](https://github.com/streamyfin/jellyfin-plugin-streamyfin).
It has not been tested against this setup yet. Write the type exactly as `BoxSet`:
Streamyfin silently ignores type names it doesn't know. With `parentId` set to the Categories library and
`includeItemTypes: [BoxSet]`, the plugin returns only the top-level categories, the same as the library tile.
