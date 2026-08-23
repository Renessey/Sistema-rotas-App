async function testNearest() {
  const p = [-42.981234, -22.923456];
  const url = `https://router.project-osrm.org/nearest/v1/driving/${p.join(',')}?number=1`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('Nearest result:', data.code, 'waypoints:', data.waypoints);
}
testNearest();
