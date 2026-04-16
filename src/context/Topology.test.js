import { describe, it, expect } from 'vitest';
import { topologyReducer, initialState, ACTIONS } from './TopologyContext';

describe('TopologyContext Reducer', () => {

  it('adds a node safely', () => {
    const action = {
      type: ACTIONS.ADD_NODE,
      payload: { id: 'R10', label: 'R10', x: 100, y: 100 }
    };
    const newState = topologyReducer(initialState, action);

    expect(newState.nodes.length).toBe(initialState.nodes.length + 1);
    expect(newState.nodes.find(n => n.id === 'R10')).toBeDefined();
    
    // Existing elements aren't mutated/lost
    expect(newState.links).toStrictEqual(initialState.links);
  });

  it('rejects duplicate nodes safely', () => {
    const action = {
      type: ACTIONS.ADD_NODE,
      // Supposing R1 already exists in DEFAULT_NODES
      payload: { id: 'R1', label: 'R1', x: 100, y: 100 }
    };
    const newState = topologyReducer(initialState, action);

    expect(newState.nodes.length).toBe(initialState.nodes.length);
  });

  it('adds a link between valid nodes', () => {
    const action = {
      type: ACTIONS.ADD_LINK,
      payload: { id: 'R1-R4', sourceNodeId: 'R1', targetNodeId: 'R4', cost: 10 }
    };
    const newState = topologyReducer(initialState, action);

    expect(newState.links.length).toBe(initialState.links.length + 1);
    const addedLink = newState.links.find(l => l.id === 'R1-R4');
    expect(addedLink).toBeDefined();
    expect(addedLink.cost).toBe(10);
    expect(addedLink.status).toBe('active');
  });

  it('rejects links to non-existent nodes', () => {
    const action = {
      type: ACTIONS.ADD_LINK,
      payload: { id: 'R1-R99', sourceNodeId: 'R1', targetNodeId: 'R99', cost: 1 }
    };
    const newState = topologyReducer(initialState, action);

    // Links should remain the same
    expect(newState.links.length).toBe(initialState.links.length);
  });

  it('cascades node deletion, correctly stripping connected links', () => {
    const action = {
      type: ACTIONS.DELETE_NODE,
      payload: { id: 'R1' }
    };
    const newState = topologyReducer(initialState, action);

    // Node is gone
    expect(newState.nodes.find(n => n.id === 'R1')).toBeUndefined();

    // Any link touching R1 is automatically gone
    const linksTouchingR1 = newState.links.filter(l => l.sourceNodeId === 'R1' || l.targetNodeId === 'R1');
    expect(linksTouchingR1.length).toBe(0);
   
    // Other links survive
    expect(newState.links.length).toBeGreaterThan(0);
  });

});
