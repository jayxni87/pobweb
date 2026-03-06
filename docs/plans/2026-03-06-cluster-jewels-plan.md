# Cluster Jewels Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to equip cluster jewels into passive tree jewel sockets via paste-item-text, dynamically generating subgraph nodes that can be allocated, nested, and persisted.

**Architecture:** Convert PoB's Lua cluster jewel data to JSON. Parse pasted item text to extract cluster jewel properties. Generate synthetic subgraph nodes positioned on proxy groups. Integrate into existing PassiveSpec for allocation/stats and TreeRenderer for display.

**Tech Stack:** Vanilla JS, WebGL2 (existing renderer), Vitest

---

## Task 1: Convert ClusterJewels.lua to JSON

**Files:**
- Create: `js/data/cluster-jewels.json`
- Create: `tools/convert-cluster-jewels.js` (one-time conversion script)

**Step 1: Write the conversion script**

Create `tools/convert-cluster-jewels.js` that reads `PathOfBuilding/src/Data/ClusterJewels.lua` and outputs `js/data/cluster-jewels.json`. The Lua file has four sections:

- `jewels` (lines 5-581): Three jewel definitions (Small/Medium/Large), each with `size`, `sizeIndex`, `minNodes`, `maxNodes`, index arrays, and a `skills` map
- `notableSortOrder` (lines 582-882): notable name → sort key
- `keystones` (lines 883-892): array of keystone names
- `orbitOffsets` (lines 893-1050): proxyGroupId → [offset per sizeIndex]

Output JSON structure:
```json
{
  "jewels": {
    "Small Cluster Jewel": {
      "size": "Small",
      "sizeIndex": 0,
      "minNodes": 2,
      "maxNodes": 3,
      "smallIndicies": [0, 4, 2],
      "notableIndicies": [4],
      "socketIndicies": [4],
      "totalIndicies": 6,
      "skills": {
        "affliction_maximum_life": {
          "name": "Life",
          "icon": "Art/2DArt/SkillIcons/passives/IncreasedMaximumLifeNode.png",
          "tag": "affliction_maximum_life",
          "stats": ["4% increased maximum Life"],
          "enchant": ["Added Small Passive Skills grant: 4% increased maximum Life"]
        }
      }
    },
    "Medium Cluster Jewel": { ... },
    "Large Cluster Jewel": { ... }
  },
  "notableSortOrder": { "Prodigious Defence": 11172, ... },
  "keystones": ["Disciple of Kitava", ...],
  "orbitOffsets": { "28650": [1, 1, 1], ... }
}
```

```js
// tools/convert-cluster-jewels.js
import { readFileSync, writeFileSync } from 'fs';

const lua = readFileSync('PathOfBuilding/src/Data/ClusterJewels.lua', 'utf8');

// Simple Lua table parser for this specific file structure
function parseLuaTable(str) {
  // This is a purpose-built parser for ClusterJewels.lua's structure
  // It handles nested tables, string keys, number values, and string values

  let pos = 0;

  function skipWhitespace() {
    while (pos < str.length && /[\s]/.test(str[pos])) pos++;
    // Skip comments
    if (str[pos] === '-' && str[pos + 1] === '-') {
      while (pos < str.length && str[pos] !== '\n') pos++;
      skipWhitespace();
    }
  }

  function parseValue() {
    skipWhitespace();
    if (str[pos] === '{') return parseTable();
    if (str[pos] === '"') return parseString();
    if (str[pos] === 't' && str.substr(pos, 4) === 'true') { pos += 4; return true; }
    if (str[pos] === 'f' && str.substr(pos, 5) === 'false') { pos += 5; return false; }
    return parseNumber();
  }

  function parseString() {
    pos++; // skip opening "
    let s = '';
    while (pos < str.length && str[pos] !== '"') {
      if (str[pos] === '\\') { pos++; s += str[pos]; }
      else s += str[pos];
      pos++;
    }
    pos++; // skip closing "
    return s;
  }

  function parseNumber() {
    const start = pos;
    if (str[pos] === '-') pos++;
    while (pos < str.length && /[0-9.]/.test(str[pos])) pos++;
    return Number(str.substring(start, pos));
  }

  function parseTable() {
    pos++; // skip {
    skipWhitespace();
    // Detect if array-like (first entry has no key) or object-like
    const result = {};
    const arr = [];
    let isArray = true;
    let index = 0;

    while (pos < str.length && str[pos] !== '}') {
      skipWhitespace();
      if (str[pos] === '}') break;

      // Check for keyed entry: ["key"] = or key = or [num] =
      let key = null;
      const savedPos = pos;
      if (str[pos] === '[') {
        pos++;
        skipWhitespace();
        if (str[pos] === '"') {
          key = parseString();
          skipWhitespace();
          pos++; // skip ]
          skipWhitespace();
          pos++; // skip =
          isArray = false;
        } else {
          // Numeric key
          key = parseNumber();
          skipWhitespace();
          pos++; // skip ]
          skipWhitespace();
          pos++; // skip =
          isArray = false;
        }
      } else if (/[a-zA-Z_]/.test(str[pos])) {
        const start = pos;
        while (pos < str.length && /[a-zA-Z0-9_]/.test(str[pos])) pos++;
        const ident = str.substring(start, pos);
        skipWhitespace();
        if (str[pos] === '=') {
          key = ident;
          pos++; // skip =
          isArray = false;
        } else {
          pos = savedPos; // Not a key, rewind
        }
      }

      skipWhitespace();
      const val = parseValue();
      skipWhitespace();
      if (str[pos] === ',') pos++;
      skipWhitespace();

      if (key !== null) {
        result[key] = val;
      } else {
        arr.push(val);
        index++;
      }
    }
    pos++; // skip }
    return isArray && arr.length > 0 ? arr : result;
  }

  // Find the main return table
  const returnIdx = str.indexOf('return {');
  if (returnIdx >= 0) pos = returnIdx + 7;
  return parseTable();
}

const data = parseLuaTable(lua);
writeFileSync('js/data/cluster-jewels.json', JSON.stringify(data, null, 2));
console.log('Wrote js/data/cluster-jewels.json');
console.log(`  Jewels: ${Object.keys(data.jewels || {}).length}`);
console.log(`  Notable sort entries: ${Object.keys(data.notableSortOrder || {}).length}`);
console.log(`  Orbit offsets: ${Object.keys(data.orbitOffsets || {}).length}`);
```

