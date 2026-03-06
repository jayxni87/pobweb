import { describe, it, expect } from 'vitest';
import { TreeAllocation } from '../tree-allocation.js';
import { TreeData } from '../tree-data.js';
import { PassiveSpec } from '../../models/passive-spec.js';

function makeTreeJson() {
  return {
    classes: [
      { name: 'Scion', ascendancies: [], startNodeId: 1 },
    ],
    nodes: {
      1: { id: 1, name: 'Start', type: 'classStart', group: 1, orbit: 0, orbitIndex: 0, stats: [], adjacent: [2] },
      2: { id: 2, name: 'Node A', type: 'normal', group: 1, orbit: 1, orbitIndex: 0, stats: ['+10 Str'], adjacent: [1, 3] },
      3: { id: 3, name: 'Node B', type: 'notable', group: 2, orbit: 0, orbitIndex: 0, stats: ['+20% Dmg'], adjacent: [2, 4] },
      4: { id: 4, name: 'Node C', type: 'keystone', group: 2, orbit: 1, orbitIndex: 0, stats: ['Keystone'], adjacent: [3] },
      5: { id: 5, name: 'Isolated', type: 'normal', group: 3, orbit: 0, orbitIndex: 0, stats: [], adjacent: [] },
    },
    groups: {
      1: { x: 0, y: 0, orbits: [0, 1] },
      2: { x: 200, y: 0, orbits: [0, 1] },
      3: { x: 999, y: 999, orbits: [0] },
    },
    constants: { orbitRadii: [0, 82], skillsPerOrbit: [1, 6] },
  };
}

describe('TreeAllocation', () => {
  it('creates with tree data and class', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    expect(alloc.spec.isAllocated(1)).toBe(true);
  });

  it('allocates a node by clicking (with path)', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    const result = alloc.allocateNode(3); // needs to path through 2
    expect(result).toBe(true);
    expect(alloc.spec.isAllocated(2)).toBe(true);
    expect(alloc.spec.isAllocated(3)).toBe(true);
  });

  it('deallocates a leaf node', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    alloc.allocateNode(2);
    alloc.allocateNode(3);
    const result = alloc.deallocateNode(3);
    expect(result).toBe(true);
    expect(alloc.spec.isAllocated(3)).toBe(false);
  });

  it('toggles allocation on click', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    alloc.toggleNode(2); // allocate
    expect(alloc.spec.isAllocated(2)).toBe(true);
    alloc.toggleNode(2); // deallocate
    expect(alloc.spec.isAllocated(2)).toBe(false);
  });

  it('returns path preview for target node', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    const path = alloc.getPathPreview(4);
    expect(path).toEqual([2, 3, 4]);
  });

  it('returns empty path for already-allocated node', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    const path = alloc.getPathPreview(1);
    expect(path).toEqual([]);
  });

  it('returns null path for unreachable node', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    const path = alloc.getPathPreview(5);
    expect(path).toBeNull();
  });

  it('fires onChange callback when allocation changes', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    let called = false;
    alloc.onChange = () => { called = true; };
    alloc.allocateNode(2);
    expect(called).toBe(true);
  });

  it('resets to class start only', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    alloc.allocateNode(3);
    alloc.reset();
    expect(alloc.spec.allocatedCount()).toBe(1);
    expect(alloc.spec.isAllocated(1)).toBe(true);
  });

  it('provides allocated node count', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    alloc.allocateNode(2);
    alloc.allocateNode(3);
    expect(alloc.allocatedCount()).toBe(3); // start + 2
  });

  it('collects stats from allocated nodes', () => {
    const td = new TreeData(makeTreeJson());
    const alloc = new TreeAllocation(td, 0);
    alloc.allocateNode(2);
    const stats = alloc.collectStats();
    expect(stats).toContain('+10 Str');
  });
});
