/**
 * useRouting — Custom hook for live RIPv2 routing table computation
 *
 * Consumes TopologyContext and reactively re-runs the Bellman-Ford algorithm
 * (calculateRoutingTables) whenever the nodes or links state changes.
 *
 * Key behaviours:
 *  - 'failed' links are excluded from the routing calculation, modelling
 *    RIP route poisoning: destinations only reachable via the failed link
 *    will surface with cost = INFINITY (16) in the returned tables.
 *  - The memo key is derived from a lightweight hash of nodes + links so
 *    React's effect only fires on genuine topology changes.
 *  - Returns `{ routingTables, isComputing }` for consumer ergonomics.
 */

import { useState, useEffect, useMemo } from 'react';
import { useTopologyState } from '../context/TopologyContext';
import { calculateRoutingTables } from '../core/algorithms';
import { INFINITY } from '../core/constants';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} RoutingState
 * @property {import('../core/algorithms').RoutingTables} routingTables
 *   - A map of nodeId → RouteEntry[]. Empty object when no nodes exist.
 * @property {boolean} isComputing
 *   - True for one render cycle while the tables are being recalculated.
 *   - Useful for showing a "recalculating…" indicator in the UI.
 */

/**
 * useRouting
 *
 * @returns {RoutingState}
 *
 * @example
 * const { routingTables, isComputing } = useRouting();
 *
 * // Access R1's routing table:
 * const table = routingTables['R1'] ?? [];
 *
 * // Find the route to R3:
 * const route = table.find(r => r.destination === 'R3');
 * // → { destination: 'R3', nextHop: 'R2', cost: 4 }
 */
export function useRouting() {
  const { nodes, links } = useTopologyState();

  // ── Derive the active link list ──────────────────────────────────────────
  // Only 'active' links participate in routing. Failed links are filtered out
  // here so the algorithm sees them as simply absent — this causes any route
  // that depended solely on a failed link to converge to INFINITY, faithfully
  // representing RIP split-horizon / route poisoning behaviour.
  const activeLinks = useMemo(
    () =>
      links
        .filter((l) => l.status === 'active')
        .map((l) => ({
          source: l.sourceNodeId,
          target: l.targetNodeId,
          cost:   l.cost,
        })),
    [links]
  );

  // ── Stable algorithm input nodes ─────────────────────────────────────────
  // algorithms.js only needs { id } per node; avoid passing full node objects
  // so future additions to the node shape don't cause spurious re-computations.
  const algorithmNodes = useMemo(
    () => nodes.map((n) => ({ id: n.id })),
    [nodes]
  );

  // ── Lightweight change fingerprint ────────────────────────────────────────
  // useEffect deps are compared by reference; stringify gives us a stable
  // value-based key without needing deep-equal libraries.
  const topologyKey = useMemo(
    () =>
      JSON.stringify({
        nodes: algorithmNodes,
        links: activeLinks,
      }),
    [algorithmNodes, activeLinks]
  );

  // ── State ─────────────────────────────────────────────────────────────────
  const [routingTables, setRoutingTables] = useState({});
  const [isComputing,    setIsComputing]  = useState(false);

  // ── Effect: recalculate on topology change ────────────────────────────────
  useEffect(() => {
    // Nothing to compute for an empty graph.
    if (algorithmNodes.length === 0) {
      setRoutingTables({});
      setIsComputing(false);
      return;
    }

    setIsComputing(true);

    // Run synchronously — Bellman-Ford is fast enough for RIP-scale topologies
    // (typically < 50 nodes). Move to a Web Worker if the topology grows large.
    let tables;
    try {
      tables = calculateRoutingTables(algorithmNodes, activeLinks);
    } catch (err) {
      console.error('[useRouting] calculateRoutingTables threw an error:', err);
      tables = {};
    }

    setRoutingTables(tables);
    setIsComputing(false);

    // topologyKey encapsulates algorithmNodes + activeLinks, so we only need
    // to list it as a dependency rather than the individual arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey]);

  // ── Return ────────────────────────────────────────────────────────────────
  return { routingTables, isComputing };
}

// ---------------------------------------------------------------------------
// Derived-data helpers exported for convenience
// ---------------------------------------------------------------------------

/**
 * getTableForNode
 *
 * Extracts and sorts the routing table for a specific node, placing
 * unreachable destinations (cost >= INFINITY) at the end.
 *
 * @param {import('../core/algorithms').RoutingTables} routingTables
 * @param {string} nodeId
 * @returns {import('../core/algorithms').RouteEntry[]}
 */
export function getTableForNode(routingTables, nodeId) {
  const table = routingTables[nodeId];
  if (!table) return [];

  return [...table].sort((a, b) => {
    // Self-route always first
    if (a.cost === 0) return -1;
    if (b.cost === 0) return  1;
    // Unreachable routes last
    const aUnreachable = a.cost >= INFINITY ? 1 : 0;
    const bUnreachable = b.cost >= INFINITY ? 1 : 0;
    if (aUnreachable !== bUnreachable) return aUnreachable - bUnreachable;
    // Otherwise sort by ascending cost
    return a.cost - b.cost;
  });
}

/**
 * getPathBetween
 *
 * Traces the explicit hop-by-hop path from `fromId` to `toId` using the
 * routing tables. Returns an ordered array of node IDs representing the path,
 * or an empty array if no route exists.
 *
 * @param {import('../core/algorithms').RoutingTables} routingTables
 * @param {string} fromId
 * @param {string} toId
 * @returns {string[]}  e.g. ['R1', 'R2', 'R3']
 */
export function getPathBetween(routingTables, fromId, toId) {
  if (fromId === toId) return [fromId];

  const path    = [fromId];
  const visited = new Set([fromId]);
  let   current = fromId;

  // Walk the next-hop chain; bail if we detect a loop or hit a dead end.
  while (current !== toId) {
    const table = routingTables[current];
    if (!table) break;

    const entry = table.find((r) => r.destination === toId);
    if (!entry || entry.nextHop === null || entry.cost >= INFINITY) break;

    const next = entry.nextHop;
    if (visited.has(next)) break; // loop guard

    path.push(next);
    visited.add(next);
    current = next;
  }

  // If we didn't reach the destination the path is invalid.
  return path[path.length - 1] === toId ? path : [];
}
