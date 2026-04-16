/**
 * TopologyContext
 *
 * Centralised state management for the RIPv2 Network Simulator topology.
 * Uses React Context + useReducer for predictable, action-driven state updates.
 *
 * State shape:
 * {
 *   nodes: Node[],
 *   links: Link[],
 * }
 *
 * Node: { id, label, x, y }
 * Link: { id, sourceNodeId, targetNodeId, cost, status }
 *   status: 'active' | 'failed'
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
} from 'react';

// ---------------------------------------------------------------------------
// Action type constants
// ---------------------------------------------------------------------------

export const ACTIONS = Object.freeze({
  ADD_NODE:              'ADD_NODE',
  UPDATE_NODE_POSITION:  'UPDATE_NODE_POSITION',
  DELETE_NODE:           'DELETE_NODE',
  ADD_LINK:              'ADD_LINK',
  DELETE_LINK:           'DELETE_LINK',
  TOGGLE_LINK_FAIL:      'TOGGLE_LINK_FAIL',
  RESET_TOPOLOGY:        'RESET_TOPOLOGY',
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/**
 * Default topology shown when the app first loads.
 * Five routers arranged in a pentagon with ring + one cross-link.
 * Positions are tuned for a ~900 × 580 canvas (viewport minus 56 px header).
 */
const DEFAULT_NODES = [
  { id: 'R1', label: 'R1', x: 422, y:  52 },
  { id: 'R2', label: 'R2', x: 622, y: 198 },
  { id: 'R3', label: 'R3', x: 542, y: 430 },
  { id: 'R4', label: 'R4', x: 302, y: 430 },
  { id: 'R5', label: 'R5', x: 222, y: 198 },
];

const DEFAULT_LINKS = [
  { id: 'R1-R2', sourceNodeId: 'R1', targetNodeId: 'R2', cost: 1, status: 'active' },
  { id: 'R2-R3', sourceNodeId: 'R2', targetNodeId: 'R3', cost: 3, status: 'active' },
  { id: 'R3-R4', sourceNodeId: 'R3', targetNodeId: 'R4', cost: 1, status: 'active' },
  { id: 'R4-R5', sourceNodeId: 'R4', targetNodeId: 'R5', cost: 2, status: 'active' },
  { id: 'R5-R1', sourceNodeId: 'R5', targetNodeId: 'R1', cost: 2, status: 'active' },
  { id: 'R1-R3', sourceNodeId: 'R1', targetNodeId: 'R3', cost: 5, status: 'active' },
];