**Step 2: Run the conversion**

Run: `node tools/convert-cluster-jewels.js`
Expected: Creates `js/data/cluster-jewels.json` with 3 jewel definitions, ~300 notable sort entries, and ~42 orbit offsets.

**Step 3: Validate the output**

Manually verify:
- `jewels["Small Cluster Jewel"].sizeIndex === 0`
- `jewels["Small Cluster Jewel"].smallIndicies` is `[0, 4, 2]`
- `jewels["Large Cluster Jewel"].skills` has entries like `affliction_fire_damage`
- `notableSortOrder["Prodigious Defence"] === 11172`
- `orbitOffsets["28650"]` is `[1, 1, 1]`

**Step 4: Commit**

```bash
git add js/data/cluster-jewels.json tools/convert-cluster-jewels.js
git commit -m "feat: convert ClusterJewels.lua to JSON data file"
```

---

## Task 2: Build clusterNodeMap in tree-data.js

**Files:**
- Modify: `js/tree/tree-data.js`
- Test: `js/tree/__tests__/tree-data.test.js`

The tree JSON contains 299 cluster notable nodes that have `isNotable: true` but no `group` field (they were skipped during loading because of the `if (ndata.group === undefined) continue` check on line 79). These nodes provide the stats and icons for cluster jewel notables. We need to index them by name.

**Step 1: Write the failing test**

Add to `js/tree/__tests__/tree-data.test.js`:

```js
describe('clusterNodeMap', () => {
  it('indexes cluster notable nodes by name', () => {
    // Create a minimal tree JSON with an orphan notable (no group)
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/tree/__tests__/tree-data.test.js --reporter=verbose`
Expected: FAIL — `tree.clusterNodeMap` is undefined

**Step 3: Implement clusterNodeMap**

In `js/tree/tree-data.js`, in the `_load` method, add after the main node loop (after line 150):

```js
// Build cluster node map: orphan notable nodes (no group) used for cluster jewel subgraphs
this.clusterNodeMap = new Map();
for (const [nid, ndata] of Object.entries(json.nodes || {})) {
  if (ndata.group !== undefined) continue;
  if (!ndata.isNotable && !ndata.isKeystone) continue;
  this.clusterNodeMap.set(ndata.name, {
    name: ndata.name,
    stats: Array.isArray(ndata.stats) ? ndata.stats : [],
    icon: ndata.icon || null,
    isKeystone: !!ndata.isKeystone,
  });
}
```

Also initialize `this.clusterNodeMap = new Map()` in the constructor (around line 30).

**Step 4: Run test to verify it passes**

Run: `npx vitest run js/tree/__tests__/tree-data.test.js --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add js/tree/tree-data.js js/tree/__tests__/tree-data.test.js
git commit -m "feat: build clusterNodeMap from orphan notable nodes in tree data"
```

---

## Task 3: Cluster Jewel Item Text Parser

**Files:**
- Create: `js/models/cluster-jewel.js`
- Create: `js/models/__tests__/cluster-jewel.test.js`

Parses pasted item text to extract cluster jewel properties. Port of relevant parts of `Item.lua` and `ModParser.lua`.

**Step 1: Write the failing tests**

Create `js/models/__tests__/cluster-jewel.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseClusterJewel } from '../cluster-jewel.js';
import clusterData from '../../data/cluster-jewels.json';

describe('parseClusterJewel', () => {
  it('parses a Large Cluster Jewel with fire damage', () => {
    const text = `Large Cluster Jewel
Adds 8 Passive Skills
2 Added Passive Skills are Jewel Sockets
Added Small Passive Skills grant: 12% increased Fire Damage
1 Added Passive Skill is Cremator
1 Added Passive Skill is Smoking Remains`;

    const result = parseClusterJewel(text, clusterData);
    expect(result.baseName).toBe('Large Cluster Jewel');
    expect(result.clusterJewelNodeCount).toBe(8);
    expect(result.clusterJewelSocketCount).toBe(2);
    expect(result.clusterJewelSkill).toBe('affliction_fire_damage');
    expect(result.clusterJewelNotables).toEqual(['Cremator', 'Smoking Remains']);
    expect(result.clusterJewelValid).toBe(true);
  });

  it('parses a Medium Cluster Jewel', () => {
    const text = `Medium Cluster Jewel
Adds 5 Passive Skills
1 Added Passive Skill is a Jewel Socket
Added Small Passive Skills grant: 6% increased Effect of your Curses
1 Added Passive Skill is Evil Eye`;

    const result = parseClusterJewel(text, clusterData);
    expect(result.baseName).toBe('Medium Cluster Jewel');
    expect(result.clusterJewelNodeCount).toBe(5);
    expect(result.clusterJewelSocketCount).toBe(1);
    expect(result.clusterJewelNotables).toEqual(['Evil Eye']);
    expect(result.clusterJewelValid).toBe(true);
  });

  it('parses a Small Cluster Jewel', () => {
    const text = `Small Cluster Jewel
Adds 2 Passive Skills
Added Small Passive Skills grant: 4% increased maximum Life
1 Added Passive Skill is Fettle`;

    const result = parseClusterJewel(text, clusterData);
    expect(result.baseName).toBe('Small Cluster Jewel');
    expect(result.clusterJewelNodeCount).toBe(2);
    expect(result.clusterJewelSocketCount).toBe(0);
    expect(result.clusterJewelNotables).toEqual(['Fettle']);
    expect(result.clusterJewelValid).toBe(true);
  });

  it('returns invalid for non-cluster jewel text', () => {
    const result = parseClusterJewel('Cobalt Jewel\n+10 to Intelligence', clusterData);
    expect(result.clusterJewelValid).toBe(false);
  });

  it('returns invalid for missing enchant', () => {
    const text = `Large Cluster Jewel
