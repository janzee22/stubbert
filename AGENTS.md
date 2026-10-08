# Stubbert

A Node app (Fastify + React) that syncs rule-based category collections to Jellyfin and announces new items on
Discord, plus a C# Jellyfin plugin in `plugin/`.

## Where to look

- **Changing code:** [docs/architecture.md](docs/architecture.md) has the module map and "How do I add…" recipes.
  Keep both in step with the code you change.
- **Jellyfin, Discord, security or design choices:** [docs/decisions.md](docs/decisions.md) holds the quirks,
  limits and trade-offs behind the code. Read the matching heading before touching that area. When you make a
  choice someone would otherwise have to guess or rediscover, add it there under the matching heading.
- **Running, the dev Jellyfin, releasing:** [docs/development.md](docs/development.md).
- **After a plugin change or a Jellyfin upgrade:** ask the user to run [docs/smoke-test.md](docs/smoke-test.md) on
  their real server; the fake Jellyfin in the tests only knows the OpenAPI spec.

## Conventions

- Comments explain _why_, in a line or two: a magic number, a Jellyfin or Discord workaround, a security choice.
  The code says what it does; longer reasons go in `docs/decisions.md`. YAML that users copy
  (`docker-compose.yml`, example configs) is the exception: there comments document the options.
- UI text, templates, docs and commit messages are in English.
- Pure logic (step states, summaries, diagnosis) lives in `.ts` files beside the components, so it is tested
  without rendering.
- Done means `npm run check` passes, plus `dotnet test` in `plugin/` when the plugin changed.
