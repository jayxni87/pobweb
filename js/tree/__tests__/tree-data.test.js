import { describe, it, expect } from 'vitest';
import { TreeData, NODE_TYPES } from '../tree-data.js';

// Minimal tree JSON structure matching PoE passive tree format
function makeTreeJson() {
  return {
    classes: [
      { name: 'Scion', ascendancies: [{ id: 'Ascendant', name: 'Ascendant' }], startNodeId: 1 },
      { name: 'Marauder', ascendancies: [{ id: 'Berserker', name: 'Berserker' }], startNodeId: 10 },
      { name: 'Witch', ascendancies: [{ id: 'Necromancer', name: 'Necromancer' }], startNodeId: 20 },
    ],
    nodes: {
      1: { id: 1, name: 'Scion Start', type: 'classStart', group: 1, orbit: 0, orbitIndex: 0, stats: [], adjacent: [2, 3] },
      2: { id: 2, name: 'Str Node', type: 'normal', group: 1, orbit: 1, orbitIndex: 0, stats: ['+10 to Strength'], adjacent: [1, 4] },
      3: { id: 3, name: 'Dex Node', type: 'normal', group: 1, orbit: 1, orbitIndex: 1, stats: ['+10 to Dexterity'], adjacent: [1, 5] },
      4: { id: 4, name: 'Life Notable', type: 'notable', group: 2, orbit: 0, orbitIndex: 0, stats: ['+20 to Maximum Life', '5% increased Maximum Life'], adjacent: [2, 6] },
      5: { id: 5, name: 'ES Notable', type: 'notable', group: 3, orbit: 0, orbitIndex: 0, stats: ['+30 to Maximum Energy Shield'], adjacent: [3] },
      6: { id: 6, name: 'Resolute Technique', type: 'keystone', group: 2, orbit: 1, orbitIndex: 0, stats: ['Your hits can\'t be Evaded', 'Never deal Critical Strikes'], adjacent: [4] },
      7: { id: 7, name: 'Jewel Socket', type: 'socket', group: 4, orbit: 0, orbitIndex: 0, stats: [], adjacent: [2] },
      10: { id: 10, name: 'Marauder Start', type: 'classStart', group: 10, orbit: 0, orbitIndex: 0, stats: [], adjacent: [11] },
      11: { id: 11, name: 'Marauder Str', type: 'normal', group: 10, orbit: 1, orbitIndex: 0, stats: ['+10 to Strength'], adjacent: [10] },
      20: { id: 20, name: 'Witch Start', type: 'classStart', group: 20, orbit: 0, orbitIndex: 0, stats: [], adjacent: [21] },
      21: { id: 21, name: 'Witch Int', type: 'normal', group: 20, orbit: 1, orbitIndex: 0, stats: ['+10 to Intelligence'], adjacent: [20] },
      // Ascendancy nodes
      100: { id: 100, name: 'Ascendant Start', type: 'ascendancyStart', group: 100, orbit: 0, orbitIndex: 0, stats: [], adjacent: [101], ascendancy: 'Ascendant' },
      101: { id: 101, name: 'Path of the Marauder', type: 'notable', group: 100, orbit: 1, orbitIndex: 0, stats: ['+40 to Strength'], adjacent: [100], ascendancy: 'Ascendant' },
      200: { id: 200, name: 'Berserker Start', type: 'ascendancyStart', group: 200, orbit: 0, orbitIndex: 0, stats: [], adjacent: [201], ascendancy: 'Berserker' },
      201: { id: 201, name: 'Aspect of Carnage', type: 'notable', group: 200, orbit: 1, orbitIndex: 0, stats: ['40% more Damage', '10% increased Damage taken'], adjacent: [200], ascendancy: 'Berserker' },
    },
    groups: {
      1: { x: 0, y: 0, orbits: [0, 1] },
      2: { x: 200, y: -100, orbits: [0, 1] },
      3: { x: -200, y: -100, orbits: [0, 1] },
      4: { x: 100, y: 100, orbits: [0] },
      10: { x: -500, y: 500, orbits: [0, 1] },
      20: { x: 500, y: -500, orbits: [0, 1] },
      100: { x: 0, y: 300, orbits: [0, 1] },
      200: { x: -500, y: 800, orbits: [0, 1] },
    },
    constants: {
      orbitRadii: [0, 82, 162, 335, 493],
      skillsPerOrbit: [1, 6, 12, 12, 40],
    },
  };
}

