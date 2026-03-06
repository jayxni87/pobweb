import { describe, it, expect } from 'vitest';
import { buildSubgraph, computeSubgraphId } from '../subgraph-builder.js';
import clusterData from '../../data/cluster-jewels.json';

describe('computeSubgraphId', () => {
  it('computes ID for large socket at index 3', () => {
    // Bit 16 = 1, bits 4-5 = sizeIndex 2 (0b10), bits 6-8 = large index 3 (0b011)
    // 0x10000 | (2 << 4) | (3 << 6) = 65536 | 32 | 192 = 65760
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
  // Use real cluster-jewels.json data for the jewel definition
  function makeTestContext() {
    const treeData = {
      groups: {
        '1000': { x: 5000, y: 5000 },
      },
      nodes: {
        26725: {
          id: 26725,
          type: 'jewel',
          group: 500,
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

    // All nodes should have x,y positions near the proxy group
    for (const node of subgraph.nodes) {
      const dx = node.x - 5000;
      const dy = node.y - 5000;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Should be within orbit radius range (0-846)
      expect(dist).toBeLessThanOrEqual(850);
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

  it('returns null for missing proxy group', () => {
    const { clusterData, constants } = makeTestContext();
    const treeData = {
      groups: {},
      nodes: {
        26725: {
          id: 26725,
          type: 'jewel',
          expansionJewel: { size: 2, index: 3, proxy: '9999' },
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

  it('returns correct subgraph metadata', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = makeParsedJewel();

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    expect(subgraph.groupId).toBe('1000');
    expect(subgraph.parentSocketId).toBe(26725);
    expect(subgraph.sizeIndex).toBe(2);
    expect(subgraph.id).toBe(computeSubgraphId(2, 3, 0));
  });
});
