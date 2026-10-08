# Stubbert — Functionele specificatie: Discord-notificaties

> Voor: Claude Code. Doel: deze feature bouwen in de bestaande app (voorheen *jf-collection-manager* / "Category Collections", nu **Stubbert**).
> UI-teksten zijn Engels; deze spec is Nederlands. Code-identifiers mogen Engels zijn.
> Visueel ontwerp: het Design-canvas "Stubbert · Ticket Booth" (artboards *Notifications*, *Template*, *Notif-states* en de phone-varianten `M-Notifications`, `M-Template`, `M-Template-preview`). Stijlen en tokens: `stubbert.css` (plain CSS, custom properties, geen UI-library).

---

## 0. Eerst doen (verkennen vóór bouwen)

1. Lees de bestaande codebase: backend-taal/framework, database/opslag, hoe config en secrets (env vars) worden gelezen, hoe de React-frontend routes en de globale "draft + save bar" werkt, en hoe de bestaande Jellyfin-client praat met de API.
2. Hernoem zichtbare appnaam "Category Collections" naar **Stubbert** (titel, login, onboarding, `<title>`). De Jellyfin-*plugin* heet nog steeds "Category Collections" — die verwijzingen blijven.
3. Verifieer tegen de echte bronnen (niet uit geheugen):
   - de payload van de **Jellyfin Webhook-plugin** (Generic destination, *Send All Properties*): veldnamen voor itemtype, ids, serie-/seizoen-/afleveringsnummers, provider-ids. Bouw een debug-modus die de ruwe payload logt;
   - de Jellyfin-API-call om afleveringen van een seizoen op te halen inclusief ontbrekende (`/Shows/{seriesId}/Episodes` met seizoen-filter en `isMissing`/`LocationType=Virtual`);
   - de TVmaze-API (lookup op TVDb/IMDb-id, seizoenen, afleveringen, rate limit);
   - de TMDb-API v3 (`/tv/{id}/season/{n}`) — alleen gebruikt als er een key is;
   - de Discord-webhook-API (embeds, limieten, `allowed_mentions`, multipart attachments, 429 `retry_after`).
4. Kies een **Jinja-compatibele template-engine met sandbox** passend bij de backend (bijv. Python `jinja2.sandbox.SandboxedEnvironment`, Go `gonja`, Node `nunjucks`). Geen bestandstoegang, geen netwerk, geen attribute-escapes.

---

## 1. Doel

Wanneer er **iets nieuws** in Jellyfin komt, post Stubbert **één overzichtelijk bericht** in een Discord-kanaal.

- Alleen nieuwe items. Updates (kwaliteitsupgrade, re-scan, metadata-refresh) geven **geen** bericht.
- Afleveringen worden gebundeld per serie:
  - precies 1 aflevering → **Episode message**;
  - 2 of meer afleveringen, maar geen heel seizoen → **Episodes message** (één bericht dat ze opsomt);
  - een heel seizoen → **Season message** (alleen het seizoen, geen lijst).
- Notificaties zijn voor **een paar losse nieuwe dingen**. Komen er in één batch **5 of meer verschillende titels** binnen (instelbaar), dan wordt **niets** gestuurd. Een film telt als 1 titel, een serie als 1 titel, ongeacht het aantal afleveringen. Zo blijft een volledige herscan of een grote import stil.
- Berichten zijn aanpasbaar met Jinja-templates en hebben in de UI een live Discord-preview.

Niet in scope: andere kanalen dan Discord, **meer dan één Discord-kanaal** (mogelijk later: bijv. aparte kanalen voor films en series — houd het datamodel daar niet onnodig op dicht, maar bouw het niet), per-gebruiker-meldingen, muziek/boeken.

## 2. Begrippen