describe('TreeData', () => {
  it('loads tree from JSON', () => {
    const td = new TreeData(makeTreeJson());
    expect(td.nodeCount()).toBeGreaterThan(0);
  });

  it('provides node by id', () => {
    const td = new TreeData(makeTreeJson());
    const node = td.getNode(1);
    expect(node).toBeDefined();
    expect(node.name).toBe('Scion Start');
    expect(node.type).toBe('classStart');
  });

  it('returns undefined for missing node', () => {
    const td = new TreeData(makeTreeJson());
    expect(td.getNode(9999)).toBeUndefined();
  });

  it('maps class starts', () => {
    const td = new TreeData(makeTreeJson());
    expect(td.classStarts[0]).toBe(1);    // Scion
    expect(td.classStarts[1]).toBe(10);   // Marauder
    expect(td.classStarts[2]).toBe(20);   // Witch
  });

  it('maps class names to IDs', () => {
    const td = new TreeData(makeTreeJson());
    expect(td.classNameToId('Scion')).toBe(0);
    expect(td.classNameToId('Marauder')).toBe(1);
    expect(td.classNameToId('Witch')).toBe(2);
  });

  it('returns -1 for unknown class', () => {
    const td = new TreeData(makeTreeJson());
    expect(td.classNameToId('NotAClass')).toBe(-1);
  });

  it('identifies node types', () => {
    const td = new TreeData(makeTreeJson());
    expect(td.getNode(1).type).toBe('classStart');
    expect(td.getNode(2).type).toBe('normal');
    expect(td.getNode(4).type).toBe('notable');
    expect(td.getNode(6).type).toBe('keystone');
    expect(td.getNode(7).type).toBe('socket');
  });

  it('builds adjacency lists', () => {
    const td = new TreeData(makeTreeJson());
    const node1 = td.getNode(1);
    expect(node1.adjacent).toContain(2);
    expect(node1.adjacent).toContain(3);
  });

  it('finds keystones by name', () => {
    const td = new TreeData(makeTreeJson());
    const rt = td.findKeystoneByName('Resolute Technique');
    expect(rt).toBeDefined();
    expect(rt.id).toBe(6);
  });

  it('returns undefined for unknown keystone', () => {
    const td = new TreeData(makeTreeJson());
    expect(td.findKeystoneByName('NonExistent')).toBeUndefined();
  });

  it('lists all nodes of a type', () => {
    const td = new TreeData(makeTreeJson());
    const notables = td.getNodesByType('notable');
    expect(notables.length).toBeGreaterThanOrEqual(2);
    for (const n of notables) {
      // notables include ascendancy notables
      expect(n.type).toBe('notable');
    }
  });

  it('computes node positions from group and orbit', () => {
    const td = new TreeData(makeTreeJson());
    const node = td.getNode(1);
    // classStart at orbit 0 should be at group position
    expect(node.x).toBeDefined();
    expect(node.y).toBeDefined();
    expect(typeof node.x).toBe('number');
  });

  it('lists ascendancy nodes for a class', () => {
    const td = new TreeData(makeTreeJson());
    const ascNodes = td.getAscendancyNodes('Ascendant');
    expect(ascNodes.length).toBe(2);
    expect(ascNodes.every(n => n.ascendancy === 'Ascendant')).toBe(true);
  });

  it('lists classes with ascendancies', () => {
    const td = new TreeData(makeTreeJson());
    const classes = td.getClasses();
    expect(classes.length).toBe(3);
    expect(classes[0].name).toBe('Scion');
    expect(classes[0].ascendancies).toEqual([{ id: 'Ascendant', name: 'Ascendant' }]);
  });

  it('lists jewel socket nodes', () => {
    const td = new TreeData(makeTreeJson());
    const sockets = td.getNodesByType('socket');
    expect(sockets.length).toBe(1);
    expect(sockets[0].id).toBe(7);
  });

  it('provides group data', () => {
    const td = new TreeData(makeTreeJson());
    const group = td.getGroup(1);
    expect(group).toBeDefined();
    expect(group.x).toBe(0);
    expect(group.y).toBe(0);
  });

  it('returns total node count', () => {
    const td = new TreeData(makeTreeJson());
    expect(td.nodeCount()).toBe(15); // all nodes including ascendancy
  });

  it('exports nodes map for PassiveSpec compatibility', () => {
    const td = new TreeData(makeTreeJson());
    expect(td.nodes).toBeDefined();
    expect(td.nodes[1]).toBeDefined();
  });
});

