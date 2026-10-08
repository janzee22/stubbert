# Changelog

The app and the plugin share one version. The plugin's version has a fourth `.0` because Jellyfin wants one.

## 1.0.0

First public release.

- **Categories:** rule-based collections (genre, studio, tag, title) with sub-categories, posters, sort names and
  descriptions, in their own Categories library.
- **Preview and sync:** see per category what would change, sync by hand, on a schedule or when new items arrive.
  Safety guards skip a category that would suddenly lose most of its items.
- **Discord notifications:** one message per new movie, episode or whole season, with poster and editable
  templates. Bulk imports and quality upgrades stay quiet.
- **Onboarding:** choose a password, connect Jellyfin and create the Categories library from the browser.
- **Plugin:** the Categories library lists only categories, and they stay out of the normal Collections tab.
  Targets Jellyfin 12.1, also runs on 12.2.
