#!/usr/bin/env bash
# Builds Valhalla offline tiles for Maricá + Niterói + São Gonçalo (Phase 4).
# Requires: osmium-tool and valhalla (build tools) installed.
set -euo pipefail

REGION_BBOX="-43.3,-23.1,-42.7,-22.6"
OSM_INPUT="rio-de-janeiro-latest.osm.pbf"
OSM_CROPPED="marica-niteroi-sg.osm.pbf"
CONFIG="ValhallaData/config/valhalla.json"
TILES_DIR="ValhallaData/tiles"

echo "==> [1/4] Baixando OSM do Rio de Janeiro"
if [ ! -f "$OSM_INPUT" ]; then
  wget https://download.geofabrik.de/south-america/brazil/rio-de-janeiro-latest.osm.pbf
fi

echo "==> [2/4] Recortando região Maricá + Niterói + São Gonçalo"
osmium extract -b "$REGION_BBOX" "$OSM_INPUT" -o "$OSM_CROPPED"

echo "==> [3/4] Gerando configuração do Valhalla"
valhalla_build_config --mjx 4 --tile-dir "$TILES_DIR" > "$CONFIG"

echo "==> [4/4] Construindo os tiles de roteamento"
valhalla_build_tiles -c "$CONFIG" "$OSM_CROPPED"

echo "==> Tiles gerados em $TILES_DIR"
echo "==> Validação:"
valhalla_validate_tiles -c "$CONFIG"
