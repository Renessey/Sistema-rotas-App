# PowerShell: Baixa e prepara os dados OSM para o Valhalla / Roteador Offline Nativo.
# Requisitos: Python com pacote 'osmium' instalado (pip install osmium).

Write-Host "Compilando grafo de roteamento offline a partir do arquivo .osm.pbf..."
python scripts/build-offline-graph.py

Write-Host ""
Write-Host "Grafo offline compilado com sucesso em src/services/routing/offline_road_graph.json!"
Write-Host "O aplicativo já está pronto para rotear 100% offline seguindo as vias do mapa."
