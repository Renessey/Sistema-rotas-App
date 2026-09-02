import osmium
import math
import heapq
import json
import sqlite3

class OSMGraphExtractor(osmium.SimpleHandler):
    def __init__(self):
        super(OSMGraphExtractor, self).__init__()
        self.nodes = {}
        self.ways = []
        self.allowed_highways = {
            'motorway', 'motorway_link', 'trunk', 'trunk_link',
            'primary', 'primary_link', 'secondary', 'secondary_link',
            'tertiary', 'tertiary_link', 'unclassified', 'residential',
            'living_street', 'service'
        }

    def node(self, n):
        self.nodes[n.id] = (n.location.lon, n.location.lat)

    def way(self, w):
        hw = w.tags.get('highway')
        if hw in self.allowed_highways and len(w.nodes) >= 2:
            oneway = w.tags.get('oneway') == 'yes' or hw in ('motorway', 'motorway_link')
            name = w.tags.get('name', '')
            maxspeed = w.tags.get('maxspeed', '')
            node_refs = [n.ref for n in w.nodes]
            self.ways.append({
                'id': w.id,
                'highway': hw,
                'name': name,
                'oneway': oneway,
                'nodes': node_refs
            })

print("Extracting nodes and ways from OSM PBF...")
extractor = OSMGraphExtractor()
extractor.apply_file(r'c:\Projetos\Routes\src\services\gps\planet_-43.018_-22.972_c488d97d.osm.pbf', locations=True)
print(f"Extracted {len(extractor.nodes)} nodes and {len(extractor.ways)} drivable ways.")

# Test building adjacency
adj = {}
used_nodes = set()
for way in extractor.ways:
    for n in way['nodes']:
        used_nodes.add(n)

print(f"Total active road nodes: {len(used_nodes)}")
