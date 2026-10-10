# Development

Needs Node 24 and Docker. How the code is organised, and where to change what, is in
[architecture.md](architecture.md).

```sh
npm install
npm run dev:up          # disposable Jellyfin 12.1 on :8096 with the plugin and test movies; writes .env.dev
npm run dev:fresh       # the same, from scratch (dev:reset + dev:up)
npm run dev             # app against it: API on :8090, UI on :5173 (opens the browser, reloads on save; password dev)
npm run dev:onboarding  # the same, but with empty app data and no .env.dev, to walk through onboarding
npm test                # unit, integration (fake Jellyfin built from the OpenAPI spec) and API tests
npm run typecheck       # server and UI
npm run lint            # oxlint
npm run format          # Prettier
npm run check           # typecheck, lint, format check and tests
npm run build           # dist/server and dist/ui
docker build -t stubbert .  # the app image, as published to ghcr.io
```

After a plugin change or a Jellyfin upgrade, run the [smoke test](smoke-test.md) on a real server.

On the dev server, the Categories folder for the setup is `/media/categories`. `npm run dev:fresh` throws it away and starts over. Plugin tests: `dotnet test` in `plugin/`.

## Releasing

The app and the plugin share one version (the plugin's has an extra `.0`). To release `1.2.0`:

1. Set it in `package.json` (`npm version 1.2.0 --no-git-tag-version`), and as `1.2.0.0` in
   [plugin/meta.json](../plugin/meta.json) and the `AssemblyVersion`/`FileVersion` in the plugin's `.csproj`.
2. Add a `## 1.2.0` section to [CHANGELOG.md](../CHANGELOG.md).
3. Commit, then `git tag v1.2.0 && git push origin main v1.2.0`.

The [release workflow](../.github/workflows/release.yml) checks that the versions agree, pushes the image to
`ghcr.io/janzee22/stubbert` (amd64 and arm64, tagged `1.2.0`, `1.2`, `1` and `latest`), creates the GitHub release
with the plugin zip and the changelog section as notes, and commits the new version to `manifest.json` on `main`.
Jellyfin reads that file anonymously, so the repo and the release must be public.

By hand, `pack.sh` needs the .NET 10 SDK, `jq` and `zip`:

```sh
bash plugin/pack.sh
# → plugin/dist/Stubbert_<version>.zip, with the .dll, meta.json and thumb.png at the root
bash plugin/manifest.sh https://<host>/Stubbert_<version>.zip "What changed"
# → manifest.json with the version, MD5 checksum and URL
```

Running `manifest.sh` for a new version adds it on top and keeps the older versions; running it again for the same
version replaces that entry.

For a Jellyfin version that no longer loads the plugin, update the Jellyfin packages in both `.csproj` files and
`targetAbi` in `meta.json`, release, and run the smoke test.
