# Architecture

How Stubbert fits together, for someone about to change it. How to run it is in
[development.md](development.md).

Stubbert is one Node process: a Fastify server with a React UI, a sync engine that writes collections to Jellyfin,
and a notifier that turns Jellyfin webhook events into Discord messages. There is no database; everything lives as
files under `DATA_DIR`. The C# plugin in `plugin/` runs inside Jellyfin and is a separate build.

## Modules

| Folder | What it does | Depends on |
|---|---|---|
| `src/core/` | Pure domain logic: evaluate rules (`rules.ts`), compute a sync plan (`planner.ts`). No I/O. | `config/` types |
| `src/config/` | The `config.yaml` schema (zod) and validation with readable issue paths. | — |
| `src/jellyfin/` | HTTP client and API wrapper for Jellyfin (retries, paging), Categories library setup. | `config/`, `shared/` |
| `src/sync/` | Runs a sync (`engine.ts`), preflight checks, the run log, reports, and `SyncService` (scheduler, one operation at a time). | `core/`, `jellyfin/`, `data.ts` |
| `src/notify/` | Webhook ingest, batching, season sizes, rendering, Discord delivery. `template/` is the Jinja-like template engine (lexer, parser, renderer, checker). | `jellyfin/` types, `shared/` |
| `src/server/` | Fastify app: auth, CSRF and security headers, error mapping, one file per route group in `routes/`. | everything above |
| `src/shared/` | The API contract: request/response types (`api.ts`), message kinds (`notify.ts`), id normalising. Used by server and UI. | type-only imports |
| `src/ui/` | React app built by Vite. Talks to the server only through `lib/api.ts`. | `shared/` |
| `src/data.ts` | All file I/O under `DATA_DIR` except notifications (`notify/store.ts`). | `config/` |
| `src/log.ts` | The `Logger` interface services take. In production it is the pino logger Fastify also uses. | — |
| `plugin/` | Jellyfin plugin that makes the Categories library list only categories. | — |
| `dev/` | Disposable Jellyfin in Docker with test media, for local development. | — |

Lint enforces two boundaries: `src/ui` can't import from `server/`, `sync/`, `notify/`, `core/`, `config/` or
`jellyfin/`, and UI files stay under 300 lines.

### Inside `src/ui/`

| Folder | What goes there |
|---|---|
| `app/` | Boot (`App.tsx`: session, onboarding, login), hash router, the shell that picks a page. |
| `components/` | Shared primitives, one per file, imported through `components/index.ts`. |
| `layout/` | Top bar, tab bar, mobile header, save bar, connection banner. |
| `hooks/` | `useLoad` (fetch once, reload), `usePoll` (fetch on an interval), `useAction` (busy/error around a call). |
| `lib/` | `api.ts` (every server call), `format.ts`, and the category tree: `tree.ts` (paths, move, indent), `draft.ts` (normalise, compact, diff), `describe.ts` (rule text). |
| `state/` | React contexts: config draft, notification draft, status poll, posters, value lists, theme. |
| `features/<page>/` | One folder per page with its components, pure helpers (`*.ts`) and its stylesheet. |

Styles: `theme.css` (tokens and primitives), `app.css` (shell and shared layout), `features/*/*.css`, then
`utilities.css`, all imported from `main.tsx` in that order.

## Flow 1: sync

```
Preview & sync page ─┐
scheduler / startup ─┼─► SyncService ──► engine.sync() ──► core/planner.plan() ──► engine writes ──► run log
webhook new items ───┘   (one at a time)   reads config,      pure diff: create,      collections,     data/runs/
                                           state, Jellyfin    adopt, add, remove,     metadata,
                                                              guards                  posters
```

1. `SyncService` (`src/sync/service.ts`) refuses a second operation with `BusyError` and keeps the scheduler.
2. `SyncService` loads `config.yaml`; `engine.sync()` (`src/sync/engine.ts`) runs `preflight`, loads `state.json`,
   fetches all movies and series, evaluates every category's rules (`core/rules.ts`) and reads the current
   collections.
3. `core/planner.ts` turns desired versus current into a plan per category, applying the safety guards.
4. With `apply: true` the engine writes: creates first, then per category metadata, poster, add, remove. `state.json`
   is saved after each create. A preview stops after step 3.
