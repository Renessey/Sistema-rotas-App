const { OfflineRoutingEngine } = require('../src/services/routing/OfflineRoutingEngine');

console.log("Offline Engine Available:", OfflineRoutingEngine.isAvailable());
console.log("Region Metadata:", OfflineRoutingEngine.getRegionMetadata());

const p1 = [-43.0107, -22.9650]; // Maricá / Itaipuaçu
const p2 = [-42.9210, -22.9190]; // Maricá Centro
const p3 = [-42.8200, -22.9200]; // Ponta Negra

console.log("Snap P1:", OfflineRoutingEngine.locate(p1));
console.log("Snap P2:", OfflineRoutingEngine.locate(p2));

console.time("Offline Route P1 -> P2 -> P3");
OfflineRoutingEngine.route([p1, p2, p3], { costing: 'auto' }).then((res) => {
  console.timeEnd("Offline Route P1 -> P2 -> P3");
  console.log("Route calculated successfully!");
  console.log("Distance (meters):", res.distance);
  console.log("Duration (seconds):", res.duration);
  console.log("GeoJSON coordinates count:", res.geojson.features[0].geometry.coordinates.length);
  console.log("First 3 coordinates:", res.geojson.features[0].geometry.coordinates.slice(0, 3));
  console.log("From Road Network:", res.fromRoadNetwork);
}).catch((err) => {
  console.error("Route error:", err);
});
