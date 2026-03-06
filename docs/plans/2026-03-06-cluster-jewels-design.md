# Cluster Jewels Design

**Goal:** Allow users to equip cluster jewels into passive tree jewel sockets via paste-item-text, dynamically generating subgraph nodes that can be allocated, nested, and persisted.

**Tech Stack:** Vanilla JS, WebGL2 (existing renderer), Vitest

---

## Data Flow

```
User clicks jewel socket on tree
  -> Popup with textarea to paste item text
  -> Parse item text -> extract cluster jewel properties
     (size, skill type, node count, notables, socket count)
  -> BuildSubgraph generates synthetic nodes positioned at proxy group
  -> Nodes added to PassiveSpec, connections generated
  -> Tree re-renders with new subgraph visible
  -> User can allocate subgraph nodes normally
  -> Nested: medium/small sockets in subgraph are clickable too
```

## Components

### 1. Cluster Jewel Data (`js/data/cluster-jewels.json`)

Converted from Lua `Data/ClusterJewels.lua` (~1050 lines). Contains:

- **Jewel definitions** for Small, Medium, Large:
  - `size`, `sizeIndex` (0/1/2), `minNodes`, `maxNodes`
  - `smallIndicies`, `notableIndicies`, `socketIndicies`, `totalIndicies`
  - `skills` map: tag -> `{ name, icon, masteryIcon?, stats[], enchant[] }`
- **`notableSortOrder`**: notable name -> sort key (for deterministic ordering)

### 2. Cluster Jewel Parser (`js/models/cluster-jewel.js`)

Parses pasted item text to extract cluster jewel properties. Port of the relevant parts of `Item.lua`:

**Input:** Raw item text (multi-line string)
**Output:**
```js
{
  baseName: "Large Cluster Jewel",   // determines size
  clusterJewelSkill: "affliction_fire_damage",
  clusterJewelNodeCount: 8,
  clusterJewelNotables: ["Cremator", "Smoking Remains"],
  clusterJewelSocketCount: 2,
  clusterJewelAddedMods: ["10% increased Fire Damage"],
  clusterJewelValid: true,
}
```

**Parsing rules:**
- Base name determines jewel size (matches key in `cluster-jewels.json`)
- Enchant line `"Added Small Passive Skills grant: X"` determines `clusterJewelSkill` by matching against skill enchant text
- Enchant `"N Added Passive Skills are Jewel Sockets"` -> `clusterJewelSocketCount`
- Enchant `"Adds N Passive Skills"` -> `clusterJewelNodeCount`
- Explicit mods with notable names (matched against `clusterNodeMap`) -> `clusterJewelNotables`
- Remaining explicit mods -> `clusterJewelAddedMods` (stats added to small passives)

### 3. Subgraph Builder (`js/tree/subgraph-builder.js`)

Port of `PassiveSpec:BuildSubgraph` (~450 lines Lua). Core algorithm:

**Input:** Parsed cluster jewel data + parent socket node + TreeData
**Output:** Subgraph object with synthetic nodes and connection info

**Algorithm:**
1. Compute subgraph ID using bit-packed format (see Node ID Scheme below)
2. Locate proxy group from `parentSocket.expansionJewel.proxy`
3. Handle downsizing (large jewel in large socket, medium jewel in large socket, etc.)
4. Create nodes in three passes:
   - **Sockets** at `socketIndicies` positions
   - **Notables** at `notableIndicies` positions (sorted by `notableSortOrder`)
   - **Small passives** filling remaining `smallIndicies` positions
5. Translate orbit indices from cluster-jewel-relative to tree `skillsPerOrbit`-relative (12<->16 mapping)
6. Compute node positions using orbit angles (reuse existing `buildOrbitAngles`)
7. Generate connections: link sequential nodes around the orbit, close loop for non-Small, link entrance to parent socket
8. For each socket node in subgraph, recursively build nested subgraphs

**Node ID Scheme (matching PoB):**
- Bit 16: always 1 (signal bit, prevents collision with real node IDs)
- Bits 0-3: Node index within subgraph (0-11)
- Bits 4-5: Group size index (0=Small, 1=Medium, 2=Large)
- Bits 6-8: Large socket index (0-5)
- Bits 9-10: Medium socket index (0-2)

