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

  it('deallocating a mid-path node also prunes orphaned nodes', () => {
    const tree = makeTestTree();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(2);
    spec.allocate(3);
    spec.allocate(4);
    spec.allocate(5);
    // Node 3 connects 2 to 4 and 5; removing it should prune 4 and 5
    const result = spec.deallocate(3);
    expect(result).toBe(true);
    expect(spec.isAllocated(3)).toBe(false);
    expect(spec.isAllocated(4)).toBe(false);
    expect(spec.isAllocated(5)).toBe(false);
    expect(spec.isAllocated(2)).toBe(true); // still connected to start
    expect(spec.allocatedCount()).toBe(2); // start + node 2
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

// Helper: make a tree with mastery nodes
function makeTreeWithMasteries() {
  return {
    nodes: {
      1: { id: 1, name: 'Start', type: 'classStart', stats: [], adjacent: [2, 20, 30], masteryEffects: [] },
      2: { id: 2, name: 'Node A', type: 'normal', stats: ['+10 to Strength'], adjacent: [1], masteryEffects: [] },
      20: { id: 20, name: 'Life Mastery', type: 'mastery', stats: [], adjacent: [1], masteryEffects: [
        { effect: 100, stats: ['+50 to maximum Life'] },
        { effect: 101, stats: ['10% increased maximum Life'] },
        { effect: 102, stats: ['Regenerate 1% Life per second'] },
      ]},
      30: { id: 30, name: 'Life Mastery', type: 'mastery', stats: [], adjacent: [1], masteryEffects: [
        { effect: 100, stats: ['+50 to maximum Life'] },
        { effect: 101, stats: ['10% increased maximum Life'] },
        { effect: 102, stats: ['Regenerate 1% Life per second'] },
      ]},
    },
    classStarts: { 0: 1 },
  };
}

describe('PassiveSpec mastery selections', () => {
  it('sets and gets a mastery effect', () => {
    const tree = makeTreeWithMasteries();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(20);
    expect(spec.setMasteryEffect(20, 100)).toBe(true);
    expect(spec.getMasteryEffect(20)).toBe(100);
  });

  it('refuses to set effect on non-mastery node', () => {
    const tree = makeTreeWithMasteries();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(2);
    expect(spec.setMasteryEffect(2, 100)).toBe(false);
  });

  it('refuses to set effect on unallocated mastery', () => {
    const tree = makeTreeWithMasteries();
    const spec = new PassiveSpec(tree, 0);
    expect(spec.setMasteryEffect(20, 100)).toBe(false);
  });

  it('refuses to set invalid effect id', () => {
    const tree = makeTreeWithMasteries();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(20);
    expect(spec.setMasteryEffect(20, 999)).toBe(false);
  });

  it('clears a mastery effect', () => {
    const tree = makeTreeWithMasteries();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(20);
    spec.setMasteryEffect(20, 100);
    spec.clearMasteryEffect(20);
    expect(spec.getMasteryEffect(20)).toBeNull();
  });

  it('tracks used effects across nodes with same mastery name', () => {
    const tree = makeTreeWithMasteries();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(20);
    spec.allocate(30);
    spec.setMasteryEffect(20, 100);
    spec.setMasteryEffect(30, 101);
    const used = spec.getUsedEffectsForMasteryName('Life Mastery');
    expect(used.has(100)).toBe(true);
    expect(used.has(101)).toBe(true);
    expect(used.has(102)).toBe(false);
  });

  it('includes mastery effect stats in collectStats', () => {
    const tree = makeTreeWithMasteries();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(20);
    spec.setMasteryEffect(20, 100);
    const stats = spec.collectStats();
    expect(stats).toContain('+50 to maximum Life');
  });

  it('does not include mastery node base stats when effect is selected', () => {
    const tree = makeTreeWithMasteries();
    // Give the mastery node some base stats to verify they're skipped
    tree.nodes[20].stats = ['base stat that should be ignored'];
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(20);
    spec.setMasteryEffect(20, 100);
    const stats = spec.collectStats();
    expect(stats).not.toContain('base stat that should be ignored');
    expect(stats).toContain('+50 to maximum Life');
  });

  it('clears mastery selection when node is deallocated', () => {
    const tree = makeTreeWithMasteries();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(20);
    spec.setMasteryEffect(20, 100);
    spec.deallocate(20);
    expect(spec.getMasteryEffect(20)).toBeNull();
  });

  it('clears mastery selections on reset', () => {
    const tree = makeTreeWithMasteries();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(20);
    spec.setMasteryEffect(20, 100);
    spec.reset();
    expect(spec.getMasteryEffect(20)).toBeNull();
  });
});

// Helper: tree with mastery in the middle of a path
function makeTreeWithMasteryPath() {
  // Graph: 1 (start) -> 2 -> 20 (mastery) -> 3
  return {
    nodes: {
      1: { id: 1, name: 'Start', type: 'classStart', stats: [], adjacent: [2], masteryEffects: [] },
      2: { id: 2, name: 'Node A', type: 'normal', stats: [], adjacent: [1, 20], masteryEffects: [] },
      20: { id: 20, name: 'ES Mastery', type: 'mastery', stats: [], adjacent: [2, 3], masteryEffects: [
        { effect: 100, stats: ['+50 to ES'] },
      ]},
      3: { id: 3, name: 'Foresight', type: 'notable', stats: ['+20% ES'], adjacent: [20], masteryEffects: [] },
    },
    classStarts: { 0: 1 },
    _classes: [{ name: 'Scion', ascendancies: [] }],
  };
}

describe('mastery nodes block pathing through', () => {
  it('cannot path through a mastery node to reach nodes beyond it', () => {
    const tree = makeTreeWithMasteryPath();
    const spec = new PassiveSpec(tree, 0);
    // Trying to path to node 3 (Foresight) would require going through mastery node 20
    const path = spec.findShortestPath(3);
    expect(path).toBeNull();
  });

  it('can still path TO a mastery node', () => {
    const tree = makeTreeWithMasteryPath();
    const spec = new PassiveSpec(tree, 0);
    const path = spec.findShortestPath(20);
    expect(path).toEqual([2, 20]);
  });

  it('deallocating a node behind a mastery prunes it since mastery does not propagate', () => {
    const tree = makeTreeWithMasteryPath();
    const spec = new PassiveSpec(tree, 0);
    spec.allocate(2);
    spec.allocate(20); // mastery
    // Force-allocate node 3 directly (simulating a previous state)
    spec.allocated.add(3);
    // Now deallocate node 2 — mastery can't propagate, so node 3 becomes orphaned
    spec.deallocate(2);
    expect(spec.isAllocated(2)).toBe(false);
    expect(spec.isAllocated(20)).toBe(false);
    expect(spec.isAllocated(3)).toBe(false);
  });
});

// Helper: tree with ascendancy starts for different classes
function makeTreeWithAscendancies() {
  // Graph: 1 (start) -> 2 (gateway) -> 10 (ascStart Slayer) -> 11
  //                                  -> 20 (ascStart Guardian) -> 21
  return {
    nodes: {
      1: { id: 1, name: 'Start', type: 'classStart', stats: [], adjacent: [2], classStartIndex: 4, masteryEffects: [] },
      2: { id: 2, name: 'Gateway', type: 'normal', stats: [], adjacent: [1, 10, 20], masteryEffects: [] },
      10: { id: 10, name: 'Asc Start Slayer', type: 'ascendancyStart', stats: [], adjacent: [2, 11], ascendancy: 'Slayer', masteryEffects: [] },
      11: { id: 11, name: 'Slayer Notable', type: 'notable', stats: ['Slayer Stuff'], adjacent: [10], ascendancy: 'Slayer', masteryEffects: [] },
      20: { id: 20, name: 'Asc Start Guardian', type: 'ascendancyStart', stats: [], adjacent: [2, 21], ascendancy: 'Guardian', masteryEffects: [] },
      21: { id: 21, name: 'Guardian Notable', type: 'notable', stats: ['Guardian Stuff'], adjacent: [20], ascendancy: 'Guardian', masteryEffects: [] },
    },
    classStarts: { 4: 1 },
    _classes: [
      { name: 'Scion', ascendancies: [] },
      { name: 'Marauder', ascendancies: [] },
      { name: 'Ranger', ascendancies: [] },
      { name: 'Witch', ascendancies: [] },
      { name: 'Duelist', ascendancies: [{ name: 'Slayer' }, { name: 'Gladiator' }, { name: 'Champion' }] },
      { name: 'Templar', ascendancies: [{ name: 'Inquisitor' }, { name: 'Hierophant' }, { name: 'Guardian' }] },
      { name: 'Shadow', ascendancies: [] },
    ],
  };
}

describe('ascendancy pathing restrictions', () => {
  it('can path to own class ascendancy nodes (Duelist -> Slayer)', () => {
    const tree = makeTreeWithAscendancies();
    const spec = new PassiveSpec(tree, 4); // Duelist
    const path = spec.findShortestPath(11);
    expect(path).toEqual([2, 10, 11]);
  });

  it('cannot path to another class ascendancy (Duelist -> Guardian)', () => {
    const tree = makeTreeWithAscendancies();
    const spec = new PassiveSpec(tree, 4); // Duelist
    const path = spec.findShortestPath(21);
    expect(path).toBeNull();
  });

  it('cannot path to another class ascendancyStart (Duelist -> Guardian start)', () => {
    const tree = makeTreeWithAscendancies();
    const spec = new PassiveSpec(tree, 4); // Duelist
    const path = spec.findShortestPath(20);
    expect(path).toBeNull();
  });
});
