// Test OSRM routing inside Brazilian condos
async function test() {
  // Let's test two points in a condo in Marica (e.g., Itaocaia Valley or Inoã)
  const p1 = [-42.981234, -22.923456]; // Inside condo
  const p2 = [-42.975432, -22.918765]; // Stop 1

  const url = `https://router.project-osrm.org/route/v1/driving/${p1.join(',')};${p2.join(',')}?overview=full&geometries=geojson&steps=true&snapping=any&continue_straight=false`;
  
  const res = await fetch(url);
  const data = await res.json();
  console.log('Result:', data.code);
  if (data.routes?.[0]) {
    const r = data.routes[0];
    console.log('Distance:', r.distance, 'Duration:', r.duration);
    console.log('Legs count:', r.legs.length);
    console.log('First leg steps:');
    r.legs[0].steps.forEach((s, idx) => {
      console.log(`  Step ${idx + 1}: ${s.maneuver.type} onto "${s.name}" (${s.distance}m, mode: ${s.mode})`);
    });
  }
}
test();
