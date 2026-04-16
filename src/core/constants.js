/**
 * RIPv2 Protocol Constants
 *
 * MAX_HOPS: The maximum number of hops a route can have before it is
 *           considered unreachable. RIP defines this as 15.
 *
 * INFINITY: A metric value of 16 signals that a destination is unreachable
 *           (i.e., "poisoned" route). Any route with a cost >= INFINITY
 *           must be treated as invalid and removed from the routing table.
 */

export const MAX_HOPS = 15;
export const INFINITY = 16;
