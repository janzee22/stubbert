# Smoke test on your server

Run this after installing, and after every Jellyfin or plugin update. Use a throwaway name such as `zz-smoke` so
it is easy to clean up.

1. **Settings:** every connection check is green.
2. **Categories → + Category**, name it `zz-smoke`. Add a **Title** rule that matches two or three movies. The
   match count shows them. Upload a poster. **Save**.
3. **Preview & sync → Preview:** `zz-smoke` shows as *new* with those titles under *Added*. Press **Sync**. The run
   finishes as *ok*.
4. **Preview again** shows *Nothing to change* (a second sync changes nothing).
5. In **Wholphin and Streamyfin**:
   - the **Categories** tile shows `zz-smoke` with its poster, and nothing else you didn't create
   - opening it shows the matched movies
   - the **Collections** tab does *not* show `zz-smoke`
6. Add a sub-category `zz-smoke-child` with its own rule, save and sync. In the apps it shows **inside**
   `zz-smoke` and not at the top of the Categories tile.
7. Open one of the matched movies in jellyfin-web → **Edit metadata**: no new tags, nothing changed.
8. In jellyfin-web, add another movie to `zz-smoke` by hand. **Preview** lists it under *Removed*.
9. Change the rule so it matches nothing. **Preview** shows `zz-smoke` as *skipped* by a guard.
10. If you use the Streamyfin home row, check that it shows the categories.
11. Clean up: select each `zz-smoke` category → **Delete collection in Jellyfin…**, then **Remove category…**,
    then **Save**. The `zz-smoke [boxset]` folders are gone from the Categories folder on disk.
