import { describe, it, expect } from 'vitest';
import { calculateRoutingTables } from './algorithms';
import { INFINITY } from './constants';

describe('RIPv2 Bellman-Ford Routing Algorithm', () => {

  // Test 1: Basic linear topology A -> B -> C
  it('calculates optimal path in a linear topology', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const links = [
      { source: 'A', target: 'B', cost: 2 },
      { source: 'B', target: 'C', cost: 3 }
    ];

    const tables = calculateRoutingTables(nodes, links);
    
    // Check A's routing table
    const tableA = tables['A'];
    expect(tableA).toBeDefined();

    // A to C should cost 5, via B
    const routeToC = tableA.find(r => r.destination === 'C');
    expect(routeToC).toBeDefined();
    expect(routeToC.cost).toBe(5);
    expect(routeToC.nextHop).toBe('B');

    // C to A should cost 5, via B
    const routeToA = tables['C'].find(r => r.destination === 'A');
    expect(routeToA.cost).toBe(5);
    expect(routeToA.nextHop).toBe('B');
  });

  // Test 2: Rerouting around failure and INFINITY
  it('reroutes gracefully or sets path to INFINITY upon link failure', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
    
    // Topology: A-B (1), B-D (3), A-C (4), C-D (2)
    // Shortest path A to D is A->B->D (cost 4)
    // Alternate path is A->C->D (cost 6)
    
    let links = [
      { source: 'A', target: 'B', cost: 1 },
      { source: 'B', target: 'D', cost: 3 },
      { source: 'A', target: 'C', cost: 4 },
      { source: 'C', target: 'D', cost: 2 },
    ];

    let tables = calculateRoutingTables(nodes, links);
    let routeAtoD = tables['A'].find(r => r.destination === 'D');
    
    expect(routeAtoD.cost).toBe(4);
    expect(routeAtoD.nextHop).toBe('B');

    // Now fail the B->D link
    links = [
      { source: 'A', target: 'B', cost: 1 },
      // { source: 'B', target: 'D', cost: 3 }, <-- removed
      { source: 'A', target: 'C', cost: 4 },
      { source: 'C', target: 'D', cost: 2 },
    ];

    tables = calculateRoutingTables(nodes, links);
    routeAtoD = tables['A'].find(r => r.destination === 'D');
    
    // It should now route via C
    expect(routeAtoD.cost).toBe(6);
    expect(routeAtoD.nextHop).toBe('C');

    // Now completely isolate D from the network
    links = [
      { source: 'A', target: 'B', cost: 1 },
      { source: 'A', target: 'C', cost: 4 },
    ];

    tables = calculateRoutingTables(nodes, links);
    routeAtoD = tables['A'].find(r => r.destination === 'D');
    
    // A to D should now be INFINITY
    expect(routeAtoD.cost).toBe(INFINITY);
    expect(routeAtoD.nextHop).toBeNull();
  });

  // Test 3: Count-to-Infinity Prevention (Max Hops Limiting)
  it('prevents count-to-infinity by capping hop limits', () => {
    const nodes = [];
    const links = [];

    // Create a 20-node linear chain A -> B -> C -> ... -> T
    const numNodes = 20;
    for (let i = 0; i < numNodes; i++) {
        nodes.push({ id: `N${i}` });
        if (i < numNodes - 1) {
            links.push({ source: `N${i}`, target: `N${i+1}`, cost: 1 });
        }
    }

    const tables = calculateRoutingTables(nodes, links);
    const table0 = tables['N0'];
    
    // N0 to N5 is cost 5 (hops 5, well within limits)
    const routeToN5 = table0.find(r => r.destination === 'N5');
    expect(routeToN5.cost).toBe(5);

    // Any destination at 16 hops or more should surface as INFINITY due to the RIP max-hop metric
    // Our logic is configured with MAX_HOPS/INFINITY = 16
    const routeToN18 = table0.find(r => r.destination === 'N18');
    expect(routeToN18.cost).toBeGreaterThanOrEqual(INFINITY);
  });

  // Test 4: Disconnected Nodes
  it('surfaces isolated nodes with no valid outbound routes', () => {
    const nodes = [{ id: 'Iso1' }, { id: 'Iso2' }];
    const links = []; // No links

    const tables = calculateRoutingTables(nodes, links);
    
    const tableIso1 = tables['Iso1'];
    // Route to self is 0
    const routeSelf = tableIso1.find(r => r.destination === 'Iso1');
    expect(routeSelf.cost).toBe(0);

    // Route to Iso2 is INFINITY
    const routeIso2 = tableIso1.find(r => r.destination === 'Iso2');
    expect(routeIso2.cost).toBe(INFINITY);
  });

});
