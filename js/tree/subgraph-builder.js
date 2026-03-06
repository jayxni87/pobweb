// Subgraph Builder for Cluster Jewels
// Port of PassiveSpec:BuildSubgraph from PassiveSpec.lua

import { buildOrbitAngles } from './tree-data.js';

// 12->16 orbit index translation (cluster jewel uses 12 positions, tree uses 16)
const ORBIT_12_TO_16 = [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15];

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
 * @param {object} parsedJewel - Output from parseClusterJewel
 * @param {object} parentSocket - The tree node (jewel socket) receiving this jewel
 * @param {object} treeData - TreeData instance (needs groups, clusterNodeMap)
 * @param {object} clusterData - cluster-jewels.json data
 * @param {object} constants - { orbitRadii, skillsPerOrbit }
 * @returns {object|null} Subgraph with nodes[], groupId, entranceNodeId, parentSocketId, sizeIndex
 */
export function buildSubgraph(parsedJewel, parentSocket, treeData, clusterData, constants) {
  const ej = parentSocket.expansionJewel;
  if (!ej) return null;

  const jewelDef = clusterData.jewels[parsedJewel.baseName];
  if (!jewelDef) return null;

  const proxyGroup = treeData.groups[ej.proxy];
  if (!proxyGroup) return null;

  const skill = jewelDef.skills[parsedJewel.clusterJewelSkill];
  if (!skill) return null;

  // Compute subgraph base ID
  const largeIndex = ej.index || 0;
  const mediumIndex = ej.parent ? (parentSocket._mediumIndex || 0) : 0;
  const subgraphBaseId = computeSubgraphId(jewelDef.sizeIndex, largeIndex, mediumIndex);

  // Determine orbit: Small uses orbit 1, Medium and Large use orbit 2
  const orbit = jewelDef.sizeIndex === 0 ? 1 : 2;
  const orbitOffset = clusterData.orbitOffsets?.[ej.proxy]?.[jewelDef.sizeIndex] || 0;

  // Build orbit angles
  const orbitAngles = buildOrbitAngles(constants.skillsPerOrbit);
  const orbitRadii = constants.orbitRadii;

  const nodeCount = parsedJewel.clusterJewelNodeCount;
  const socketCount = parsedJewel.clusterJewelSocketCount;
  const notableNames = parsedJewel.clusterJewelNotables || [];

  // Sort notables by sort order
  const sortOrder = clusterData.notableSortOrder || {};
  const sortedNotables = [...notableNames].sort((a, b) =>
    (sortOrder[a] || 0) - (sortOrder[b] || 0)
  );

  // Three-pass node assignment (matching PoB's BuildSubgraph algorithm):
  // 1. Assign sockets to socketIndicies positions
  // 2. Assign notables to notableIndicies positions
  // 3. Fill remaining with small passives from smallIndicies

  const indicies = jewelDef.totalIndicies;
  const assigned = new Map(); // orbit position index -> node info

  // Determine how many small nodes we need
  const smallCount = nodeCount - socketCount - sortedNotables.length;

  // Pass 1: Sockets
  const socketPositions = jewelDef.socketIndicies.slice(0, socketCount);
  for (let i = 0; i < socketPositions.length; i++) {
    const posIdx = socketPositions[i];
    assigned.set(posIdx, {
      type: 'jewel',
      name: jewelDef.sizeIndex === 2 ? 'Medium Jewel Socket' : 'Small Jewel Socket',
      stats: [],
      icon: null,
      isSocket: true,
      socketSize: jewelDef.sizeIndex === 2 ? 1 : 0,
    });
  }

  // Pass 2: Notables - skip positions already taken by sockets
  let notablesFilled = 0;
  for (const posIdx of jewelDef.notableIndicies) {
    if (notablesFilled >= sortedNotables.length) break;
    if (assigned.has(posIdx)) continue;
    const notableName = sortedNotables[notablesFilled];
    const clusterNode = treeData.clusterNodeMap?.get(notableName);
    assigned.set(posIdx, {
      type: 'notable',
      name: notableName,
      stats: clusterNode?.stats || [],
      icon: clusterNode?.icon || null,
      isSocket: false,
    });
    notablesFilled++;
  }

  // Pass 3: Small passives - fill remaining from smallIndicies
  let smallsFilled = 0;
  for (const posIdx of jewelDef.smallIndicies) {
    if (smallsFilled >= smallCount) break;
    if (assigned.has(posIdx)) continue;
    assigned.set(posIdx, {
      type: 'normal',
      name: skill.name,
      stats: skill.stats || [],
      icon: skill.icon || null,
      isSocket: false,
    });
    smallsFilled++;
  }

  // Convert assigned positions to actual nodes with positions and IDs
  // Sort by position index for deterministic ordering
  const sortedPositions = [...assigned.entries()].sort((a, b) => a[0] - b[0]);

  const nodes = [];
  let nodeIndex = 0;
  const posToNode = new Map(); // posIdx -> node

  for (const [posIdx, info] of sortedPositions) {
    const nodeId = subgraphBaseId | nodeIndex;

    // Translate orbit index: cluster jewel indices -> tree orbit indices
    let treeOrbitIndex;
    if (indicies === 12) {
      // 12->16 mapping
      treeOrbitIndex = ORBIT_12_TO_16[posIdx] ?? posIdx;
    } else {
      // For 6-slot (small cluster), no translation needed
      treeOrbitIndex = posIdx;
    }

    // Apply orbit offset
    const totalSlots = constants.skillsPerOrbit[orbit] || indicies;
    const adjustedIndex = (treeOrbitIndex + orbitOffset) % totalSlots;

    // Compute position
    const angles = orbitAngles[orbit];
    const angle = angles ? (angles[adjustedIndex] || 0) : 0;
    const radius = orbitRadii[orbit] || 0;
    const x = proxyGroup.x + Math.sin(angle) * radius;
    const y = proxyGroup.y - Math.cos(angle) * radius;

    const node = {
      id: nodeId,
      name: info.name,
      type: info.type,
      stats: info.stats,
      adjacent: [],
      group: ej.proxy,
      orbit,
      orbitIndex: adjustedIndex,
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
      node.expansionJewel = {
        size: info.socketSize,
        index: largeIndex,
        proxy: ej.proxy,
        parent: String(parentSocket.id),
      };
      node._mediumIndex = socketCount > 1 ? nodes.filter(n => n.type === 'jewel').length : 0;
    }

    nodes.push(node);
    posToNode.set(posIdx, node);
    nodeIndex++;
  }

  // Generate connections between sequential nodes around the orbit
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].adjacent.push(nodes[i + 1].id);
    nodes[i + 1].adjacent.push(nodes[i].id);
  }

  // Close the loop for Medium and Large (not Small)
  if (jewelDef.sizeIndex > 0 && nodes.length > 2) {
    nodes[0].adjacent.push(nodes[nodes.length - 1].id);
    nodes[nodes.length - 1].adjacent.push(nodes[0].id);
  }

  // Find entrance node (first node at the lowest position index)
  const entranceNode = nodes[0];

  // Connect entrance to parent socket
  if (entranceNode) {
    entranceNode.adjacent.push(parentSocket.id);
  }

  return {
    id: subgraphBaseId,
    nodes,
    groupId: ej.proxy,
    parentSocketId: parentSocket.id,
    entranceNodeId: entranceNode?.id,
    sizeIndex: jewelDef.sizeIndex,
  };
}