/** @type {{ nodes: import('../core/algorithms.js').Node[], links: Object[] }} */
export const initialState = {
  nodes: DEFAULT_NODES,
  links: DEFAULT_LINKS,
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Pure reducer — no side effects.
 * Every action returns a new state object; arrays are never mutated in place.
 *
 * @param {typeof initialState} state
 * @param {{ type: string, payload: any }} action
 * @returns {typeof initialState}
 */
export function topologyReducer(state, action) {
  switch (action.type) {

    // ── ADD_NODE ────────────────────────────────────────────────────────────
    // payload: { id, label, x, y }
    case ACTIONS.ADD_NODE: {
      const { id, label, x = 0, y = 0 } = action.payload;

      // Guard: ignore duplicate IDs
      if (state.nodes.some((n) => n.id === id)) {
        console.warn(`[TopologyContext] ADD_NODE: node "${id}" already exists.`);
        return state;
      }

      return {
        ...state,
        nodes: [
          ...state.nodes,
          { id, label: label ?? id, x, y },
        ],
      };
    }

    // ── UPDATE_NODE_POSITION ─────────────────────────────────────────────────
    // payload: { id, x, y }
    case ACTIONS.UPDATE_NODE_POSITION: {
      const { id, x, y } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, x, y } : n
        ),
      };
    }

    // ── DELETE_NODE ──────────────────────────────────────────────────────────
    // payload: { id }
    // Cascade: remove all links that reference this node.
    case ACTIONS.DELETE_NODE: {
      const { id } = action.payload;
      return {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== id),
        links: state.links.filter(
          (l) => l.sourceNodeId !== id && l.targetNodeId !== id
        ),
      };
    }

    // ── ADD_LINK ─────────────────────────────────────────────────────────────
    // payload: { id, sourceNodeId, targetNodeId, cost }
    // Default status is 'active'.
    case ACTIONS.ADD_LINK: {
      const { id, sourceNodeId, targetNodeId, cost = 1 } = action.payload;

      // Guard: duplicate link ID
      if (state.links.some((l) => l.id === id)) {
        console.warn(`[TopologyContext] ADD_LINK: link "${id}" already exists.`);
        return state;
      }

      // Guard: both endpoints must exist
      const srcExists = state.nodes.some((n) => n.id === sourceNodeId);
      const tgtExists = state.nodes.some((n) => n.id === targetNodeId);
      if (!srcExists || !tgtExists) {
        console.warn(
          `[TopologyContext] ADD_LINK: one or both nodes ("${sourceNodeId}", "${targetNodeId}") not found.`
        );
        return state;
      }

      // Guard: no self-loops
      if (sourceNodeId === targetNodeId) {
        console.warn(`[TopologyContext] ADD_LINK: self-loop on node "${sourceNodeId}" rejected.`);
        return state;
      }

      return {
        ...state,
        links: [
          ...state.links,
          {
            id,
            sourceNodeId,
            targetNodeId,
            cost: Math.max(1, Number(cost)),
            status: 'active',
          },
        ],
      };
    }

    // ── DELETE_LINK ───────────────────────────────────────────────────────────
    // payload: { id }
    case ACTIONS.DELETE_LINK: {
      const { id } = action.payload;
      return {
        ...state,
        links: state.links.filter((l) => l.id !== id),
      };
    }

    // ── TOGGLE_LINK_FAIL ──────────────────────────────────────────────────────
    // payload: { id }
    // Flips status between 'active' and 'failed'.
    // A 'failed' link is kept in state but excluded from routing calculations,
    // modelling RIP route poisoning without permanently deleting the link.
    case ACTIONS.TOGGLE_LINK_FAIL: {
      const { id } = action.payload;
      return {
        ...state,
        links: state.links.map((l) =>
          l.id === id
            ? { ...l, status: l.status === 'active' ? 'failed' : 'active' }
            : l
        ),
      };
    }

    // ── RESET_TOPOLOGY ────────────────────────────────────────────────────────
    // payload: (optional) { nodes, links } — resets to provided or empty state.
    case ACTIONS.RESET_TOPOLOGY: {
      const { nodes = [], links = [] } = action.payload ?? {};
      return { nodes, links };
    }

    default:
      console.warn(`[TopologyContext] Unknown action: "${action.type}"`);
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TopologyStateContext   = createContext(null);
const TopologyDispatchContext = createContext(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * TopologyProvider
 *
 * Wrap your application (or the relevant subtree) with this provider to give
 * child components access to topology state and dispatch via hooks.
 *
 * @param {{ children: React.ReactNode, initialTopology?: typeof initialState }} props
 */
export function TopologyProvider({ children, initialTopology }) {
  const [state, dispatch] = useReducer(
    topologyReducer,
    initialTopology ?? initialState
  );

  return (
    <TopologyStateContext.Provider value={state}>
      <TopologyDispatchContext.Provider value={dispatch}>
        {children}
      </TopologyDispatchContext.Provider>
    </TopologyStateContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hooks
// ---------------------------------------------------------------------------

/**
 * useTopologyState
 * Returns the current topology state { nodes, links }.
 *
 * @returns {{ nodes: Object[], links: Object[] }}
 */
export function useTopologyState() {
  const ctx = useContext(TopologyStateContext);
  if (ctx === null) {
    throw new Error('useTopologyState must be used inside <TopologyProvider>.');
  }
  return ctx;
}

/**
 * useTopologyDispatch
 * Returns the raw dispatch function for firing topology actions.
 *
 * Prefer the action-creator helpers below for ergonomics and type safety.
 *
 * @returns {React.Dispatch<{ type: string, payload: any }>}
 */
export function useTopologyDispatch() {
  const ctx = useContext(TopologyDispatchContext);
  if (ctx === null) {
    throw new Error('useTopologyDispatch must be used inside <TopologyProvider>.');
  }
  return ctx;
}

/**
 * useTopologyActions
 *
 * Returns stable, memoised action-creator functions so consumers never need
 * to import ACTIONS or call dispatch directly.
 *
 * @returns {Object} Action creator functions
 */
export function useTopologyActions() {
  const dispatch = useTopologyDispatch();

  const addNode = useCallback(
    (id, label, x = 0, y = 0) =>
      dispatch({ type: ACTIONS.ADD_NODE, payload: { id, label, x, y } }),
    [dispatch]
  );

  const updateNodePosition = useCallback(
    (id, x, y) =>
      dispatch({ type: ACTIONS.UPDATE_NODE_POSITION, payload: { id, x, y } }),
    [dispatch]
  );

  const deleteNode = useCallback(
    (id) =>
      dispatch({ type: ACTIONS.DELETE_NODE, payload: { id } }),
    [dispatch]
  );

  const addLink = useCallback(
    (id, sourceNodeId, targetNodeId, cost = 1) =>
      dispatch({ type: ACTIONS.ADD_LINK, payload: { id, sourceNodeId, targetNodeId, cost } }),
    [dispatch]
  );

  const deleteLink = useCallback(
    (id) =>
      dispatch({ type: ACTIONS.DELETE_LINK, payload: { id } }),
    [dispatch]
  );

  const toggleLinkFail = useCallback(
    (id) =>
      dispatch({ type: ACTIONS.TOGGLE_LINK_FAIL, payload: { id } }),
    [dispatch]
  );

  const resetTopology = useCallback(
    (nodes = [], links = []) =>
      dispatch({ type: ACTIONS.RESET_TOPOLOGY, payload: { nodes, links } }),
    [dispatch]
  );

  return {
    addNode,
    updateNodePosition,
    deleteNode,
    addLink,
    deleteLink,
    toggleLinkFail,
    resetTopology,
  };
}
