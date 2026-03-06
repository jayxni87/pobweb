// PoBWeb - PassiveSpec Model (port of Classes/PassiveSpec.lua)
// Tree allocation state, shortest path, node connectivity.

export class PassiveSpec {
  constructor(tree, classId) {
    this.tree = tree;
    this.classId = classId;
    this.allocated = new Set();
    this.ascendancy = null;
    this.ascendancyAllocated = new Set();

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

  // Deallocate a node (must not disconnect the graph)
  deallocate(nodeId) {
    if (!this.allocated.has(nodeId)) return false;

    // Can't deallocate class start
    const startNodeId = this.tree.classStarts[this.classId];
    if (nodeId === startNodeId) return false;

    // Check if removing this node would disconnect the tree
    // Temporarily remove and check connectivity
    this.allocated.delete(nodeId);
    if (this._isConnected()) {
      return true;
    }
    // Restore if disconnected
    this.allocated.add(nodeId);
    return false;
  }

  // Check if all allocated nodes are connected to class start
  _isConnected() {
    const startNodeId = this.tree.classStarts[this.classId];
    if (!this.allocated.has(startNodeId)) return false;
    if (this.allocated.size <= 1) return true;

    const visited = new Set();
    const queue = [startNodeId];
    visited.add(startNodeId);

    while (queue.length > 0) {
      const current = queue.shift();
      const node = this.tree.nodes[current];
      if (!node || !node.adjacent) continue;
      for (const adj of node.adjacent) {
        if (this.allocated.has(adj) && !visited.has(adj)) {
          visited.add(adj);
          queue.push(adj);
        }
      }
    }

    // All allocated nodes should be reachable
    for (const id of this.allocated) {
      if (!visited.has(id)) return false;
    }
    return true;
  }

  // Find shortest path from currently allocated nodes to target
  // Returns array of node IDs (not including already-allocated), or null if unreachable
  findShortestPath(targetId) {
    if (this.isAllocated(targetId)) return [];

    const visited = new Set();
    const parent = new Map();
    const queue = [];

    // Start BFS from all allocated nodes
    for (const allocId of this.allocated) {
      visited.add(allocId);
      queue.push(allocId);
    }

    while (queue.length > 0) {
      const current = queue.shift();
      const node = this.tree.nodes[current];
      if (!node || !node.adjacent) continue;

      for (const adj of node.adjacent) {
        if (visited.has(adj)) continue;
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

        queue.push(adj);
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
      if (node && node.stats) {
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

  reset() {
    this.allocated.clear();
    this.ascendancyAllocated.clear();
    const startNodeId = this.tree.classStarts[this.classId];
    if (startNodeId !== undefined) {
      this.allocated.add(startNodeId);
    }
  }
}
