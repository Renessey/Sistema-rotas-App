// Test routing from condo
async function test() {
  // Example coordinate in Marica condo
  // User might be at Itaocaia / Inoa / Sao Jose etc.
  // Let's test routing with different OSRM / OSM endpoints
  const origin = [-42.98234, -22.92451];
  const destination = [-42.97123, -22.91890];

  const endpoints = [
    { name: 'OSRM Driving', url: `https://router.project-osrm.org/route/v1/driving/${origin.join(',')};${destination.join(',')}?overview=full&geometries=geojson&snapping=any` },
    { name: 'OSM DE Car', url: `https://routing.openstreetmap.de/routed-car/route/v1/driving/${origin.join(',')};${destination.join(',')}?overview=full&geometries=geojson&snapping=any` },
    { name: 'OSM DE Bike', url: `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${origin.join(',')};${destination.join(',')}?overview=full&geometries=geojson&snapping=any` },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url);
      const data = await res.json();
      console.log(ep.name, 'code:', data.code, 'points:', data.routes?.[0]?.geometry?.coordinates?.length);
    } catch(e) {
      console.error(ep.name, 'error:', e.message);
    }
  }
}
test();
