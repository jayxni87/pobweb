// Subgraph Builder for Cluster Jewels
// Port of PassiveSpec:BuildSubgraph from PassiveSpec.lua

import { buildOrbitAngles } from './tree-data.js';

// 12->16 orbit index translation (cluster jewels use 12 positions, tree orbit 2/3 use 16)
const OIDX_12_TO_16 = [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15];
const OIDX_16_TO_12 = [0, 1, 1, 2, 3, 4, 4, 5, 6, 7, 7, 8, 9, 10, 10, 11];

function translateOidx(srcOidx, srcCount, destCount) {
  if (srcCount === destCount) return srcOidx;
  if (srcCount === 12 && destCount === 16) return OIDX_12_TO_16[srcOidx] ?? srcOidx;
  if (srcCount === 16 && destCount === 12) return OIDX_16_TO_12[srcOidx] ?? srcOidx;
  return Math.floor(srcOidx * destCount / srcCount);
}

/**
 * Compute a unique subgraph ID using PoB's bit-packing scheme.
 * Bit 16: always 1 (signal bit)
 * Bits 4-5: group size index (0=Small, 1=Medium, 2=Large)
 * Bits 6-8: large socket index (0-5)
 * Bits 9-10: medium socket index (0-2)
 * Bits 0-3: reserved for node index within subgraph
 */
export function computeSubgraphId(sizeIndex, largeIndex, mediumIndex) {
  return 0x10000 | (sizeIndex << 4) | (largeIndex << 6) | (mediumIndex << 9);
}

/**
 * Build a subgraph for a cluster jewel.
 * Closely follows PassiveSpec:BuildSubgraph in Lua PoB.
 *
 * @param {object} parsedJewel - Output from parseClusterJewel
 * @param {object} parentSocket - The tree node (jewel socket) receiving this jewel
 * @param {object} treeData - TreeData instance
 * @param {object} clusterData - cluster-jewels.json data
 * @param {object} constants - { orbitRadii, skillsPerOrbit }
 * @returns {object|null} Subgraph with nodes[], groupId, entranceNodeId, parentSocketId, sizeIndex
 */
