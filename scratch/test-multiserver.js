async function testMultiServer() {
  const waypoints = [
    [-42.981234, -22.923456],
    [-42.975432, -22.918765]
  ];
  const coordsStr = waypoints.map(c => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(';');

  const servers = [
    'https://router.project-osrm.org/route/v1/driving',
    'https://routing.openstreetmap.de/routed-car/route/v1/driving',
    'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
  ];

  for (const s of servers) {
    try {
      const url = `${s}/${coordsStr}?overview=full&geometries=geojson&steps=false&snapping=any&continue_straight=false`;
      const res = await fetch(url);
      const data = await res.json();
      console.log(s, '-> code:', data.code, 'coords count:', data.routes?.[0]?.geometry?.coordinates?.length);
    } catch (e) {
      console.error(s, 'failed:', e.message);
    }
  }
}
testMultiServer();
