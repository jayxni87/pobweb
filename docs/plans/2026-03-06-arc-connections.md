# Arc Connections Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render curved arc connections between passive tree nodes that share the same group and orbit, matching the original Path of Building behavior.

**Architecture:** Two-part fix: (1) correct node orbit angles to use PoB's non-uniform spacing for 16-node and 40-node orbits, and store each node's angle; (2) detect same-orbit connections and render them as segmented arcs along the orbit circle instead of straight lines. We use the existing flat-colored connection shader with arc polylines rather than introducing textured kite quads, which keeps the change small and avoids a new shader.

**Tech Stack:** Vanilla JS, WebGL2 (existing shaders), Vitest

---

## Background

### The Problem

The JS tree renders all node connections as straight lines. In PoB (and the real game), connections between nodes on the same orbit ring of a group follow the curve of that ring. About 1,537 of ~3,110 connections are arcs.

Additionally, nodes on 16-node and 40-node orbits are currently placed at uniform angular spacing, but PoB uses specific non-uniform degree patterns (e.g., every 30 and 45 degrees for 16-node orbits). This means node positions are slightly wrong for those orbits.

### How PoB Does It

**Node angles** (`PassiveTree.lua:825,967-988`):
- Orbit 0: 1 node at angle 0
- Orbit with 16 nodes: `[0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]` degrees
- Orbit with 40 nodes: `[0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350]` degrees
- All others: uniform `360 * i / N` degrees
- Position: `x = group.x + sin(angle) * radius`, `y = group.y - cos(angle) * radius`

**Arc detection** (`PassiveTree.lua:871`): `node1.g == node2.g and node1.o == node2.o`

**Arc geometry** (`PassiveTree.lua:925-965`): PoB renders arcs as textured kite-shaped quads using pre-rendered 90-degree arc sprites per orbit. For simplicity, we approximate arcs with polyline segments using the existing connection shader.

### Current JS Angle Convention

```js
// tree-data.js:92 — WRONG for 16 and 40-node orbits
const angle = (2 * Math.PI * node.orbitIndex) / nodesInOrbit - Math.PI / 2;
node.x = group.x + radius * Math.cos(angle);
node.y = group.y + radius * Math.sin(angle);
```

### Target JS Angle Convention (matching PoB)

```js
const angle = orbitAngles[node.orbitIndex];  // from lookup table, in radians
node.x = group.x + Math.sin(angle) * radius;
node.y = group.y - Math.cos(angle) * radius;
```

### Orbit Distribution in Tree Data

| Orbit | Radius | Nodes/Orbit | Count | Angle Pattern |
|-------|--------|-------------|-------|---------------|
| 0     | 0      | 1           | 586   | N/A (center)  |
| 1     | 82     | 6           | 51    | Uniform       |
| 2     | 162    | 16          | 1411  | Non-uniform   |
| 3     | 335    | 16          | 450   | Non-uniform   |
| 4     | 493    | 40          | 197   | Non-uniform   |
| 5     | 662    | 72          | 14    | Uniform       |
| 6     | 846    | 72          | 34    | Uniform       |

---

## Task 1: Fix Orbit Angles and Store Node Angle

**Files:**
- Modify: `js/tree/tree-data.js`
- Test: `js/tree/__tests__/tree-data.test.js`

### Step 1: Write the failing test

Add to `tree-data.test.js`:

```js
describe('orbit angle calculation', () => {
  it('places 16-node orbit nodes at non-uniform angles', () => {
    // In a 16-node orbit, index 1 should be at 30 degrees, not 22.5
    // Build minimal tree data with a group at origin and a node at orbit 2, index 1
    const json = {
      constants: {
        orbitRadii: [0, 82, 162],
        skillsPerOrbit: [1, 6, 16],
      },
      groups: { 1: { x: 0, y: 0 } },
      nodes: {
        100: { skill: 100, name: 'Test', group: 1, orbit: 2, orbitIndex: 1, out: [], in: [] },
      },
      classes: [],
    };
    const tree = new TreeData(json);
    const node = tree.getNode(100);
    // PoB: angle = 30 degrees = pi/6
    // x = sin(pi/6) * 162 = 0.5 * 162 = 81
    // y = -cos(pi/6) * 162 = -0.866 * 162 = -140.3
    expect(node.x).toBeCloseTo(81, 0);
    expect(node.y).toBeCloseTo(-140.3, 0);
  });

  it('stores the computed angle on each node', () => {
    const json = {
      constants: {
        orbitRadii: [0, 82, 162],
        skillsPerOrbit: [1, 6, 16],
      },
      groups: { 1: { x: 0, y: 0 } },
      nodes: {
        100: { skill: 100, name: 'Test', group: 1, orbit: 2, orbitIndex: 0, out: [], in: [] },
      },
      classes: [],
    };
    const tree = new TreeData(json);
    const node = tree.getNode(100);
    expect(node.angle).toBeCloseTo(0, 5); // orbit index 0 = 0 degrees
  });

  it('uses uniform spacing for 6-node orbits', () => {
    const json = {
      constants: {
        orbitRadii: [0, 82],
        skillsPerOrbit: [1, 6],
      },
      groups: { 1: { x: 0, y: 0 } },
      nodes: {
        100: { skill: 100, name: 'Test', group: 1, orbit: 1, orbitIndex: 1, out: [], in: [] },
      },
      classes: [],
    };
    const tree = new TreeData(json);
    const node = tree.getNode(100);
    // 6 nodes, uniform: index 1 = 60 degrees = pi/3
    // x = sin(pi/3) * 82 = 0.866 * 82 = 71.0
    // y = -cos(pi/3) * 82 = -0.5 * 82 = -41
    expect(node.x).toBeCloseTo(71.0, 0);
    expect(node.y).toBeCloseTo(-41, 0);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run js/tree/__tests__/tree-data.test.js`