| Term | Betekenis |
|---|---|
| Event | Eén POST van de Jellyfin Webhook-plugin naar Stubbert. |
| Item | Film of aflevering uit een event, genormaliseerd. |
| Announced key | Stabiele sleutel waarmee Stubbert herkent dat iets al eens gemeld is. |
| Batch | Alle nieuwe items (films én afleveringen) die binnenkomen tot het stil is. Er is altijd hooguit één open batch. |
| Quiet period | Instelbare minuten zonder enig nieuw item; daarna wordt de batch verwerkt. Default 10. |
| Titel | Telling-eenheid in een batch: elke film = 1, elke serie = 1 (ongeacht het aantal afleveringen of seizoenen). |
| Bulk threshold | Aantal titels in één batch vanaf waar niets gestuurd wordt. Default 5 (dus 5 of meer = stil). |
| Message kind | `movie`, `episode`, `episodes`, `season`. Elk heeft een eigen template. |

## 3. Flow

```
Jellyfin (Webhook plugin, ItemAdded)
   │ POST /hooks/jellyfin/{token}
   ▼
Stubbert ingest ──► valideren ──► normaliseren ──► filteren ──► dedupe (announced?)
                                                                   │
                                          open batch (film of aflevering) — elke toevoeging reset de timer
                                                                   │ quiet period verstreken (of "Send now")
                                                                   ▼
                                          titels tellen ── ≥ bulk threshold ──► alles "Skipped · bulk", niets sturen
                                                                   │ < threshold
                                                                   ▼
                                          per titel: film → movie; serie → per seizoen classificeren
                                                                   ▼
                                          template renderen ──► Discord webhook ──► activity log
```

## 4. Ingest-endpoint

- `POST /hooks/jellyfin/{token}` — publiek bereikbaar voor Jellyfin, **buiten** de UI-login.
- `token`: ≥128 bit random, URL-safe. Vergelijk constant-time. Opslaan als hash is prima zolang de UI de volledige URL kan tonen (dus: plaintext encrypted at rest óf alleen tonen direct na aanmaken — kies plaintext-in-DB als dat in deze app de norm is voor secrets; documenteer de keuze).
- Antwoorden:
  - `202 Accepted` zodra het event is opgeslagen (verwerking async, Jellyfin mag niet wachten);
  - `401` bij onbekend token → tel als *refused event* (voor de UI-staat "Jellyfin uses an old URL"), log zonder payload;
  - `400` bij onleesbare payload → log de ruwe body (ingekort) op debug-niveau;
  - `413` bij body > 1 MB.
- Rotatie: "New URL…" maakt een nieuw token; het oude werkt **direct** niet meer (UI waarschuwt vooraf).
- Instelling *Stubbert's address, as Jellyfin sees it* (bijv. `http://stubbert:8080`) is alleen bedoeld om de juiste volledige URL in de UI te tonen.

### Normalisatie

Zet elke payload om naar een intern model:

```
Item {
  jellyfin_id, type: movie|episode, name, year, overview,
  library_id/library_name,
  provider_ids { tmdb, imdb, tvdb },
  // episodes:
  series { jellyfin_id, name, provider_ids { tmdb, imdb, tvdb } },
  season_number, episode_number, episode_end_number (dubbele afleveringen),
  received_at
}
```

Andere itemtypes (Season, Series, Audio, …) en andere notification types dan *ItemAdded* worden genegeerd (wel tellen in debug-statistiek).

## 5. Filteren en dedupe

1. Master switch *Send notifications* uit → events wel accepteren en loggen als "Notifications off", niets bufferen.
2. Type-filter: *Movies* en/of *Episodes and seasons*.
3. Bibliotheekfilter: lege lijst = alle bibliotheken.
4. **Announced keys** (permanent opgeslagen):
   - film: `movie:tmdb:{id}` → anders `movie:imdb:{id}` → anders `movie:jf:{normalized name}:{year}`;
   - aflevering: `ep:{series key}:S{season}E{episode}` waarbij series key = tmdb → tvdb → imdb → jellyfin series id.
   - Bestaat de key al (en *Skip titles that were announced before* staat aan) → niet melden, activity-regel "Skipped · Announced before. Looks like a quality upgrade."
   - Een key wordt pas vastgelegd **na een geslaagde verzending** of bij **Skipped** (ook bij een bulk-skip, zodat die titels later nooit alsnog gemeld worden), niet bij binnenkomst.
   - Dedupe zit vóór het tellen: titels die al gemeld zijn tellen niet mee voor de bulk threshold.
