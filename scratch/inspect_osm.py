import osmium
import sys

class RoadCounter(osmium.SimpleHandler):
    def __init__(self):
        super(RoadCounter, self).__init__()
        self.num_nodes = 0
        self.num_ways = 0
        self.num_highways = 0
        self.highway_types = {}
        self.min_lat = 90
        self.max_lat = -90
        self.min_lon = 180
        self.max_lon = -180

    def node(self, n):
        self.num_nodes += 1
        lat = n.location.lat
        lon = n.location.lon
        self.min_lat = min(self.min_lat, lat)
        self.max_lat = max(self.max_lat, lat)
        self.min_lon = min(self.min_lon, lon)
        self.max_lon = max(self.max_lon, lon)

    def way(self, w):
        self.num_ways += 1
        if 'highway' in w.tags:
            self.num_highways += 1
            hw = w.tags['highway']
            self.highway_types[hw] = self.highway_types.get(hw, 0) + 1

counter = RoadCounter()
counter.apply_file(r'c:\Projetos\Routes\src\services\gps\planet_-43.018_-22.972_c488d97d.osm.pbf', locations=True)

print(f"Total Nodes: {counter.num_nodes}")
print(f"Total Ways: {counter.num_ways}")
print(f"Total Highways: {counter.num_highways}")
print(f"Bounding Box: [{counter.min_lon}, {counter.min_lat}, {counter.max_lon}, {counter.max_lat}]")
print(f"Highway types: {counter.highway_types}")