Expected: FAIL — node positions use old uniform formula, `node.angle` is undefined

### Step 3: Implement orbit angle lookup + position fix

In `tree-data.js`, add the orbit angle lookup table builder before `_load`, and update the position calculation:

```js
// Precompute orbit angles matching PoB's CalcOrbitAngles
function buildOrbitAngles(skillsPerOrbit) {
  const DEG = Math.PI / 180;
  return skillsPerOrbit.map(n => {
    if (n === 16) {
      return [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330].map(d => d * DEG);
    }
    if (n === 40) {
      return [0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350].map(d => d * DEG);
    }
    const angles = [];
    for (let i = 0; i < n; i++) angles.push((2 * Math.PI * i) / n);
    return angles;
  });
}
```

Then in `_load`, replace the angle/position computation:

```js
const orbitAngles = buildOrbitAngles(skillsPerOrbit);

// ... inside the node loop, replace lines 90-94:
const radius = orbitRadii[node.orbit] || 0;
const angles = orbitAngles[node.orbit];
const angle = angles ? (angles[node.orbitIndex] || 0) : 0;
node.angle = angle;
node.x = group.x + Math.sin(angle) * radius;
node.y = group.y - Math.cos(angle) * radius;
```

### Step 4: Run test to verify it passes

Run: `npx vitest run js/tree/__tests__/tree-data.test.js`
Expected: PASS

### Step 5: Run full test suite

Run: `npx vitest run`
Expected: All tests pass. Some tree-renderer tests may need minor coord adjustments if they use hardcoded positions from the old angle formula.

### Step 6: Commit

```bash
git add js/tree/tree-data.js js/tree/__tests__/tree-data.test.js
git commit -m "fix: use non-uniform orbit angles for 16/40-node orbits matching PoB"
```

---

## Task 2: Generate Arc Segments in `buildConnectionInstances`

**Files:**
- Modify: `js/tree/tree-renderer.js` (the `buildConnectionInstances` function)
- Test: `js/tree/__tests__/tree-renderer.test.js`

### Step 1: Write the failing test

Add to `tree-renderer.test.js`:

```js
describe('arc connections', () => {
  it('generates arc segments for same-group same-orbit connections', () => {
    // Two nodes in orbit 2 of group 1, 90 degrees apart
    const DEG = Math.PI / 180;
    const treeData = {
      nodes: {
        1: { id: 1, type: 'normal', group: 1, orbit: 2, angle: 0, adjacent: [2],
             x: 0, y: -162, ascendancy: null },
        2: { id: 2, type: 'normal', group: 1, orbit: 2, angle: 90 * DEG, adjacent: [1],
             x: 162, y: 0, ascendancy: null },
      },
      groups: { 1: { x: 0, y: 0 } },
    };
    const connections = buildConnectionInstances(treeData, null);
    // Should produce multiple segments (arc), not just 1 straight line
    expect(connections.length).toBeGreaterThan(1);
    // All segments should lie approximately on the circle of radius 162
    for (const c of connections) {
      const r1 = Math.sqrt(c.x1 * c.x1 + c.y1 * c.y1);
      const r2 = Math.sqrt(c.x2 * c.x2 + c.y2 * c.y2);
      expect(r1).toBeCloseTo(162, -1); // within ~10 units
      expect(r2).toBeCloseTo(162, -1);
    }
  });

  it('generates a single straight connection for different-orbit nodes', () => {
    const treeData = {
      nodes: {
        1: { id: 1, type: 'normal', group: 1, orbit: 1, angle: 0, adjacent: [2],
             x: 0, y: -82, ascendancy: null },
        2: { id: 2, type: 'normal', group: 1, orbit: 2, angle: 0, adjacent: [1],
             x: 0, y: -162, ascendancy: null },
      },
      groups: { 1: { x: 0, y: 0 } },
    };
    const connections = buildConnectionInstances(treeData, null);
    expect(connections.length).toBe(1);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run js/tree/__tests__/tree-renderer.test.js`
