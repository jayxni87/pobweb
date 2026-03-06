import { describe, it, expect } from 'vitest';
import { buildSubgraph, computeSubgraphId } from '../subgraph-builder.js';
import clusterData from '../../data/cluster-jewels.json';

describe('computeSubgraphId', () => {
  it('computes ID for large socket at index 3', () => {
    // Bit 16 = 1, bits 4-5 = sizeIndex 2 (0b10), bits 6-8 = large index 3 (0b011)
    const id = computeSubgraphId(2, 3, 0);
    expect(id).toBe(0x10000 | (2 << 4) | (3 << 6));
    expect(id).toBe(65760);
  });

  it('computes ID for medium socket nested in large index 3, medium index 1', () => {
    const id = computeSubgraphId(1, 3, 1);
    expect(id).toBe(0x10000 | (1 << 4) | (3 << 6) | (1 << 9));
  });
});

describe('buildSubgraph', () => {
  // The proxy is a NODE ID. The proxy node belongs to a group. The group has position.
  function makeTestContext() {
    const treeData = {
      groups: {
        '500': { x: 0, y: 0, n: [] }, // parent socket's group (not used for positioning)
        '999': { x: 5000, y: 5000, n: [] }, // proxy node's group (used for positioning)
      },
      nodes: {
        // Proxy node — this is what ej.proxy points to
        1000: {
          id: 1000,
          type: 'normal',
          group: '999',
          orbit: 3,
          orbitIndex: 1,
          isProxy: true,
          adjacent: [],
        },
        // Parent socket node
        26725: {
          id: 26725,
          type: 'jewel',
          group: '500',
          orbit: 1,
          orbitIndex: 5,
          expansionJewel: { size: 2, index: 3, proxy: '1000' },
          adjacent: [100],
        },
      },
      clusterNodeMap: new Map([
        ['Cremator', { name: 'Cremator', stats: ['burn stuff'], icon: 'cremator.png' }],
        ['Smoking Remains', { name: 'Smoking Remains', stats: ['smoke stuff'], icon: 'smoke.png' }],
      ]),
    };

    const constants = {
      orbitRadii: [0, 82, 162, 335, 493, 662, 846],
      skillsPerOrbit: [1, 6, 16, 16, 40, 72, 72],
    };

    return { clusterData, treeData, constants };
  }

  function makeParsedJewel() {
    return {
      baseName: 'Large Cluster Jewel',
      clusterJewelSkill: 'affliction_fire_damage',
      clusterJewelNodeCount: 8,
      clusterJewelSocketCount: 2,
      clusterJewelNotables: ['Cremator', 'Smoking Remains'],
      clusterJewelAddedMods: [],
    };
  }

  it('generates correct number of nodes for Large Cluster Jewel', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    expect(subgraph).not.toBeNull();
    expect(subgraph.nodes.length).toBe(8); // 2 sockets + 2 notables + 4 smalls
  });

  it('generates an entrance node connected to parent socket', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    expect(subgraph.entranceNodeId).toBeDefined();
    const entrance = subgraph.nodes.find(n => n.id === subgraph.entranceNodeId);
    expect(entrance).toBeDefined();
    // Entrance should be adjacent to parent socket
    expect(entrance.adjacent).toContain(26725);
  });

  it('sets correct node types for sockets, notables, and smalls', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    const sockets = subgraph.nodes.filter(n => n.type === 'jewel');
    const notables = subgraph.nodes.filter(n => n.type === 'notable');
    const smalls = subgraph.nodes.filter(n => n.type === 'normal');

    expect(sockets.length).toBe(2);
    expect(notables.length).toBe(2);
    expect(smalls.length).toBe(4);
  });

  it('positions nodes on the proxy group orbit', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    // Large cluster uses orbit 3 (sizeIndex 2 + 1), radius = orbitRadii[3] = 335
    for (const node of subgraph.nodes) {
      const dx = node.x - 5000;
      const dy = node.y - 5000;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Should be at orbit 3 radius (335) within rounding tolerance
      expect(dist).toBeCloseTo(335, 0);
    }
  });

  it('creates connections between sequential nodes', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    // Each node should have at least one adjacent node
    for (const node of subgraph.nodes) {
      expect(node.adjacent.length).toBeGreaterThan(0);
    }
  });

  it('all nodes are marked as cluster nodes', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    for (const node of subgraph.nodes) {
      expect(node._isClusterNode).toBe(true);
    }
  });

  it('socket nodes have expansionJewel metadata for nesting', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    const sockets = subgraph.nodes.filter(n => n.type === 'jewel');
    for (const socket of sockets) {
      expect(socket.expansionJewel).toBeDefined();
      expect(socket.name).toBe('Medium Jewel Socket');
      // Large cluster jewel sockets should have size 1 (medium)
      expect(socket.expansionJewel.size).toBe(1);
    }
  });

  it('returns null for missing jewel definition', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = { baseName: 'Nonexistent Jewel' };

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);
    expect(subgraph).toBeNull();
  });

  it('returns null for missing proxy node', () => {
    const { clusterData, constants } = makeTestContext();
    const treeData = {
      groups: {},
      nodes: {
        26725: {
          id: 26725,
          type: 'jewel',
          expansionJewel: { size: 2, index: 3, proxy: '9999' },
          adjacent: [],
        },
      },
      clusterNodeMap: new Map(),
    };
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);
    expect(subgraph).toBeNull();
  });

  it('closes the loop for Large cluster jewels', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    const first = subgraph.nodes[0];
    const last = subgraph.nodes[subgraph.nodes.length - 1];
    // For Large (sizeIndex > 0), first and last should be connected
    expect(first.adjacent).toContain(last.id);
    expect(last.adjacent).toContain(first.id);
  });

  it('uses node IDs based on orbit position index, not sequential', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    // Node IDs should be subgraphBaseId + positionIndex
    const baseId = subgraph.id;
    for (const node of subgraph.nodes) {
      const offset = node.id - baseId;
      // Offset should be the cluster orbit position index (0-11), not sequential
      expect(offset).toBe(node._positionIndex);
      expect(offset).toBeLessThan(12); // totalIndicies for Large is 12
    }
  });

  it('returns correct subgraph metadata', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    // groupId should be the proxy node's group, not the proxy node ID itself
    expect(subgraph.groupId).toBe('999');
    expect(subgraph.parentSocketId).toBe(26725);
    expect(subgraph.sizeIndex).toBe(2);
  });
});