some random mod`;
    const result = parseClusterJewel(text, clusterData);
    expect(result.clusterJewelValid).toBe(false);
  });

  it('handles single jewel socket text', () => {
    const text = `Large Cluster Jewel
Adds 10 Passive Skills
1 Added Passive Skill is a Jewel Socket
Added Small Passive Skills grant: 12% increased Fire Damage`;

    const result = parseClusterJewel(text, clusterData);
    expect(result.clusterJewelSocketCount).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/models/__tests__/cluster-jewel.test.js --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Implement the parser**

Create `js/models/cluster-jewel.js`:

```js
// Cluster Jewel item text parser
// Extracts cluster jewel properties from pasted item text.

/**
 * Parse item text for a cluster jewel.
 * @param {string} text - Raw multi-line item text
 * @param {object} clusterData - The cluster-jewels.json data
 * @returns {object} Parsed cluster jewel properties
 */
export function parseClusterJewel(text, clusterData) {
  const result = {
    baseName: null,
    clusterJewelSkill: null,
    clusterJewelNodeCount: 0,
    clusterJewelSocketCount: 0,
    clusterJewelNotables: [],
    clusterJewelAddedMods: [],
    clusterJewelValid: false,
  };

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return result;

  // Determine base name (first line that matches a jewel type)
  const jewelTypes = Object.keys(clusterData.jewels);
  for (const line of lines) {
    for (const jt of jewelTypes) {
      if (line === jt) {
        result.baseName = jt;
        break;
      }
    }
    if (result.baseName) break;
  }

  if (!result.baseName) return result;

  const jewelDef = clusterData.jewels[result.baseName];
  if (!jewelDef) return result;

  // Build notable name set from cluster data for matching
  const notableNames = new Set(Object.keys(clusterData.notableSortOrder || {}));

  // Parse enchant lines
  for (const line of lines) {
    const lower = line.toLowerCase();

    // "Adds N Passive Skills"
    const addCountMatch = line.match(/^Adds (\d+) Passive Skills?$/i);
    if (addCountMatch) {
      result.clusterJewelNodeCount = parseInt(addCountMatch[1], 10);
      continue;
    }

    // "N Added Passive Skills are Jewel Sockets"
    const socketCountMatch = line.match(/^(\d+) Added Passive Skills? (?:are|is a) Jewel Sockets?$/i);
    if (socketCountMatch) {
      result.clusterJewelSocketCount = parseInt(socketCountMatch[1], 10);
      continue;
    }

    // "Added Small Passive Skills grant: X" -> match against skill enchant text
    const grantMatch = line.match(/^Added Small Passive Skills grant: (.+)$/i);
    if (grantMatch && !result.clusterJewelSkill) {
      const grantText = grantMatch[1];
      // Search skills for matching enchant
      for (const [tag, skill] of Object.entries(jewelDef.skills)) {
        for (const enchant of skill.enchant) {
          const enchantGrant = enchant.replace(/^Added Small Passive Skills grant: /i, '');
          if (enchantGrant.toLowerCase() === grantText.toLowerCase()) {
            result.clusterJewelSkill = tag;
            break;
          }
        }
        if (result.clusterJewelSkill) break;
      }
      continue;
    }

    // "1 Added Passive Skill is <NotableName>"
    const notableMatch = line.match(/^1 Added Passive Skill is (.+)$/i);
    if (notableMatch) {
      const name = notableMatch[1];
      // Skip "a Jewel Socket" match
      if (/^a Jewel Socket$/i.test(name)) continue;
      if (notableNames.has(name)) {
        result.clusterJewelNotables.push(name);
      }
      continue;
    }
  }

  // Validate: need skill + nodeCount to be valid
  result.clusterJewelValid = !!(result.clusterJewelSkill && result.clusterJewelNodeCount > 0);

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run js/models/__tests__/cluster-jewel.test.js --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add js/models/cluster-jewel.js js/models/__tests__/cluster-jewel.test.js
git commit -m "feat: cluster jewel item text parser"
```

---

## Task 4: Subgraph Builder

**Files:**
- Create: `js/tree/subgraph-builder.js`
- Create: `js/tree/__tests__/subgraph-builder.test.js`

Port of `PassiveSpec:BuildSubgraph` (~450 lines Lua). Generates synthetic nodes positioned on proxy groups.

**Step 1: Write the failing tests**

Create `js/tree/__tests__/subgraph-builder.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildSubgraph, computeSubgraphId } from '../subgraph-builder.js';

describe('computeSubgraphId', () => {
  it('computes ID for large socket at index 3', () => {
    // Bit 16 = 1, bits 4-5 = sizeIndex 2 (0b10), bits 6-8 = large index 3 (0b011)
    // 0x10000 | (2 << 4) | (3 << 6) = 65536 | 32 | 192 = 65760
    const id = computeSubgraphId(2, 3, 0);
    expect(id).toBe(0x10000 | (2 << 4) | (3 << 6));
  });

  it('computes ID for medium socket nested in large index 3, medium index 1', () => {
    const id = computeSubgraphId(1, 3, 1);
    expect(id).toBe(0x10000 | (1 << 4) | (3 << 6) | (1 << 9));
  });
});

