<p align="center">
  <img src="docs/images/logo.svg" alt="" width="160">
</p>

<h1 align="center">Stubbert</h1>

<p align="center">
  <b>The friendly usher for your Jellyfin library.</b><br>
  Shows every title to the right category, and tells Discord when something new is playing.
</p>

<p align="center">
  <img alt="Jellyfin 12.1+" src="https://img.shields.io/badge/Jellyfin-12.1%2B-00a4dc?logo=jellyfin&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/runs%20in-Docker-2496ed?logo=docker&logoColor=white">
</p>

---

Stubbert sorts your movies and series into categories such as *Disney*, *Marvel* or *Horror*, using rules you set,
and keeps them up to date as your library grows. They get their own **Categories** library in every Jellyfin app.
When something new arrives, Stubbert can post it to Discord.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/screenshot-categories-dark.png">
    <img alt="The Categories page: a tree of categories with posters, and the editor for Horror" src="docs/images/screenshot-categories-light.png" width="800">
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/screenshot-notifications-dark.png">
    <img alt="The Discord message editor with a live preview of a new-movie notification" src="docs/images/screenshot-notifications-light.png" width="800">
  </picture>
</p>

## Features

- 🎟️ **Categories as a library.** A *Categories* tile next to Movies and Shows in every Jellyfin app, with only your
  categories in it. They stay out of the normal Collections tab.
- 🧩 **Rules, not hand-picking.** Match on genre, studio, tag or title (contains, exact or regex). Combine rules
  with *any* or *all*, or exclude matches. New movies and series join the right categories on their own.
- 🗂️ **Sub-categories.** Nest *Pixar* inside *Disney*, or *Slashers* inside *Horror*.
- 🖼️ **Your own posters**, names, sort order and descriptions per category.
- 👀 **Preview before anything changes.** See per category which titles would be added or removed, then sync, or
  let it run on a schedule.
- 🛡️ **Safety guards.** A category that would suddenly lose all or more than half of its items is skipped, so a
  broken rule or a bad fetch can't empty it.
- 🔔 **Discord notifications.** One tidy message per new movie, episode or whole season, with the poster. Bulk
  imports and quality upgrades stay quiet, and every message is a template you can edit with a live preview.
- 🔒 **Leaves your media alone.** It never writes tags or metadata to your movies and series. It only touches the
  collections it manages.

## How it works

There are two parts:

| Part | What it does |
|---|---|
| **The app** (Docker) | Web UI where you manage categories and rules. It previews changes and syncs them to Jellyfin, by hand or on a schedule. |
| **The plugin** (Jellyfin) | Makes the *Categories* library list only your categories, and hides them from the normal Collections tab. |

The plugin is needed because stock Jellyfin can't do this: every collection lands in the same built-in folder, and
a collections library always shows all of them.

## Quick start

You need **Jellyfin 12.1 or newer** and **Docker** with Compose.

### 1. Install the plugin

In jellyfin-web, go to **Dashboard → Plugins → Repositories**, click **+** and add:

```
https://raw.githubusercontent.com/janzee22/stubbert/main/manifest.json
```

Then open the **Catalog**, install **Stubbert** and restart Jellyfin. It should show as *Active*
under **Dashboard → Plugins**.

<details>
<summary>Install by hand instead</summary>

Download the zip from the [releases](https://github.com/janzee22/stubbert/releases), unzip it into a new folder
`Stubbert_<version>/` in Jellyfin's plugin folder and restart Jellyfin.

| Jellyfin install | Plugin folder |
|---|---|
| Official Docker image | `/config/plugins/` inside the container |
| Debian/Ubuntu package | `/var/lib/jellyfin/plugins/` |

</details>

### 2. Start the app

Save this as `docker-compose.yml`:

```yaml
services:
  stubbert:
    image: ghcr.io/janzee22/stubbert:latest
    user: '1000:1000'
    ports:
      - '8080:8080'
    volumes:
      - ./data:/data
    restart: unless-stopped
    stop_grace_period: 2m
```

```sh
mkdir -p data
docker compose up -d
```

`./data` must be writable by the user in `user:`. Passwords, the Jellyfin address and other options can also come
from environment variables; see [Configuration](docs/configuration.md).

### 3. Walk through the setup

Open `http://<host>:8080` **right away**: the first visitor chooses the password. The setup then connects to
Jellyfin with an API key (**Dashboard → API Keys → +**), checks the plugin and creates the Categories library for
you. More detail in [Using Stubbert](docs/usage.md#onboarding).

That's it. Add your first category, preview, sync, and the **Categories** tile shows up in your apps.

## Documentation

| | |
|---|---|
| 📖 [Using Stubbert](docs/usage.md) | Onboarding, the editor, preview & sync, safety guards, known limits |
| 🔔 [Discord notifications](docs/notifications.md) | Setting up the Jellyfin webhook and Discord, what gets sent, templates |
| ⚙️ [Configuration](docs/configuration.md) | Environment variables, the data folder, `config.yaml`, a Streamyfin home row |
| 🩺 [Troubleshooting](docs/troubleshooting.md) | Common errors and how to fix them, and how to update |
| 📝 [Changelog](CHANGELOG.md) | What changed in each release |
| 🛠️ [Development](docs/development.md) | How the code is organised, running a dev Jellyfin, tests, releasing |

## Compatibility

The plugin is tested on **Jellyfin 12.1 and 12.2** but may work on different versions. The Categories library is a normal Jellyfin library,
so it shows up in any Jellyfin app.

## Support and license

Stubbert is a hobby project, maintained in spare time. Bug reports and ideas are welcome as
[issues](https://github.com/janzee22/stubbert/issues); security problems go through [SECURITY.md](SECURITY.md).

Licensed under the [GNU GPL v3](LICENSE).
