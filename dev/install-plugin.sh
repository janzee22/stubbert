#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
bash ../plugin/pack.sh >/dev/null
version=$(jq -r .version ../plugin/meta.json)
plugins=data/config/plugins
mkdir -p "$plugins"
rm -rf "$plugins"/Stubbert_*
cp -R "../plugin/dist/Stubbert_${version}" "$plugins/"
echo "Installed Stubbert ${version} into dev/${plugins}"
if [ -n "$(docker compose ps -q jellyfin 2>/dev/null)" ]; then
  docker compose restart jellyfin >/dev/null
  echo "Restarted Jellyfin"
fi
