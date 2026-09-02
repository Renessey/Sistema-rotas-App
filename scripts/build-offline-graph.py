"""
build-offline-graph.py
Compila o arquivo OSM PBF em um grafo de malha viária compacto e indexado espacialmente
para roteamento 100% offline no aplicativo.
"""

import osmium
import math
import json
import os
import sys

def haversine(lon1, lat1, lon2, lat2):
    R = 6371000.0  # meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

SPEED_MAP = {
    'motorway': 80.0,
    'motorway_link': 50.0,
    'trunk': 70.0,
    'trunk_link': 45.0,
    'primary': 60.0,
    'primary_link': 40.0,
    'secondary': 50.0,
    'secondary_link': 35.0,
    'tertiary': 40.0,
    'tertiary_link': 30.0,
    'unclassified': 30.0,
    'residential': 30.0,
    'living_street': 15.0,
    'service': 20.0,
}

ALLOWED_HIGHWAYS = set(SPEED_MAP.keys())

class OSMGraphHandler(osmium.SimpleHandler):
    def __init__(self):
        super(OSMGraphHandler, self).__init__()
        self.nodes = {}
        self.ways = []
        self.min_lon = 180.0
        self.max_lon = -180.0
        self.min_lat = 90.0
        self.max_lat = -90.0

    def node(self, n):
        lon = round(n.location.lon, 6)
        lat = round(n.location.lat, 6)
        self.nodes[n.id] = (lon, lat)
        self.min_lon = min(self.min_lon, lon)
        self.max_lon = max(self.max_lon, lon)
        self.min_lat = min(self.min_lat, lat)
        self.max_lat = max(self.max_lat, lat)

    def way(self, w):
        hw = w.tags.get('highway')
        if hw in ALLOWED_HIGHWAYS and len(w.nodes) >= 2:
            oneway_tag = w.tags.get('oneway', 'no')
            oneway = oneway_tag in ('yes', '1', 'true') or hw in ('motorway', 'motorway_link')
            reverse_oneway = oneway_tag == '-1'
            name = w.tags.get('name', '')
            node_refs = [n.ref for n in w.nodes]
            self.ways.append({
                'id': w.id,
                'highway': hw,
                'name': name,
                'oneway': oneway,
                'reverse_oneway': reverse_oneway,
                'nodes': node_refs
            })

def build_graph(pbf_path, output_json_path):
    print(f"1. Lendo arquivo OSM PBF: {pbf_path}")
    handler = OSMGraphHandler()
    handler.apply_file(pbf_path, locations=True)
    print(f"   -> {len(handler.nodes)} nós e {len(handler.ways)} vias transitáveis.")

    # 2. Compactar IDs de nós
    active_osm_nodes = set()
    for way in handler.ways:
        for n_id in way['nodes']:
            if n_id in handler.nodes:
                active_osm_nodes.add(n_id)

    node_to_compact_id = {}
    nodes_array = []
    for osm_id in active_osm_nodes:
        compact_id = len(nodes_array)
        node_to_compact_id[osm_id] = compact_id
        nodes_array.append(handler.nodes[osm_id])

    print(f"2. Nós viários ativos: {len(nodes_array)}")

    # 3. Construir Arestas e Adjacência
    # Cada aresta: [to_node_id, distance_meters, speed_kmh, oneway_flags, name, way_id]
    # Representação compacta da adjacência:
    # adj[u] = [ [v, dist_m, dur_s, hw_type, name], ... ]
    adj = [[] for _ in range(len(nodes_array))]
    edges_for_spatial_index = []

    GRID_SIZE = 0.005 # ~500 metros por célula de grid para indexação espacial ultra-rápida
    spatial_grid = {}

    def get_grid_key(lon, lat):
        gx = int(math.floor(lon / GRID_SIZE))
        gy = int(math.floor(lat / GRID_SIZE))
        return f"{gx}_{gy}"

    for way_idx, way in enumerate(handler.ways):
        hw = way['highway']
        speed = SPEED_MAP.get(hw, 30.0)
        speed_ms = speed / 3.6
        name = way['name']
        oneway = way['oneway']
        reverse_oneway = way['reverse_oneway']

        node_ids = [node_to_compact_id[n] for n in way['nodes'] if n in node_to_compact_id]
        
        for i in range(len(node_ids) - 1):
            u = node_ids[i]
            v = node_ids[i + 1]
            u_pos = nodes_array[u]
            v_pos = nodes_array[v]
            
            dist = round(haversine(u_pos[0], u_pos[1], v_pos[0], v_pos[1]), 1)
            if dist < 0.1:
                dist = 0.1
            dur = round(dist / speed_ms, 1)

            # Adicionar u -> v se permitido
            if not reverse_oneway:
                adj[u].append([v, dist, dur, hw, name])

            # Adicionar v -> u se bidirecional
            if not oneway and not reverse_oneway:
                adj[v].append([u, dist, dur, hw, name])

            # Indexar segmento no spatial grid
            edge_idx = len(edges_for_spatial_index)
            edges_for_spatial_index.append([u, v, dist, dur, hw, name])

            # Preencher células do grid que interceptam a bounding box do segmento
            min_lon = min(u_pos[0], v_pos[0])
            max_lon = max(u_pos[0], v_pos[0])
            min_lat = min(u_pos[1], v_pos[1])
            max_lat = max(u_pos[1], v_pos[1])

            gx_start = int(math.floor(min_lon / GRID_SIZE))
            gx_end = int(math.floor(max_lon / GRID_SIZE))
            gy_start = int(math.floor(min_lat / GRID_SIZE))
            gy_end = int(math.floor(max_lat / GRID_SIZE))

            for gx in range(gx_start, gx_end + 1):
                for gy in range(gy_start, gy_end + 1):
                    k = f"{gx}_{gy}"
                    if k not in spatial_grid:
                        spatial_grid[k] = []
                    spatial_grid[k].append(edge_idx)

    print(f"3. Arestas viárias: {len(edges_for_spatial_index)}, Células no Grid: {len(spatial_grid)}")

    metadata = {
        'version': '1.0.0',
        'region': 'Maricá - Niterói - São Gonçalo - Região dos Lagos',
        'bounds': [handler.min_lon, handler.min_lat, handler.max_lon, handler.max_lat],
        'totalNodes': len(nodes_array),
        'totalEdges': len(edges_for_spatial_index),
        'gridSize': GRID_SIZE,
    }

    graph_data = {
        'metadata': metadata,
        'nodes': nodes_array,
        'adj': adj,
        'edges': edges_for_spatial_index,
        'spatialGrid': spatial_grid,
    }

    print(f"4. Salvando dados em: {output_json_path}")
    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(graph_data, f, separators=(',', ':'))

    size_mb = os.path.getsize(output_json_path) / (1024 * 1024)
    print(f"   -> Concluído! Tamanho do arquivo compactado: {size_mb:.2f} MB")

if __name__ == '__main__':
    pbf_file = r'c:\Projetos\Routes\src\services\gps\planet_-43.018_-22.972_c488d97d.osm.pbf'
    out_file = r'c:\Projetos\Routes\src\services\routing\offline_road_graph.json'
    build_graph(pbf_file, out_file)
