// PoBWeb - PassiveSpec Model (port of Classes/PassiveSpec.lua)
// Tree allocation state, shortest path, node connectivity.

export class PassiveSpec {
  constructor(tree, classId) {
    this.tree = tree;
    this.classId = classId;
    this.allocated = new Set();
    this.ascendancy = null;
    this.ascendancyAllocated = new Set();
    this.masterySelections = new Map(); // nodeId → effectId
    this.jewels = new Map();       // socketNodeId → parsed cluster jewel data
    this.subGraphs = new Map();    // subgraphId → { nodes[], parentSocketId, entranceNodeId }

    // Build set of valid ascendancy names for this class
    this._classAscendancies = new Set();
    const classes = tree.getClasses?.() || tree._classes || [];
    const cls = classes[classId];
    if (cls) {
      for (const asc of cls.ascendancies || []) {
        this._classAscendancies.add(asc.name || asc);
      }
    }

    // Allocate class start node
    const startNodeId = tree.classStarts[classId];
    if (startNodeId !== undefined) {
      this.allocated.add(startNodeId);
    }
  }

  isAllocated(nodeId) {
    return this.allocated.has(nodeId) || this.ascendancyAllocated.has(nodeId);
  }

  allocatedCount() {
    return this.allocated.size;
  }

  ascendancyCount() {
    return this.ascendancyAllocated.size;
  }

  // Check if a node can be traversed during pathfinding.
  // Blocks: ascendancyStart nodes not belonging to the current class,
  // and any ascendancy nodes not matching the current class.
  _isPathable(node) {
    if (!node) return false;
    // Block ascendancyStart nodes for other classes
    if (node.type === 'ascendancyStart') {
      return node.ascendancy ? this._classAscendancies.has(node.ascendancy) : false;
    }
    // Block ascendancy nodes for other classes
    if (node.ascendancy) {
      return this._classAscendancies.has(node.ascendancy);
    }
    return true;
  }

  // Check if a node is adjacent to any currently allocated node
  _isAdjacentToAllocated(nodeId) {
    const node = this.tree.nodes[nodeId];
    if (!node || !node.adjacent) return false;
    for (const adj of node.adjacent) {
      if (this.allocated.has(adj)) return true;
    }
    return false;
  }

  // Allocate a single node (must be adjacent to existing allocation)
  allocate(nodeId) {
    if (this.isAllocated(nodeId)) return true;
    if (!this._isAdjacentToAllocated(nodeId)) return false;
    this.allocated.add(nodeId);
    return true;
  }

  // Allocate a path to a target node
  allocatePath(targetId) {
    if (this.isAllocated(targetId)) return true;
    const path = this.findShortestPath(targetId);
    if (!path) return false;
    for (const nodeId of path) {
      this.allocated.add(nodeId);
    }
    return true;
  }

  // Deallocate a node and prune any nodes that become disconnected from the class start
  deallocate(nodeId) {
    if (!this.allocated.has(nodeId)) return false;

    // Can't deallocate class start
    const startNodeId = this.tree.classStarts[this.classId];
    if (nodeId === startNodeId) return false;

    this.allocated.delete(nodeId);
    this.masterySelections.delete(nodeId);

    // Find all nodes still reachable from class start
    const reachable = this._reachableFromStart();

    // Remove any allocated nodes that are no longer reachable
    for (const id of [...this.allocated]) {
      if (!reachable.has(id)) {
        this.allocated.delete(id);
        this.masterySelections.delete(id);
      }
    }

    return true;
  }

  // Return the set of allocated nodes reachable from the class start
  _reachableFromStart() {
    const startNodeId = this.tree.classStarts[this.classId];
    const visited = new Set();
    if (!this.allocated.has(startNodeId)) return visited;

    const queue = [startNodeId];
    visited.add(startNodeId);

    while (queue.length > 0) {
      const current = queue.shift();
      const node = this.tree.nodes[current];
      if (!node || !node.adjacent) continue;
      // Mastery nodes are reachable but don't propagate (dead ends)
      if (node.type === 'mastery') continue;
      for (const adj of node.adjacent) {
        if (this.allocated.has(adj) && !visited.has(adj)) {
          visited.add(adj);
          queue.push(adj);
        }
      }
    }

    return visited;
  }

  // Check if all allocated nodes are connected to class start
  _isConnected() {
    const reachable = this._reachableFromStart();
    return reachable.size === this.allocated.size;
  }

