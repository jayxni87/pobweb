// PoBWeb - Tree Data Loader & Graph Structure
// Loads passive tree JSON and builds a navigable graph with positions.

export const NODE_TYPES = ['classStart', 'normal', 'notable', 'keystone', 'socket', 'mastery', 'ascendancyStart'];

export class TreeData {
  constructor(treeJson) {
    this.nodes = {};
    this.classStarts = {};
    this.groups = {};
    this._classes = [];
    this._keystoneIndex = new Map();
    this._typeIndex = new Map();
    this._ascendancyIndex = new Map();
    this._classNameMap = new Map();
    this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    this._load(treeJson);
  }

  _load(json) {
    const orbitRadii = json.constants?.orbitRadii || [0, 82, 162, 335, 493, 662, 846];
    const skillsPerOrbit = json.constants?.skillsPerOrbit || [1, 6, 16, 16, 40, 72, 72];

    // Load groups
    for (const [gid, gdata] of Object.entries(json.groups || {})) {
      this.groups[gid] = { ...gdata };
    }

    // Determine node type: supports both raw game data (boolean flags) and simple format (type field)
    function getNodeType(ndata) {
      if (ndata.type) return ndata.type; // simple format
      if (ndata.classStartIndex !== undefined) return 'classStart';
      if (ndata.isAscendancyStart) return 'ascendancyStart';
      if (ndata.isKeystone) return 'keystone';
      if (ndata.isNotable) return 'notable';
      if (ndata.isJewelSocket) return 'jewel';
      if (ndata.isMastery) return 'mastery';
      return 'normal';
    }

    // Extract adjacency: supports both out/in arrays and adjacent field
    function getAdjacent(ndata) {
      if (ndata.adjacent) return ndata.adjacent.map(Number);
      const adj = new Set();
      const out = Array.isArray(ndata.out) ? ndata.out : [];
      const inp = Array.isArray(ndata.in) ? ndata.in : [];
      for (const id of out) adj.add(Number(id));
      for (const id of inp) adj.add(Number(id));
      return [...adj];
    }

    // Extract stats (can be array, empty object, or undefined)
    function getStats(ndata) {
      if (Array.isArray(ndata.stats)) return ndata.stats;
      return [];
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // Load nodes with position calculation - skip nodes without a group
    for (const [nid, ndata] of Object.entries(json.nodes || {})) {
      if (ndata.group === undefined) continue; // orphan node, no position

      const id = Number(nid);
      const type = getNodeType(ndata);
      const node = {
        id,
        skill: ndata.skill || id,
        name: ndata.name || '',
        type,
        stats: getStats(ndata),
        adjacent: getAdjacent(ndata),
        group: ndata.group,
        orbit: ndata.orbit ?? 0,
        orbitIndex: ndata.orbitIndex ?? 0,
        ascendancy: ndata.ascendancyName || ndata.ascendancy || null,
        classStartIndex: ndata.classStartIndex,
        x: 0,
        y: 0,
      };

      // Compute position from group + orbit
      const group = this.groups[node.group];
      if (group) {
        const radius = orbitRadii[node.orbit] || 0;
        const nodesInOrbit = skillsPerOrbit[node.orbit] || 1;
        const angle = (2 * Math.PI * node.orbitIndex) / nodesInOrbit - Math.PI / 2;
        node.x = group.x + radius * Math.cos(angle);
        node.y = group.y + radius * Math.sin(angle);
      }

      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x > maxX) maxX = node.x;
      if (node.y > maxY) maxY = node.y;

      this.nodes[id] = node;

      // Index by type
      if (!this._typeIndex.has(node.type)) {
        this._typeIndex.set(node.type, []);
      }
      this._typeIndex.get(node.type).push(node);

      // Index keystones by name
      if (node.type === 'keystone') {
        this._keystoneIndex.set(node.name, node);
      }

      // Index ascendancy nodes
      if (node.ascendancy) {
        if (!this._ascendancyIndex.has(node.ascendancy)) {
          this._ascendancyIndex.set(node.ascendancy, []);
        }
        this._ascendancyIndex.get(node.ascendancy).push(node);
      }

      // Track class starts from classStartIndex (raw game data format)
      if (node.classStartIndex !== undefined) {
        this.classStarts[node.classStartIndex] = id;
      }
    }

    this.bounds = { minX, minY, maxX, maxY };

    // Load classes
    this._classes = (json.classes || []).map((cls, idx) => {
      // startNodeId may come from the class data (simple format) or from classStarts map (raw format)
      const startNodeId = cls.startNodeId ?? this.classStarts[idx];
      if (startNodeId !== undefined) {
        this.classStarts[idx] = startNodeId;
      }
      this._classNameMap.set(cls.name, idx);
      return {
        id: idx,
        name: cls.name,
        ascendancies: cls.ascendancies || [],
        startNodeId,
      };
    });
  }

  getNode(id) {
    return this.nodes[id];
  }

  nodeCount() {
    return Object.keys(this.nodes).length;
  }

  classNameToId(name) {
    const id = this._classNameMap.get(name);
    return id !== undefined ? id : -1;
  }

  findKeystoneByName(name) {
    return this._keystoneIndex.get(name);
  }

  getNodesByType(type) {
    return this._typeIndex.get(type) || [];
  }

  getAscendancyNodes(ascendancyName) {
    return this._ascendancyIndex.get(ascendancyName) || [];
  }

  getClasses() {
    return this._classes;
  }

  getGroup(groupId) {
    return this.groups[groupId];
  }
}