5. Dezelfde aflevering twee keer in één batch → één keer tellen.

## 6. Batch en wachttijd

- Er is hooguit **één open batch** voor alles (films en afleveringen samen). Elk nieuw item dat de filters en dedupe doorkomt: toevoegen en `flush_at = now + quiet_period` (timer reset).
- Quiet period: integer minuten, 1–120, default 10 (UI-validatie: "Use 1 to 120 minutes.").
- De batch staat in de database, niet alleen in geheugen. Bij herstart: is `flush_at` verstreken, dan direct verwerken; anders de timer herstellen.
- Een scheduler/worker controleert elke ~15 s of de batch aan de beurt is.
- **Send now** (UI) verwerkt de open batch direct (inclusief de bulk-controle).
- Gevolg: ook films wachten de quiet period af. Dat is nodig om te kunnen tellen.

## 7. Verwerken bij flush

### 7a. Bulk-controle (eerst)
- Tel titels: elke film = 1, elke serie (series key) = 1.
- `titels ≥ bulk_threshold` → **niets versturen**. Alle items in de batch krijgen hun announced key, en er komt één activity-regel: "Skipped · {n} titles at once — Looks like a rescan or big import, so nothing was sent." met een uitklapbare lijst van de titels ("Show titles"). Geen Retry/Send-optie.
- Bulk threshold: integer 2–100, default 5. Voorbeeld uit de wens: 3 films + 5 afleveringen van 1 serie = 4 titels → wél versturen.
- Een volledige herscan levert daarnaast via de dedupe (§5) normaal al niets op; de bulk-regel vangt de rest af (bijv. een nieuwe bibliotheek of herinstallatie met lege database).

### 7b. Classificeren (per titel)
- Film → `movie`, één bericht per film.
- Serie: groepeer de afleveringen **per seizoen**. Per seizoen:

| Inhoud van deze batch voor dat seizoen | Bericht |
|---|---|
| precies 1 aflevering | `episode` |
| ≥ 2 afleveringen én de batch bevat **alle** afleveringen van het seizoen | `season` |
| ≥ 2 afleveringen, niet compleet (of onbekend) | `episodes` |

- "Alle afleveringen" = de verzameling afleveringsnummers die de bron voor dat seizoen geeft (zie §8), inclusief nog niet uitgezonden afleveringen als de bron die kent. Dubbele afleveringen (`episode_end_number`) tellen voor alle nummers die ze dekken.
- Seizoen 0 (specials) is nooit `season`.
- *Aanname (bevestigd door de gebruiker):* als 9 van 10 afleveringen er al waren en de 10e komt los binnen, is dat een `episode`-bericht — "heel seizoen" gaat over wat er in **deze batch** binnenkwam.
- Meerdere seizoenen van één serie in een batch → één bericht per seizoen, in seizoensvolgorde.
- Volgorde van berichten binnen een batch: in volgorde van binnenkomst van de eerste aflevering/film per titel.

## 8. Hoeveel afleveringen heeft een seizoen? (bronnen)

Probeer in volgorde, neem het eerste bruikbare antwoord:

1. **Jellyfin** — afleveringen van het seizoen opvragen inclusief ontbrekende/virtuele. Bruikbaar als Jellyfin minstens één ontbrekende of een complete lijst teruggeeft die klopt met de batch. (Verifieer of Jellyfin ontbrekende afleveringen standaard kent; zo niet, beschouw Jellyfin als "onbekend" wanneer er geen virtuele items zijn en de batch = alles wat Jellyfin heeft. Documenteer het gedrag dat je vindt.)
2. **TVmaze** (aan/uit, default aan; geen key) — lookup via TVDb- of IMDb-id, dan seizoenen → `episodeOrder` of afleveringslijst. Respecteer de rate limit; time-out 5 s.
3. **TMDb** (alleen als er een API key is ingevuld) — `/tv/{tmdb_id}/season/{n}` → afleveringslijst. Time-out 5 s.

