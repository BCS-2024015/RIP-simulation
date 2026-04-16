/**
 * RIPv2 Core Algorithm — Bellman-Ford Distance-Vector Routing
 *
 * This module implements the core RIP mechanics using the Bellman-Ford
 * algorithm. It is intentionally free of any UI or React dependencies.
 *
 * Key RIP behaviours modelled:
 *  - Maximum hop count of 15 (routes with cost >= 16 are unreachable).
 *  - Route poisoning: broken/removed links instantly become INFINITY.
 *  - Split horizon is NOT applied here (pure Bellman-Ford pass).
 *  - Full recalculation on every topology change (link add / remove / cost change).
 */

import { INFINITY } from './constants.js';

// ---------------------------------------------------------------------------
// Types (JSDoc only — no TypeScript dependency)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Node
 * @property {string} id - Unique router identifier (e.g. "R1").
 */

/**
 * @typedef {Object} Link
 * @property {string} source - ID of the source node.
 * @property {string} target - ID of the target node.
 * @property {number} cost   - Link metric / cost (must be >= 1).
 */

/**
 * @typedef {Object} RouteEntry
 * @property {string} destination - ID of the destination node.
 * @property {string|null} nextHop - ID of the next-hop node towards the destination,
 *                                   or null when the destination is the node itself.
 * @property {number} cost        - Total accumulated cost to reach the destination.
 *                                  A value of INFINITY (16) means unreachable.
 */

/**
 * @typedef {Object.<string, RouteEntry[]>} RoutingTables
 * Key: node ID → Value: array of RouteEntry objects for every destination.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build an undirected adjacency structure from the link list.
 * A removed or cost-changed link is simply absent / updated in `links`,
 * so this function naturally reflects the current topology state.
 *
 * @param {Link[]} links
 * @returns {Map<string, Array<{neighbor: string, cost: number}>>}
 */
