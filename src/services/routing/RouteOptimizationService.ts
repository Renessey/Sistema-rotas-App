import type { LngLat } from '../../types/geo';
import { ValhallaService } from './ValhallaService';

export interface OptimizationOptions {
  /** optional final destination after all stops */
  destination?: LngLat | null;
  /** use durations (seconds) as cost instead of distances */
  useDuration?: boolean;
}

export interface OptimizationResult {
  /** order of the stops (indices into the input stops array) */
  order: number[];
  totalCost: number;
  /** true when the cost came from the real road network */
  fromRoadNetwork: boolean;
}

/**
 * RouteOptimizationService — Phase 15.
 *
 * TSP solver for the delivery stops:
 *   1. Nearest Neighbor  → initial solution
 *   2. 2-opt              → remove crossings / improve
 *   3. Local Search       → relocate single stops
 *
 * The cost matrix is provided by Valhalla (real road network). When the road
 * matrix is unavailable the solver falls back to haversine costs so the flow
 * still works offline during development.
 */
export class RouteOptimizationService {
  /**
   * Optimizes the visit order starting from `start`.
   * Returns the ordered stop indices.
   */
  static async optimize(
    start: LngLat,
    stops: LngLat[],
    options: OptimizationOptions = {},
  ): Promise<OptimizationResult> {
    if (stops.length === 0) {
      return { order: [], totalCost: 0, fromRoadNetwork: false };
    }
    if (stops.length === 1) {
      const cost = await RouteOptimizationService.costBetween(
        start,
        stops[0],
        options.useDuration,
      );
      return { order: [0], totalCost: cost, fromRoadNetwork: false };
    }

    // 1) Cost matrix (real road network when possible)
    const nodes: LngLat[] = [start, ...stops];
    if (options.destination) nodes.push(options.destination);

    const matrix = await ValhallaService.matrix(nodes, nodes);
    const cost = (i: number, j: number) =>
      options.useDuration ? matrix.durations[i][j] : matrix.distances[i][j];

    // 2) Initial solution — Nearest Neighbor (depot = index 0)
    let order = RouteOptimizationService.nearestNeighbor(stops.length, cost);

    // 3) Improve — 2-opt
    order = RouteOptimizationService.twoOpt(order, cost);

    // 4) Improve — local search (relocate)
    order = RouteOptimizationService.localSearch(order, cost);

    // 5) Total cost including return/end
    const totalCost = RouteOptimizationService.tourCost(order, cost);

    return {
      order,
      totalCost,
      fromRoadNetwork: matrix.fromRoadNetwork,
    };
  }

  /** Cost between two stops (used by UI for stop details) */
  static async costBetween(
    a: LngLat,
    b: LngLat,
    useDuration = false,
  ): Promise<number> {
    const m = await ValhallaService.matrix([a], [b]);
    return useDuration ? m.durations[0][0] : m.distances[0][0];
  }

  private static nearestNeighbor(
    count: number,
    cost: (i: number, j: number) => number,
  ): number[] {
    const visited = new Set<number>();
    const order: number[] = [];
    let current = 0; // depot

    while (order.length < count) {
      let best: number | null = null;
      let bestCost = Infinity;
      for (let i = 1; i <= count; i++) {
        if (visited.has(i)) continue;
        const c = cost(current, i);
        if (c < bestCost) {
          bestCost = c;
          best = i;
        }
      }
      if (best === null) break;
      visited.add(best);
      order.push(best - 1); // stop index
      current = best;
    }

    return order;
  }

  /** 2-opt: reverses segments to remove crossings */
  private static twoOpt(
    order: number[],
    cost: (i: number, j: number) => number,
  ): number[] {
    const n = order.length;
    const idx = (v: number) => v + 1; // depot is 0
    let improved = true;
    let iterations = 0;
    const maxIterations = 100;

    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;
      for (let i = 0; i < n - 1; i++) {
        for (let k = i + 1; k < n; k++) {
          const beforeI = i === 0 ? idx(0) : idx(order[i - 1]);
          const afterK = k === n - 1 ? idx(0) : idx(order[k + 1]);
          const currentCost =
            cost(beforeI, idx(order[i])) + cost(idx(order[k]), afterK);
          const newCost =
            cost(beforeI, idx(order[k])) + cost(idx(order[i]), afterK);

          if (newCost < currentCost - 1e-9) {
            order = [
              ...order.slice(0, i),
              ...order.slice(i, k + 1).reverse(),
              ...order.slice(k + 1),
            ];
            improved = true;
          }
        }
      }
    }

    return order;
  }

  /** Local search: tries relocating each stop to every other position */
  private static localSearch(
    order: number[],
    cost: (i: number, j: number) => number,
  ): number[] {
    const n = order.length;
    let bestOrder = [...order];
    let bestCost = RouteOptimizationService.tourCost(bestOrder, cost);

    let improved = true;
    let iterations = 0;

    while (improved && iterations < 20) {
      improved = false;
      iterations++;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const candidate = [...bestOrder];
          const [moved] = candidate.splice(i, 1);
          candidate.splice(j, 0, moved);
          const candidateCost = RouteOptimizationService.tourCost(candidate, cost);
          if (candidateCost < bestCost - 1e-9) {
            bestCost = candidateCost;
            bestOrder = candidate;
            improved = true;
          }
        }
      }
    }

    return bestOrder;
  }

  /** Total tour cost: depot → stops → depot (or destination) */
  private static tourCost(
    order: number[],
    cost: (i: number, j: number) => number,
  ): number {
    let total = 0;
    let prev = 0; // depot
    for (const stop of order) {
      total += cost(prev, stop + 1);
      prev = stop + 1;
    }
    total += cost(prev, 0); // return to depot
    return total;
  }
}