- Cache per (serie, seizoen) 24 uur.
- Geen bron weet het → classificeer als `episodes` (nooit `season`) en log "Season size unknown".
- Fouten van een bron (time-out, 401 bij TMDb) → door naar de volgende bron; TMDb-401 tonen in de UI ("TMDb rejected the API key").

## 9. Templates

Vier templates, één per message kind, elk met:

| Veld | Regels |
|---|---|
| `title` | Jinja, max 256 tekens na renderen |
| `content` | Jinja, max 4096 tekens na renderen; Discord-Markdown toegestaan |
| `image` | `poster` \| `backdrop` \| `none` |
| `color` | hex, default `#FFBE2E` |

Globaal (niet per template): mention (geen / `@everyone` / role-id), username override (default "Stubbert"), Jellyfin-adres voor links.

### Render-gedrag
- Sandboxed Jinja. Filters minimaal: `truncate`, `pad` (nul-padding, bijv. `pad(2)` → `03`), `upper`, `lower`, `default`, `join`, `length`.
- Na renderen: trailing whitespace per regel weg, 3+ lege regels → max 1 lege regel, begin/einde trimmen (zodat lege `{% if %}`-blokken geen gaten laten).
- Te lang → afkappen op woordgrens met `…`. Totale embed ≤ 6000 tekens (Discord-limiet).
- Renderfout tijdens verzenden → val terug op de **default template** van dat kind, verstuur, en log een warning in de activity ("Used the default template: …").

### Variabelen (context)
```
item:      { name, year, overview, type }            # film of seizoen/aflevering
series:    { name, year, overview }                  # alleen episode/episodes/season
season:    { number, name, episode_count }           # episode_count = bekend aantal of null
episode:   { number, name, overview }                # alleen 'episode'
episodes:  [ { season, number, name } … ]            # 'episodes' en 'season'
links:     { tmdb, imdb, tvdb, jellyfin }            # volledige URLs of null
library:   { name }
server:    { name }
```
`links.jellyfin` = *Jellyfin address for links* + `/web/#/details?id={id}` (verifieer het juiste pad voor de Jellyfin-versie). Leeg adres → `null`.

### Defaults (Nederlands, zoals de gebruiker ze gebruikt)
```
movie.title:     {{ item.name }} ({{ item.year }}) is beschikbaar
movie.content:   {% if item.overview %}{{ item.overview | truncate(180) }}

{% endif %}Externe links:
[TMDb]({{ links.tmdb }})
[Jellyfin]({{ links.jellyfin }})

episode.title:   {{ series.name }} S{{ season.number | pad(2) }}E{{ episode.number | pad(2) }} is beschikbaar
episode.content: Externe links:
[TMDb]({{ links.tmdb }})
[Jellyfin]({{ links.jellyfin }})

episodes.title:  {{ series.name }}: {{ episodes | length }} nieuwe afleveringen
episodes.content: Seizoen {{ season.number }} · aflevering {{ episodes | map(attribute='number') | join(', ') }}

Externe links:
[TMDb]({{ links.tmdb }})
[Jellyfin]({{ links.jellyfin }})

season.title:    {{ series.name }} Season {{ season.number }} is beschikbaar
season.content:  {% if item.overview %}{{ item.overview | truncate(180) }}
{% endif %}Externe links:
[TMDb]({{ links.tmdb }})
[Jellyfin]({{ links.jellyfin }})
```
Links met een `null`-waarde: de default templates moeten die regel weglaten (`{% if links.tmdb %}…{% endif %}`) — pas de defaults daarop aan.