5. `toReport()` makes the `SyncReport` the UI shows; applied runs are stored as one JSON file in `data/runs/`.

## Flow 2: notifications

```
Jellyfin webhook ──► POST /hooks/jellyfin/:token ──► NotifyService.ingest()
                     (routes/hooks.ts: token check,     │
                      parse, answer 202)                ├─ ingest.ts     parse, dedupe, filter, enrich from Jellyfin
                                                        ├─ batcher.ts    add to the open batch, restart the quiet timer
                                                        │      … quiet period passes, tick() flushes …
                                                        ├─ compose.ts    plan messages, season sizes, render templates
                                                        ├─ delivery.ts   fetch image, post to Discord, retries
                                                        └─ activity.ts   record sent / skipped / failed
```

`NotifyService` (`src/notify/service.ts`) is a thin façade over these modules; routes only call it. The
notification routes (`routes/notifications.ts`) also use `views.ts` (API shapes), `validate.ts` and `preview.ts`
(template preview with sample or real data). Every accepted new item also calls `SyncService.newItemsArrived()`,
which debounces a sync.

## State on disk

All under `DATA_DIR` (`/data` in Docker, `./data` otherwise):

| Path | Written by | Contents |
|---|---|---|
| `config.yaml` | `PUT /api/config` | Categories, rules, schedule, the Categories library id. Edited in the UI. |
| `state.json` | sync engine | Category id → Jellyfin BoxSet id and poster hash. |
| `settings.json` | onboarding, Settings | Jellyfin URL and API key, password hash. Mode 0600. |
| `runs/` | `SyncService` | One JSON file per applied run, newest `RUN_HISTORY` kept. |
| `posters/` | poster upload | `<category id>.png/.jpg/.webp`. |
| `notifications/settings.json` | Notifications page | Preferences, changed templates, webhook token, Discord URL, TMDb key. Mode 0600. |
| `notifications/state.json` | `NotifyService` | Announced titles, the open batch, activity, ingest and Discord status, season-size cache. |

## How do I add…

### An API route

1. Put the request and response types in `src/shared/api.ts`.
2. Add the handler to the matching file in `src/server/routes/` (or a new file, registered in the list in
   `src/server/app.ts`). Parse the body with a zod schema and `parseBody`; throw `ApiError` for expected failures,
   or a domain error that `toApiError` in `src/server/errors.ts` maps. Keep logic out of the route: put it in the
   module it belongs to and call that.
3. Add a method to `api` in `src/ui/lib/api.ts`.
4. Test it in `test/server/<group>.test.ts` with the shared harness (`get`, `post`, `h`).

### A rule type

1. Add it to `ruleSchema` in `src/config/schema.ts`.
2. Match it in `compileRule` in `src/core/rules.ts`, with tests in `test/core/rules.test.ts`.
3. In the UI: `newRule` and normalising in `src/ui/lib/draft.ts`, the wording in `src/ui/lib/describe.ts`, and the
   editor in `src/ui/features/categories/RuleEditor.tsx`. If it needs a value list, see `/api/values/:field` in
   `routes/catalog.ts`.

### A notification message kind

1. Add it to `MESSAGE_KINDS` in `src/shared/notify.ts`.
2. Decide when it's sent in `planBatch` (`src/notify/plan.ts`), with tests in `test/notify/plan.test.ts`.
3. Give it a default template in `src/notify/defaults.ts`, a sample context in `src/notify/context.ts` and a
   `templates` entry in `preferencesSchema` (`src/notify/settings.ts`).
4. In the UI: its name in `KIND_NAMES` (`src/ui/state/notify.tsx`), the subtitle in
   `features/notify/notifications/MessagesSection.tsx` and the "when" line in `features/notify/template/TemplatePage.tsx`.

## Tests

`npm test` runs everything under `test/`, which mirrors `src/`. API tests start the app against
`test/fake-jellyfin.ts`, a fake Jellyfin that checks every request and response against the real 12.1 OpenAPI spec
in `test/fixtures/`. `npm run check` runs typecheck, lint, format check and tests; run it before every commit.