describe('clusterNodeMap', () => {
  it('indexes cluster notable nodes by name', () => {
    const json = {
      constants: { orbitRadii: [0, 82], skillsPerOrbit: [1, 6] },
      groups: { '1': { x: 0, y: 0 } },
      nodes: {
        '100': { group: 1, orbit: 0, orbitIndex: 0, classStartIndex: 0 },
        '999': { isNotable: true, name: 'Cremator', stats: ['Ignited enemies die faster'], icon: 'fire.png' },
      },
      classes: [],
    };
    const tree = new TreeData(json);
    expect(tree.clusterNodeMap).toBeDefined();
    expect(tree.clusterNodeMap.get('Cremator')).toBeDefined();
    expect(tree.clusterNodeMap.get('Cremator').stats).toEqual(['Ignited enemies die faster']);
    expect(tree.clusterNodeMap.get('Cremator').icon).toBe('fire.png');
  });

  it('does not include grouped notables in clusterNodeMap', () => {
    const json = {
      constants: { orbitRadii: [0, 82], skillsPerOrbit: [1, 6] },
      groups: { '1': { x: 0, y: 0 } },
      nodes: {
        '100': { group: 1, orbit: 0, orbitIndex: 0, classStartIndex: 0 },
        '200': { group: 1, orbit: 1, orbitIndex: 0, isNotable: true, name: 'Regular Notable', stats: ['stat'] },
      },
      classes: [],
    };
    const tree = new TreeData(json);
    expect(tree.clusterNodeMap.has('Regular Notable')).toBe(false);
  });
});

describe('orbit angle calculation', () => {
  // Helper: build a minimal tree with one node at the given orbit/orbitIndex
  function makeOrbitTestJson({ orbit, orbitIndex, skillsPerOrbit, orbitRadii }) {
    return {
      classes: [],
      nodes: {
        1: {
          id: 1,
          name: 'Test Node',
          type: 'normal',
          group: 1,
          orbit,
          orbitIndex,
          stats: [],
          adjacent: [],
        },
      },
      groups: {
        1: { x: 0, y: 0, orbits: [0, 1, 2, 3, 4] },
      },
      constants: { orbitRadii, skillsPerOrbit },
    };
  }

  it('16-node orbit uses non-uniform angles (orbitIndex 1 => 30 degrees)', () => {
    // Orbit 2 with 16 skills, radius 162, group at origin
    // PoB angle for orbitIndex 1 in 16-node orbit = 30 degrees = PI/6 rad
    // x = sin(PI/6) * 162 = 0.5 * 162 = 81
    // y = -cos(PI/6) * 162 = -0.866 * 162 ≈ -140.296
    const json = makeOrbitTestJson({
      orbit: 2,
      orbitIndex: 1,
      skillsPerOrbit: [1, 6, 16, 16, 40],
      orbitRadii: [0, 82, 162, 335, 493],
    });
    const td = new TreeData(json);
    const node = td.getNode(1);
    expect(node.x).toBeCloseTo(81, 0);
    expect(node.y).toBeCloseTo(-140.3, 0);
  });

  it('stores node.angle for each node', () => {
    // orbitIndex 0 should have angle = 0
    const json = makeOrbitTestJson({
      orbit: 2,
      orbitIndex: 0,
      skillsPerOrbit: [1, 6, 16, 16, 40],
      orbitRadii: [0, 82, 162, 335, 493],
    });
    const td = new TreeData(json);
    const node = td.getNode(1);
    expect(node.angle).toBeDefined();
    expect(node.angle).toBe(0);
  });

  it('6-node orbit uses uniform spacing (orbitIndex 1 => 60 degrees)', () => {
    // Orbit 1 with 6 skills, radius 82, group at origin
    // Uniform: angle = 2*PI*1/6 = PI/3 = 60 degrees
    // x = sin(PI/3) * 82 = 0.866 * 82 ≈ 71.0
    // y = -cos(PI/3) * 82 = -0.5 * 82 = -41
    const json = makeOrbitTestJson({
      orbit: 1,
      orbitIndex: 1,
      skillsPerOrbit: [1, 6, 16, 16, 40],
      orbitRadii: [0, 82, 162, 335, 493],
    });
    const td = new TreeData(json);
    const node = td.getNode(1);
    expect(node.x).toBeCloseTo(71.0, 0);
    expect(node.y).toBeCloseTo(-41, 0);
  });
});
