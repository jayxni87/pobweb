/**
 * Cluster jewel item text parser.
 * Extracts cluster jewel properties from pasted item text.
 * Handles both plain item text and PoB's extended format with {crafted} tags,
 * Prefix:/Suffix: metadata, Cluster Jewel Skill: fields, etc.
 */

const ENCHANT_PREFIX = 'Added Small Passive Skills grant: ';

// Lines to skip when parsing PoB item text
const SKIP_PREFIXES = [
  'Rarity:', 'Crafted:', 'Prefix:', 'Suffix:', 'LevelReq:',
  'Implicits:', 'Quality:', 'Sockets:', 'ItemLevel:', 'Unique ID:',
  'Selected Variant:', 'Variant:', 'Has Alt Variant:', 'Selected Alt Variant:',
  'League:', 'Source:', 'Unreleased:', 'ArmourData:',
];

/**
 * Parse raw item text for cluster jewel properties.
 * @param {string} text - Multi-line item text (e.g. from copy-paste or PoB XML)
 * @param {object} clusterData - The cluster-jewels.json data
 * @returns {object} Parsed cluster jewel properties
 */
export function parseClusterJewel(text, clusterData) {
  const result = {
    baseName: null,
    clusterJewelSkill: null,
    clusterJewelNodeCount: 0,
    clusterJewelNotables: [],
    clusterJewelSocketCount: 0,
    clusterJewelAddedMods: [],
    clusterJewelValid: false,
  };

  if (!text || !clusterData) return result;

  const lines = text.split('\n')
    .map(l => l.trim())
    // Strip {crafted}, {fractured}, {range:N} and similar PoB tag prefixes
    .map(l => l.replace(/^\{[^}]*\}/g, '').trim())
    // Remove embedded <ModRange.../> XML elements
    .filter(l => !l.startsWith('<ModRange'))
    .filter(l => l.length > 0);

  // 1. Find base name: first line matching a key in clusterData.jewels
  const jewelNames = Object.keys(clusterData.jewels);
  for (const line of lines) {
    if (jewelNames.includes(line)) {
      result.baseName = line;
      break;
    }
  }

  if (!result.baseName) return result;

  const jewelDef = clusterData.jewels[result.baseName];
  const handledLines = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip PoB metadata lines
    if (SKIP_PREFIXES.some(p => line.startsWith(p))) {
      handledLines.add(i);
      continue;
    }
    // Skip generic name lines (e.g. "New Item")
    if (line === 'New Item' || line.startsWith('--------')) {
      handledLines.add(i);
      continue;
    }

    // PoB explicit field: "Cluster Jewel Skill: <tag>"
    const skillFieldMatch = line.match(/^Cluster Jewel Skill: (.+)$/);
    if (skillFieldMatch) {
      result.clusterJewelSkill = skillFieldMatch[1];
      handledLines.add(i);
      continue;
    }

    // PoB explicit field: "Cluster Jewel Node Count: N"
    const nodeCountFieldMatch = line.match(/^Cluster Jewel Node Count: (\d+)$/);
    if (nodeCountFieldMatch) {
      result.clusterJewelNodeCount = parseInt(nodeCountFieldMatch[1], 10);
      handledLines.add(i);
      continue;
    }

    // 2. "Adds N Passive Skills"
    const nodeCountMatch = line.match(/^Adds (\d+) Passive Skills$/);
    if (nodeCountMatch) {
      result.clusterJewelNodeCount = parseInt(nodeCountMatch[1], 10);
      handledLines.add(i);
      continue;
    }

    // 3. "N Added Passive Skills are Jewel Sockets" or "1 Added Passive Skill is a Jewel Socket"
    const socketPluralMatch = line.match(/^(\d+) Added Passive Skills are Jewel Sockets$/);
    if (socketPluralMatch) {
      result.clusterJewelSocketCount = parseInt(socketPluralMatch[1], 10);
      handledLines.add(i);
      continue;
    }
    if (line === '1 Added Passive Skill is a Jewel Socket') {
      result.clusterJewelSocketCount = 1;
      handledLines.add(i);
      continue;
    }

    // 4. "Added Small Passive Skills grant: X" → match against enchant text
    if (line.startsWith(ENCHANT_PREFIX)) {
      for (const [, skillDef] of Object.entries(jewelDef.skills)) {
        if (skillDef.enchant && skillDef.enchant.includes(line)) {
          result.clusterJewelSkill = skillDef.tag;
          handledLines.add(i);
          break;
        }
      }
      if (!handledLines.has(i)) {
        // Enchant line didn't match any known skill; treat as added mod
        result.clusterJewelAddedMods.push(line);
        handledLines.add(i);
      }
      continue;
    }

    // 5. "1 Added Passive Skill is <name>" → notable
    const notableMatch = line.match(/^1 Added Passive Skill is (.+)$/);
    if (notableMatch) {
      const name = notableMatch[1];
      if (clusterData.notableSortOrder && name in clusterData.notableSortOrder) {
        result.clusterJewelNotables.push(name);
        handledLines.add(i);
        continue;
      }
    }

    // Skip the base name line itself
    if (line === result.baseName) {
      handledLines.add(i);
      continue;
    }

    // Remaining lines are added mods (if not already handled)
    if (!handledLines.has(i)) {
      result.clusterJewelAddedMods.push(line);
    }
  }

  // 6. Valid if skill and nodeCount are present
  result.clusterJewelValid = !!(result.clusterJewelSkill && result.clusterJewelNodeCount > 0);

  return result;
}
