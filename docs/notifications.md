# Discord notifications

Stubbert can post a message in a Discord channel when something new lands in Jellyfin: one message per movie, and
episodes grouped per series and season. Everything is set up on the **Notifications** page.

## Set it up

1. **Discord:** in the channel settings, open **Integrations → Webhooks → New Webhook**, give it a name and an
   avatar ([happy Stubbert](images/stubbert-avatar.png) fits), and **Copy Webhook URL**. Paste it under *Discord webhook URL* and save. **Send test message** checks it.
2. **Stubbert's address:** under *Jellyfin webhook*, enter the address Jellyfin uses to reach Stubbert. Inside
   Docker that is usually the service name, like `http://stubbert:8080`, not `localhost`.
3. **Jellyfin:** install the **Webhook** plugin (Dashboard → Plugins → Catalog) and restart Jellyfin. Then open the
   plugin and choose **Add Generic Destination**:
   - *Webhook Url*: the URL Stubbert shows (with **Copy**). Leave the template empty.
   - *Notification Type*: only **Item Added**.
   - *Item Type*: **Movies**, **Episodes** and **Seasons**.
   - Turn on **Send All Properties**, and save.
4. Turn on **Send notifications** and save. The Jellyfin step at the top turns green with the first event.

The last part of the webhook URL is a secret. **New URL…** makes a new one; the old one stops working right away, so
paste the new one into Jellyfin.

## Syncing categories on new items

The same webhook also keeps your categories current: two minutes after the last new movie or episode, Stubbert
runs a sync (guards on), so new titles land in their categories without waiting for the schedule. A big import
gives one sync. This works with *Send notifications* off too; turn it off in **Settings → Schedule**. These runs
show up under **Runs** as *New in Jellyfin*.

## What gets sent

New items wait for a quiet period (default 10 minutes). Every new movie or episode restarts the timer. When it runs
out, Stubbert counts **titles**: every movie is 1, every series is 1, however many episodes it has.

- **5 or more titles at once** (you can change the number): nothing is sent. This keeps a full rescan or a big
  import quiet. Those titles are remembered and never announced later.
- Otherwise:
  - a movie → **Movie message**
  - 1 episode → **Episode message**
  - 2 or more episodes of one season → **Episodes message**
  - every episode of a season in this one batch → **Season message**

Titles that were announced before are skipped (a quality upgrade adds the same title again). Stubbert recognises
them by their TMDb, IMDb or TVDb id. Waiting items survive a restart; events Jellyfin sends while Stubbert is down
are lost.

To know whether a season is complete, Stubbert asks Jellyfin first (only useful when it lists episodes you don't
have yet), then **TVmaze** (free, no key), then **TMDb** if you paste an API key. If none knows, 2 or more episodes
always get an Episodes message.

## Templates

Each kind of message has a title, a content, an image (poster, backdrop or none) and a side colour. Open one with
**Edit**. Templates use a Jinja subset:

- `{{ series.name }}`, with filters: `{{ item.overview | truncate(180) }}`, `{{ season.number | pad(2) }}`,
  `upper`, `lower`, `default("…")`, `join(", ")`, `map(attribute='number')`, `length`, `first`, `last`.
- `{% if links.tmdb %}…{% elif … %}…{% else %}…{% endif %}` and `{% for e in episodes %}…{% endfor %}`.
- `{# comments #}` and `{%- -%}` to trim whitespace.

A line that only holds tags disappears from the message, and empty lines left behind are collapsed, so if-blocks
don't leave gaps. Discord Markdown works in the content: `**bold**`, `[text](link)`.

The **Variables** list shows every variable with its value for the chosen preview item. The preview renders the
message the way Discord shows it, for a sample or a real recent item. A typo blocks saving and gets a **Fix it**.

| Variable | |
|---|---|
| `item.name`, `item.year`, `item.overview`, `item.type` | The movie, episode or season |
| `series.name`, `series.year`, `series.overview` | Episode, Episodes and Season messages |
| `season.number`, `season.name`, `season.episode_count` | Episode, Episodes and Season messages |
| `episode.number`, `episode.name`, `episode.overview` | Episode message |
| `episodes` (list of `season`, `number`, `name`) | Episodes and Season messages |
| `links.tmdb`, `links.imdb`, `links.tvdb`, `links.jellyfin` | Full URLs, or empty when unknown |
| `library.name`, `server.name` | |

## Tagging a role

Under **Discord → Mention**, pick *@everyone* or *A role…*. For a role, paste its tag: type `\@RoleName` in any
Discord channel and send it, and Discord shows `<@&123456789012345678>`. The role id alone works too. The tag goes
in the same message, above the embed (Discord always puts message text there), and pings once. The role needs
*Allow anyone to @mention this role* in the server settings.

Posters are fetched from Jellyfin and sent along with the message, so they work even when Jellyfin is not
reachable from the internet. `links.jellyfin` uses *Jellyfin address for links*; leave it empty to drop that link.

## When something fails

- Discord answers 429 (too many messages): Stubbert waits as asked and tries 3 times. A message that still fails
  shows **Retry** under *Recent* for 24 hours.
- Discord answers 404 (the webhook was deleted): sending pauses. Paste a new webhook URL and the held messages from
  the last 24 hours are sent.
- The status pill at the top shows *Notifications failing* while sending keeps failing.
- To see what Jellyfin sends, start Stubbert with `LOG_LEVEL=debug`: every webhook payload is logged.
