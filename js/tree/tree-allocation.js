// PoBWeb - Tree Allocation Logic
// Integrates PassiveSpec with tree interaction for node allocation/deallocation.

import { PassiveSpec } from '../models/passive-spec.js';

export class TreeAllocation {
  constructor(treeData, classId) {
    this.treeData = treeData;
    this.spec = new PassiveSpec(treeData, classId);
    this.onChange = null;
  }

  allocateNode(nodeId) {
    const result = this.spec.allocatePath(nodeId);
    if (result && this.onChange) this.onChange();
    return result;
  }

  deallocateNode(nodeId) {
    const result = this.spec.deallocate(nodeId);
    if (result && this.onChange) this.onChange();
    return result;
  }

  toggleNode(nodeId) {
    if (this.spec.isAllocated(nodeId)) {
      return this.deallocateNode(nodeId);
    }
    return this.allocateNode(nodeId);
  }

  getPathPreview(targetId) {
    return this.spec.findShortestPath(targetId);
  }

  allocatedCount() {
    return this.spec.allocatedCount();
  }

  collectStats() {
    return this.spec.collectStats();
  }

  reset() {
    this.spec.reset();
    if (this.onChange) this.onChange();
  }
}
