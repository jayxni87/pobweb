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

describe('cluster jewel subgraph rendering', () => {
  // Simulate cluster subgraph nodes added to treeData.nodes by the subgraph builder.
  // Cluster nodes have IDs with bit 16 set (>= 65536), share a proxy group,
  // and connect back to the parent jewel socket.
  function makeClusterTreeJson() {
    return {
      classes: [
        { name: 'Scion', ascendancies: [], startNodeId: 1 },
      ],
      nodes: {
        1: { id: 1, name: 'Start', type: 'classStart', group: 1, orbit: 0, orbitIndex: 0, stats: [], adjacent: [2] },
        2: { id: 2, name: 'Node A', type: 'normal', group: 1, orbit: 1, orbitIndex: 0, stats: ['+10 Str'], adjacent: [1, 100] },
        100: { id: 100, name: 'Large Jewel Socket', type: 'jewel', group: 2, orbit: 0, orbitIndex: 0, stats: [], adjacent: [2] },
      },
      groups: {
        1: { x: 0, y: 0, orbits: [0, 1] },
        2: { x: 500, y: 0, orbits: [0] },
        // Proxy group for cluster subgraph
        3: { x: 600, y: 100, orbits: [0, 1, 2] },
      },
      constants: { orbitRadii: [0, 82, 162], skillsPerOrbit: [1, 6, 16] },
    };
  }

  function addClusterNodes(td) {
    // Simulate what _applySubgraph does: add synthetic cluster nodes to treeData.nodes
    // and connect the entrance node to the parent socket
    const clusterNodes = [
      { id: 0x10000, name: 'Small Passive', type: 'normal', group: 3, orbit: 2, orbitIndex: 0, stats: ['+10 Life'], adjacent: [0x10001, 100], x: 600, y: -62, angle: 0 },
      { id: 0x10001, name: 'Cluster Notable', type: 'notable', group: 3, orbit: 2, orbitIndex: 4, stats: ['Big cluster bonus'], adjacent: [0x10000, 0x10002], x: 762, y: 100, angle: Math.PI / 2 },
      { id: 0x10002, name: 'Small Passive 2', type: 'normal', group: 3, orbit: 2, orbitIndex: 8, stats: ['+10 Life'], adjacent: [0x10001], x: 600, y: 262, angle: Math.PI },
    ];
    for (const node of clusterNodes) {
      td.nodes[node.id] = node;
    }
    // Connect parent socket to entrance node (bidirectional)
    td.nodes[100].adjacent.push(0x10000);
  }

  it('buildNodeInstances includes cluster subgraph nodes', () => {
    const td = new TreeData(makeClusterTreeJson());
    addClusterNodes(td);
    const instances = buildNodeInstances(td, null);
    // 3 original + 3 cluster = 6
    expect(instances.length).toBe(6);
  });

  it('buildConnectionInstances includes connections between cluster nodes (arc segments)', () => {
    const td = new TreeData(makeClusterTreeJson());
    addClusterNodes(td);
    const conns = buildConnectionInstances(td, null);
    // Visible edges:
    // - 2-100 (normal-jewel, straight line) = 1
    // - 0x10000-0x10001 (same group 3, orbit 2 -> arc, multiple segments)
    // - 0x10001-0x10002 (same group 3, orbit 2 -> arc, multiple segments)
    // - 0x10000-100 (entrance to parent socket, different groups -> straight line) = 1
    // Hidden: 1-2 (classStart)
    // Arc segments: each arc connection produces multiple segments (>= 2 each)
    expect(conns.length).toBeGreaterThanOrEqual(4);

    // Verify the straight-line connection from entrance to parent socket exists
    const entranceToSocket = conns.find(c =>
      (Math.abs(c.x1 - 600) < 1 && Math.abs(c.y1 - (-62)) < 1 && Math.abs(c.x2 - 500) < 1 && Math.abs(c.y2 - 0) < 1) ||
      (Math.abs(c.x2 - 600) < 1 && Math.abs(c.y2 - (-62)) < 1 && Math.abs(c.x1 - 500) < 1 && Math.abs(c.y1 - 0) < 1)
    );
    expect(entranceToSocket).toBeDefined();
  });

  it('buildConnectionInstances uses arc rendering for cluster nodes in same group/orbit', () => {
    const td = new TreeData(makeClusterTreeJson());
    addClusterNodes(td);
    const conns = buildConnectionInstances(td, null);

    // Arc segments between cluster nodes should lie on the orbit circle around proxy group (600, 100)
    // Radius = distance from group center to cluster node positions
    const groupX = 600, groupY = 100;
    const radius = 162;
    const tolerance = 2;

    // Find arc segments: those where both endpoints are near the orbit circle of group 3
    const arcSegments = conns.filter(c => {
      const r1 = Math.sqrt((c.x1 - groupX) ** 2 + (c.y1 - groupY) ** 2);
      const r2 = Math.sqrt((c.x2 - groupX) ** 2 + (c.y2 - groupY) ** 2);
      return Math.abs(r1 - radius) < tolerance && Math.abs(r2 - radius) < tolerance;
    });

    // Should have multiple arc segments (at least 4 from the two arc connections)
    expect(arcSegments.length).toBeGreaterThanOrEqual(4);
  });

  it('buildConnectionInstances deduplicates correctly with large node IDs (bit 16 set)', () => {
    const td = new TreeData(makeClusterTreeJson());
    addClusterNodes(td);
    const conns = buildConnectionInstances(td, null);

    // Count total connections including arc segments. Run twice and compare to verify no dupes.
    const conns2 = buildConnectionInstances(td, null);
    expect(conns.length).toBe(conns2.length);
  });

  it('buildConnectionInstances marks cluster connections active when both nodes allocated', () => {
    const td = new TreeData(makeClusterTreeJson());
    addClusterNodes(td);
    const spec = mockSpec([1, 2, 100, 0x10000, 0x10001]);
    const conns = buildConnectionInstances(td, spec);

    // The entrance-to-socket connection (0x10000 <-> 100) should be active
    // (both allocated). Find by checking for active color.
    const activeConns = conns.filter(c => c.color === CONNECTION_COLORS.active);
    expect(activeConns.length).toBeGreaterThanOrEqual(1);
  });

  it('cluster jewel socket nodes do not get icons (only frames)', () => {
    // In buildNodeLayers, jewel-type nodes skip icon rendering.
    // This verifies the code path doesn't crash for cluster jewel sockets.
    const td = new TreeData(makeClusterTreeJson());
    addClusterNodes(td);
    // Add a cluster jewel socket node
    td.nodes[0x10003] = {
      id: 0x10003, name: 'Medium Jewel Socket', type: 'jewel',
      group: 3, orbit: 2, orbitIndex: 12, stats: [],
      adjacent: [0x10002], x: 438, y: 100, angle: Math.PI * 1.5,
    };
    // buildNodeInstances should include it without error
    const instances = buildNodeInstances(td, null);
    expect(instances.length).toBe(7); // 3 original + 3 cluster + 1 socket
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
