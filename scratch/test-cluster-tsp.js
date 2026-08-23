function haversine(c1, c2) {
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class TestOptimizer {
  static solve(start, stops) {
    const nodes = [start, ...stops];
    const n = stops.length;
    const dist = (i, j) => (i === j ? 0 : haversine(nodes[i], nodes[j]));

    // 1. Cluster-aware Nearest Neighbor
    const visited = new Set();
    const order = [];
    let current = 0; // start depot

    while (order.length < n) {
      // Find nearest unvisited stop from current
      let best = null;
      let bestDist = Infinity;

      for (let i = 1; i <= n; i++) {
        if (visited.has(i)) continue;
        const d = dist(current, i);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }

      if (best === null) break;
      visited.add(best);
      order.push(best - 1);
      current = best;

      // Micro-clustering: check if any unvisited stops are within 800m of the current stop (same condo / neighborhood)
      let clusterSearch = true;
      while (clusterSearch && order.length < n) {
        let nearestInCluster = null;
        let clusterDist = Infinity;

        for (let j = 1; j <= n; j++) {
          if (visited.has(j)) continue;
          const d = dist(current, j);
          if (d <= 800 && d < clusterDist) {
            clusterDist = d;
            nearestInCluster = j;
          }
        }

        if (nearestInCluster !== null) {
          visited.add(nearestInCluster);
          order.push(nearestInCluster - 1);
          current = nearestInCluster;
        } else {
          clusterSearch = false;
        }
      }
    }

    // 2. Open 2-Opt (Untangle crossings without return to depot)
    const idx = (v) => v + 1;
    let improved = true;
    let iters = 0;
    while (improved && iters < 50) {
      improved = false;
      iters++;
      for (let i = 0; i < n - 1; i++) {
        for (let k = i + 1; k < n; k++) {
          const beforeI = i === 0 ? idx(0) : idx(order[i - 1]);
          const afterK = k === n - 1 ? null : idx(order[k + 1]);

          let currCost = dist(beforeI, idx(order[i]));
          let newCost = dist(beforeI, idx(order[k]));

          if (afterK !== null) {
            currCost += dist(idx(order[k]), afterK);
            newCost += dist(idx(order[i]), afterK);
          }

          if (newCost < currCost - 1e-6) {
            order.splice(i, k - i + 1, ...order.slice(i, k + 1).reverse());
            improved = true;
          }
        }
      }
    }

    // 3. Or-Opt (Relocate 1-3 stops to eliminate leftover sub-optimal placements)
    for (let blockSize = 3; blockSize >= 1; blockSize--) {
      let blockImproved = true;
      let bIters = 0;
      while (blockImproved && bIters < 10) {
        blockImproved = false;
        bIters++;
        for (let i = 0; i <= n - blockSize; i++) {
          for (let j = 0; j <= n - blockSize; j++) {
            if (i === j) continue;
            const candidate = [...order];
            const block = candidate.splice(i, blockSize);
            candidate.splice(j, 0, ...block);

            const currTotal = TestOptimizer.calcCost(order, dist);
            const candTotal = TestOptimizer.calcCost(candidate, dist);

            if (candTotal < currTotal - 1e-6) {
              order.splice(0, n, ...candidate);
              blockImproved = true;
            }
          }
        }
      }
    }

    return order;
  }

  static calcCost(order, dist) {
    let total = 0;
    let prev = 0;
    for (const stop of order) {
      total += dist(prev, stop + 1);
      prev = stop + 1;
    }
    return total;
  }
}

// Test with 2 condo stops close to start, 2 far stops, and 2 other condo stops
const start = [-42.8188, -22.9192];
const stops = [
  [-42.8150, -22.9150], // Condo Costa do Sol Stop A (Idx 0)
  [-42.7500, -22.8500], // Far Away Stop 1 (Idx 1)
  [-42.8153, -22.9152], // Condo Costa do Sol Stop B (Idx 2) -> (Next to Stop A!)
  [-42.7510, -22.8510], // Far Away Stop 2 (Idx 3) -> (Next to Far 1!)
];

const res = TestOptimizer.solve(start, stops);
console.log('Resulting order:', res);
console.log('Stop 0 pos:', res.indexOf(0), 'Stop 2 pos:', res.indexOf(2));
console.log('Stop 1 pos:', res.indexOf(1), 'Stop 3 pos:', res.indexOf(3));
