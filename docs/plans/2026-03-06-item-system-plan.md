# Item System + Calc Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the full item system: base data, XML import with slot assignment, item model with local calc, mod parser, and calc pipeline integration — so that equipped items contribute stats to the build calculation.

**Architecture:** Bottom-up. Convert Lua base data → fix XML import → enhance item model with base resolution + local calc → build mod parser → wire items into CalcSetup. UI comes in a later plan.

**Tech Stack:** Vitest for testing, existing `tools/convert-lua-data.js` for Lua→JSON conversion, existing `js/engine/mod-db.js` + `js/engine/mod-list.js` for modifier storage.

---

### Task 1: Convert Lua Base Data to JSON

The 22 base data files at `js/data/bases/*.json` are all empty stubs (`"__REF:local"`). The Lua source files at `PathOfBuilding/src/Data/Bases/*.lua` contain the real data. The existing converter tool handles Lua→JSON but the `itemBases = ...` preamble needs a wrapper.

**Files:**
- Modify: `tools/convert-lua-data.js` (add base-specific conversion that wraps the `itemBases = ...` preamble)
- Output: `js/data/bases/*.json` (22 files, overwrite stubs)
- Test: `js/data/__tests__/bases.test.js` (create)

**Step 1: Write the failing test**

Create `js/data/__tests__/bases.test.js`:

```js
import { describe, it, expect } from 'vitest';
import sword from '../bases/sword.json';
import body from '../bases/body.json';
import shield from '../bases/shield.json';

describe('base data: sword', () => {
  it('has Rusted Sword with weapon stats', () => {
    const base = sword['Rusted Sword'];
    expect(base).toBeDefined();
    expect(base.type).toBe('One Handed Sword');
    expect(base.weapon).toBeDefined();
    expect(base.weapon.PhysicalMin).toBe(4);
    expect(base.weapon.PhysicalMax).toBe(9);
    expect(base.weapon.CritChanceBase).toBe(5);
    expect(base.weapon.AttackRateBase).toBe(1.55);
    expect(base.weapon.Range).toBe(11);
  });

  it('has requirements', () => {
    const base = sword['Copper Sword'];
    expect(base.req).toBeDefined();
    expect(base.req.level).toBe(5);
    expect(base.req.str).toBe(14);
    expect(base.req.dex).toBe(14);
  });

  it('has tags', () => {
    const base = sword['Rusted Sword'];
    expect(base.tags).toBeDefined();
    expect(base.tags.sword).toBe(true);
    expect(base.tags.weapon).toBe(true);
  });

  it('has implicit', () => {
    const base = sword['Rusted Sword'];
    expect(base.implicit).toBe('40% increased Global Accuracy Rating');
  });
});

describe('base data: body armour', () => {
  it('has Plate Vest with armour stats', () => {
    const base = body['Plate Vest'];
    expect(base).toBeDefined();
    expect(base.type).toBe('Body Armour');
    expect(base.subType).toBe('Armour');
    expect(base.armour).toBeDefined();
    expect(base.armour.ArmourBaseMin).toBe(19);
    expect(base.armour.ArmourBaseMax).toBe(27);
  });
});

describe('base data: shield', () => {
  it('has Splintered Tower Shield with block chance', () => {
    const base = shield['Splintered Tower Shield'];
    expect(base).toBeDefined();
    expect(base.armour.BlockChance).toBe(24);
    expect(base.armour.ArmourBaseMin).toBe(9);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/data/__tests__/bases.test.js`
Expected: FAIL (json files contain `"__REF:local"` string, not objects)

**Step 3: Update the converter and run it**

The Lua base files use `local itemBases = ...` as a preamble, then `itemBases["Name"] = { ... }` assignments. The existing `parseLuaTable` can't handle this directly. Add a `convertBases()` function to `tools/convert-lua-data.js` that:

1. Reads each Lua base file
2. Strips the `local itemBases = ...` preamble
3. Converts each `itemBases["Name"] = { ... }` block into a key-value pair
4. Writes the resulting object as JSON

Add this function to `tools/convert-lua-data.js` after the existing `convertDirectory` function:

```js
function convertBases(inputDir, outputDir) {
  for (const entry of readdirSync(inputDir)) {
    if (extname(entry) !== '.lua') continue;
    const fullPath = join(inputDir, entry);
    const lua = readFileSync(fullPath, 'utf-8');

    // Parse all itemBases["Name"] = { ... } assignments into an object
    const result = {};
    const regex = /itemBases\["([^"]+)"\]\s*=\s*\{/g;
    let match;
    while ((match = regex.exec(lua)) !== null) {
      const name = match[1];
      const startPos = match.index + match[0].length - 1; // position of opening {
      // Use parseLuaTable to parse from the opening {
      const tableStr = lua.substring(startPos);
      const parsed = parseLuaTable(tableStr);
      if (parsed && typeof parsed === 'object') {
        result[name] = parsed;
      }
    }

    const outName = basename(entry, '.lua') + '.json';
    const outputPath = join(outputDir, outName);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(result, null, 0));
    const inSize = (statSync(fullPath).size / 1024).toFixed(0);
    const outSize = (statSync(outputPath).size / 1024).toFixed(0);
    console.log(`  ${basename(entry)} (${inSize}KB) → ${outName} (${outSize}KB)`);
  }
}
```

Then update the CLI section to call `convertBases` instead of `convertDirectory` for bases:

```js
console.log('\n--- Bases ---');
convertBases(join(POB_SRC, 'Data', 'Bases'), join(OUT_DIR, 'bases'));
```

**Step 4: Run the converter**

Run: `node tools/convert-lua-data.js`
Expected: All 22 base files converted with actual data.

**Step 5: Run test to verify it passes**

Run: `npx vitest run js/data/__tests__/bases.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add tools/convert-lua-data.js js/data/bases/*.json js/data/__tests__/bases.test.js
git commit -m "feat: convert Lua base data to JSON (22 weapon/armour/jewelry base files)"
```

---

### Task 2: Fix XML Parser for PoB Item/Slot Format

The PoB XML format stores items and slot assignments differently than our current parser handles:

```xml
<Items activeItemSet="1">
  <Item id="1" variant="2">Raw item text</Item>
  <Item id="2">Raw item text</Item>
  <ItemSet id="1">
    <Slot name="Weapon 1" itemId="1"/>
    <Slot name="Body Armour" itemId="2"/>
  </ItemSet>
</Items>
```