Expected: FAIL — currently all connections are single straight lines

### Step 3: Implement arc generation

In `buildConnectionInstances` in `tree-renderer.js`, after the existing skip-checks and before pushing a straight line, detect same-orbit pairs and generate arc segments:

```js
// Inside buildConnectionInstances, replace the connection push logic:

// Check if this is a same-orbit connection (should be an arc)
const sameOrbit = node.group === adjNode.group
  && node.orbit === adjNode.orbit
  && node.orbit > 0
  && node.angle !== undefined
  && adjNode.angle !== undefined;

if (sameOrbit) {
  // Generate arc segments along the orbit circle
  const group = treeData.groups[node.group];
  if (group) {
    const radius = Math.sqrt(
      (node.x - group.x) ** 2 + (node.y - group.y) ** 2
    );
    // Determine arc direction (shortest path)
    let startAngle = node.angle;
    let endAngle = adjNode.angle;
    let arcSpan = endAngle - startAngle;
    // Normalize to [-PI, PI]
    if (arcSpan > Math.PI) arcSpan -= 2 * Math.PI;
    if (arcSpan < -Math.PI) arcSpan += 2 * Math.PI;

    const ARC_SEGMENTS = 16;
    const segCount = Math.max(2, Math.round(Math.abs(arcSpan) / (Math.PI / 2) * ARC_SEGMENTS));
    for (let s = 0; s < segCount; s++) {
      const t0 = s / segCount;
      const t1 = (s + 1) / segCount;
      const a0 = startAngle + arcSpan * t0;
      const a1 = startAngle + arcSpan * t1;
      connections.push({
        x1: group.x + Math.sin(a0) * radius,
        y1: group.y - Math.cos(a0) * radius,
        x2: group.x + Math.sin(a1) * radius,
        y2: group.y - Math.cos(a1) * radius,
        width: bothAllocated ? 8 : 5,
        color,
      });
    }
  }
} else {
  connections.push({
    x1: node.x, y1: node.y,
    x2: adjNode.x, y2: adjNode.y,
    width: bothAllocated ? 8 : 5,
    color,
  });
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run js/tree/__tests__/tree-renderer.test.js`
Expected: PASS

### Step 5: Run full test suite

Run: `npx vitest run`
Expected: All tests pass

### Step 6: Commit

```bash
git add js/tree/tree-renderer.js js/tree/__tests__/tree-renderer.test.js
git commit -m "feat: render curved arc connections for same-orbit node pairs"
```

---

## Task 3: Fix Any Broken Tests from Angle Change

Task 1 changes the angle convention and node positions globally. Existing tests that hardcode node positions or use the old angle formula may break. This task is a catch-all for updating those tests.

**Files:**
- Modify: any test files that fail after Task 1
- Likely: `js/tree/__tests__/tree-renderer.test.js`, `js/tree/__tests__/tree-interaction.test.js`

### Step 1: Run full test suite

Run: `npx vitest run`
Identify any failures caused by changed node positions.

### Step 2: Update test fixtures

For each failing test, update hardcoded node positions to match the new angle convention. Tests that construct their own tree data with explicit `x`/`y` values and don't go through `TreeData._load()` should be unaffected. Tests that rely on `TreeData` loading from JSON may need position updates.

### Step 3: Verify all tests pass

Run: `npx vitest run`
Expected: All tests pass

### Step 4: Commit

```bash
git add -u
git commit -m "test: update fixtures for new orbit angle convention"
```

---

## What We're NOT Implementing (YAGNI)

- **Textured connection rendering**: PoB uses textured quads with gradient-edged line art and pre-rendered orbit arc sprites. The segmented polyline approach looks good enough and avoids adding a new shader and texture loading pipeline for connections.
- **Line connector textures**: The `LineConnectorNormal`/`Active` sprites and `Orbit{N}Normal`/`Active` sprites exist in the sprite sheet but aren't needed for flat-colored polylines.
- **Intermediate connection state**: PoB has a third "Intermediate" connection state for partially-allocated paths. Not implemented yet.
- **Split arcs > 90 degrees**: PoB splits large arcs into two kite quads to avoid texture distortion. With polyline segments, there's no distortion to worry about.

## Verification

1. **Visual**: Load the tree, zoom into a cluster of nodes. Connections between nodes on the same orbit ring should follow the ring's curve, not cut across as straight lines.
2. **16-node orbit check**: Nodes on orbit 2 (radius 162, 16 nodes) should be at non-uniform spacing — pairs at 30/45/60 degree gaps, not all at 22.5 degrees.
3. **Import test**: Import a share code → nodes should land at the correct positions on their orbit rings.
4. **Performance**: The tree has ~1,537 arc connections × ~8 segments each ≈ 12K extra line instances. Combined with ~1,573 straight lines, total ~14K connection instances. The existing instanced renderer handles this fine.
