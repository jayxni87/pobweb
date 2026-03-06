// PoBWeb - Tree Search & Highlight
// Text search over tree nodes by name and stat descriptions.

export class TreeSearch {
  constructor(treeData) {
    this.treeData = treeData;
    this._nodeList = Object.values(treeData.nodes);
    this.lastResult = { matchIds: new Set(), matchCount: 0 };
  }

  search(query) {
    if (!query || query.trim() === '') {
      return this.clear();
    }

    const matchIds = new Set();
    // Escape regex special characters for literal matching
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');

    for (const node of this._nodeList) {
      if (re.test(node.name)) {
        matchIds.add(node.id);
        continue;
      }
      if (node.stats) {
        for (const stat of node.stats) {
          if (re.test(stat)) {
            matchIds.add(node.id);
            break;
          }
        }
      }
    }

    this.lastResult = { matchIds, matchCount: matchIds.size };
    return this.lastResult;
  }

  clear() {
    this.lastResult = { matchIds: new Set(), matchCount: 0 };
    return this.lastResult;
  }
}