Our current parser (`js/io/build-xml.js`) stores items as `{slot, raw}` but:
- PoB items have `id` attributes (not `slot`)
- Slot assignments come from `<Slot name="..." itemId="N"/>` inside `<ItemSet>`
- We need to build an `itemById` map, then resolve `<Slot>` references

**Files:**
- Modify: `js/io/build-xml.js:109-245` (parseXmlSimple) and `js/io/build-xml.js:273-372` (parseDom)
- Modify: `js/io/build-xml.js:4-19` (Build class — add `itemSlots` field)
- Test: `js/io/__tests__/build-xml.test.js` (add tests)

**Step 1: Write the failing test**

Add to `js/io/__tests__/build-xml.test.js`:

```js
describe('xmlToBuild - PoB item format', () => {
  it('parses Item elements with id and resolves Slot references', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Marauder" level="90" ascendClassName="Berserker" buildName="Test"/>
  <Tree><Spec treeVersion="3_25" classId="1" ascendClassId="0" nodes=""/></Tree>
  <Skills/>
  <Items activeItemSet="1">
    <Item id="1">Rarity: Rare
Havoc Bite
Vaal Axe
--------
Adds 10 to 20 Physical Damage</Item>
    <Item id="2">Rarity: Unique
Tabula Rasa
Simple Robe</Item>
    <ItemSet id="1">
      <Slot name="Weapon 1" itemId="1"/>
      <Slot name="Body Armour" itemId="2"/>
    </ItemSet>
  </Items>
  <Config/>
  <Notes/>
</PathOfBuilding>`;

    const build = xmlToBuild(xml);

    // Items should be stored by id
    expect(build.itemsById).toBeDefined();
    expect(build.itemsById['1']).toBeDefined();
    expect(build.itemsById['2']).toBeDefined();

    // Slot assignments should be resolved
    expect(build.itemSlots).toBeDefined();
    expect(build.itemSlots['Weapon 1']).toBe('1');
    expect(build.itemSlots['Body Armour']).toBe('2');

    // Legacy items array should still be populated for backwards compat
    expect(build.items.length).toBe(2);
    expect(build.items[0].slot).toBe('Weapon 1');
    expect(build.items[0].raw).toContain('Havoc Bite');
    expect(build.items[1].slot).toBe('Body Armour');
    expect(build.items[1].raw).toContain('Tabula Rasa');
  });

  it('handles items without any ItemSet (legacy Slot format)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Witch" level="1" ascendClassName="" buildName=""/>
  <Tree/>
  <Skills/>
  <Items>
    <Item id="1">Rarity: Normal
Iron Ring</Item>
    <Slot name="Ring 1" itemId="1"/>
  </Items>
  <Config/>
  <Notes/>
</PathOfBuilding>`;

    const build = xmlToBuild(xml);
    expect(build.itemSlots['Ring 1']).toBe('1');
    expect(build.items.length).toBe(1);
    expect(build.items[0].slot).toBe('Ring 1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/io/__tests__/build-xml.test.js`
Expected: FAIL (itemsById and itemSlots not populated)

**Step 3: Implement the fix**

In `js/io/build-xml.js`:

1. Add `itemsById` and `itemSlots` to the `Build` constructor:
```js
this.itemsById = opts.itemsById || {};  // id -> raw text
this.itemSlots = opts.itemSlots || {};  // slotName -> itemId
```

2. In `parseXmlSimple`, after parsing items by id (the existing `itemById` map at line ~128-137), also parse `<Slot>` tags at the `<Items>` level AND inside `<ItemSet>` blocks. Then build the `items` array from resolved slots:

```js
// Parse <Slot> at Items level (legacy format)
const topSlotRegex = /<Items[^>]*>([\s\S]*?)<\/Items>/;
const itemsBlock = topSlotRegex.exec(xml);
if (itemsBlock) {
  // Legacy top-level <Slot> tags
  const legacySlotRegex = /<Slot\s+name="([^"]*)"\s+itemId="([^"]*)"\s*\/>/g;
  let slotMatch;
  const block = itemsBlock[1];
  // Only match slots NOT inside <ItemSet>
  const beforeItemSets = block.split(/<ItemSet/)[0];
  while ((slotMatch = legacySlotRegex.exec(beforeItemSets)) !== null) {
    build.itemSlots[slotMatch[1]] = slotMatch[2];
  }

  // Parse <ItemSet> blocks
  const itemSetRegex = /<ItemSet[^>]*>([\s\S]*?)<\/ItemSet>/g;
  let setMatch;
  let firstSet = true;
  while ((setMatch = itemSetRegex.exec(block)) !== null) {
    if (firstSet) {
      const setSlotRegex = /<Slot\s+name="([^"]*)"\s+itemId="([^"]*)"/g;
      let ss;
      while ((ss = setSlotRegex.exec(setMatch[1])) !== null) {
        build.itemSlots[ss[1]] = ss[2];
      }
      firstSet = false;
    }
  }
}

build.itemsById = itemById;

// Build items array from slot assignments
for (const [slotName, itemId] of Object.entries(build.itemSlots)) {
  if (itemById[itemId]) {
    build.items.push({ slot: slotName, raw: itemById[itemId] });
  }
}
```

3. Apply the same logic to `parseDom`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run js/io/__tests__/build-xml.test.js`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (no regressions)

**Step 6: Commit**

```bash
git add js/io/build-xml.js js/io/__tests__/build-xml.test.js
git commit -m "fix: parse PoB XML Item/Slot/ItemSet format for proper item slot assignment"
```

---

### Task 3: Base Type Registry

Create a registry that loads all base data and provides lookup by base name. Items need this to resolve their base type for weapon/armour stats.

**Files:**
- Create: `js/data/base-types.js`
- Test: `js/data/__tests__/base-types.test.js` (create)

**Step 1: Write the failing test**

Create `js/data/__tests__/base-types.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { BaseTypeRegistry } from '../base-types.js';

describe('BaseTypeRegistry', () => {
  let registry;

  beforeAll(() => {
    registry = new BaseTypeRegistry();
  });

  it('finds weapon bases by name', () => {
    const base = registry.get('Rusted Sword');
    expect(base).toBeDefined();
    expect(base.type).toBe('One Handed Sword');
    expect(base.weapon.PhysicalMin).toBe(4);
  });

  it('finds armour bases by name', () => {
    const base = registry.get('Plate Vest');
    expect(base).toBeDefined();
    expect(base.type).toBe('Body Armour');
    expect(base.armour.ArmourBaseMin).toBe(19);
  });

  it('finds jewelry bases by name', () => {
    const base = registry.get('Iron Ring');
    expect(base).toBeDefined();
    expect(base.type).toBe('Ring');
  });

  it('returns null for unknown bases', () => {
    expect(registry.get('Nonexistent Base')).toBeNull();
  });

  it('isWeapon returns true for weapon bases', () => {
    expect(registry.isWeapon('Rusted Sword')).toBe(true);
    expect(registry.isWeapon('Plate Vest')).toBe(false);
  });

  it('isArmour returns true for armour bases', () => {
    expect(registry.isArmour('Plate Vest')).toBe(true);
    expect(registry.isArmour('Rusted Sword')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/data/__tests__/base-types.test.js`
Expected: FAIL (module doesn't exist)

**Step 3: Implement**

Create `js/data/base-types.js`:

```js
// Base Type Registry - loads all base item data and provides lookup by name
import amulet from './bases/amulet.json';
import axe from './bases/axe.json';
import belt from './bases/belt.json';
import body from './bases/body.json';
import boots from './bases/boots.json';
import bow from './bases/bow.json';
import claw from './bases/claw.json';
import dagger from './bases/dagger.json';
import flask from './bases/flask.json';
import gloves from './bases/gloves.json';
import helmet from './bases/helmet.json';
import jewel from './bases/jewel.json';
import mace from './bases/mace.json';
import quiver from './bases/quiver.json';
import ring from './bases/ring.json';
import shield from './bases/shield.json';
import staff from './bases/staff.json';
import sword from './bases/sword.json';
import wand from './bases/wand.json';

const WEAPON_TYPES = new Set([
  'One Handed Sword', 'Two Handed Sword', 'Thrusting One Handed Sword',
  'One Handed Axe', 'Two Handed Axe',
  'One Handed Mace', 'Two Handed Mace', 'Sceptre',
  'Bow', 'Claw', 'Dagger', 'Rune Dagger', 'Wand', 'Staff', 'Warstaff',
  'Fishing Rod',
]);

const ARMOUR_TYPES = new Set([
  'Body Armour', 'Helmet', 'Gloves', 'Boots', 'Shield',
]);

const allBases = [
  amulet, axe, belt, body, boots, bow, claw, dagger,
  flask, gloves, helmet, jewel, mace, quiver, ring,
  shield, staff, sword, wand,
];

export class BaseTypeRegistry {
  constructor() {
    this._map = new Map();
    for (const baseFile of allBases) {
      for (const [name, data] of Object.entries(baseFile)) {
        this._map.set(name, data);
      }
    }
  }

  get(baseName) {
    return this._map.get(baseName) || null;
  }

  isWeapon(baseName) {
    const base = this.get(baseName);
    return base ? WEAPON_TYPES.has(base.type) : false;
  }

  isArmour(baseName) {
    const base = this.get(baseName);
    return base ? ARMOUR_TYPES.has(base.type) : false;
  }

  isShield(baseName) {
    const base = this.get(baseName);
    return base ? base.type === 'Shield' : false;
  }

  isJewelry(baseName) {
    const base = this.get(baseName);
    if (!base) return false;
    return base.type === 'Ring' || base.type === 'Amulet' || base.type === 'Belt';
  }

  allNames() {
    return [...this._map.keys()];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run js/data/__tests__/base-types.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/data/base-types.js js/data/__tests__/base-types.test.js
git commit -m "feat: add BaseTypeRegistry for item base type lookup"
```

---

### Task 4: Mod Parser (Common Patterns)

The mod parser converts item mod text lines (e.g. `"+50 to maximum Life"`, `"Adds 10 to 20 Physical Damage"`) into structured modifier objects that can be added to a ModDB. This is a simplified version of PoB's 6,641-line ModParser.lua — we cover the most common patterns first.

**Reference:** `PathOfBuilding/src/Modules/ModParser.lua` — the `parseMod` function.

**Files:**
- Create: `js/models/mod-parser.js`
- Test: `js/models/__tests__/mod-parser.test.js` (create)

**Step 1: Write the failing test**

Create `js/models/__tests__/mod-parser.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseMod } from '../mod-parser.js';

describe('parseMod', () => {
  describe('flat additions', () => {
    it('parses +N to maximum Life', () => {
      const mods = parseMod('+50 to maximum Life');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'Life', type: 'BASE', value: 50 });
    });

    it('parses +N to maximum Mana', () => {
      const mods = parseMod('+80 to maximum Mana');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'Mana', type: 'BASE', value: 80 });
    });

    it('parses +N to Strength', () => {
      const mods = parseMod('+20 to Strength');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'Str', type: 'BASE', value: 20 });
    });

    it('parses +N to all Attributes', () => {
      const mods = parseMod('+10 to all Attributes');
      expect(mods).toHaveLength(3);
      expect(mods.map(m => m.name).sort()).toEqual(['Dex', 'Int', 'Str']);
      for (const m of mods) {
        expect(m.type).toBe('BASE');
        expect(m.value).toBe(10);
      }
    });
  });

  describe('resistances', () => {
    it('parses +N% to Fire Resistance', () => {
      const mods = parseMod('+40% to Fire Resistance');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'FireResist', type: 'BASE', value: 40 });
    });

    it('parses +N% to all Elemental Resistances', () => {
      const mods = parseMod('+15% to all Elemental Resistances');
      expect(mods).toHaveLength(3);
      const names = mods.map(m => m.name).sort();
      expect(names).toEqual(['ColdResist', 'FireResist', 'LightningResist']);
    });

    it('parses +N% to Chaos Resistance', () => {
      const mods = parseMod('+20% to Chaos Resistance');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'ChaosResist', type: 'BASE', value: 20 });
    });
  });

  describe('percentage increases', () => {
    it('parses N% increased maximum Life', () => {
      const mods = parseMod('10% increased maximum Life');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'Life', type: 'INC', value: 10 });
    });

    it('parses N% increased Attack Speed', () => {
      const mods = parseMod('15% increased Attack Speed');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'Speed', type: 'INC', value: 15, flags: expect.any(Number) });
    });

    it('parses N% reduced is negative INC', () => {
      const mods = parseMod('10% reduced Movement Speed');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'MovementSpeed', type: 'INC', value: -10 });
    });
  });

  describe('flat damage', () => {
    it('parses Adds N to N Physical Damage', () => {
      const mods = parseMod('Adds 10 to 20 Physical Damage');
      expect(mods).toHaveLength(2);
      expect(mods[0]).toMatchObject({ name: 'PhysicalMin', type: 'BASE', value: 10 });
      expect(mods[1]).toMatchObject({ name: 'PhysicalMax', type: 'BASE', value: 20 });
    });

    it('parses Adds N to N Fire Damage', () => {
      const mods = parseMod('Adds 5 to 10 Fire Damage');
      expect(mods).toHaveLength(2);
      expect(mods[0]).toMatchObject({ name: 'FireMin', type: 'BASE', value: 5 });
      expect(mods[1]).toMatchObject({ name: 'FireMax', type: 'BASE', value: 10 });
    });
  });

  describe('armour/evasion/ES', () => {
    it('parses +N to Armour', () => {
      const mods = parseMod('+100 to Armour');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'Armour', type: 'BASE', value: 100 });
    });

    it('parses N% increased Armour', () => {
      const mods = parseMod('50% increased Armour');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'Armour', type: 'INC', value: 50 });
    });

    it('parses +N to maximum Energy Shield', () => {
      const mods = parseMod('+40 to maximum Energy Shield');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'EnergyShield', type: 'BASE', value: 40 });
    });

    it('parses +N to Evasion Rating', () => {
      const mods = parseMod('+200 to Evasion Rating');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'Evasion', type: 'BASE', value: 200 });
    });
  });

  describe('crit', () => {
    it('parses N% increased Critical Strike Chance', () => {
      const mods = parseMod('25% increased Critical Strike Chance');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'CritChance', type: 'INC', value: 25 });
    });

    it('parses +N% to Global Critical Strike Multiplier', () => {
      const mods = parseMod('+30% to Global Critical Strike Multiplier');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toMatchObject({ name: 'CritMultiplier', type: 'BASE', value: 30 });
    });
  });

  describe('unrecognized mods', () => {
    it('returns empty array for unrecognized text', () => {
      const mods = parseMod('Some completely unknown mod text');
      expect(mods).toEqual([]);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/models/__tests__/mod-parser.test.js`
Expected: FAIL (module doesn't exist)

**Step 3: Implement the mod parser**

Create `js/models/mod-parser.js`:

```js
// Mod Parser — converts item mod text to structured modifier objects.
// Simplified port of ModParser.lua covering common patterns.

import { ModFlag, KeywordFlag } from '../engine/utils.js';
import { createMod } from '../engine/mod-tools.js';

// Pattern table: [regex, handler(match) => mod[] | null]
const PATTERNS = [];

function addPattern(regex, handler) {
  PATTERNS.push({ regex, handler });
}

// --- Flat additions ---

// +N to maximum Life/Mana/Energy Shield
addPattern(/^([+-]?\d+) to maximum (Life|Mana|Energy Shield)$/, (m) => {
  const val = parseInt(m[1], 10);
  const stat = m[2] === 'Energy Shield' ? 'EnergyShield' : m[2];
  return [createMod(stat, 'BASE', val, 'Item')];
});

// +N to Strength/Dexterity/Intelligence
addPattern(/^([+-]?\d+) to (Strength|Dexterity|Intelligence)$/, (m) => {
  const val = parseInt(m[1], 10);
  const name = { Strength: 'Str', Dexterity: 'Dex', Intelligence: 'Int' }[m[2]];
  return [createMod(name, 'BASE', val, 'Item')];
});

// +N to all Attributes
addPattern(/^([+-]?\d+) to all Attributes$/, (m) => {
  const val = parseInt(m[1], 10);
  return [
    createMod('Str', 'BASE', val, 'Item'),
    createMod('Dex', 'BASE', val, 'Item'),
    createMod('Int', 'BASE', val, 'Item'),
  ];
});

// +N to Strength and Dexterity (and other dual-stat combos)
addPattern(/^([+-]?\d+) to (Strength|Dexterity|Intelligence) and (Strength|Dexterity|Intelligence)$/, (m) => {
  const val = parseInt(m[1], 10);
  const map = { Strength: 'Str', Dexterity: 'Dex', Intelligence: 'Int' };
  return [
    createMod(map[m[2]], 'BASE', val, 'Item'),
    createMod(map[m[3]], 'BASE', val, 'Item'),
  ];
});

// --- Resistances ---

// +N% to Fire/Cold/Lightning/Chaos Resistance
addPattern(/^([+-]?\d+)% to (Fire|Cold|Lightning|Chaos) Resistance$/, (m) => {
  const val = parseInt(m[1], 10);
  return [createMod(`${m[2]}Resist`, 'BASE', val, 'Item')];
});

// +N% to all Elemental Resistances
addPattern(/^([+-]?\d+)% to all Elemental Resistances$/, (m) => {
  const val = parseInt(m[1], 10);
  return [
    createMod('FireResist', 'BASE', val, 'Item'),
    createMod('ColdResist', 'BASE', val, 'Item'),
    createMod('LightningResist', 'BASE', val, 'Item'),
  ];
});

// +N% to Fire and Cold Resistances (and other dual-resist combos)
addPattern(/^([+-]?\d+)% to (Fire|Cold|Lightning) and (Fire|Cold|Lightning) Resistances$/, (m) => {
  const val = parseInt(m[1], 10);
  return [
    createMod(`${m[2]}Resist`, 'BASE', val, 'Item'),
    createMod(`${m[3]}Resist`, 'BASE', val, 'Item'),
  ];
});

// --- Percentage increases/reductions ---

// N% increased/reduced maximum Life/Mana/Energy Shield
addPattern(/^(\d+)% (increased|reduced) maximum (Life|Mana|Energy Shield)$/, (m) => {
  const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
  const stat = m[3] === 'Energy Shield' ? 'EnergyShield' : m[3];
  return [createMod(stat, 'INC', val, 'Item')];
});

// N% increased/reduced Attack Speed
addPattern(/^(\d+)% (increased|reduced) Attack Speed$/, (m) => {
  const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
  return [createMod('Speed', 'INC', val, 'Item', ModFlag.Attack)];
});

// N% increased/reduced Cast Speed
addPattern(/^(\d+)% (increased|reduced) Cast Speed$/, (m) => {
  const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
  return [createMod('Speed', 'INC', val, 'Item', ModFlag.Cast)];
});

// N% increased/reduced Movement Speed
addPattern(/^(\d+)% (increased|reduced) Movement Speed$/, (m) => {
  const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
  return [createMod('MovementSpeed', 'INC', val, 'Item')];
});

// N% increased/reduced Armour/Evasion Rating/Energy Shield (local)
addPattern(/^(\d+)% (increased|reduced) (Armour|Evasion Rating|Energy Shield)$/, (m) => {
  const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
  const stat = { 'Armour': 'Armour', 'Evasion Rating': 'Evasion', 'Energy Shield': 'EnergyShield' }[m[3]];
  return [createMod(stat, 'INC', val, 'Item')];
});

// N% increased/reduced Armour and Evasion Rating (and other dual combos)
addPattern(/^(\d+)% (increased|reduced) (Armour|Evasion Rating|Energy Shield) and (Armour|Evasion Rating|Energy Shield)$/, (m) => {
  const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
  const map = { 'Armour': 'Armour', 'Evasion Rating': 'Evasion', 'Energy Shield': 'EnergyShield' };
  return [
    createMod(map[m[3]], 'INC', val, 'Item'),
    createMod(map[m[4]], 'INC', val, 'Item'),
  ];
});

// N% increased/reduced Global Physical Damage / Elemental Damage / etc
addPattern(/^(\d+)% (increased|reduced) (Physical|Fire|Cold|Lightning|Chaos|Elemental) Damage$/, (m) => {
  const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
  const keyMap = {
    Physical: { name: 'PhysicalDamage', kw: KeywordFlag.Physical },
    Fire: { name: 'FireDamage', kw: KeywordFlag.Fire },
    Cold: { name: 'ColdDamage', kw: KeywordFlag.Cold },
    Lightning: { name: 'LightningDamage', kw: KeywordFlag.Lightning },
    Chaos: { name: 'ChaosDamage', kw: KeywordFlag.Chaos },
    Elemental: { name: 'ElementalDamage', kw: 0 },
  };
  const { name, kw } = keyMap[m[3]];
  return [createMod(name, 'INC', val, 'Item', 0, kw)];
});

// --- Flat damage ---

// Adds N to N [Type] Damage / Adds N to N [Type] Damage to Attacks
addPattern(/^Adds (\d+) to (\d+) (Physical|Fire|Cold|Lightning|Chaos) Damage(?: to Attacks)?$/, (m) => {
  const min = parseInt(m[1], 10);
  const max = parseInt(m[2], 10);
  const type = m[3];
  return [
    createMod(`${type}Min`, 'BASE', min, 'Item'),
    createMod(`${type}Max`, 'BASE', max, 'Item'),
  ];
});

// Adds N to N [Type] Damage to Spells
addPattern(/^Adds (\d+) to (\d+) (Physical|Fire|Cold|Lightning|Chaos) Damage to Spells$/, (m) => {
  const min = parseInt(m[1], 10);
  const max = parseInt(m[2], 10);
  const type = m[3];
  return [
    createMod(`${type}Min`, 'BASE', min, 'Item', ModFlag.Spell),
    createMod(`${type}Max`, 'BASE', max, 'Item', ModFlag.Spell),
  ];
});

// --- Flat defences ---

// +N to Armour / +N to Evasion Rating
addPattern(/^([+-]?\d+) to (Armour|Evasion Rating|Energy Shield|Ward)$/, (m) => {
  const val = parseInt(m[1], 10);
  const stat = { 'Armour': 'Armour', 'Evasion Rating': 'Evasion', 'Energy Shield': 'EnergyShield', 'Ward': 'Ward' }[m[2]];
  return [createMod(stat, 'BASE', val, 'Item')];
});

// --- Critical strike ---

// N% increased Critical Strike Chance
addPattern(/^(\d+)% (increased|reduced) Critical Strike Chance$/, (m) => {
  const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
  return [createMod('CritChance', 'INC', val, 'Item')];
});

// +N% to Global Critical Strike Multiplier
addPattern(/^([+-]?\d+)% to Global Critical Strike Multiplier$/, (m) => {
  const val = parseInt(m[1], 10);
  return [createMod('CritMultiplier', 'BASE', val, 'Item')];
});

// N% increased Global Accuracy Rating / +N to Accuracy Rating
addPattern(/^([+-]?\d+) to Accuracy Rating$/, (m) => {
  const val = parseInt(m[1], 10);
  return [createMod('Accuracy', 'BASE', val, 'Item')];
});

addPattern(/^(\d+)% increased Global Accuracy Rating$/, (m) => {
  const val = parseInt(m[1], 10);
  return [createMod('Accuracy', 'INC', val, 'Item')];
});

// --- Life/mana on hit/leech ---

// +N Life gained on Kill
addPattern(/^([+-]?\d+) Life gained on Kill$/, (m) => {
  return [createMod('LifeOnKill', 'BASE', parseInt(m[1], 10), 'Item')];
});

// N% of Physical Attack Damage Leeched as Life
addPattern(/^(\d+(?:\.\d+)?)% of Physical Attack Damage Leeched as (Life|Mana)$/, (m) => {
  const val = parseFloat(m[1]);
  const stat = m[2] === 'Life' ? 'PhysicalDamageLifeLeech' : 'PhysicalDamageManaLeech';
  return [createMod(stat, 'BASE', val, 'Item', ModFlag.Attack)];
});

// --- Regen ---

// N Life Regenerated per second / N% of Life Regenerated per second
addPattern(/^(\d+(?:\.\d+)?) (Life|Mana|Energy Shield) Regenerated per second$/, (m) => {
  const val = parseFloat(m[1]);
  const stat = { Life: 'LifeRegen', Mana: 'ManaRegen', 'Energy Shield': 'EnergyShieldRegen' }[m[2]];
  return [createMod(stat, 'BASE', val, 'Item')];
});

/**
 * Parse a single mod line into an array of structured mods.
 * Returns empty array if the mod is unrecognized.
 */
export function parseMod(text) {
  // Strip leading/trailing whitespace and common prefixes
  const line = text.trim()
    .replace(/^\{[^}]*\}\s*/, '')  // strip {crafted}, {range:0.5}, etc.
    .replace(/\s*\([\w\s]+\)$/, ''); // strip trailing (implicit), (crafted), etc.

  for (const { regex, handler } of PATTERNS) {
    const match = line.match(regex);
    if (match) {
      const result = handler(match);
      if (result) return result;
    }
  }

  return [];
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run js/models/__tests__/mod-parser.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/models/mod-parser.js js/models/__tests__/mod-parser.test.js
git commit -m "feat: add mod parser for common item mod patterns"
```

---

### Task 5: Item Model Enhancement — Base Resolution + Local Calc

Enhance `js/models/item.js` to resolve the base type and compute weapon DPS / armour values from base stats + local mods + quality.

**Reference:** `PathOfBuilding/src/Classes/Item.lua:1375-1490` (`BuildModListForSlotNum`)

**Files:**
- Modify: `js/models/item.js`
- Modify: `js/models/__tests__/item.test.js` (add tests)

**Step 1: Write the failing tests**

Add to `js/models/__tests__/item.test.js`:

```js
import { BaseTypeRegistry } from '../../data/base-types.js';

describe('Item with base resolution', () => {
  const registry = new BaseTypeRegistry();

  it('resolves weapon base stats', () => {
    const item = new Item(`Rarity: Rare
Havoc Bite
Rusted Sword
--------
Quality: +20%
--------
Adds 10 to 20 Physical Damage
15% increased Attack Speed`);

    item.resolveBase(registry);

    expect(item.baseData).toBeDefined();
    expect(item.baseData.weapon).toBeDefined();
    expect(item.baseData.weapon.PhysicalMin).toBe(4);
    expect(item.baseData.weapon.PhysicalMax).toBe(9);
  });

  it('computes weapon DPS with local mods', () => {
    const item = new Item(`Rarity: Rare
Havoc Bite
Rusted Sword
--------
Quality: +20%
--------
Adds 10 to 20 Physical Damage`);

    item.resolveBase(registry);
    item.buildModList();

    expect(item.weaponData).toBeDefined();
    // Base: 4-9, flat added: 10-20, total: 14-29
    // Quality 20%: * 1.2 = 16.8-34.8 -> round to 17-35
    // Attack rate: 1.55
    // PhysDPS = (17+35)/2 * 1.55 = 40.3
    expect(item.weaponData.PhysicalMin).toBeGreaterThan(0);
    expect(item.weaponData.PhysicalMax).toBeGreaterThan(0);
    expect(item.weaponData.PhysicalDPS).toBeGreaterThan(0);
    expect(item.weaponData.AttackRate).toBeCloseTo(1.55, 1);
  });

  it('computes armour values with local mods', () => {
    const item = new Item(`Rarity: Rare
Glyph Ward
Plate Vest
--------
Quality: +20%
--------
50% increased Armour`);

    item.resolveBase(registry);
    item.buildModList();

    expect(item.armourData).toBeDefined();
    // Base armour: avg(19,27) = 23, quality 20%: * 1.2 = 27.6, local 50% inc: * 1.5 = 41.4
    expect(item.armourData.Armour).toBeGreaterThan(0);
  });

  it('returns null weaponData for non-weapon items', () => {
    const item = new Item(`Rarity: Normal
Iron Ring`);

    item.resolveBase(registry);
    item.buildModList();

    expect(item.weaponData).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/models/__tests__/item.test.js`
Expected: FAIL (resolveBase and buildModList don't exist)

**Step 3: Implement base resolution and local calc**

Add methods to the `Item` class in `js/models/item.js`:

```js
import { parseMod } from './mod-parser.js';
import { round } from '../engine/utils.js';

// In Item class:

resolveBase(registry) {
  // Try baseName first (rare/unique), then name (normal)
  const lookupName = this.baseName || this.name;
  this.baseData = registry.get(lookupName);
}

buildModList() {
  this.weaponData = null;
  this.armourData = null;
  this.parsedMods = [];

  if (!this.baseData) return;

  // Parse all mod lines into structured mods
  const allModLines = [
    ...this.implicitModLines,
    ...this.explicitModLines,
    ...this.enchantModLines,
    ...this.crucibleModLines,
  ];

  for (const line of allModLines) {
    const mods = parseMod(line);
    this.parsedMods.push(...mods);
  }

  if (this.baseData.weapon) {
    this._calcWeapon();
  }
  if (this.baseData.armour) {
    this._calcArmour();
  }
}

_calcWeapon() {
  const base = this.baseData.weapon;
  const wd = {};
  wd.type = this.baseData.type;

  // Local flat damage additions
  const localFlat = {};
  const localInc = {};
  for (const mod of this.parsedMods) {
    if (mod.source !== 'Item') continue;
    // Flat damage mods on weapons are local
    if (mod.type === 'BASE' && mod.name.endsWith('Min') && mod.flags === 0) {
      const dmgType = mod.name.replace('Min', '');
      localFlat[dmgType + 'Min'] = (localFlat[dmgType + 'Min'] || 0) + mod.value;
    }
    if (mod.type === 'BASE' && mod.name.endsWith('Max') && mod.flags === 0) {
      const dmgType = mod.name.replace('Max', '');
      localFlat[dmgType + 'Max'] = (localFlat[dmgType + 'Max'] || 0) + mod.value;
    }
    // Local INC for PhysicalDamage on weapon
    if (mod.type === 'INC' && mod.name === 'PhysicalDamage') {
      localInc.physical = (localInc.physical || 0) + mod.value;
    }
    // Local attack speed
    if (mod.type === 'INC' && mod.name === 'Speed' && (mod.flags & 0x1)) { // ModFlag.Attack
      localInc.attackSpeed = (localInc.attackSpeed || 0) + mod.value;
    }
    // Local crit chance
    if (mod.type === 'INC' && mod.name === 'CritChance') {
      localInc.critChance = (localInc.critChance || 0) + mod.value;
    }
  }

  wd.AttackRate = round(base.AttackRateBase * (1 + (localInc.attackSpeed || 0) / 100), 2);

  const dmgTypes = ['Physical', 'Fire', 'Cold', 'Lightning', 'Chaos'];
  for (const dmgType of dmgTypes) {
    let min = (base[dmgType + 'Min'] || 0) + (localFlat[dmgType + 'Min'] || 0);
    let max = (base[dmgType + 'Max'] || 0) + (localFlat[dmgType + 'Max'] || 0);

    if (dmgType === 'Physical') {
      const physInc = localInc.physical || 0;
      const qualityScalar = this.quality || 0;
      min = round(min * (1 + physInc / 100) * (1 + qualityScalar / 100));
      max = round(max * (1 + physInc / 100) * (1 + qualityScalar / 100));
    }

    if (min > 0 && max > 0) {
      wd[dmgType + 'Min'] = min;
      wd[dmgType + 'Max'] = max;
      wd[dmgType + 'DPS'] = (min + max) / 2 * wd.AttackRate;
    }
  }

  wd.CritChance = round(
    base.CritChanceBase * (1 + (localInc.critChance || 0) / 100), 2
  );

  this.weaponData = wd;
}

_calcArmour() {
  const base = this.baseData.armour;
  const ad = {};

  // Collect local INC for defences
  const localInc = { armour: 0, evasion: 0, energyShield: 0 };
  for (const mod of this.parsedMods) {
    if (mod.source !== 'Item') continue;
    if (mod.type === 'INC') {
      if (mod.name === 'Armour') localInc.armour += mod.value;
      if (mod.name === 'Evasion') localInc.evasion += mod.value;
      if (mod.name === 'EnergyShield') localInc.energyShield += mod.value;
    }
  }

  const quality = this.quality || 0;

  if (base.ArmourBaseMin || base.ArmourBaseMax) {
    const baseVal = ((base.ArmourBaseMin || 0) + (base.ArmourBaseMax || 0)) / 2;
    ad.Armour = round(baseVal * (1 + quality / 100) * (1 + localInc.armour / 100));
  }
  if (base.EvasionBaseMin || base.EvasionBaseMax) {
    const baseVal = ((base.EvasionBaseMin || 0) + (base.EvasionBaseMax || 0)) / 2;
    ad.Evasion = round(baseVal * (1 + quality / 100) * (1 + localInc.evasion / 100));
  }
  if (base.EnergyShieldBaseMin || base.EnergyShieldBaseMax) {
    const baseVal = ((base.EnergyShieldBaseMin || 0) + (base.EnergyShieldBaseMax || 0)) / 2;
    ad.EnergyShield = round(baseVal * (1 + quality / 100) * (1 + localInc.energyShield / 100));
  }
  if (base.BlockChance) {
    ad.BlockChance = base.BlockChance;
  }

  this.armourData = ad;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run js/models/__tests__/item.test.js`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add js/models/item.js js/models/__tests__/item.test.js
git commit -m "feat: item base resolution and local weapon/armour stat calculation"
```

---

### Task 6: CalcSetup Item Integration

Wire equipped items into the calc pipeline. For each gear slot, resolve the item, extract non-local mods, and merge them into the player's ModDB.

**Reference:** `PathOfBuilding/src/Modules/CalcSetup.lua:668-760`

**Files:**
- Modify: `js/engine/calc-setup.js` (add `mergeItemMods` function)
- Test: `js/engine/__tests__/calc-setup.test.js` (add tests)

**Step 1: Write the failing test**

Add to `js/engine/__tests__/calc-setup.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { initEnv, mergeItemMods } from '../calc-setup.js';
import { Item } from '../../models/item.js';
import { BaseTypeRegistry } from '../../data/base-types.js';

describe('mergeItemMods', () => {
  const registry = new BaseTypeRegistry();

  it('merges flat life mod from equipped ring', () => {
    const env = initEnv();
    const items = {
      'Ring 1': new Item(`Rarity: Rare
Storm Band
Ruby Ring
--------
+30% to Fire Resistance (implicit)
--------
+50 to maximum Life`),
    };
    items['Ring 1'].resolveBase(registry);
    items['Ring 1'].buildModList();

    mergeItemMods(env, items);

    // Life should now be in the modDB
    const lifeBase = env.player.modDB.sum('BASE', null, 'Life');
    expect(lifeBase).toBe(50);
  });

  it('merges resistance mods from equipped items', () => {
    const env = initEnv();
    const items = {
      'Ring 1': new Item(`Rarity: Rare
Test Ring
Ruby Ring
--------
+30% to Fire Resistance (implicit)
--------
+40% to Cold Resistance`),
    };
    items['Ring 1'].resolveBase(registry);
    items['Ring 1'].buildModList();

    mergeItemMods(env, items);

    expect(env.player.modDB.sum('BASE', null, 'FireResist')).toBe(30);
    expect(env.player.modDB.sum('BASE', null, 'ColdResist')).toBe(40);
  });

  it('does not merge local weapon mods globally', () => {
    const env = initEnv();
    const items = {
      'Weapon 1': new Item(`Rarity: Rare
Test Sword
Rusted Sword
--------
Quality: +20%
--------
Adds 10 to 20 Physical Damage`),
    };
    items['Weapon 1'].resolveBase(registry);
    items['Weapon 1'].buildModList();

    mergeItemMods(env, items);

    // Local flat phys damage should NOT be in global modDB
    // (it's already consumed by weapon DPS calculation)
    expect(env.player.modDB.sum('BASE', null, 'PhysicalMin')).toBe(0);
  });

  it('stores weapon data on env for offence calc', () => {
    const env = initEnv();
    const items = {
      'Weapon 1': new Item(`Rarity: Rare
Test Sword
Rusted Sword
--------
Quality: +20%
--------
Adds 10 to 20 Physical Damage`),
    };
    items['Weapon 1'].resolveBase(registry);
    items['Weapon 1'].buildModList();

    mergeItemMods(env, items);

    expect(env.player.weaponData1).toBeDefined();
    expect(env.player.weaponData1.PhysicalDPS).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/engine/__tests__/calc-setup.test.js`
Expected: FAIL (mergeItemMods doesn't exist)

**Step 3: Implement mergeItemMods**

Add to `js/engine/calc-setup.js`:

```js
// Gear slot order (matching Lua's orderedSlots)
const GEAR_SLOTS = [
  'Weapon 1', 'Weapon 2',
  'Helmet', 'Body Armour', 'Gloves', 'Boots',
  'Amulet', 'Ring 1', 'Ring 2', 'Belt',
];

// Mod names that are local to weapons (consumed by weapon DPS calc, not merged globally)
const LOCAL_WEAPON_MODS = new Set([
  'PhysicalMin', 'PhysicalMax', 'FireMin', 'FireMax', 'ColdMin', 'ColdMax',
  'LightningMin', 'LightningMax', 'ChaosMin', 'ChaosMax',
  'PhysicalDamage', // local % increased phys
]);

// Mod names that are local to armour (consumed by armour calc, not merged globally)
const LOCAL_ARMOUR_MODS = new Set([
  'Armour', 'Evasion', 'EnergyShield',
]);

function isLocalMod(mod, item) {
  if (!item.baseData) return false;
  // On weapons, damage flat/inc mods are local
  if (item.baseData.weapon && LOCAL_WEAPON_MODS.has(mod.name) && mod.flags === 0) {
    return true;
  }
  // On armour, defence INC mods are local
  if (item.baseData.armour && LOCAL_ARMOUR_MODS.has(mod.name) && mod.type === 'INC') {
    return true;
  }
  // Attack speed INC on weapons is local
  if (item.baseData.weapon && mod.name === 'Speed' && mod.type === 'INC' && (mod.flags & ModFlag.Attack)) {
    return true;
  }
  // Crit chance INC on weapons is local
  if (item.baseData.weapon && mod.name === 'CritChance' && mod.type === 'INC') {
    return true;
  }
  return false;
}

/**
 * Merge equipped item mods into the calc environment.
 * @param {object} env - Calc environment from initEnv()
 * @param {object} items - Map of slot name -> Item instance (with resolveBase + buildModList already called)
 */
export function mergeItemMods(env, items) {
  const itemModDB = new ModDB();

  for (const slotName of GEAR_SLOTS) {
    const item = items[slotName];
    if (!item || !item.parsedMods) continue;

    // Store weapon data on env for offence calc
    if (slotName === 'Weapon 1' && item.weaponData) {
      env.player.weaponData1 = item.weaponData;
    }
    if (slotName === 'Weapon 2' && item.weaponData) {
      env.player.weaponData2 = item.weaponData;
    }

    // Merge non-local mods into itemModDB
    for (const mod of item.parsedMods) {
      if (!isLocalMod(mod, item)) {
        itemModDB.addMod(mod);
      }
    }
  }

  // Merge item mods into player modDB
  env.player.modDB.addDB(itemModDB);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run js/engine/__tests__/calc-setup.test.js`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add js/engine/calc-setup.js js/engine/__tests__/calc-setup.test.js
git commit -m "feat: CalcSetup item integration — merge equipped item mods into ModDB"
```

---

### Task 7: Wire Items Through App Import Pipeline

Connect the XML import → item parsing → calc pipeline in `js/app.js` so that imported builds have their items contribute to calculations.

**Files:**
- Modify: `js/app.js` (wire items through import flow)
- Test: Manual verification with a real build import (items should appear and contribute stats)

**Step 1: Read current app.js import flow**

Read `js/app.js` to understand the current `_applyBuild` or import method. Identify where items are loaded and where calc is triggered.

**Step 2: Wire item import**

In the build import/apply flow (wherever `build.items` is processed), add:

```js
import { BaseTypeRegistry } from './data/base-types.js';
import { mergeItemMods } from './engine/calc-setup.js';

// Create registry once (singleton or in constructor)
this.baseTypeRegistry = new BaseTypeRegistry();

// In _applyBuild or wherever build data is applied:
// After loading items from build.items into this.itemsTab.items:
const resolvedItems = {};
for (const { slot, raw } of build.items) {
  if (slot && raw) {
    const item = new Item(raw);
    item.resolveBase(this.baseTypeRegistry);
    item.buildModList();
    resolvedItems[slot] = item;
  }
}

// When running calc, pass resolved items:
// In the calc trigger or setup:
mergeItemMods(env, resolvedItems);
```

The exact integration points depend on how `js/app.js` currently triggers calculations. The key connections are:

1. On build import: parse items, resolve bases, build mod lists
2. On calc trigger: call `mergeItemMods(env, items)` before running CalcPerform
3. Store resolved items so they can be re-used when items change

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: wire item import through calc pipeline"
```

---

### Task 8: Serialize Items in PoB XML Format

Update `buildToXml` to output items in the PoB-compatible `<Item id="N">` + `<ItemSet><Slot>` format instead of the current `<Item slot="...">` format.

**Files:**
- Modify: `js/io/build-xml.js:33-92` (buildToXml Items section)
- Test: `js/io/__tests__/build-xml.test.js` (add round-trip test)

**Step 1: Write the failing test**

Add to `js/io/__tests__/build-xml.test.js`:

```js
describe('buildToXml - PoB item format', () => {
  it('serializes items with id and Slot references', () => {
    const build = new Build({
      items: [
        { slot: 'Weapon 1', raw: 'Rarity: Rare\nHavoc Bite\nVaal Axe' },
        { slot: 'Body Armour', raw: 'Rarity: Unique\nTabula Rasa\nSimple Robe' },
      ],
    });
    const xml = buildToXml(build);

    // Should have <Item id="1"> and <Item id="2">
    expect(xml).toContain('<Item id="1">');
    expect(xml).toContain('<Item id="2">');
    // Should have <ItemSet> with <Slot> references
    expect(xml).toContain('<Slot name="Weapon 1" itemId="1"');
    expect(xml).toContain('<Slot name="Body Armour" itemId="2"');
  });

  it('round-trips items through serialize/parse', () => {
    const build = new Build({
      className: 'Marauder',
      level: 90,
      items: [
        { slot: 'Ring 1', raw: 'Rarity: Rare\nStorm Band\nRuby Ring' },
      ],
    });
    const xml = buildToXml(build);
    const parsed = xmlToBuild(xml);

    expect(parsed.items.length).toBe(1);
    expect(parsed.items[0].slot).toBe('Ring 1');
    expect(parsed.items[0].raw).toContain('Storm Band');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run js/io/__tests__/build-xml.test.js`
Expected: FAIL

**Step 3: Update buildToXml**

Replace the Items section in `buildToXml`:

```js
// Items section - PoB format: <Item id="N"> + <ItemSet><Slot>
xml += '  <Items activeItemSet="1">\n';
for (let i = 0; i < build.items.length; i++) {
  const item = build.items[i];
  xml += `    <Item id="${i + 1}">${escapeXml(item.raw || '')}</Item>\n`;
}
if (build.items.length > 0) {
  xml += '    <ItemSet id="1">\n';
  for (let i = 0; i < build.items.length; i++) {
    const item = build.items[i];
    if (item.slot) {
      xml += `      <Slot name="${escapeXml(item.slot)}" itemId="${i + 1}"/>\n`;
    }
  }
  xml += '    </ItemSet>\n';
}
xml += '  </Items>\n';
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run js/io/__tests__/build-xml.test.js`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add js/io/build-xml.js js/io/__tests__/build-xml.test.js
git commit -m "feat: serialize items in PoB-compatible XML format with Item id + ItemSet Slot"
```
