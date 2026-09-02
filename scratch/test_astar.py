import osmium
import math
import heapq
import time

def haversine(lon1, lat1, lon2, lat2):
    R = 6371000  # meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(delta_lambda/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1-a))

class OSMGraphExtractor(osmium.SimpleHandler):
    def __init__(self):
        super(OSMGraphExtractor, self).__init__()
        self.nodes = {}
        self.ways = []
        self.allowed = {
            'motorway', 'motorway_link', 'trunk', 'trunk_link',
            'primary', 'primary_link', 'secondary', 'secondary_link',
            'tertiary', 'tertiary_link', 'unclassified', 'residential',
            'living_street', 'service'
        }

    def node(self, n):
        self.nodes[n.id] = (n.location.lon, n.location.lat)

    def way(self, w):
        hw = w.tags.get('highway')
        if hw in self.allowed and len(w.nodes) >= 2:
            oneway = w.tags.get('oneway') == 'yes' or hw in ('motorway', 'motorway_link')
            name = w.tags.get('name', '')
            self.ways.append({
                'id': w.id,
                'hw': hw,
                'name': name,
                'oneway': oneway,
                'nodes': [n.ref for n in w.nodes]
            })

extractor = OSMGraphExtractor()
extractor.apply_file(r'c:\Projetos\Routes\src\services\gps\planet_-43.018_-22.972_c488d97d.osm.pbf', locations=True)

# Build Adjacency Graph
adj = {}
coords = {}

for way in extractor.ways:
    n_list = way['nodes']
    oneway = way['oneway']
    for i in range(len(n_list) - 1):
        u = n_list[i]
        v = n_list[i+1]
        p_u = extractor.nodes[u]
        p_v = extractor.nodes[v]
        coords[u] = p_u
        coords[v] = p_v
        d = haversine(p_u[0], p_u[1], p_v[0], p_v[1])
        
        if u not in adj: adj[u] = []
        if v not in adj: adj[v] = []
        
        adj[u].append((v, d, way['name'], way['hw']))
        if not oneway:
            adj[v].append((u, d, way['name'], way['hw']))

print(f"Graph built with {len(coords)} nodes and adjacency for {len(adj)} junctions.")

# Pick two nodes and run A*
node_ids = list(coords.keys())
start_node = node_ids[100]
target_node = node_ids[5000]

print(f"Routing from {coords[start_node]} to {coords[target_node]}")

t0 = time.time()
def a_star(start, goal):
    pq = [(0, start)]
    g_score = {start: 0}
    came_from = {}
    
    goal_lon, goal_lat = coords[goal]
    
    while pq:
        f, u = heapq.heappop(pq)
        if u == goal:
            break
        
        u_g = g_score[u]
        if f > u_g + haversine(coords[u][0], coords[u][1], goal_lon, goal_lat):
            continue
            
        for v, d, name, hw in adj.get(u, []):
            tentative_g = u_g + d
            if tentative_g < g_score.get(v, float('inf')):
                g_score[v] = tentative_g
                came_from[v] = u
                h = haversine(coords[v][0], coords[v][1], goal_lon, goal_lat)
                heapq.heappush(pq, (tentative_g + h, v))
                
    if goal not in came_from and goal != start:
        return None, 0
        
    curr = goal
    path = []
    while curr:
        path.append(coords[curr])
        curr = came_from.get(curr)
    path.reverse()
    return path, g_score[goal]

path, dist = a_star(start_node, target_node)
dt = (time.time() - t0) * 1000
print(f"A* finished in {dt:.2f} ms! Path nodes: {len(path) if path else 0}, Total distance: {dist:.1f} m")