  // Find shortest path from currently allocated nodes to target
  // Returns array of node IDs (not including already-allocated), or null if unreachable
  findShortestPath(targetId) {
    if (this.isAllocated(targetId)) return [];

    const targetNode = this.tree.nodes[targetId];
    if (!targetNode || !this._isPathable(targetNode)) return null;

    const visited = new Set();
    const parent = new Map();
    const queue = [];

    // Start BFS from all allocated nodes
    for (const allocId of this.allocated) {
      visited.add(allocId);
      // Don't expand through mastery nodes (they are dead ends for pathing)
      const allocNode = this.tree.nodes[allocId];
      if (allocNode && allocNode.type !== 'mastery') {
        queue.push(allocId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      const node = this.tree.nodes[current];
      if (!node || !node.adjacent) continue;

      for (const adj of node.adjacent) {
        if (visited.has(adj)) continue;

        const adjNode = this.tree.nodes[adj];
        if (!adjNode || !this._isPathable(adjNode)) continue;

        visited.add(adj);
        parent.set(adj, current);

        if (adj === targetId) {
          // Reconstruct path
          const path = [];
          let cur = targetId;
          while (cur !== undefined && !this.allocated.has(cur)) {
            path.unshift(cur);
            cur = parent.get(cur);
          }
          return path;
        }

        // Don't expand through mastery nodes (they are dead ends for pathing)
        if (adjNode.type !== 'mastery') {
          queue.push(adj);
        }
      }
    }

    return null; // unreachable
  }

  getAllocatedNodeIds() {
    return [...this.allocated, ...this.ascendancyAllocated];
  }

  collectStats() {
    const stats = [];
    for (const nodeId of this.allocated) {
      const node = this.tree.nodes[nodeId];
      if (!node) continue;
      // For mastery nodes, use the selected effect's stats instead of node.stats
      const effectId = this.masterySelections.get(nodeId);
      if (node.type === 'mastery' && effectId != null) {
        const effect = node.masteryEffects.find(e => e.effect === effectId);
        if (effect) stats.push(...effect.stats);
      } else if (node.stats) {
        stats.push(...node.stats);
      }
    }
    for (const nodeId of this.ascendancyAllocated) {
      const node = this.tree.nodes[nodeId];
      if (node && node.stats) {
        stats.push(...node.stats);
      }
    }
    return stats;
  }

  setMasteryEffect(nodeId, effectId) {
    const node = this.tree.nodes[nodeId];
    if (!node || node.type !== 'mastery') return false;
    if (!this.isAllocated(nodeId)) return false;
    const effect = node.masteryEffects.find(e => e.effect === effectId);
    if (!effect) return false;
    this.masterySelections.set(nodeId, effectId);
    return true;
  }

  clearMasteryEffect(nodeId) {
    return this.masterySelections.delete(nodeId);
  }

  getMasteryEffect(nodeId) {
    return this.masterySelections.get(nodeId) ?? null;
  }

  getUsedEffectsForMasteryName(masteryName) {
    const used = new Set();
    for (const [nodeId, effectId] of this.masterySelections) {
      const node = this.tree.nodes[nodeId];
      if (node && node.name === masteryName) {
        used.add(effectId);
      }
    }
    return used;
  }

  setAscendancy(name) {
    this.ascendancy = name;
    this.ascendancyAllocated.clear();
  }

  allocateAscendancy(nodeId) {
    const node = this.tree.nodes[nodeId];
    if (!node || !node.ascendancy) return false;
    if (node.ascendancy !== this.ascendancy) return false;
    this.ascendancyAllocated.add(nodeId);
    return true;
  }

  deallocateAscendancy(nodeId) {
    return this.ascendancyAllocated.delete(nodeId);
  }

  _applySubgraph(socketNodeId, subgraph) {
    // Add each node in the subgraph to the tree
    for (const node of subgraph.nodes) {
      this.tree.nodes[node.id] = node;
    }
    // Add the entrance node ID to the parent socket's adjacent array if not already present
    const parentSocket = this.tree.nodes[socketNodeId];
    if (parentSocket && !parentSocket.adjacent.includes(subgraph.entranceNodeId)) {
      parentSocket.adjacent.push(subgraph.entranceNodeId);
    }
    // Store in subGraphs
    this.subGraphs.set(subgraph.id, {
      nodes: subgraph.nodes,
      parentSocketId: socketNodeId,
      entranceNodeId: subgraph.entranceNodeId,
    });
  }

  _removeSubgraph(socketNodeId) {
    // Find the subgraph that has parentSocketId === socketNodeId
    let subgraphId = null;
    let subgraphData = null;
    for (const [id, data] of this.subGraphs) {
      if (data.parentSocketId === socketNodeId) {
        subgraphId = id;
        subgraphData = data;
        break;
      }
    }
    if (!subgraphData) return;

    // Deallocate all its nodes
    for (const node of subgraphData.nodes) {
      this.allocated.delete(node.id);
      this.masterySelections.delete(node.id);
    }
    // Delete nodes from tree
    for (const node of subgraphData.nodes) {
      delete this.tree.nodes[node.id];
    }
    // Remove entrance node ID from parent socket's adjacent array
    const parentSocket = this.tree.nodes[socketNodeId];
    if (parentSocket) {
      const idx = parentSocket.adjacent.indexOf(subgraphData.entranceNodeId);
      if (idx !== -1) {
        parentSocket.adjacent.splice(idx, 1);
      }
    }
    // Delete from subGraphs
    this.subGraphs.delete(subgraphId);
  }

  reset() {
    // Clean up subgraphs before clearing: remove their nodes from tree and restore adjacency
    for (const [, data] of this.subGraphs) {
      for (const node of data.nodes) {
        delete this.tree.nodes[node.id];
      }
      const parentSocket = this.tree.nodes[data.parentSocketId];
      if (parentSocket) {
        const idx = parentSocket.adjacent.indexOf(data.entranceNodeId);
        if (idx !== -1) {
          parentSocket.adjacent.splice(idx, 1);
        }
      }
    }
    this.jewels.clear();
    this.subGraphs.clear();

    this.allocated.clear();
    this.ascendancyAllocated.clear();
    this.masterySelections.clear();
    const startNodeId = this.tree.classStarts[this.classId];
    if (startNodeId !== undefined) {
      this.allocated.add(startNodeId);
    }
  }
}