### Validatie bij opslaan (blokkeert Save)
- Syntaxfout → "Line {n}: {melding in gewone taal}."
- Onbekende variabele (render met de sample-context in strict-undefined-modus) → "Line {n}: there is no `{naam}`. Did you mean `{suggestie}`?" (Levenshtein op bekende paden). De UI biedt "Fix it".
- Lengte na renderen met sample > limiet → waarschuwing (blokkeert niet).

## 10. Discord verzenden

- Webhook-URL: secret; in UI gemaskeerd met Show. Valideer vorm (`https://discord.com/api/webhooks/…` of `discordapp.com`).
- Payload: `username`, `content` = mention (indien ingesteld), `embeds[0]` = { title, description, color, thumbnail }, `allowed_mentions` beperkt tot de gekozen role/everyone.
- **Afbeelding:** Jellyfin is meestal niet publiek bereikbaar, dus Stubbert haalt poster/backdrop zelf op via de Jellyfin-API en stuurt die mee als **multipart attachment** (`attachment://poster.jpg` in de embed). Poster → `thumbnail`, backdrop → `image`. Max ~8 MB; schaal zo nodig.
- Avatar: die van de webhook zoals ingesteld in Discord (geen avatar-upload in Stubbert).
- Rate limits: bij `429` wachten op `retry_after`; max 3 pogingen met backoff; volgorde behouden.
- Mislukt na 3 pogingen → activity "Failed" met leesbare oorzaak (bijv. "Discord answered 429: too many messages. Tried 3 times."), knop **Retry**. Mislukte berichten 24 uur bewaren.
- `404` van Discord → status "Discord doesn't know this webhook (404)", pauzeer verzenden tot de URL is aangepast; wachtende berichten blijven 24 uur staan.
- **Send test message** stuurt een vast testbericht met de huidige instellingen en meldt het resultaat inline.

## 11. Opslag (indicatief)

- `notification_settings` (1 rij): enabled, types, library_ids, quiet_minutes, bulk_threshold, skip_announced, tvmaze_enabled, tmdb_api_key (secret), webhook_token, public_address, discord_webhook_url (secret), username, mention, jellyfin_link_base.
- `notification_templates`: kind (PK), title, content, image, color, updated_at.
- `announced_items`: key (PK), kind, title, announced_at.
- `pending_batch` (hooguit 1 open): id, flush_at, created_at; `pending_items`: batch FK, item JSON, received_at.
- `notification_activity`: id, created_at, status (`sent|waiting|skipped|failed`), reason (`announced|bulk|disabled|…`), title, detail, message_kind, payload (voor retry of de titellijst bij bulk), error.
- `ingest_stats`: last_event_at, last_event_summary, refused_count + last_refused_at.
- `season_size_cache`: (series_key, season) → count/episode-numbers, source, fetched_at.

## 12. API voor de UI (indicatief)

| Methode | Pad | Doel |
|---|---|---|
| GET/PUT | `/api/notifications/settings` | instellingen (secrets gemaskeerd terug) |
| POST | `/api/notifications/token/rotate` | nieuwe webhook-URL |
| GET | `/api/notifications/status` | pijplijnstatus: laatste event, refused-teller, open batch (titels + flush_at), laatste verzending, Discord-status |
| GET/PUT | `/api/notifications/templates/{kind}` | template lezen/opslaan (met validatie) |
| POST | `/api/notifications/templates/{kind}/reset` | terug naar default |
| POST | `/api/notifications/preview` | body: kind, title, content, image, color, sample_id → gerenderde embed + validatie-meldingen |
| GET | `/api/notifications/samples` | recente echte items/batches voor de preview-keuzelijst, plus "Sample data" |
| POST | `/api/notifications/test` | testbericht naar Discord |
| GET | `/api/notifications/activity` | recente activiteit (paginering) |
| POST | `/api/notifications/batch/send` | Send now (open batch, met bulk-controle) |
| POST | `/api/notifications/activity/{id}/retry` | Retry |

