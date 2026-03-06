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

function makeConnTreeJson() {
  return {
    classes: [
      { name: 'Scion', ascendancies: [], startNodeId: 1 },
    ],
    nodes: {
      1: { id: 1, name: 'Start', type: 'classStart', group: 1, orbit: 0, orbitIndex: 0, stats: [], adjacent: [2] },
      2: { id: 2, name: 'Node A', type: 'normal', group: 1, orbit: 1, orbitIndex: 0, stats: ['+10 Str'], adjacent: [1, 3, 4] },
      3: { id: 3, name: 'Notable', type: 'notable', group: 2, orbit: 0, orbitIndex: 0, stats: ['Big'], adjacent: [2] },
      4: { id: 4, name: 'Node B', type: 'normal', group: 2, orbit: 1, orbitIndex: 0, stats: ['+5 Dex'], adjacent: [2, 3] },
    },
    groups: {
      1: { x: 0, y: 0, orbits: [0, 1] },
      2: { x: 200, y: 0, orbits: [0, 1] },
    },
    constants: { orbitRadii: [0, 82], skillsPerOrbit: [1, 6] },
  };
}

describe('buildConnectionInstances', () => {
  it('creates connections for each edge (deduplicated), skipping classStart/mastery', () => {
    const td = new TreeData(makeConnTreeJson());
    const conns = buildConnectionInstances(td, null);
    // 2-3, 2-4, 3-4 visible; 1-2 hidden (classStart)
    expect(conns.length).toBe(3);
  });

  it('marks active connections gold when both endpoints allocated', () => {
    const td = new TreeData(makeConnTreeJson());
    const spec = mockSpec([1, 2, 3]);
    const conns = buildConnectionInstances(td, spec);
    const active = conns.filter(c => c.color === CONNECTION_COLORS.active);
    expect(active.length).toBe(1); // 2-3
  });

  it('marks inactive connections with inactive color', () => {
    const td = new TreeData(makeConnTreeJson());
    const spec = mockSpec([1, 2]);
    const conns = buildConnectionInstances(td, spec);
    const inactive = conns.filter(c => c.color === CONNECTION_COLORS.inactive);
    expect(inactive.length).toBe(3); // 2-3, 2-4, 3-4 all inactive (only one endpoint allocated)
  });

  it('active connections are thicker', () => {
    const td = new TreeData(makeConnTreeJson());
    const spec = mockSpec([1, 2, 3]);
    const conns = buildConnectionInstances(td, spec);
    const active = conns.find(c => c.color === CONNECTION_COLORS.active);
    const inactive = conns.find(c => c.color === CONNECTION_COLORS.inactive);
    expect(active.width).toBeGreaterThan(inactive.width);
  });
});

describe('arc connections', () => {
  function makeArcTreeJson() {
    // Two nodes on orbit 2 (radius 162) of the same group at 0 and PI/2 radians apart
    // Group center at origin. orbitRadii[2] = 162, skillsPerOrbit[2] = 16
    // Node 10: orbit 2, orbitIndex 0 -> angle 0 -> x=0, y=-162
    // Node 11: orbit 2, orbitIndex 4 -> angle PI/2 (90 deg) -> x=162, y=0
    return {
      classes: [
        { name: 'Scion', ascendancies: [], startNodeId: 1 },
      ],
      nodes: {
        1: { id: 1, name: 'Start', type: 'classStart', group: 1, orbit: 0, orbitIndex: 0, stats: [], adjacent: [10], ascendancy: null },
        10: { id: 10, name: 'Arc A', type: 'normal', group: 1, orbit: 2, orbitIndex: 0, stats: [], adjacent: [1, 11], ascendancy: null },
        11: { id: 11, name: 'Arc B', type: 'normal', group: 1, orbit: 2, orbitIndex: 4, stats: [], adjacent: [10], ascendancy: null },
      },
      groups: {
        1: { x: 0, y: 0, orbits: [0, 1, 2] },
      },
      constants: { orbitRadii: [0, 82, 162], skillsPerOrbit: [1, 6, 16] },
    };
  }

  it('generates multiple arc segments for same-orbit same-group nodes', () => {
    const td = new TreeData(makeArcTreeJson());
    const conns = buildConnectionInstances(td, null);
    // Only 10-11 connection should be visible (1-10 is classStart, hidden)
    // Since 10 and 11 share group=1 and orbit=2, the connection should be an arc (multiple segments)
    expect(conns.length).toBeGreaterThan(1);

    // All segment endpoints should lie approximately on the circle of radius 162 from origin
    const radius = 162;
    const tolerance = 1; // allow small floating-point deviation
    for (const seg of conns) {
      const r1 = Math.sqrt(seg.x1 * seg.x1 + seg.y1 * seg.y1);
      const r2 = Math.sqrt(seg.x2 * seg.x2 + seg.y2 * seg.y2);
      expect(r1).toBeCloseTo(radius, 0);
      expect(r2).toBeCloseTo(radius, 0);
    }
  });

  it('generates a straight line for different-orbit nodes in same group', () => {
    const json = makeArcTreeJson();
    // Change node 11 to orbit 1 so it's a different orbit from node 10 (orbit 2)
    json.nodes[11] = { id: 11, name: 'Diff Orbit', type: 'normal', group: 1, orbit: 1, orbitIndex: 0, stats: [], adjacent: [10], ascendancy: null };
    const td = new TreeData(json);
    const conns = buildConnectionInstances(td, null);
    // 10-11 is the only visible edge (1-10 is classStart, hidden)
    expect(conns.length).toBe(1);
  });

  it('generates a straight line for different-group nodes on same orbit', () => {
    const json = makeArcTreeJson();
    // Add group 2 and put node 11 in group 2 but same orbit
    json.groups[2] = { x: 500, y: 0, orbits: [0, 1, 2] };
    json.nodes[11] = { id: 11, name: 'Diff Group', type: 'normal', group: 2, orbit: 2, orbitIndex: 0, stats: [], adjacent: [10], ascendancy: null };
    const td = new TreeData(json);
    const conns = buildConnectionInstances(td, null);
    // 10-11 is the only visible edge (1-10 is classStart, hidden)
    expect(conns.length).toBe(1);
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
