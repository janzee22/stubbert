#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
url=${1:?usage: manifest.sh <zip-url> [changelog]}
changelog=${2:-}
# The catalog shows this image; it is served from main, like manifest.json itself.
image=https://raw.githubusercontent.com/janzee22/stubbert/main/plugin/thumb.png
version=$(jq -r .version meta.json)
zip="dist/Stubbert_${version}.zip"
[ -f "$zip" ] || { echo "$zip not found, run pack.sh first" >&2; exit 1; }
if command -v md5sum >/dev/null; then checksum=$(md5sum "$zip" | cut -d' ' -f1); else checksum=$(md5 -q "$zip"); fi
manifest=../manifest.json
[ -f "$manifest" ] || echo '[]' > "$manifest"
jq --slurpfile meta meta.json \
  --arg url "$url" --arg image "$image" --arg changelog "$changelog" --arg checksum "$checksum" \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  $meta[0] as $m
  | {version: $m.version, changelog: $changelog, targetAbi: $m.targetAbi,
     sourceUrl: $url, checksum: $checksum, timestamp: $timestamp} as $entry
  | (map(select(.guid == $m.guid)) | first // {versions: []}) as $old
  | [$m | {guid, name, description, overview, owner, category, imageUrl: $image}
      + {versions: ([$entry] + ($old.versions | map(select(.version != $m.version))))}]
    + map(select(.guid != $m.guid))
' "$manifest" > "$manifest.tmp"
mv "$manifest.tmp" "$manifest"
echo "manifest.json: $version → $url"
