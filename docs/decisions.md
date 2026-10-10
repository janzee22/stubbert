# Decisions

Why the code is the way it is, by topic: Jellyfin and Discord quirks, limits, security trade-offs, things tried
and dropped. Only what still holds; older history is in git.

## Jellyfin API facts

Found on the real 12.1.0 server, the dev server or in the 12.1 source. The spec doesn't tell you these.

- **`POST /Collections?parentId=` is ignored.** Every BoxSet lands in the built-in collections folder. This is why
  the plugin exists.
- **Never change `LockData` through `POST /Items/{id}`.** On a folder it cascades `IsLocked` to every item inside.
  Always send the current value back. If a field ever drifts, use `LockedFields` (doesn't cascade).
- **Always pass an admin `userId`.** Without it `GET /Items?parentId=<boxset>` returns 0 members, and
  `GET /Items/{id}` and `GET /Items/{id}/Collections` fail.
- **Pass `collapseBoxSetItems=false`** when listing movies, or Jellyfin returns BoxSets instead. Still filter on
  `Type` client-side.
- **`nameStartsWith` matches `SortName`**, which has hyphens and other characters stripped, so it's useless for
  exact-name lookup. Find a BoxSet by name by listing and comparing `Name` in code.
- **Poster upload:** base64 body with the image's `Content-Type`.
- **Full-DTO update:** `POST /Items/{id}` with the whole `BaseItemDto` changes nothing else and keeps members.
  `null` clears `ForcedSortName` and `Overview`.
- **BoxSet ids are deterministic by path:** a recreated collection may get its old id back.
- **Library ids are derived from the library name.**
- **Remote metadata hijacks categories:** with default library options, a new category was matched to a TMDb
  collection by name and got its overview, poster and TMDb id. Setup turns off BoxSet metadata and image fetchers
  on the Categories library.
- **Empty library folders are skipped** when scanning ("inaccessible or empty"), so a new library has no folder item
  and doesn't show in users' views. Fixes: the plugin's marker file on create, and
  `POST /Items/{libraryId}/Refresh` after a sync that changed something.
- **`POST /Library/VirtualFolders` with a missing folder answers `400`** and creates nothing.
- **The real server doesn't serve its OpenAPI spec** (HTTP 500). The dev server does; its document, including the
  plugin's endpoints, is `test/fixtures/jellyfin-openapi-12.1.0.json`.
- **Auth:** `Authorization: MediaBrowser Client=..., Device=..., DeviceId=..., Version=..., Token="<key>"`. The key
  never goes into URLs, so request URLs are safe to log. Array query params are comma-joined (`ids=a,b`).

## Plugin

`Jellyfin.Plugin.Stubbert`, `net10.0`, built against Jellyfin 12.1 (`targetAbi` is a minimum, so it also loads on
12.2).

- **Why:** Streamyfin and Wholphin open a boxsets library with `includeItemTypes=[BoxSet]`, which Jellyfin answers
  with every BoxSet on the server. No stock setup gives a library with only categories (tried: `parentId` on create,
  a `[boxset]` folder in a mixed library, a second boxsets library).
- **How:** a global MVC filter rewrites the arguments of `Items.GetItems` only, so Jellyfin still queries, pages and
  builds DTOs (`TotalRecordCount` stays right). The rules are in the pure, unit-tested `ItemsQueryRewrite.Rewrite`:
  - parent = Categories library, types `[BoxSet]` or empty → clear types, exclude child categories
  - types `[BoxSet]` with any other parent or none (Collections tab, a library's collections view) → exclude all
    categories
  - everything else → untouched
- **Category** = a BoxSet whose `Path` is under the library's `VirtualFolderInfo.Locations` (not
  `CollectionFolder.PhysicalLocations`, which points to the config dir on 12.1). **Child category** = one that's a
  member of another category.
- **Endpoints (admin):** `GET`/`POST /CategoryCollections` list and create categories (`<name> [boxset]` in the
  library folder, `409` on a duplicate name). `GET`/`POST /CategoryCollections/Folder` report and create the
  default library folder `<DataPath>/categories`; it takes no path from the request. Members, poster and metadata
  use the standard endpoints.
- Without a `CategoriesLibraryId` the filter does nothing.
- The zip is flat (`.dll` + `meta.json` at the root): Jellyfin unzips a repository install into its own
  `<name>_<version>` folder, so a folder inside the zip would sit one level too deep.

## Sync

- **Preflight:** sync refuses to run unless the plugin is installed and active, its library id matches the config,
  the library is of type `boxsets`, and it has no remote BoxSet fetchers.
- **Categories aren't locked:** they have no provider ids, so a refresh has nothing to fetch, and sync restores any
  drift anyway.
- **Names unique across the whole tree:** all categories are folders in one library folder, the plugin refuses
  duplicates, and adoption matches by name.
- **Adoption** only looks at `GET /CategoryCollections`, so collections outside the Categories library are never
  touched. A collection is never claimed by two categories.
- **Posters** upload when the file's sha256 differs from the state, the collection has no image, or it was just
  adopted. A category without a poster never has its image removed.
- **Guards:** previous count = current members minus child collections. Exactly 50% drop is allowed. Metadata and
  poster are still applied to a guarded category.
- **Write order:** creates first (children before parents), state saved after each create (temp file + rename).
  Then per category: metadata, poster, add, remove. A failing category is reported, the others continue. Member
  changes in chunks of 100. Reads run up to four at a time; writes are sequential.
- **Retries:** reads and idempotent writes retry network errors and 408/429/5xx (4 attempts, 0.5 s doubling). A
  create only retries 429/503 and refused connections, since another error may mean it went through.
- **Value pickers** (`/api/values/*`) count from the same item fetch the rules use, not `/Genres` or `/Studios`, so
  names and counts are exactly what rules match.
- **Scheduler:** next run is one interval after the last applied run, whatever started it. If busy, retry after a
  minute. `syncOnStart` is opt-in, since a sync on every restart would surprise people.
- **One operation at a time** (preview, sync, setup, delete): a second gets `409 busy`.
- **Run log:** one JSON file per applied run in `<data>/runs`, newest `RUN_HISTORY` (50) kept. Dry runs aren't
  logged. A run still marked `running` after a restart shows as "Interrupted".
- **Preview then Sync:** Sync plans again on the server, so the result can differ if Jellyfin changed in between.
  The run shows what was actually done.

## Server and security

- **Fastify 5, no plugins.** Cookies parsed by hand; the UI is served from `dist/ui`, read into memory at startup
  and answered by exact path (no way to reach other files). CSP `default-src 'self'`, no framing.
- **Sessions:** random tokens in memory (30 days; a restart logs everyone out), `HttpOnly; SameSite=Strict` cookie,
  `Secure` with `COOKIE_SECURE=true`. 5 wrong passwords per client in 15 min → `429`.
- **Password:** scrypt hash. Chosen by the first visitor, unless `UI_PASSWORD` is set; until then everything but
  health, session, login and setting the password answers `401`. Changing it needs the current one and ends every
  session. `UI_ALLOW_NO_PASSWORD=true` turns auth off.
- **CSRF:** besides `SameSite=Strict`, every non-GET `/api` request must be `application/json` or `image/*`, which a
  form can't send. Bodyless actions send `{}`.
- **API key:** stored in `<data>/settings.json` (mode 0600), used only in the Jellyfin client's header. Responses
  never contain it; tests assert that.
- **Env vars override settings:** `JELLYFIN_URL` + `JELLYFIN_API_KEY` (both or neither), `UI_PASSWORD`. The UI shows
  them read-only and the API refuses changes with `409`.
- **Starts without Jellyfin settings:** until configured, every Jellyfin call fails with `409 not-configured`. New
  settings are tested with a throwaway client before saving.
- **Posters:** raw body upload, max 20 MB, magic bytes must be PNG, JPEG or WebP and match the extension (sync picks
  the Content-Type from it). Stored as `<category id>.<ext>`. A poster in use can't be deleted.
- **Deleting a collection** needs `{ "confirm": "<category id>" }`, only works for collections in the state file and
  leaves members alone.
- **Errors** have the shape `{ error, code, issues? }`; request bodies go through zod. A failing call to Discord
  answers `502` with code `upstream`; `jellyfin` is kept for Jellyfin failures.
- **One logger, made before anything else** (`pino` in `main.ts`). Fastify, `SyncService` and `NotifyService` get
  it through their constructors, so nothing is rewired after start-up. The request serializer that masks the
  webhook token is `logSerializers` in `app.ts`.
- **Login throttling keeps memory bounded** (2026-10-08, security review). Each failure drops clients whose
  failures are all older than 15 min, and at 10,000 tracked clients the oldest goes. With `TRUST_PROXY=true` a
  faked `X-Forwarded-For` makes a new client per request, which grew the map without limit before.
- **Warn once when a proxy is detected but `TRUST_PROXY` is off** (2026-10-08, security review). Then every client
  has the proxy's address, so five wrong passwords from anyone lock everyone out. Not switched on automatically:
  trusting the header is only safe when Stubbert is reachable through the proxy alone, which the app can't tell.

## Onboarding and setup

- **No library created on start:** that'd be a write without preview, and the app can't know a folder path as
  Jellyfin sees it. Onboarding asks once, with Check before Set up.
- **Default folder `<DataPath>/categories`**, next to Jellyfin's own `collections` folder, so Jellyfin backups include
  it. The plugin creates it, since the app can't reach Jellyfin's file system.
- **Run setup again:** a bar appears when Jellyfin is unreachable, the key is rejected, the plugin is missing or a
  preflight fails. It reopens onboarding at the Jellyfin step and keeps the config; the old server's ids match
  nothing, so sync recreates collections (adopting by name).

## UI

- **Stack:** React 19 + Vite 8 in `src/ui`, no UI library, router or state library. Hash routes. Four contexts in
  `src/ui/state` (status, posters, values, draft), so a status poll doesn't re-render the editor.
- **One API contract:** request and response types live in `src/shared/api.ts`; routes annotate their return
  types with them and `src/ui/lib/api.ts` re-exports them. Domain types that are also responses (`SyncReport`,
  `RunRecord`, …) are re-exported there with `export type`, so the UI never imports from `server/`, `sync/` or
  `notify/` directly and a changed response still breaks the build.
- **Shared constants are plain arrays, not zod enums** (`MESSAGE_KINDS` in `src/shared/notify.ts`). The UI imports
  them at runtime, and a zod enum would pull zod into the UI bundle for one `includes`. The server wraps them in `z.enum`.
- **One config draft**, edited on Categories and Settings, saved from a save bar. The server validates it 400 ms
  after each change, so the UI shows exactly what sync would complain about. Saving writes no default values.
- **Live match count:** `POST /api/evaluate` runs one category's rules against the cached items.
- **Moving categories:** up/down buttons and Alt+arrows, not drag and drop.
- **Ticket Booth design** (Claude Design canvas "Category Collections · Ticket Booth"): categories as cinema
  programmes, posters on a wall, rules as tickets. Marigold accent on warm cream (warm brown in dark mode),
  Bricolage Grotesque headings, Figtree UI, JetBrains Mono for ids and logs, and Stubby the ticket mascot in empty
  states, errors and after a sync. Work surfaces stay calm and dense.
- **CSS:** `theme.css` is the design system from the canvas (tokens, primitives such as buttons, inputs, badges),
  `app.css` the shell and shared layout, and each feature has its own stylesheet next to it
  (`features/<name>/<name>.css`) for classes only that feature uses. Theme is `data-theme` on `<html>`, chosen per
  browser (system, light, dark) in `localStorage`.
- **Stylesheets load in one fixed order from `main.tsx`**: theme, app, the features, utilities. Not imported from
  the components themselves, because then the bundle order follows the import graph, and a settings form shown
  inside onboarding would get its styles only once the Settings page had loaded. When the feature styles were split
  off (2026-10-08) every rule whose cascade order changed against a rule that can hit the same element stayed in
  `app.css`/`theme.css`, so the result renders the same.
- **Utility classes instead of recurring inline styles** (`gap-6`, `grow`, `self-start`, … in `utilities.css`). They
  are `!important` on purpose: they replaced `style={}` attributes, which beat every normal rule, and must keep
  doing so. Values were kept as they were; gaps of 4, 8, 12, 16 and 20 px use the spacing tokens, the others (2, 6,
  10, 18, 22) are off the scale and could be snapped to it in a later visual pass. One-off and computed styles stay
  inline.
- **Fonts bundled** (`@fontsource`), since the CSP allows only `'self'`.
- **Responsive:** from 1100 px tree and editor side by side; below that the editor replaces the tree; below 700 px a
  bottom tab bar and report tables as cards.

## Code and tooling

- **Own thin HTTP client** on native `fetch`, no `@jellyfin/sdk`. Only endpoints the app uses are wrapped.
- **oxlint**, because typescript-eslint doesn't support TypeScript 7 yet. Off on purpose:
  `react/set-state-in-effect`, `react/exhaustive-effect-dependencies` (data loading in effects),
  `react/no-array-index-key` (rules and log lines have no stable id), `no-await-in-loop` (sequential writes),
  `oxc/no-async-endpoint-handlers` (Fastify handles async). Checked again on 2026-10-08: each still has real hits.
- **Lint guards structure:** `max-lines` 300 (blank lines not counted) for everything except the template
  lexer/parser/renderer, the Jellyfin client and tests, and `no-restricted-imports` that stops `src/ui` from
  importing `server/`, `sync/`, `notify/`, `core/`, `config/` or `jellyfin/` (one override per folder depth,
  since oxlint has no path-based import rule). `max-lines-per-function` and `complexity` were tried and left off:
  JSX markup and parser switch statements count as length and branches without being hard to read, and with
  `--deny-warnings` a warning fails the build.
- **Docker:** published as `ghcr.io/janzee22/stubbert`, so users only need a compose file, not the repo. On SIGTERM
  it waits for a running sync, hence `stop_grace_period: 2m`.

## Dev and testing

- **The API test harness keeps its state on the exported `h` object** (`test/server/harness.ts`), because a test
  file can't reassign another module's variables.
- **Fake Jellyfin** (`test/fake-jellyfin.ts`): every request is checked against the fixture spec, every response
  against its schema. Behaviour the spec doesn't describe comes from the API facts above.

## Naming

- **Plugin keeps its GUID** `efa3a80a-…` from before the rename to Stubbert, so Jellyfin and the manifest treat it
  as the same plugin.
- **API route stays `/CategoryCollections`**: it names the resource (category collections), not the app.

## Notifications

Spec: `docs/stubbert-notifications-spec.md` in the repo. Design: the "Stubbert · Ticket Booth" canvas (artboards
Notifications, Template, Notif-states and the phone versions).

- **`NotifyService` is a thin façade** over one module per step of the flow: `ingest.ts` (parse, dedupe,
  filter, enrich), `batcher.ts` (open batch, timer, the lock that also serializes retries), `compose.ts` (plan,
  season sizes, render), `delivery.ts` (Discord payload, images, send, failure state) and `activity.ts` (log and
  pruning). `runtime.ts` bundles the injected dependencies they share. Routes only see the façade plus
  `views.ts` (API shapes), `validate.ts` and `preview.ts` (template preview and sample data).
- **The preview's "if-block is skipped" notes use the template parser**, not a regex over the source, so they see
  the same `{% if %}` tags the renderer does and skip loop variables like `ep.name`, which have no value outside
  the loop.
- **Storage as JSON, not a database**: `data/notifications/settings.json` (preferences, templates, secrets, mode
  0600) and `state.json` (announced keys, the open batch, activity, ingest stats, season-size cache). Same pattern
  as the rest of the app. Writes are atomic and serialized in one queue.
- **Secrets in plain text** (webhook token, Discord URL, TMDb key), like the Jellyfin API key in `settings.json`.
  The UI must be able to show the full Jellyfin webhook URL again. The API only returns a `…abcd` hint for the
  Discord URL and TMDb key; they are write-only from the UI.
- **Own Jinja subset, not nunjucks**: nunjucks has no real sandbox (`constructor` escapes are known). The engine in
  `src/notify/template` only reads own properties of plain data, has no calls or I/O, a 200 ms and 20 000-character
  limit, and gives line numbers and "did you mean" suggestions (Levenshtein over known paths). Supported: `{{ }}`,
  filters (truncate, pad, upper, lower, title, capitalize, trim, replace, default/d, join, length/count, first,
  last, map, sort, string, int), if/elif/else, for/else with `loop`, `is defined/none/…`, comments, `{%- -%}`.
- **Deviations from Jinja**: `none` prints as empty (not "None"); `default` also replaces null; `truncate` ends with
  `…`. Lines that only hold tags are dropped (like trim_blocks + lstrip_blocks, but only for tag-only lines), so
  if-blocks leave no gaps and `{% if %}yes{% endif %}\nnext` keeps its newline.
- **Unknown variables are found statically** against a full sample context per message kind, in every branch, not
  only the ones the sample takes. That sample doubles as "Sample data" in the preview.
- **Webhook payload facts** (jellyfin-plugin-webhook source, `DataObjectHelpers.cs`, `BaseOption.cs`): Generic
  destination posts `Content-Type: text/plain` unless a header is set, keys are PascalCase, Guids come without
  dashes, strings have `"` escaped as `\"` (unescaped on our side). Provider ids are `Provider_tmdb/imdb/tvdb` of the
  item itself; an episode has no series provider ids and no library, so both come from the Jellyfin API
  (`/Items?ids=` and `/Items/{id}/Ancestors` → CollectionFolder). The plugin waits for provider ids before it sends.
- **Another plugin can swallow ItemAdded** (2026-10-09, seen on a real server). Jellyfin's `LibraryManager`
  invokes the `ItemAdded` event as one multicast delegate inside one try/catch, so a handler that throws stops the
  ones after it: "Error in ItemAdded event handler" in the Jellyfin log, and the Webhook plugin never queues the
  item. Seen with Streamyfin's push notifications (`NullReferenceException`); other events still arrive. Nothing to
  fix on our side; troubleshooting tells users to look for that log line.
- **Hook route** `/hooks/jellyfin/{token}` lives outside `/api` (no login, no JSON content-type rule), in its own
  Fastify scope that reads every content type as text, 1 MB limit, 60 calls/min. It parses and validates
  synchronously (400 on bad bodies), answers 202 and ingests in the background. Raw payloads go to the debug log.
- **The event is not stored before 202**: the background ingest stores it a few ms later. Jellyfin doesn't retry
  anyway, so a crash in that window loses the same as a crash just before the request.
- **Flush detaches the batch first** (`batch = null`, persisted), then sends. A crash mid-send loses that batch
  instead of sending it twice.
- **Jellyfin as season-size source** only counts when it lists virtual (missing) episodes; without them a full
  list can't be told apart from "all we have", so it's treated as unknown. TVmaze: `/lookup/shows?thetvdb=|imdb=`
  (301 to the show) then `/shows/{id}/seasons` → `episodeOrder`, falling back to the season's episode list. TMDb:
  `/3/tv/{id}/season/{n}`, `api_key` query or a Bearer token for v4 keys (`eyJ…`). Found sizes are cached 24 h;
  unknown ones are not, so a source that learns later is used.
- **Library filter fails open**: when Jellyfin can't tell the library, the item is kept rather than lost.
- **Images**: poster → `thumbnail`, backdrop → `image`, sent as a multipart attachment (`attachment://poster.jpg`)
  fetched from Jellyfin as JPEG (600 px poster, 1280 px backdrop, smaller when over 8 MB). Episode messages use
  the series poster; a Season message the season poster.
- **Discord**: posts with `?wait=true`, `redirect: 'error'`, only to `discord.com`/`discordapp.com` (plus ptb/
  canary). 429 waits `retry_after` (max 60 s); 5xx and network errors back off 1 s, 2 s; 3 attempts. 404 pauses
  sending until the URL changes; held messages younger than 24 h are then resent. "Failing" for the status pill =
  404 or 3 failures in a row. The username may not contain "discord" or "clyde".
- **Draft**: notification settings and templates join the existing save bar through a second draft
  (`NotifyDraftProvider`), validated by `POST /api/notifications/validate`. Instead of the spec's
  `templates/{kind}` GET/PUT/reset routes, templates are saved with the settings and "Reset to default" uses the
  defaults that `GET /api/notifications/settings` returns.
- **Editor**: a transparent `<textarea>` over a highlighted copy with the same metrics; each row holds its line
  number, so wrapped lines stay aligned. JetBrains Mono keeps bold at the same width, so coloured tokens don't move
  the caret.
- **Channel name** isn't shown ("#nieuw-op-jellyfin" in the design): a webhook can't read it. The UI says "Discord".
- **Open point from the spec** (bulk-skipped titles sent later from the activity?): kept as specified, never.
- **Sample images** (`src/ui/public/samples/poster.jpg`, `backdrop.jpg`) are drawn in the Stubbert style, not
  real movie posters (copyright). They ship with the UI; the server reads them from the loaded UI files to attach
  them to a test message sent with sample data.
- **The tag sits above the embed, in the same message.** Discord renders `content` above embeds, and mentions
  inside an embed don't ping. A follow-up message with the tag (to get it under the embed) was tried and dropped
  on 2026-10-08: two messages per notification looked noisy. The role field accepts `<@&id>` or the id; the server
  stores the id.
- **Sync on new items** (`schedule.syncOnNewItems`, default on, only with `schedule.enabled`): every accepted,
  non-duplicate ItemAdded (movie or episode) calls `SyncService.newItemsArrived()`, which debounces 2 minutes and
  then applies a sync with trigger `webhook` (guards on, like scheduled runs). Busy → retry a minute later. It
  hangs off the webhook, not the Discord pipeline, so it works with notifications off, before the filters and the
  announced check (an upgrade can still change matches). Debounced, not per batch, so a bulk import syncs once.
- **Default templates are English**, unlike the spec's Dutch ones, so the app, sample data and messages speak one
  language.
- **Only customised templates are saved.** `settings.json` keeps a template only when it differs from the default;
  missing ones load as the current default. So an untouched template follows default changes, even though the save
  bar always sends all four.
- **Webhook rate limit counts only refused calls** (2026-10-08, security review). It used to count every call
  before the token check, so anyone could spend the 60/min budget and make Jellyfin's real events get 429s. Now
  the token is checked first; a valid token is never limited, and over the limit a refused call gets 429 without
  writing the refused counter, which also caps those disk writes at 60/min.
- **A call with the right token clears the refused counter** (2026-10-09). Before, only "New URL…" did, so one
  stray call (a typo, a curl test) kept the Jellyfin step red for good. A valid call proves Jellyfin has the current
  URL; if an old URL is still configured somewhere, its next call brings the banner back.
- **The webhook token is masked in request logs** (2026-10-08, security review). Fastify logs `req.url` on every
  request, which put `/hooks/jellyfin/<token>` in `docker logs`. `buildApp` sets its own `req` serializer (same
  fields as Fastify's default) that logs `/hooks/jellyfin/…`.