function buildAdjacency(links) {
  /** @type {Map<string, Array<{neighbor: string, cost: number}>>} */
  const adj = new Map();

  for (const link of links) {
    const { source, target, cost } = link;

    // Validate cost; treat anything out-of-range as a broken link.
    const effectiveCost = typeof cost === 'number' && cost >= 1 && cost < INFINITY
      ? cost
      : INFINITY;

    if (!adj.has(source)) adj.set(source, []);
    if (!adj.has(target)) adj.set(target, []);

    adj.get(source).push({ neighbor: target, cost: effectiveCost });
    adj.get(target).push({ neighbor: source, cost: effectiveCost }); // undirected
  }

  return adj;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * calculateRoutingTables
 *
 * Runs the Bellman-Ford algorithm from the perspective of every node in the
 * network to produce a complete set of routing tables.
 *
 * Complexity: O(N² × E) where N = number of nodes, E = number of links.
 * This is acceptable for the small topologies typical in RIP deployments.
 *
 * RIP recalculation behaviour:
 *  - If a link is removed from `links`, affected routes are recalculated and
 *    any now-unreachable destination receives cost = INFINITY.
 *  - If a link's cost changes, the algorithm converges to the new shortest
 *    paths automatically.
 *
 * @param {Node[]} nodes   - All routers in the topology.
 * @param {Link[]} links   - All active links (current snapshot of the topology).
 * @returns {RoutingTables} A map of nodeId → RouteEntry[].
 */
export function calculateRoutingTables(nodes, links) {
  if (!Array.isArray(nodes) || nodes.length === 0) return {};
  if (!Array.isArray(links)) links = [];

  const nodeIds = nodes.map((n) => n.id);
  const adj = buildAdjacency(links);

  /** @type {RoutingTables} */
  const allTables = {};

  // Run one Bellman-Ford pass for each source node.
  for (const sourceId of nodeIds) {
    // dist[v]    — best known cost from sourceId to v
    // nextHop[v] — first hop from sourceId towards v
    const dist    = {};
    const nextHop = {};

    // Initialise: self = 0, everything else = INFINITY
    for (const id of nodeIds) {
      dist[id]    = INFINITY;
      nextHop[id] = null;
    }
    dist[sourceId] = 0;

    // Bellman-Ford: relax edges up to (N-1) times.
    // Each iteration represents one RIP update cycle.
    const iterations = nodeIds.length - 1;

    for (let iter = 0; iter < iterations; iter++) {
      let updated = false;

      for (const nodeId of nodeIds) {
        if (dist[nodeId] >= INFINITY) continue; // unreachable — skip

        const neighbors = adj.get(nodeId) || [];

        for (const { neighbor, cost } of neighbors) {
          // RIP: cost must stay below INFINITY to be a valid route.
          if (cost >= INFINITY) continue;

          const newCost = dist[nodeId] + cost;

          if (newCost < dist[neighbor] && newCost < INFINITY) {
            dist[neighbor] = newCost;

            // Track the first hop from source.
            // If we're relaxing a direct neighbour of the source, the next
            // hop IS the neighbour. Otherwise inherit the source's next hop
            // towards nodeId.
            nextHop[neighbor] = nodeId === sourceId ? neighbor : nextHop[nodeId];
            updated = true;
          }
        }
      }

      // Early exit if no relaxation occurred — algorithm has converged.
      if (!updated) break;
    }

    // Build the RouteEntry array for this source node.
    const table = nodeIds.map((destId) => ({
      destination: destId,
      nextHop:     destId === sourceId ? null : (nextHop[destId] ?? null),
      cost:        dist[destId],
    }));

    allTables[sourceId] = table;
  }

  return allTables;
}

/**
 * getRoute
 *
 * Convenience helper — extracts a single RouteEntry from a pre-computed
 * routing table.
 *
 * @param {RoutingTables} tables    - Output of calculateRoutingTables().
 * @param {string}        fromId    - Source node ID.
 * @param {string}        toId      - Destination node ID.
 * @returns {RouteEntry|null}
 */
export function getRoute(tables, fromId, toId) {
  const table = tables[fromId];
  if (!table) return null;
  return table.find((entry) => entry.destination === toId) ?? null;
}

/**
 * isReachable
 *
 * Returns true when a destination is reachable (cost < INFINITY) from a
 * given source in the pre-computed routing tables.
 *
 * @param {RoutingTables} tables
 * @param {string}        fromId
 * @param {string}        toId
 * @returns {boolean}
 */
export function isReachable(tables, fromId, toId) {
  const route = getRoute(tables, fromId, toId);
  return route !== null && route.cost < INFINITY;
}

// ---------------------------------------------------------------------------
// RIP Convergence Simulation
// ---------------------------------------------------------------------------

/**
 * simulateRIPConvergence
 *
 * Faithfully models how RIP builds routing tables over N broadcast rounds.
 *
 * How it works
 * ─────────────
 * • Round 0 — Initialisation: Every router knows only ITSELF (cost 0).
 *   All other destinations are INFINITY (unknown).
 *
 * • Round r — Broadcast: Every router simultaneously sends its current
 *   distance table to each directly connected neighbour.  Neighbours
 *   apply the Bellman-Ford relaxation rule:
 *
 *     if dist[u][d] + cost(v,u) < dist[v][d]  →  update dist[v][d]
 *
 *   All updates are computed from the PREVIOUS round's snapshot so the
 *   simulation is truly synchronous (no router sees another's mid-round
 *   update).
 *
 * • Convergence: When a round produces zero changes the routing tables are
 *   stable.  For a loop-free topology this is guaranteed within (N-1)
 *   rounds (N = number of nodes, bounded by MAX_HOPS = 15).
 *
 * Key RIP properties demonstrated
 * ─────────────────────────────────
 *  - max 15 hops: routes with metric ≥ 16 are treated as unreachable.
 *  - Failed / removed links surface as INFINITY immediately on the next
 *    round (pass only active links).
 *  - Count-to-infinity is bounded by MAX_HOPS rounds.
 *
 * @param {Node[]} nodes  — All routers in the topology.
 * @param {Link[]} links  — Active links only ({ source, target, cost }).
 * @returns {{
 *   rounds: Array<{
 *     roundNumber: number,
 *     tables:      RoutingTables,
 *     changes:     Object.<string, string[]>,
 *     changedCount: number,
 *     description: string,
 *   }>,
 *   convergedAt:  number,
 *   finalTables:  RoutingTables,
 * }}
 */
export function simulateRIPConvergence(nodes, links) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { rounds: [], convergedAt: 0, finalTables: {} };
  }
  if (!Array.isArray(links)) links = [];

  const nodeIds = nodes.map((n) => n.id);
  const adj     = buildAdjacency(links);

  // dist[v][d] — best known cost from router v to destination d
  // next[v][d] — direct neighbour v should forward to in order to reach d
  const dist = {};
  const next = {};

  for (const v of nodeIds) {
    dist[v] = {};
    next[v] = {};
    for (const d of nodeIds) {
      dist[v][d] = v === d ? 0 : INFINITY;
      next[v][d] = null;
    }
  }

  /** Produce a RoutingTables snapshot from the current dist/next state. */
  const snapshot = () => {
    const tables = {};
    for (const v of nodeIds) {
      tables[v] = nodeIds.map((d) => ({
        destination: d,
        nextHop:     d === v ? null : (next[v][d] ?? null),
        cost:        dist[v][d],
      }));
    }
    return tables;
  };

  const rounds = [];

  // Round 0 — initialisation state
  rounds.push({
    roundNumber:  0,
    tables:       snapshot(),
    changes:      {},
    changedCount: 0,
    description:  'Round 0 — Initialisation: each router knows only itself (cost 0). All other destinations are ∞.',
  });

  let convergedAt = 0;

  // Iterate up to MAX_HOPS rounds (RIP convergence upper bound)
  for (let r = 1; r <= INFINITY; r++) {
    // ── Freeze the state BEFORE this round so updates are truly simultaneous
    const prevDist = {};
    const prevNext = {};
    for (const v of nodeIds) {
      prevDist[v] = { ...dist[v] };
      prevNext[v] = { ...next[v] };
    }

    const changes    = {}; // v → [destination IDs updated this round]
    let   anyChange  = false;

    for (const v of nodeIds) {
      const neighbors = adj.get(v) || [];

      for (const { neighbor: u, cost: linkCost } of neighbors) {
        if (linkCost >= INFINITY) continue; // broken link — skip

        // v receives u's full distance table from the previous round
        for (const d of nodeIds) {
          if (prevDist[u][d] >= INFINITY) continue; // u can't reach d — no useful info

          const newCost = prevDist[u][d] + linkCost;

          if (newCost < dist[v][d] && newCost < INFINITY) {
            dist[v][d] = newCost;
            // The next hop from v towards d (via u) is always u itself
            next[v][d] = u;

            if (!changes[v]) changes[v] = [];
            if (!changes[v].includes(d)) changes[v].push(d);
            anyChange = true;
          }
        }
      }
    }

    const changedCount = Object.values(changes).reduce((s, arr) => s + arr.length, 0);
    const routerCount  = Object.keys(changes).length;

    rounds.push({
      roundNumber: r,
      tables:      snapshot(),
      changes,
      changedCount,
      description: anyChange
        ? `Round ${r} — ${changedCount} route update${changedCount !== 1 ? 's' : ''} across ${routerCount} router${routerCount !== 1 ? 's' : ''}`
        : `Round ${r} — No changes detected · Network has converged ✓`,
    });

    if (!anyChange) {
      convergedAt = r;
      break;
    }
    convergedAt = r;
  }

  return {
    rounds,
    convergedAt,
    finalTables: snapshot(),
  };
}

