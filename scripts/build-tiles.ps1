# PowerShell: Baixa e prepara os dados OSM para o Valhalla (Maricá + Niterói + São Gonçalo).
# Requisitos: osmium-tool e valhalla instalados (WSL recomendado no Windows).
# Use: bash scripts/build-tiles.sh  (dentro do WSL)

Write-Host "Use o script scripts/build-tiles.sh dentro do WSL/Linux para baixar o OSM e gerar os tiles."

Write-Host ""
Write-Host "Passos manuais:"
Write-Host "  1) wget https://download.geofabrik.de/south-america/brazil/rio-de-janeiro-latest.osm.pbf"
Write-Host "  2) osmium extract -b -43.3,-23.1,-42.7,-22.6 rio-de-janeiro-latest.osm.pbf -o marica-niteroi-sg.osm.pbf"
Write-Host "  3) valhalla_build_config --mjx 4 --tile-dir ValhallaData/tiles > ValhallaData/config/valhalla.json"
Write-Host "  4) valhalla_build_tiles -c ValhallaData/config/valhalla.json marica-niteroi-sg.osm.pbf"
Write-Host "  5) valhalla_validate_tiles -c ValhallaData/config/valhalla.json"
Write-Host ""
Write-Host "Depois de gerar os tiles:"
Write-Host "  1) Copie a pasta ValhallaData/tiles e ValhallaData/config/valhalla.json para o aparelho em:"
Write-Host "     /data/user/0/com.routes/files/valhalla/"
Write-Host "  2) No ValhallaNativeModule.kt, altere isEngineLinked para true."
