import { describe, it, expect } from 'vitest';
import {
  buildNodeInstances,
  buildConnectionInstances,
  buildPathPreviewInstances,
  NODE_COLORS,
  CONNECTION_COLORS,
} from '../tree-renderer.js';
import { TreeData } from '../tree-data.js';

function makeTreeJson() {
  return {
    classes: [
      { name: 'Scion', ascendancies: [], startNodeId: 1 },
    ],
    nodes: {
      1: { id: 1, name: 'Start', type: 'classStart', group: 1, orbit: 0, orbitIndex: 0, stats: [], adjacent: [2] },
      2: { id: 2, name: 'Node A', type: 'normal', group: 1, orbit: 1, orbitIndex: 0, stats: ['+10 Str'], adjacent: [1, 3] },
      3: { id: 3, name: 'Notable', type: 'notable', group: 2, orbit: 0, orbitIndex: 0, stats: ['Big'], adjacent: [2] },
    },
    groups: {
      1: { x: 0, y: 0, orbits: [0, 1] },
      2: { x: 200, y: 0, orbits: [0] },
    },
    constants: { orbitRadii: [0, 82], skillsPerOrbit: [1, 6] },
  };
}

// Simple spec mock
function mockSpec(allocatedIds) {
  const set = new Set(allocatedIds);
  return {
    isAllocated(id) { return set.has(id); },
  };
}

describe('buildNodeInstances', () => {
  it('creates an instance per node', () => {
    const td = new TreeData(makeTreeJson());
    const instances = buildNodeInstances(td, null);
    expect(instances.length).toBe(3);
  });

  it('marks allocated nodes gold', () => {
    const td = new TreeData(makeTreeJson());
    const spec = mockSpec([1]);
    const instances = buildNodeInstances(td, spec);
    // Find the instance for node 1 (classStart at origin)
    const startInst = instances.find(i => i.x === 0 && i.y === 0);
    expect(startInst).toBeDefined();
    expect(startInst.color).toEqual(NODE_COLORS.allocated);
  });

  it('marks unallocated nodes grey', () => {
    const td = new TreeData(makeTreeJson());
    const spec = mockSpec([1]);
    const instances = buildNodeInstances(td, spec);
    const unalloc = instances.filter(i => i.color === NODE_COLORS.unallocated);
    expect(unalloc.length).toBe(2); // nodes 2 and 3
  });

  it('sizes notable nodes larger than normal', () => {
    const td = new TreeData(makeTreeJson());
    const instances = buildNodeInstances(td, null);
    const normal = instances.find(i => i.size === 20);
    const notable = instances.find(i => i.size === 30);
    expect(normal).toBeDefined();
    expect(notable).toBeDefined();
  });

  it('supports highlighted nodes', () => {
    const td = new TreeData(makeTreeJson());
    const instances = buildNodeInstances(td, null, { highlighted: new Set([2]) });
    const highlighted = instances.find(i => i.color === NODE_COLORS.highlighted);
    expect(highlighted).toBeDefined();
  });
});

describe('buildConnectionInstances', () => {
  it('creates connections for each edge (deduplicated)', () => {
    const td = new TreeData(makeTreeJson());
    const conns = buildConnectionInstances(td, null);
    // 1-2 and 2-3 = 2 unique edges
    expect(conns.length).toBe(2);
  });

  it('marks active connections gold when both endpoints allocated', () => {
    const td = new TreeData(makeTreeJson());
    const spec = mockSpec([1, 2]);
    const conns = buildConnectionInstances(td, spec);
    const active = conns.filter(c => c.color === CONNECTION_COLORS.active);
    expect(active.length).toBe(1); // 1-2
  });

  it('marks inactive connections grey', () => {
    const td = new TreeData(makeTreeJson());
    const spec = mockSpec([1]);
    const conns = buildConnectionInstances(td, spec);
    const inactive = conns.filter(c => c.color === CONNECTION_COLORS.inactive);
    expect(inactive.length).toBe(2); // both edges inactive (node 2 not allocated)
  });

  it('active connections are thicker', () => {
    const td = new TreeData(makeTreeJson());
    const spec = mockSpec([1, 2]);
    const conns = buildConnectionInstances(td, spec);
    const active = conns.find(c => c.color === CONNECTION_COLORS.active);
    const inactive = conns.find(c => c.color === CONNECTION_COLORS.inactive);
    expect(active.width).toBeGreaterThan(inactive.width);
  });
});

describe('buildPathPreviewInstances', () => {
  it('creates green connections for path nodes', () => {
    const td = new TreeData(makeTreeJson());
    const path = [1, 2, 3];
    const conns = buildPathPreviewInstances(td, path);
    expect(conns.length).toBe(2); // 1->2, 2->3
    for (const c of conns) {
      expect(c.color).toEqual(CONNECTION_COLORS.path);
    }
  });

  it('handles single node path', () => {
    const td = new TreeData(makeTreeJson());
    const conns = buildPathPreviewInstances(td, [1]);
    expect(conns.length).toBe(0);
  });

  it('handles empty path', () => {
    const td = new TreeData(makeTreeJson());
    const conns = buildPathPreviewInstances(td, []);
    expect(conns.length).toBe(0);
  });
});