### 4. PassiveSpec Extensions (`js/models/passive-spec.js`)

New state:
- `this.jewels = new Map()` — socketNodeId -> parsed cluster jewel data
- `this.subGraphs = new Map()` — subgraphId -> `{ nodes[], group, parentSocketId, entranceNodeId }`

New methods:
- `equipJewel(socketNodeId, parsedJewel)` — stores jewel, calls subgraph builder, adds synthetic nodes to `this.tree.nodes`, rebuilds
- `unequipJewel(socketNodeId)` — removes subgraph nodes, deallocates them, removes from tree
- `rebuildSubgraphs()` — rebuilds all subgraphs (called after tree changes)

Synthetic nodes participate in allocation/pathing/stats like normal nodes. The `findShortestPath` BFS naturally traverses into subgraph nodes since they're linked to the parent socket.

### 5. Tree Interaction (`js/app.js`)

Click handler changes:
- Clicking a `jewel` node that has `expansionJewel.size === 2` (outer large socket) and no equipped jewel -> shows equip popup
- Clicking a `jewel` node inside a subgraph (nested socket) -> shows equip popup for that socket
- Equip popup: textarea to paste item text + "Equip" / "Cancel" buttons
- If socket already has a jewel, show "Unequip" button instead
- Plain jewel sockets (no `expansionJewel`, inner tree sockets) -> no cluster jewel support (these are for regular jewels)

### 6. Rendering

Synthetic nodes render through the existing node layer system:
- Subgraph nodes are added to `treeData.nodes` so `buildNodeLayers` picks them up automatically
- Group backgrounds for subgraph groups use the expansion-style group background sprites (`GroupBackgroundSmallAlt`, `GroupBackgroundMediumAlt`, `GroupBackgroundLargeHalfAlt`)
- Connections between subgraph nodes use the existing arc/straight connection logic

### 7. Persistence (`js/io/build-xml.js`)

Jewel socket assignments stored in build XML within `<Spec>`:
```xml
<Spec ...>
  <Sockets>
    <Socket nodeId="26725" itemText="Large Cluster Jewel&#10;...encoded item text..." />
  </Sockets>
</Spec>
```

Import: parse `<Socket>` elements, decode item text, equip jewels.
Export: serialize equipped jewels back to XML.

Share code round-trip: jewel data survives encode/decode since it's part of the XML.

### 8. Cluster Notable Data

The tree JSON contains cluster-specific notable nodes (with `isBlighted` or without a group). These are stored in `TreeData.clusterNodeMap` (name -> node data) for lookup when building subgraphs. The notables provide `name`, `stats`, and `icon`.

---

## Node Position Calculation

Subgraph nodes are positioned on orbits around the proxy group center, using the same angle/radius system as the main tree:

```js
x = group.x + sin(angle) * orbitRadii[orbit]
y = group.y - cos(angle) * orbitRadii[orbit]
```

The orbit index translation handles the mismatch between cluster jewel indices (totalIndicies: 6/12/12) and tree orbit sizes (skillsPerOrbit: 6/16/16):

```js
// 12 -> 16 mapping
[0] = 0, [1] = 1, [2] = 3, [3] = 4, [4] = 5, [5] = 7,
[6] = 8, [7] = 9, [8] = 11, [9] = 12, [10] = 13, [11] = 15
```

---

## What's NOT Included (YAGNI)

- **Full Items tab jewel management** — deferred; jewels managed via tree socket popup only
- **Regular jewel effects** — radius-based stat transformations, Timeless/Legion jewels
- **Cluster jewel keystones** — Voices and similar special cluster keystones
- **Charm sockets** — separate system
- **Item editor/builder UI** — paste-only for now
- **Blighted nodes** — deferred

## Verification

1. Paste a Large Cluster Jewel with 2 sockets + 2 notables -> subgraph appears with correct node layout
2. Allocate nodes in the subgraph -> stats appear in sidebar
3. Paste a Medium Cluster Jewel into a nested socket -> second subgraph appears
4. Unequip outer jewel -> all nested subgraphs removed
5. Export build -> reimport -> cluster jewels preserved
6. Import a PoB share code with cluster jewels -> subgraphs display correctly
