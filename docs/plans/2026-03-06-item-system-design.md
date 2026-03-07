# Item System + Calc Pipeline Design

**Goal:** Implement the full item system for PoBWeb — base data, item parsing, local stat calculation, calc pipeline integration, and items tab UI with all editing modes.

**Approach:** Bottom-up (Data → Calc → UI). Calc correctness before visual feedback.

## Phase 1: Data Layer

### Base Data Conversion (Lua → JSON)

Convert 22 Lua base data files at `PathOfBuilding/src/Data/Bases/*.lua` to populate the empty stubs at `js/data/bases/*.json` using `tools/convert-lua-data.js`.

Each entry contains:
- `type`, `subType`, `tags` (for mod matching)
- `implicit` (implicit mod text lines)
- `req` (level, str, dex, int requirements)
- `weapon` stats: `PhysicalMin`, `PhysicalMax`, `CritChanceBase`, `AttackRateBase`, `Range`
- `armour` stats: `ArmourBaseMin/Max`, `EvasionBaseMin/Max`, `EnergyShieldBaseMin/Max`, `BlockChance`, `MovementPenalty`

### XML Parser Fix

Fix `js/io/build-xml.js` to parse `<Slot name="..." itemId="N"/>` tags from PoB XML format, mapping slot names to item IDs. Currently items are stored as `{slot, raw}` but `<Slot>` tags are ignored.

## Phase 2: Item Model + Local Calculation

### Item Parser Enhancement (`js/models/item.js`)

1. **Base type resolution** — Match item base name against converted base data for weapon/armour/requirement stats
2. **Mod classification** — Classify mod lines as implicit, explicit, crafted, enchant (markers like `{crafted}`, `{range:0.5}` already in raw text)
3. **Mod → ModList conversion** — Parse mod text into structured modifier objects via new `js/models/mod-parser.js`

### ModParser (Incremental)

New file `js/models/mod-parser.js`. Covers common mod patterns first:
- Flat damage (physical, elemental, chaos)
- % increased/reduced
- +attributes, resistances, life/mana
- Attack speed, crit chance/multiplier
- Armour, evasion, energy shield
- Unrecognized mods returned as raw text (no calc contribution, visible in UI)

### Local Mod Calculation

Per Lua's `calcLocal()` in `Item.lua` and `BuildModListForSlotNum`:
- **Weapons**: effective phys/ele/chaos DPS from base + quality + local mods. `physDPS = (min + max) / 2 * attackRate`
- **Armour**: effective armour/evasion/ES from base + quality + local increases
- Quality affects weapon phys damage and armour base values

## Phase 3: Calc Pipeline (CalcSetup Item Integration)

### Slot System

Ordered slot iteration matching Lua CalcSetup (lines 668-1200):
- Weapon 1, Weapon 2, Helmet, Body Armour, Gloves, Boots, Amulet, Ring 1, Ring 2, Belt

### Item → ModDB Flow

1. For each equipped slot, resolve item from build's item set
2. Build mod list for the item (parsed mods with local calc applied)
3. Merge non-local mods into `env.itemModDB`
4. After all slots processed, merge `env.itemModDB` into `env.modDB`

### Deferred

- Flasks (active/inactive state, flask effect calc)
- Jewel mods in calc (jewel → tree socket mod application)
- Socket colors / gem links (entire skill/gem system)
- Item sets (multiple sets for comparison)
- Special unique redirects (Necromantic Aegis, Dancing Dervish, Kalandra's Touch)

## Phase 4: Items Tab UI

### Display Layout

Full PoB-style: left panel with slot grid (weapon/armour/jewelry arranged spatially), right panel with item detail showing parsed mods, computed stats (weapon DPS, armour values), requirements.

### Editing Modes

1. **Paste** — Paste raw item text from game or trade site
2. **Create from base** — Pick base type, add mods manually
3. **Edit** — Modify existing item's mods in-place
4. **Database browser** — Browse/search unique items database