export function buildSubgraph(parsedJewel, parentSocket, treeData, clusterData, constants) {
  const ej = parentSocket.expansionJewel;
  if (!ej) return null;

  const jewelDef = clusterData.jewels[parsedJewel.baseName];
  if (!jewelDef) return null;

  // Look up proxy node, then its group (Lua: proxyNode = self.tree.nodes[proxy]; proxyGroup = proxyNode.group)
  const proxyNodeOrig = treeData.nodes[Number(ej.proxy)];
  if (!proxyNodeOrig) return null;
  let proxyGroup = treeData.groups[proxyNodeOrig.group];
  if (!proxyGroup) return null;

  const skill = jewelDef.skills[parsedJewel.clusterJewelSkill];
  if (!skill) return null;

  // Compute subgraph base ID (Lua: id = 0x10000 + shifts for large/medium index)
  let id = 0x10000;
  if (ej.size === 2) {
    id |= (ej.index << 6);
  } else if (ej.size === 1) {
    id |= (ej.index << 9);
  }
  const nodeId = id | (jewelDef.sizeIndex << 4);

  // Track effective proxy orbit/orbitIndex/groupId (may change during downsizing)
  let proxyOrbit = proxyNodeOrig.orbit;
  let proxyOrbitIndex = proxyNodeOrig.orbitIndex;
  let proxyGroupId = proxyNodeOrig.group;

  // Handle downsizing: if cluster is smaller than the socket, walk down through inner sockets
  // (Lua: while clusterJewel.sizeIndex < groupSize do findSocket...)
  let groupSize = ej.size;
  while (jewelDef.sizeIndex < groupSize) {
    // Find the inner socket (index 1 first, then 0) in the proxy group
    let innerSocket = findSocketInGroup(treeData, proxyGroup, 1) || findSocketInGroup(treeData, proxyGroup, 0);
    if (!innerSocket) break;
    const innerProxy = treeData.nodes[Number(innerSocket.expansionJewel.proxy)];
    if (!innerProxy) break;
    proxyGroup = treeData.groups[innerProxy.group];
    if (!proxyGroup) break;
    proxyOrbit = innerProxy.orbit;
    proxyOrbitIndex = innerProxy.orbitIndex;
    proxyGroupId = innerProxy.group;
    groupSize = innerSocket.expansionJewel.size;
  }

  // Orbit for this cluster's nodes: sizeIndex + 1 (Lua: nodeOrbit = clusterJewel.sizeIndex + 1)
  const nodeOrbit = jewelDef.sizeIndex + 1;

  // Build orbit angles table
  const orbitAngles = buildOrbitAngles(constants.skillsPerOrbit);
  const orbitRadii = constants.orbitRadii;

  const totalIndicies = jewelDef.totalIndicies;
  const socketCount = parsedJewel.clusterJewelSocketCount;
  const notableNames = parsedJewel.clusterJewelNotables || [];
  const nodeCount = parsedJewel.clusterJewelNodeCount;

  // Sort notables by sort order (Lua sorts by sortOrder)
  const sortOrder = clusterData.notableSortOrder || {};
  const sortedNotables = [...notableNames].sort((a, b) =>
    (sortOrder[a] || 0) - (sortOrder[b] || 0)
  );

  const notableCount = sortedNotables.length;
  const smallCount = nodeCount - socketCount - notableCount;

  // Three-pass node assignment matching Lua's BuildSubgraph:
  // indicies[posIdx] -> node info
  const indicies = {};

  // Pass 1: Sockets (Lua lines 1789-1798)
  if (jewelDef.size === 'Large' && socketCount === 1) {
    // Large clusters with 1 socket always place it at index 6
    indicies[6] = makeSocketInfo(jewelDef);
  } else {
    const getJewels = [0, 2, 1]; // Lua: socket finder indices
    for (let i = 0; i < socketCount && i < jewelDef.socketIndicies.length; i++) {
      indicies[jewelDef.socketIndicies[i]] = makeSocketInfo(jewelDef);
    }
  }

  // Pass 2: Notables (Lua lines 1800-1854) with Medium special rules
  const notableIndexList = [];
  for (const posIdx of jewelDef.notableIndicies) {
    if (notableIndexList.length >= notableCount) break;
    let adjustedIdx = posIdx;
    if (jewelDef.size === 'Medium') {
      if (socketCount === 0 && notableCount === 2) {
        if (posIdx === 6) adjustedIdx = 4;
        else if (posIdx === 10) adjustedIdx = 8;
      } else if (nodeCount === 4) {
        if (posIdx === 10) adjustedIdx = 9;
        else if (posIdx === 2) adjustedIdx = 3;
      }
    }
    if (!(adjustedIdx in indicies)) {
      notableIndexList.push(adjustedIdx);
    }
  }
  notableIndexList.sort((a, b) => a - b);

  for (let i = 0; i < sortedNotables.length && i < notableIndexList.length; i++) {
    const name = sortedNotables[i];
    const clusterNode = treeData.clusterNodeMap?.get(name);
    indicies[notableIndexList[i]] = {
      type: 'notable',
      name,
      stats: clusterNode?.stats || [],
      icon: clusterNode?.icon || null,
    };
  }

  // Pass 3: Small passives (Lua lines 1856-1906) with Medium special rules
  const smallIndexList = [];
  for (const posIdx of jewelDef.smallIndicies) {
    if (smallIndexList.length >= smallCount) break;
    let adjustedIdx = posIdx;
    if (jewelDef.size === 'Medium') {
      if (nodeCount === 5 && posIdx === 4) adjustedIdx = 3;
      else if (nodeCount === 4) {
        if (posIdx === 8) adjustedIdx = 9;
        else if (posIdx === 4) adjustedIdx = 3;
      }
    }
    if (!(adjustedIdx in indicies)) {
      smallIndexList.push(adjustedIdx);
    }
  }

  for (let i = 0; i < smallCount && i < smallIndexList.length; i++) {
    indicies[smallIndexList[i]] = {
      type: 'normal',
      name: skill.name,
      stats: [...(skill.stats || []), ...(parsedJewel.clusterJewelAddedMods || [])],
      icon: skill.icon || null,
    };
  }

  // Entrance must be at index 0 (Lua: assert(indicies[0], "No entrance to subgraph"))
  if (!(0 in indicies)) return null;

  // Translate oidx values (Lua lines 1931-1938)
  // Convert each node's cluster-relative oidx to tree skillsPerOrbit-relative oidx
  const proxyNodeSkillsPerOrbit = constants.skillsPerOrbit[proxyOrbit] || totalIndicies;
  const translatedIndicies = {};
  for (const posIdx of Object.keys(indicies).map(Number)) {
    const proxyOidxInCluster = translateOidx(proxyOrbitIndex, proxyNodeSkillsPerOrbit, totalIndicies);
    const correctedInCluster = (posIdx + proxyOidxInCluster) % totalIndicies;
    const correctedInTree = translateOidx(correctedInCluster, totalIndicies, proxyNodeSkillsPerOrbit);
    translatedIndicies[posIdx] = correctedInTree;
  }

  // Build actual nodes with positions
  const nodes = [];
  const posToNode = {};

  for (const posIdx of Object.keys(indicies).map(Number).sort((a, b) => a - b)) {
    const info = indicies[posIdx];
    const thisNodeId = nodeId + posIdx; // Lua: nodeId + nodeIndex

    // Compute position using translated oidx (Lua: ProcessNode)
    const treeOidx = translatedIndicies[posIdx];
    const angles = orbitAngles[nodeOrbit];
    const angle = angles ? (angles[treeOidx] || 0) : 0;
    const radius = orbitRadii[nodeOrbit] || 0;
    const x = proxyGroup.x + Math.sin(angle) * radius;
    const y = proxyGroup.y - Math.cos(angle) * radius;

    const node = {
      id: thisNodeId,
      name: info.name,
      type: info.type,
      stats: info.stats,
      adjacent: [],
      group: proxyGroupId,
      orbit: nodeOrbit,
      orbitIndex: treeOidx,
      x,
      y,
      angle,
      _icon: info.icon,
      _inactiveIcon: null,
      _activeIcon: null,
      masteryEffects: [],
      _isClusterNode: true,
      _positionIndex: posIdx,
    };

    if (info.isSocket) {
      node.type = 'jewel';
      node.expansionJewel = {
        size: info.socketSize,
        index: ej.index || 0,
        proxy: String(ej.proxy),
        parent: String(parentSocket.id),
      };
    }

    nodes.push(node);
    posToNode[posIdx] = node;
  }

  // Generate connections between sequential nodes around the orbit (Lua lines 1951-1968)
  let firstNode = null;
  let lastNode = null;
  for (let i = 0; i < totalIndicies; i++) {
    const thisNode = posToNode[i];
    if (thisNode) {
      if (!firstNode) firstNode = thisNode;
      if (lastNode) {
        lastNode.adjacent.push(thisNode.id);
        thisNode.adjacent.push(lastNode.id);
      }
      lastNode = thisNode;
    }
  }
  // Close the loop for non-small clusters (Lua: if firstNode ~= lastNode and size ~= "Small")
  if (firstNode && lastNode && firstNode !== lastNode && jewelDef.size !== 'Small') {
    firstNode.adjacent.push(lastNode.id);
    lastNode.adjacent.push(firstNode.id);
  }

  // Connect entrance to parent socket (Lua: linkNodes(subGraph.entranceNode, parentSocket))
  const entranceNode = posToNode[0];
  if (entranceNode) {
    entranceNode.adjacent.push(parentSocket.id);
  }

  return {
    id: nodeId,
    nodes,
    groupId: proxyGroupId,
    parentSocketId: parentSocket.id,
    entranceNodeId: entranceNode?.id,
    sizeIndex: jewelDef.sizeIndex,
  };
}

function makeSocketInfo(jewelDef) {
  return {
    type: 'jewel',
    name: jewelDef.sizeIndex === 2 ? 'Medium Jewel Socket' : 'Small Jewel Socket',
    stats: [],
    icon: null,
    isSocket: true,
    socketSize: jewelDef.sizeIndex === 2 ? 1 : 0,
  };
}

function findSocketInGroup(treeData, group, index) {
  if (!group.n) return null;
  for (const gnid of group.n) {
    const node = treeData.nodes[Number(gnid)];
    if (node?.expansionJewel?.index === index) return node;
  }
  return null;
}
