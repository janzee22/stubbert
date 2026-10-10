#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
version=$(jq -r .version meta.json)
dotnet test --nologo -v quiet
dotnet build Jellyfin.Plugin.Stubbert -c Release --nologo -v quiet
out="dist/Stubbert_${version}"
rm -rf "$out" && mkdir -p "$out"
cp Jellyfin.Plugin.Stubbert/bin/Release/net10.0/Jellyfin.Plugin.Stubbert.dll meta.json thumb.png "$out/"
rm -f "$out.zip" && (cd "$out" && zip -qr "../Stubbert_${version}.zip" .)
echo "dist/Stubbert_${version}.zip"
