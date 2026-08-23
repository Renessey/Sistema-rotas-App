async function testOSRM() {
  // Let's test with various points in Marica
  const points = [
    [-42.98234, -22.92451], // Condo point
    [-42.97500, -22.92000],
    [-42.81880, -22.91920]
  ];

  const coordsStr = points.map(c => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(';');
  const url1 = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false&snapping=any&continue_straight=false`;
  const url2 = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false&snapping=any&continue_straight=false`;

  const r1 = await fetch(url1);
  const j1 = await r1.json();
  console.log('OSRM Org result code:', j1.code, 'routes:', j1.routes?.length);

  const r2 = await fetch(url2);
  const j2 = await r2.json();
  console.log('OSM DE result code:', j2.code, 'routes:', j2.routes?.length);
}
testOSRM();
