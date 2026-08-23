function haversine(coord1, coord2) {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function solveOpenTSP(start, stops) {
  const nodes = [start, ...stops];
  const count = stops.length;
  
  // Distance matrix
  const dist = (i, j) => {
    if (i === j) return 0;
    return haversine(nodes[i], nodes[j]);
  };

  // 1. Density-aware nearest neighbor
  const visited = new Set();
  const order = [];
  let current = 0; // start

  while (order.length < count) {
    let best = null;
    let bestCost = Infinity;

    for (let i = 1; i <= count; i++) {
      if (visited.has(i)) continue;
      const d = dist(current, i);
      if (d < bestCost) {
        bestCost = d;
        best = i;
      }
    }
    if (best === null) break;
    visited.add(best);
    order.push(best - 1);
    current = best;
  }

  // 2. Open 2-Opt (no return to depot)
  const idx = (v) => v + 1;
  let improved = true;
  let iters = 0;
  while (improved && iters < 100) {
    improved = false;
    iters++;
    for (let i = 0; i < count - 1; i++) {
      for (let k = i + 1; k < count; k++) {
        const beforeI = i === 0 ? idx(0) : idx(order[i - 1]);
        const afterK = k === count - 1 ? null : idx(order[k + 1]);

        let currentCost = dist(beforeI, idx(order[i]));
        let newCost = dist(beforeI, idx(order[k]));

        if (afterK !== null) {
          currentCost += dist(idx(order[k]), afterK);
          newCost += dist(idx(order[i]), afterK);
        }

        if (newCost < currentCost - 1e-6) {
          order.splice(i, k - i + 1, ...order.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }

  return order;
}

// Test case with condo:
// Start: [0, 0]
// Stop 0 (Condo A): [0.001, 0.001]
// Stop 1 (Condo B): [0.0012, 0.0011] (50m from Condo A)
// Stop 2 (Far 1): [0.05, 0.05] (5km away)
// Stop 3 (Far 2): [0.051, 0.052] (5km away)
const start = [-42.8188, -22.9192];
const stops = [
  [-42.8150, -22.9150], // Condo 1
  [-42.8152, -22.9151], // Condo 2 (next door!)
  [-42.7500, -22.8500], // Far 1
  [-42.7510, -22.8510], // Far 2
];

const result = solveOpenTSP(start, stops);
console.log('Optimized order indices:', result);
console.log('Stop 0 and Stop 1 sequence:', result.indexOf(0), 'and', result.indexOf(1));
