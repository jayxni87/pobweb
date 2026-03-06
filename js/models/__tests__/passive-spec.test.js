import { describe, it, expect } from 'vitest';
import { PassiveSpec } from '../passive-spec.js';

// Create a simple test tree graph
function makeTestTree() {
  // Graph: 1 (class start) -> 2 -> 3 -> 4
  //                                \-> 5
  return {
    nodes: {
      1: { id: 1, name: 'Start', type: 'classStart', stats: [], adjacent: [2], classId: 0 },
      2: { id: 2, name: 'Node A', type: 'normal', stats: ['+10 to Strength'], adjacent: [1, 3] },
      3: { id: 3, name: 'Node B', type: 'notable', stats: ['+20% increased Damage'], adjacent: [2, 4, 5] },
      4: { id: 4, name: 'Node C', type: 'keystone', stats: ['Resolute Technique'], adjacent: [3] },
      5: { id: 5, name: 'Node D', type: 'normal', stats: ['+15 to Dexterity'], adjacent: [3] },
      6: { id: 6, name: 'Isolated', type: 'normal', stats: ['+5 to all'], adjacent: [] },
      // Ascendancy nodes
      10: { id: 10, name: 'Asc Start', type: 'ascendancyStart', stats: [], adjacent: [11], ascendancy: 'Berserker' },
      11: { id: 11, name: 'Asc Node', type: 'notable', stats: ['Aspect of Carnage'], adjacent: [10], ascendancy: 'Berserker' },
    },
    classStarts: { 0: 1 }, // class 0 starts at node 1
  };
}

describe('PassiveSpec', () => {
  it('creates with class start allocated', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    expect(spec.isAllocated(1)).toBe(true);
    expect(spec.allocatedCount()).toBe(1);
  });

  it('allocates a node adjacent to allocated', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    const result = spec.allocate(2);
    expect(result).toBe(true);
    expect(spec.isAllocated(2)).toBe(true);
    expect(spec.allocatedCount()).toBe(2);
  });

  it('allocates path to non-adjacent node', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    // Node 3 requires going through node 2
    const result = spec.allocatePath(3);
    expect(result).toBe(true);
    expect(spec.isAllocated(2)).toBe(true); // intermediate
    expect(spec.isAllocated(3)).toBe(true); // target
  });

  it('refuses to allocate disconnected node', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    const result = spec.allocate(6);
    expect(result).toBe(false);
    expect(spec.isAllocated(6)).toBe(false);
  });

  it('deallocates a leaf node', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(2);
    spec.allocate(3);
    // Node 3 is a leaf, should be deallocatable
    const result = spec.deallocate(3);
    expect(result).toBe(true);
    expect(spec.isAllocated(3)).toBe(false);
  });

  it('refuses to deallocate if it disconnects graph', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(2);
    spec.allocate(3);
    spec.allocate(4);
    // Node 3 connects 2 to 4, removing it would disconnect
    const result = spec.deallocate(3);
    expect(result).toBe(false);
    expect(spec.isAllocated(3)).toBe(true);
  });

  it('refuses to deallocate class start', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    expect(spec.deallocate(1)).toBe(false);
  });

  it('finds shortest path to unallocated node', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    const path = spec.findShortestPath(4);
    // Should be [2, 3, 4]
    expect(path).toEqual([2, 3, 4]);
  });

  it('returns empty path for already allocated node', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    const path = spec.findShortestPath(1);
    expect(path).toEqual([]);
  });

  it('returns null for unreachable node', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    const path = spec.findShortestPath(6);
    expect(path).toBeNull();
  });

  it('returns all allocated node IDs', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(2);
    spec.allocate(3);
    const ids = spec.getAllocatedNodeIds();
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(ids).toHaveLength(3);
  });

  it('collects stats from allocated nodes', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(2);
    const stats = spec.collectStats();
    expect(stats).toContain('+10 to Strength');
  });

  it('handles ascendancy nodes', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    spec.setAscendancy('Berserker');
    spec.allocateAscendancy(10);
    spec.allocateAscendancy(11);
    expect(spec.isAllocated(10)).toBe(true);
    expect(spec.isAllocated(11)).toBe(true);
    expect(spec.ascendancyCount()).toBe(2);
  });

  it('resets tree', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(2);
    spec.allocate(3);
    spec.reset();
    expect(spec.allocatedCount()).toBe(1); // class start only
    expect(spec.isAllocated(2)).toBe(false);
  });
});