describe('buildSubgraph', () => {
  // Build a minimal test environment
  function makeTestContext() {
    const clusterData = {
      jewels: {
        'Large Cluster Jewel': {
          size: 'Large',
          sizeIndex: 2,
          minNodes: 8,
          maxNodes: 12,
          smallIndicies: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
          notableIndicies: [0, 2, 4, 6, 8, 10],
          socketIndicies: [2, 10],
          totalIndicies: 12,
          skills: {
            'affliction_fire_damage': {
              name: 'Fire Damage',
              icon: 'fire.png',
              tag: 'affliction_fire_damage',
              stats: ['12% increased Fire Damage'],
              enchant: ['Added Small Passive Skills grant: 12% increased Fire Damage'],
            },
          },
        },
      },
      notableSortOrder: { 'Cremator': 100, 'Smoking Remains': 200 },
      orbitOffsets: {},
    };

    const treeData = {
      groups: {
        '1000': { x: 5000, y: 5000 },
      },
      nodes: {
        26725: {
          id: 26725,
          type: 'jewel',
          group: 500,
          expansionJewel: { size: 2, index: 3, proxy: '1000' },
          adjacent: [100],
        },
      },
      clusterNodeMap: new Map([
        ['Cremator', { name: 'Cremator', stats: ['burn stuff'], icon: 'cremator.png' }],
        ['Smoking Remains', { name: 'Smoking Remains', stats: ['smoke stuff'], icon: 'smoke.png' }],
      ]),
    };

    const constants = {
      orbitRadii: [0, 82, 162, 335, 493, 662, 846],
      skillsPerOrbit: [1, 6, 16, 16, 40, 72, 72],
    };

    return { clusterData, treeData, constants };
  }

  it('generates correct number of nodes for Large Cluster Jewel', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = {
      baseName: 'Large Cluster Jewel',
      clusterJewelSkill: 'affliction_fire_damage',
      clusterJewelNodeCount: 8,
      clusterJewelSocketCount: 2,
      clusterJewelNotables: ['Cremator', 'Smoking Remains'],
    };

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    expect(subgraph).not.toBeNull();
    expect(subgraph.nodes.length).toBe(8); // 2 sockets + 2 notables + 4 smalls
  });

  it('generates an entrance node connected to parent socket', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = {
      baseName: 'Large Cluster Jewel',
      clusterJewelSkill: 'affliction_fire_damage',
      clusterJewelNodeCount: 8,
      clusterJewelSocketCount: 2,
      clusterJewelNotables: ['Cremator', 'Smoking Remains'],
    };

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    expect(subgraph.entranceNodeId).toBeDefined();
    const entrance = subgraph.nodes.find(n => n.id === subgraph.entranceNodeId);
    expect(entrance).toBeDefined();
    // Entrance should be adjacent to parent socket
    expect(entrance.adjacent).toContain(26725);
  });

  it('sets correct node types for sockets, notables, and smalls', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = {
      baseName: 'Large Cluster Jewel',
      clusterJewelSkill: 'affliction_fire_damage',
      clusterJewelNodeCount: 8,
      clusterJewelSocketCount: 2,
      clusterJewelNotables: ['Cremator', 'Smoking Remains'],
    };

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    const sockets = subgraph.nodes.filter(n => n.type === 'jewel');
    const notables = subgraph.nodes.filter(n => n.type === 'notable');
    const smalls = subgraph.nodes.filter(n => n.type === 'normal');

    expect(sockets.length).toBe(2);
    expect(notables.length).toBe(2);
    expect(smalls.length).toBe(4);
  });

  it('positions nodes on the proxy group orbit', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = {
      baseName: 'Large Cluster Jewel',
      clusterJewelSkill: 'affliction_fire_damage',
      clusterJewelNodeCount: 8,
      clusterJewelSocketCount: 2,
      clusterJewelNotables: ['Cremator', 'Smoking Remains'],
    };

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    // All nodes should have x,y positions near the proxy group
    for (const node of subgraph.nodes) {
      const dx = node.x - 5000;
      const dy = node.y - 5000;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Should be within orbit radius range (0-846)
      expect(dist).toBeLessThanOrEqual(850);
    }
  });

  it('creates connections between sequential nodes', () => {
    const { clusterData, treeData, constants } = makeTestContext();
    const parsedJewel = {
      baseName: 'Large Cluster Jewel',
      clusterJewelSkill: 'affliction_fire_damage',
      clusterJewelNodeCount: 8,
      clusterJewelSocketCount: 2,
      clusterJewelNotables: ['Cremator', 'Smoking Remains'],
    };

    const subgraph = buildSubgraph(parsedJewel, treeData.nodes[26725], treeData, clusterData, constants);

    // Each node should have at least one adjacent node
    for (const node of subgraph.nodes) {
      expect(node.adjacent.length).toBeGreaterThan(0);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/tree/__tests__/subgraph-builder.test.js --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Implement the subgraph builder**

Create `js/tree/subgraph-builder.js`:

```js
// Subgraph Builder for Cluster Jewels
// Port of PassiveSpec:BuildSubgraph from PassiveSpec.lua

import { buildOrbitAngles } from './tree-data.js';

// 12→16 orbit index translation (cluster jewel uses 12 positions, tree uses 16)
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
 * @returns {object|null} Subgraph with nodes[], groupCenter, entranceNodeId, connections[]
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

  // Determine orbit and orbit offset
  const orbit = jewelDef.sizeIndex === 2 ? 2 : (jewelDef.sizeIndex === 1 ? 2 : 1);
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
  const assigned = new Map(); // orbit position index → node info

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

  // Pass 2: Notables
  const notablePositions = jewelDef.notableIndicies.slice(0, sortedNotables.length);
  for (let i = 0; i < notablePositions.length; i++) {
    const posIdx = notablePositions[i];
    const notableName = sortedNotables[i];
    const clusterNode = treeData.clusterNodeMap?.get(notableName);
    assigned.set(posIdx, {
      type: 'notable',
      name: notableName,
      stats: clusterNode?.stats || [],
      icon: clusterNode?.icon || null,
      isSocket: false,
    });
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
  const posToNode = new Map(); // posIdx → node

  for (const [posIdx, info] of sortedPositions) {
    const nodeId = subgraphBaseId | nodeIndex;

    // Translate orbit index: cluster jewel indices → tree orbit indices
    let treeOrbitIndex;
    if (indicies === 12) {
      // 12→16 mapping
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

  // Find entrance node (first small passive, which is at position 0 in the orbit)
  // The entrance is the node at the lowest position index
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run js/tree/__tests__/subgraph-builder.test.js --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add js/tree/subgraph-builder.js js/tree/__tests__/subgraph-builder.test.js
git commit -m "feat: subgraph builder for cluster jewel node generation"
```

---

## Task 5: PassiveSpec Jewel Tracking + Equip/Unequip

**Files:**
- Modify: `js/models/passive-spec.js`
- Modify: `js/models/__tests__/passive-spec.test.js`

**Step 1: Write the failing tests**

Add to `js/models/__tests__/passive-spec.test.js`:

```js
describe('PassiveSpec cluster jewels', () => {
  function makeTreeWithJewelSocket() {
    return {
      nodes: {
        1: { id: 1, name: 'Start', type: 'classStart', stats: [], adjacent: [2], masteryEffects: [] },
        2: { id: 2, name: 'Path', type: 'normal', stats: [], adjacent: [1, 100], masteryEffects: [] },
        100: { id: 100, name: 'Large Jewel Socket', type: 'jewel', stats: [], adjacent: [2],
          masteryEffects: [],
          expansionJewel: { size: 2, index: 0, proxy: '500' },
        },
      },
      classStarts: { 0: 1 },
      _classes: [{ name: 'Scion', ascendancies: [] }],
      groups: { '500': { x: 1000, y: 1000 } },
      clusterNodeMap: new Map(),
    };
  }

  it('tracks equipped jewels', () => {
    const tree = makeTreeWithJewelSocket();
    const spec = new PassiveSpec(tree, 0);
    expect(spec.jewels.size).toBe(0);
    spec.jewels.set(100, { baseName: 'Large Cluster Jewel' });
    expect(spec.jewels.has(100)).toBe(true);
  });

  it('tracks subgraphs', () => {
    const tree = makeTreeWithJewelSocket();
    const spec = new PassiveSpec(tree, 0);
    expect(spec.subGraphs.size).toBe(0);
  });

  it('equipJewel stores jewel and creates subgraph nodes in tree', () => {
    const tree = makeTreeWithJewelSocket();
    const spec = new PassiveSpec(tree, 0);

    // Create a mock subgraph
    const subgraph = {
      id: 0x10020,
      nodes: [
        { id: 0x10020, name: 'Small', type: 'normal', stats: ['10% fire'], adjacent: [0x10021, 100], masteryEffects: [] },
        { id: 0x10021, name: 'Notable', type: 'notable', stats: ['big fire'], adjacent: [0x10020], masteryEffects: [] },
      ],
      parentSocketId: 100,
      entranceNodeId: 0x10020,
    };

    spec._applySubgraph(100, subgraph);
    expect(spec.subGraphs.has(0x10020)).toBe(true);
    // Synthetic nodes should be added to tree.nodes
    expect(tree.nodes[0x10020]).toBeDefined();
    expect(tree.nodes[0x10021]).toBeDefined();
    // Parent socket should gain adjacency to entrance
    expect(tree.nodes[100].adjacent).toContain(0x10020);
  });

  it('unequipJewel removes subgraph nodes and restores tree', () => {
    const tree = makeTreeWithJewelSocket();
    const spec = new PassiveSpec(tree, 0);

    const subgraph = {
      id: 0x10020,
      nodes: [
        { id: 0x10020, name: 'Small', type: 'normal', stats: ['10% fire'], adjacent: [0x10021, 100], masteryEffects: [] },
        { id: 0x10021, name: 'Notable', type: 'notable', stats: ['big fire'], adjacent: [0x10020], masteryEffects: [] },
      ],
      parentSocketId: 100,
      entranceNodeId: 0x10020,
    };

    spec._applySubgraph(100, subgraph);
    spec._removeSubgraph(100);

    expect(spec.subGraphs.has(0x10020)).toBe(false);
    expect(tree.nodes[0x10020]).toBeUndefined();
    expect(tree.nodes[0x10021]).toBeUndefined();
    expect(tree.nodes[100].adjacent).not.toContain(0x10020);
  });

  it('subgraph nodes participate in allocation', () => {
    const tree = makeTreeWithJewelSocket();
    const spec = new PassiveSpec(tree, 0);

    const subgraph = {
      id: 0x10020,
      nodes: [
        { id: 0x10020, name: 'Small', type: 'normal', stats: ['10% fire'], adjacent: [0x10021, 100], masteryEffects: [] },
        { id: 0x10021, name: 'Notable', type: 'notable', stats: ['big fire'], adjacent: [0x10020], masteryEffects: [] },
      ],
      parentSocketId: 100,
      entranceNodeId: 0x10020,
    };

    spec._applySubgraph(100, subgraph);

    // Allocate path to the socket first, then into the subgraph
    spec.allocate(2);
    spec.allocate(100);
    spec.allocate(0x10020);
    spec.allocate(0x10021);

    expect(spec.isAllocated(0x10020)).toBe(true);
    expect(spec.isAllocated(0x10021)).toBe(true);

    const stats = spec.collectStats();
    expect(stats).toContain('10% fire');
    expect(stats).toContain('big fire');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/models/__tests__/passive-spec.test.js --reporter=verbose`
Expected: FAIL — `spec.jewels` is undefined

**Step 3: Implement jewel tracking in PassiveSpec**

In `js/models/passive-spec.js`, add to constructor (after line 11):

```js
this.jewels = new Map();       // socketNodeId → parsed cluster jewel data
this.subGraphs = new Map();    // subgraphId → { nodes[], parentSocketId, entranceNodeId }
```

Add new methods:

```js
// Apply a subgraph: add its nodes to the tree and connect entrance to parent socket
_applySubgraph(socketNodeId, subgraph) {
  // Add synthetic nodes to tree
  for (const node of subgraph.nodes) {
    this.tree.nodes[node.id] = node;
  }

  // Connect parent socket to entrance node
  const parentSocket = this.tree.nodes[socketNodeId];
  if (parentSocket && subgraph.entranceNodeId != null) {
    if (!parentSocket.adjacent.includes(subgraph.entranceNodeId)) {
      parentSocket.adjacent.push(subgraph.entranceNodeId);
    }
  }

  this.subGraphs.set(subgraph.id, {
    nodes: subgraph.nodes,
    parentSocketId: socketNodeId,
    entranceNodeId: subgraph.entranceNodeId,
  });
}

// Remove a subgraph: delete its nodes from the tree and disconnect from parent
_removeSubgraph(socketNodeId) {
  // Find the subgraph for this socket
  let subgraphId = null;
  for (const [id, sg] of this.subGraphs) {
    if (sg.parentSocketId === socketNodeId) {
      subgraphId = id;
      break;
    }
  }
  if (subgraphId == null) return;

  const sg = this.subGraphs.get(subgraphId);

  // Deallocate all subgraph nodes
  for (const node of sg.nodes) {
    this.allocated.delete(node.id);
    this.masterySelections.delete(node.id);
    delete this.tree.nodes[node.id];
  }

  // Remove entrance adjacency from parent socket
  const parentSocket = this.tree.nodes[socketNodeId];
  if (parentSocket && sg.entranceNodeId != null) {
    parentSocket.adjacent = parentSocket.adjacent.filter(id => id !== sg.entranceNodeId);
  }

  this.subGraphs.delete(subgraphId);
}
```

Also update `reset()` to clear jewels and subgraphs:

```js
reset() {
  // Remove all subgraphs from tree before clearing
  for (const [id, sg] of this.subGraphs) {
    for (const node of sg.nodes) {
      delete this.tree.nodes[node.id];
    }
    const parentSocket = this.tree.nodes[sg.parentSocketId];
    if (parentSocket && sg.entranceNodeId != null) {
      parentSocket.adjacent = parentSocket.adjacent.filter(id => id !== sg.entranceNodeId);
    }
  }
  this.allocated.clear();
  this.ascendancyAllocated.clear();
  this.masterySelections.clear();
  this.jewels.clear();
  this.subGraphs.clear();
  const startNodeId = this.tree.classStarts[this.classId];
  if (startNodeId !== undefined) {
    this.allocated.add(startNodeId);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run js/models/__tests__/passive-spec.test.js --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add js/models/passive-spec.js js/models/__tests__/passive-spec.test.js
git commit -m "feat: PassiveSpec jewel tracking with subgraph apply/remove"
```

---

## Task 6: Tree Click Handler + Popup UI

**Files:**
- Modify: `js/app.js`
- Modify: `css/main.css`

This task adds the jewel socket click handler and the paste-item-text popup. No automated tests — this is UI wiring.

**Step 1: Add cluster jewel imports to app.js**

At the top of `js/app.js`, add:

```js
import { parseClusterJewel } from './models/cluster-jewel.js';
import { buildSubgraph } from './tree/subgraph-builder.js';
import clusterData from './data/cluster-jewels.json' with { type: 'json' };
```

Note: If JSON import assertion isn't supported, use a fetch-based approach instead:
```js
// Alternative: load at init time
let clusterData = null;
fetch('js/data/cluster-jewels.json').then(r => r.json()).then(d => { clusterData = d; });
```

**Step 2: Add jewel click handler**

In the `onNodeClick` handler (around line 136-147 in `app.js`), add handling for jewel nodes before the `toggleNode` call:

```js
this.treeInteraction.onNodeClick = (node) => {
  if (!node) return;
  if (node.type === 'classStart') return;
  if (node.type === 'mastery') {
    this._onMasteryClick(node);
    return;
  }

  // Handle jewel socket clicks for cluster jewels
  if (node.type === 'jewel' && node.expansionJewel) {
    this._onJewelSocketClick(node);
    return;
  }

  this.treeAllocation.toggleNode(node.id);
  this._rebuildTreeInstances();
  this._updateStatusBar();
  this._runCalc();
};
```

**Step 3: Implement _onJewelSocketClick**

Add method to PoBApp:

```js
_onJewelSocketClick(node) {
  if (!this.treeAllocation || !clusterData) return;
  const spec = this.treeAllocation.spec;
  const hasJewel = spec.jewels.has(node.id);

  if (hasJewel) {
    this._showJewelPopup(node, true);
  } else {
    this._showJewelPopup(node, false);
  }
}
```

**Step 4: Implement _showJewelPopup**

```js
_showJewelPopup(node, hasJewel) {
  const spec = this.treeAllocation.spec;

  const overlay = document.createElement('div');
  overlay.className = 'pob-modal-overlay';

  if (hasJewel) {
    // Show unequip dialog
    const jewel = spec.jewels.get(node.id);
    overlay.innerHTML = `
      <div class="pob-modal">
        <div class="pob-modal-title">Jewel Socket</div>
        <div class="jewel-info">Equipped: ${jewel?.baseName || 'Cluster Jewel'}</div>
        <div class="pob-modal-actions">
          <button class="pob-btn jewel-unequip-btn">Unequip</button>
          <button class="pob-btn mastery-cancel-btn">Cancel</button>
        </div>
      </div>
    `;
  } else {
    // Show equip dialog with textarea
    overlay.innerHTML = `
      <div class="pob-modal">
        <div class="pob-modal-title">Equip Cluster Jewel</div>
        <textarea class="jewel-paste-area" rows="8" placeholder="Paste cluster jewel item text here..."></textarea>
        <div class="jewel-parse-status" id="jewel-parse-status"></div>
        <div class="pob-modal-actions">
          <button class="pob-btn mastery-cancel-btn">Cancel</button>
          <button class="pob-btn pob-btn-primary jewel-equip-btn" disabled>Equip</button>
        </div>
      </div>
    `;
  }

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  // Cancel / overlay click
  overlay.querySelector('.mastery-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  if (hasJewel) {
    // Unequip
    overlay.querySelector('.jewel-unequip-btn').addEventListener('click', () => {
      spec._removeSubgraph(node.id);
      spec.jewels.delete(node.id);
      this._rebuildTreeInstances();
      this._updateStatusBar();
      this._runCalc();
      close();
    });
  } else {
    // Equip: parse on input, enable button when valid
    const textarea = overlay.querySelector('.jewel-paste-area');
    const equipBtn = overlay.querySelector('.jewel-equip-btn');
    const status = overlay.querySelector('#jewel-parse-status');
    let parsedJewel = null;

    textarea.addEventListener('input', () => {
      parsedJewel = parseClusterJewel(textarea.value, clusterData);
      if (parsedJewel.clusterJewelValid) {
        status.textContent = `${parsedJewel.baseName}: ${parsedJewel.clusterJewelNodeCount} nodes, ` +
          `${parsedJewel.clusterJewelSocketCount} sockets, ` +
          `${parsedJewel.clusterJewelNotables.length} notables`;
        status.style.color = '#8f8';
        equipBtn.disabled = false;
      } else {
        status.textContent = parsedJewel.baseName ? 'Invalid cluster jewel data' : 'Paste a cluster jewel item text';
        status.style.color = '#f88';
        equipBtn.disabled = true;
      }
    });

    equipBtn.addEventListener('click', () => {
      if (!parsedJewel?.clusterJewelValid) return;

      const constants = {
        orbitRadii: [0, 82, 162, 335, 493, 662, 846],
        skillsPerOrbit: [1, 6, 16, 16, 40, 72, 72],
      };

      const subgraph = buildSubgraph(parsedJewel, node, this.treeData, clusterData, constants);
      if (!subgraph) {
        status.textContent = 'Failed to build subgraph';
        status.style.color = '#f88';
        return;
      }

      spec.jewels.set(node.id, parsedJewel);
      spec._applySubgraph(node.id, subgraph);
      this._rebuildTreeInstances();
      this._updateStatusBar();
      this._runCalc();
      close();
    });

    // Auto-focus textarea
    setTimeout(() => textarea.focus(), 50);
  }
}
```

**Step 5: Add CSS for jewel popup**

Add to `css/main.css`:

```css
.jewel-paste-area {
  width: 100%;
  min-height: 120px;
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid var(--border, #3a3a5e);
  border-radius: 4px;
  color: var(--text, #d4d4d4);
  font-family: monospace;
  font-size: 12px;
  padding: 8px;
  resize: vertical;
  margin-bottom: 8px;
}

.jewel-parse-status {
  font-size: 12px;
  margin-bottom: 8px;
  min-height: 1.5em;
}

.jewel-info {
  padding: 8px 0;
  color: var(--text-secondary, #999);
}
```

**Step 6: Test manually**

Open the app, click a large jewel socket on the outer ring. Verify:
- Popup appears with textarea
- Pasting valid cluster jewel text shows parsed info and enables Equip button
- Clicking Equip creates subgraph nodes visible on the tree
- Clicking a socket with an equipped jewel shows Unequip option

**Step 7: Commit**

```bash
git add js/app.js css/main.css
git commit -m "feat: jewel socket click handler and cluster jewel equip popup"
```

---

## Task 7: Rendering Subgraph Nodes

**Files:**
- Modify: `js/tree/tree-renderer.js`

Subgraph nodes are already added to `treeData.nodes` by the subgraph builder, so `buildNodeLayers` picks them up automatically. The main rendering task is ensuring connections between subgraph nodes render correctly.

**Step 1: Verify existing rendering works**

After completing Tasks 1-6, subgraph nodes should already appear because:
- `buildNodeLayers` iterates `Object.values(treeData.nodes)` — synthetic nodes are included
- `buildConnectionInstances` iterates all nodes and their adjacency lists — subgraph connections are included

If nodes render but look wrong (e.g., missing icons for cluster small passives), the sprite UV lookup may need a fallback. The existing `buildNodeLayers` uses `spriteData.getIconUV(node.type, node._icon, allocated)` which returns null for unknown icons, and the renderer shows nothing.

**Step 2: Add fallback icon handling for cluster nodes**

In `buildNodeLayers` in `tree-renderer.js`, where the icon UV is looked up, add a fallback for cluster nodes whose icons aren't in the sprite atlas:

```js
// When building icon instances, if getIconUV returns null and node._isClusterNode,
// skip the icon (the frame is enough) or use a default
```

This is a minor adjustment. Cluster notable icons from the tree JSON (like `Art/2DArt/SkillIcons/passives/CurseEffectNotable.png`) ARE in the sprite atlas since they're standard notable icons. Small passive cluster icons (like `Art/2DArt/SkillIcons/passives/IncreasedMaximumLifeNode.png`) are also standard and already in the atlas.

**Step 3: Ensure connection arcs work for subgraph nodes**

The `buildConnectionInstances` function creates connections between adjacent nodes. Subgraph nodes have `adjacent` arrays that reference each other, so connections should render automatically. Verify that the function handles the case where `node.group` matches for subgraph nodes (they share the proxy group).

If connections between subgraph nodes need arc rendering (they're on the same orbit), the existing arc connection logic should handle this since the nodes have `orbit` and `orbitIndex` set.

**Step 4: Test manually**

Equip a cluster jewel and verify:
- Subgraph nodes appear at the correct positions around the jewel socket
- Connections between subgraph nodes render
- Node frames (normal/notable/jewel) display correctly
- Icons appear on the nodes

**Step 5: Commit (if changes were needed)**

```bash
git add js/tree/tree-renderer.js
git commit -m "fix: ensure subgraph node rendering works for cluster jewels"
```

---

## Task 8: XML Persistence for Jewel Sockets

**Files:**
- Modify: `js/io/build-xml.js`
- Modify: `js/io/__tests__/build-xml.test.js`
- Modify: `js/app.js`

**Step 1: Write the failing tests**

Add to `js/io/__tests__/build-xml.test.js`:

```js
describe('cluster jewel XML persistence', () => {
  it('serializes jewel sockets to XML', () => {
    const build = new Build({
      className: 'Scion',
      level: 90,
      treeNodes: [100, 200],
      jewelSockets: [
        { nodeId: 26725, itemText: 'Large Cluster Jewel\nAdds 8 Passive Skills' },
      ],
    });
    const xml = buildToXml(build);
    expect(xml).toContain('<Sockets>');
    expect(xml).toContain('nodeId="26725"');
    expect(xml).toContain('Large Cluster Jewel');
  });

  it('parses jewel sockets from XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Scion" level="90" ascendClassName="" buildName="Test"/>
  <Tree>
    <Spec treeVersion="3_25" classId="0" ascendClassId="0" nodes="100,200">
      <Sockets>
        <Socket nodeId="26725" itemText="Large Cluster Jewel&#10;Adds 8 Passive Skills"/>
      </Sockets>
    </Spec>
  </Tree>
  <Skills></Skills>
  <Items></Items>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const build = xmlToBuild(xml);
    expect(build.specs[0].jewelSockets).toBeDefined();
    expect(build.specs[0].jewelSockets.length).toBe(1);
    expect(build.specs[0].jewelSockets[0].nodeId).toBe(26725);
    expect(build.specs[0].jewelSockets[0].itemText).toContain('Large Cluster Jewel');
  });

  it('round-trips jewel socket data', () => {
    const build = new Build({
      className: 'Scion',
      level: 90,
      treeNodes: [100],
      jewelSockets: [
        { nodeId: 26725, itemText: 'Large Cluster Jewel\nAdds 8 Passive Skills\nSome mod with "quotes"' },
      ],
    });
    const xml = buildToXml(build);
    const parsed = xmlToBuild(xml);
    expect(parsed.jewelSockets.length).toBe(1);
    expect(parsed.jewelSockets[0].nodeId).toBe(26725);
    expect(parsed.jewelSockets[0].itemText).toContain('Large Cluster Jewel');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/io/__tests__/build-xml.test.js --reporter=verbose`
Expected: FAIL

**Step 3: Implement XML serialization**

In `js/io/build-xml.js`:

**Add `jewelSockets` to Build constructor:**

```js
this.jewelSockets = opts.jewelSockets || []; // [{nodeId, itemText}]
```

**Serialize in `buildToXml`** — inside the `<Spec>` tag (after the nodes attribute, before `</Spec>`):

```js
// Inside the Spec generation block:
if (build.jewelSockets && build.jewelSockets.length > 0) {
  xml += '      <Sockets>\n';
  for (const socket of build.jewelSockets) {
    xml += `        <Socket nodeId="${socket.nodeId}" itemText="${escapeXml(socket.itemText)}"/>\n`;
  }
  xml += '      </Sockets>\n';
}
```

**Parse in `parseXmlSimple`** — inside the Spec parsing loop, after extracting nodes:

```js
// Parse <Socket> elements within the <Spec> block
const specBlock = specMatch[0]; // full match including content
const socketRegex = /<Socket\s+([^>]*)\/>/g;
const jewelSockets = [];
let socketMatch;
while ((socketMatch = socketRegex.exec(specBlock)) !== null) {
  const sAttrs = socketMatch[1];
  const socketNodeId = parseInt(extractAttr(sAttrs, 'nodeId') || '0', 10);
  const socketItemText = extractAttr(sAttrs, 'itemText') || '';
  if (socketNodeId) {
    jewelSockets.push({ nodeId: socketNodeId, itemText: socketItemText });
  }
}
// Add to spec
spec.jewelSockets = jewelSockets;
```

Similarly in `parseDom`:

```js
specEl.querySelectorAll('Socket').forEach(socketEl => {
  const nodeId = parseInt(socketEl.getAttribute('nodeId') || '0', 10);
  const itemText = socketEl.getAttribute('itemText') || '';
  if (nodeId) {
    if (!spec.jewelSockets) spec.jewelSockets = [];
    spec.jewelSockets.push({ nodeId, itemText });
  }
});
```

**Apply in `_applyBuild` in `app.js`:**

After allocating tree nodes and mastery effects, equip jewels:

```js
// Apply jewel sockets from the active spec
const activeSpec = build.specs[build.activeSpec];
if (activeSpec?.jewelSockets && clusterData) {
  for (const { nodeId, itemText } of activeSpec.jewelSockets) {
    const parsedJewel = parseClusterJewel(itemText, clusterData);
    if (parsedJewel.clusterJewelValid) {
      const socketNode = this.treeData.nodes[nodeId];
      if (socketNode?.expansionJewel) {
        const constants = {
          orbitRadii: [0, 82, 162, 335, 493, 662, 846],
          skillsPerOrbit: [1, 6, 16, 16, 40, 72, 72],
        };
        const subgraph = buildSubgraph(parsedJewel, socketNode, this.treeData, clusterData, constants);
        if (subgraph) {
          this.treeAllocation.spec.jewels.set(nodeId, { ...parsedJewel, _itemText: itemText });
          this.treeAllocation.spec._applySubgraph(nodeId, subgraph);
        }
      }
    }
  }
}
```

**Export in `_buildCurrentBuild` in `app.js`:**

Add jewel socket serialization:

```js
// Collect jewel sockets
const jewelSockets = [];
if (this.treeAllocation?.spec.jewels) {
  for (const [nodeId, jewel] of this.treeAllocation.spec.jewels) {
    jewelSockets.push({ nodeId, itemText: jewel._itemText || '' });
  }
}

return new Build({
  // ... existing fields ...
  jewelSockets,
});
```

Also store `_itemText` on the parsed jewel when equipping in the popup handler:

```js
spec.jewels.set(node.id, { ...parsedJewel, _itemText: textarea.value });
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run js/io/__tests__/build-xml.test.js --reporter=verbose`
Expected: PASS

**Step 5: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass

**Step 6: Commit**

```bash
git add js/io/build-xml.js js/io/__tests__/build-xml.test.js js/app.js
git commit -m "feat: XML persistence for cluster jewel sockets"
```

---

## Verification Checklist

After all 8 tasks are complete:

1. Paste a Large Cluster Jewel with 2 sockets + 2 notables into an outer jewel socket -> subgraph appears with correct node layout
2. Allocate nodes in the subgraph -> stats appear in sidebar
3. Paste a Medium Cluster Jewel into a nested socket within the subgraph -> second subgraph appears
4. Unequip the outer jewel -> all nested subgraphs removed
5. Export build -> re-import -> cluster jewels preserved
6. Import a PoB share code containing cluster jewels -> subgraphs display correctly
7. All automated tests pass