Alle UI-endpoints achter de bestaande login. Instellingen en templates doen mee in de bestaande **draft + save bar** (één draft voor de hele app).

## 13. UI (zie canvas)

**Navigatie:** nieuwe tab **Notifications** (bel-icoon) tussen Runs en Settings; op de telefoon label "Notify".

**Notifications-overzicht** (`Notifications` / `M-Notifications`):
1. Kop + toggle *Send notifications*.
2. Pijplijnstrook **Jellyfin webhook → Stubbert groups & filters → Discord**, per stap icoon + status (ok/wacht/fout) + laatste activiteit. Op telefoon verticaal.
3. *Jellyfin webhook*: adres-veld, webhook-URL met **Copy**, "New URL…" (bevestiging), uitklapbare stappen voor de Jellyfin Webhook-plugin (Generic destination, alleen *Item Added*, itemtypes Movies/Episodes/Seasons, *Send All Properties* aan).
4. *What gets announced*: types, bibliotheken (chip-picker), *Send when Jellyfin has been quiet for* + tijdlijn-uitleg, *Stay quiet when this many titles arrive at once* (default 5, met uitleg over het tellen), de uitkomsten per titel (film → Movie, 1 aflevering → Episode, 2+ → Episodes, heel seizoen → Season), bronnen voor seizoensgrootte (Jellyfin ✓, TVmaze toggle, TMDb optionele key), *Skip titles that were announced before*.
5. *Messages*: vier rijen met mini-preview + Edit.
6. *Discord*: webhook-URL, Post as, Mention, Jellyfin address for links, Send test message.
7. *Recent* (zijpaneel desktop / sectie telefoon): Waiting (met Send now), Sent, Skipped (met reden; bulk-skip met "Show titles"), Failed (met Retry).

**Template-editor** (`Template` / `M-Template` / `M-Template-preview`):
- Wisselaar Movie / Episode / Episodes / Season; Reset to default.
- Title (één regel) en Content (meerregelig) met Jinja-highlighting en regelnummers, tekenteller. Implementatie zonder UI-library: `<textarea>` boven een `<pre>` met dezelfde metrics voor de kleuring.
- Toolbar: Variable ▾, If-block, Link. Image (Poster/Backdrop/None), Side color (swatches + hex).
- Variabelenlijst met echte waarden van het gekozen sample; klik = invoegen op cursorpositie.
- Preview rechts (telefoon: tab Preview): sample-keuze, Discord Dark/Light, gerenderd bericht zoals Discord (avatar, naam + APP-badge, tijd, mention, embed met gekleurde zijbalk, titel, Markdown-beschrijving met links, poster rechts), checks, "Send test to #kanaal". Preview debounced (~300 ms) via `/preview`.
- Fouten bij de regel, Save geblokkeerd zolang er een fout is (save bar toont "Fix 1 problem").

**Staten** (`Notif-states`): niet ingesteld (lege staat met Stubbert + "Set up notifications"), wacht op eerste event (met Docker-tip), refused events door oud token, Discord 404, templatefout, nog niets gemeld.

**Globale status:** faalt verzenden structureel (404, herhaalde fouten), dan toont de statuspil rechtsboven "Notifications failing" en linkt naar Notifications.

Toegankelijkheid zoals de rest van het ontwerp: WCAG 2.2 AA, targets ≥ 44 px, status nooit alleen met kleur, zichtbare focus, `prefers-reduced-motion`.

## 14. Beveiliging

- Webhook-token en Discord-URL en TMDb-key zijn secrets: niet loggen, gemaskeerd in API-responses (behalve de webhook-URL in de daarvoor bedoelde weergave).
- Template-sandbox: geen toegang tot Python/JS-internals, geen I/O, render-timeout (bijv. 200 ms) en output-limiet.
- Ingest-endpoint: body-limiet, rate limit (bijv. 60/min), geen redirects volgen.
- Discord-URL alleen naar Discord-hosts posten (voorkomt dat Stubbert als proxy naar willekeurige URLs gebruikt wordt).

