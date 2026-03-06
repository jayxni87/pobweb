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

    this._load(treeJson);
  }

  _load(json) {
    const orbitRadii = json.constants?.orbitRadii || [0, 82, 162, 335, 493];
    const skillsPerOrbit = json.constants?.skillsPerOrbit || [1, 6, 12, 12, 40];

    // Load groups
    for (const [gid, gdata] of Object.entries(json.groups || {})) {
      this.groups[gid] = { ...gdata };
    }

    // Load nodes with position calculation
    for (const [nid, ndata] of Object.entries(json.nodes || {})) {
      const id = Number(nid);
      const node = {
        id,
        name: ndata.name || '',
        type: ndata.type || 'normal',
        stats: ndata.stats || [],
        adjacent: ndata.adjacent || [],
        group: ndata.group,
        orbit: ndata.orbit ?? 0,
        orbitIndex: ndata.orbitIndex ?? 0,
        ascendancy: ndata.ascendancy || null,
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
    }

    // Load classes
    this._classes = (json.classes || []).map((cls, idx) => {
      this.classStarts[idx] = cls.startNodeId;
      this._classNameMap.set(cls.name, idx);
      return {
        id: idx,
        name: cls.name,
        ascendancies: cls.ascendancies || [],
        startNodeId: cls.startNodeId,
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