## 15. Randgevallen

- Jellyfin stuurt hetzelfde event dubbel → dedupe op (jellyfin_id, notification type) binnen 1 uur.
- Aflevering zonder seizoens-/afleveringsnummer → als `episode` behandelen met wat bekend is; log warning.
- Serie zonder provider-ids → series key = Jellyfin-id; TVmaze/TMDb overslaan.
- Volledige herscan of herinstallatie → dedupe + bulk-regel (§7a): er wordt niets gestuurd.
- Stubbert lag uit terwijl Jellyfin events stuurde → die zijn verloren; geen backfill (documenteren in de UI-help).
- Quiet period of bulk threshold gewijzigd terwijl er een batch open staat → nieuwe quiet period geldt bij de volgende reset (bestaande `flush_at` niet herberekenen); de bulk threshold wordt pas bij flush gelezen, dus de nieuwe waarde geldt.

## 16. Acceptatiecriteria (testscenario's)

1. 1 film toegevoegd → na de quiet period 1 Movie message; later een tweede event voor dezelfde film (upgrade) → Skipped.
2. 1 aflevering, daarna 10 min stil → 1 Episode message.
3. 3 afleveringen binnen 10 min (timer reset bij elke) → 1 Episodes message 10 min na de laatste.
4. Alle 10 afleveringen van een seizoen (bron zegt 10) → 1 Season message, geen afleveringslijst.
5. Zelfde als 4, maar geen bron weet de grootte → Episodes message + log "Season size unknown".
6. 9 van 10 waren er al, 10e komt los → Episode message.
7. Afleveringen uit seizoen 1 en 2 van één serie in één batch → twee berichten, S1 eerst (telt als 1 titel).
8. Herstart van Stubbert met een open batch → batch blijft, wordt op tijd (of direct als verlopen) verwerkt.
9. Event met verkeerd token → 401, refused-teller +1, UI-staat zichtbaar.
10. Discord geeft 429 → wacht `retry_after`, slaagt bij herhaling; na 3 mislukkingen Failed + Retry werkt.
11. Template met `{{ seasn.number }}` → Save geblokkeerd met regel en suggestie.
12. Preview toont voor de default Season-template met sample "The Handmaid's Tale · Season 6": titel "The Handmaid's Tale Season 6 is beschikbaar", "Externe links:" met TMDb- en Jellyfin-link, poster rechts, gekleurde zijbalk.
13. Poster komt aan in Discord terwijl Jellyfin alleen intern bereikbaar is (attachment).
14. Notifications uit → events gelogd, niets verstuurd, niets gebufferd.
15. 3 films + 5 afleveringen van 1 serie binnen de wachttijd (= 4 titels) → 3 Movie messages + 1 Episodes message.
16. 4 films + 1 aflevering (= 5 titels) → niets verstuurd; één activity-regel "5 titles at once"; dezelfde titels later opnieuw binnen → Skipped (announced).
17. Volledige bibliotheek-herscan → geen enkel Discord-bericht.
18. Een film komt binnen, 8 minuten later nog een film (timer reset) → beide pas 10 minuten na de tweede, als 2 Movie messages.

## 17. Besluiten en open punten

Besloten:
- Eén Discord-kanaal. Meerdere kanalen (bijv. films/series apart) is een mogelijke latere uitbreiding, nu out of scope.
- Bij een volledige herscan wordt niets gestuurd.
- 5 of meer verschillende titels in één batch → helemaal niets sturen (drempel instelbaar).
- Films krijgen elk een eigen bericht; ze worden niet tot één bericht gebundeld.

Open:
- Moeten titels uit een bulk-skip echt nooit meer gemeld worden (huidige keuze), of mag je ze vanuit de activity alsnog versturen?
