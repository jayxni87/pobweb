# PoBWeb: Path of Building Web Port — Design Document

## Overview

Full 1:1 port of Path of Building (Lua desktop app) to a browser-based application using only HTML, CSS, and JavaScript. Runs entirely locally with no server dependencies.

## Key Decisions

- **Calculation engine:** Full JavaScript rewrite (not Lua VM in browser)
- **Tree rendering:** WebGL with instanced rendering and texture atlases
- **UI framework:** Vanilla JS + CSS (no framework dependencies)
- **Architecture:** Web Worker for calculation engine, main thread for UI
- **Data format:** Lua tables converted to JSON via build script
- **Build compatibility:** Import/export compatible with desktop PoB share codes

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Browser                     │
│                                              │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │   Main Thread     │  │   Web Worker     │ │
│  │                   │  │                  │ │
│  │  app.js           │  │  worker.js       │ │
│  │  ui/*             │  │  calc-setup.js   │ │
│  │  tabs/*           │  │  calc-offence.js │ │
│  │  tree/ (WebGL)    │  │  calc-defence.js │ │
│  │  models/*         │  │  calc-perform.js │ │
│  │  io/*             │  │  mod-parser.js   │ │
│  │                   │  │  mod-db.js       │ │
│  │  ◄──messages──►   │  │                  │ │
│  └──────────────────┘  └──────────────────┘ │
│                                              │
│  ┌──────────────────────────────────────────┐│
│  │  data/ (JSON)  │  assets/ (PNGs)         ││
│  └──────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

## Project Structure

```
pobweb/
├── index.html
├── css/
│   ├── main.css                  # Global styles, CSS custom properties
│   ├── tree.css                  # Skill tree overlay styles
│   ├── tabs.css                  # Tab panel styles
│   └── components.css            # Reusable component styles
├── js/
│   ├── app.js                    # Entry point, tab management, state coordination
│   ├── engine/                   # Web Worker calculation engine
│   │   ├── worker.js             # Worker entry, message handler
│   │   ├── calc-setup.js         # Environment init (CalcSetup.lua)
│   │   ├── calc-offence.js       # DPS/damage calcs (CalcOffence.lua)
│   │   ├── calc-defence.js       # Defense calcs (CalcDefence.lua)
│   │   ├── calc-perform.js       # Base stat aggregation (CalcPerform.lua)
│   │   ├── calc-active-skill.js  # Skill processing
│   │   ├── calc-triggers.js      # Trigger chains
│   │   ├── mod-parser.js         # Mod text → structured mod (ModParser.lua)
│   │   └── mod-db.js             # Modifier database/query system
│   ├── data/                     # Game data (Lua → JSON converted)
│   │   ├── loader.js             # Lazy data loader
│   │   ├── gems.json
│   │   ├── bases/
│   │   ├── uniques/
│   │   ├── mods/                 # Chunked mod data (~500KB each)
│   │   ├── tree/                 # Passive tree data per version
│   │   └── config-options.json
│   ├── models/                   # Data models
│   │   ├── build.js              # Build state management
│   │   ├── item.js               # Item parsing and representation
│   │   ├── skill.js              # Skill/gem model
│   │   ├── passive-spec.js       # Passive tree allocation state
│   │   └── mod.js                # Mod data structures
│   ├── tree/                     # WebGL passive tree
│   │   ├── tree-renderer.js      # WebGL rendering pipeline
│   │   ├── tree-interaction.js   # Pan/zoom/click handling
│   │   ├── tree-search.js        # Node search/highlight
│   │   └── shaders/              # GLSL vertex/fragment shaders
│   ├── ui/                       # UI components
│   │   ├── component.js          # Base component class
│   │   ├── tab-panel.js
│   │   ├── tooltip.js
│   │   ├── dropdown.js
│   │   ├── list-control.js       # Virtual-scrolling list
│   │   ├── edit-control.js
│   │   └── modal.js
│   ├── tabs/                     # Tab implementations
│   │   ├── tree-tab.js
│   │   ├── items-tab.js
│   │   ├── skills-tab.js
│   │   ├── calcs-tab.js
│   │   ├── config-tab.js
│   │   ├── import-tab.js
│   │   └── notes-tab.js
│   └── io/                       # Build I/O
│       ├── build-xml.js          # XML serialize/deserialize
│       ├── share-code.js         # Base64 share code encode/decode
│       └── file-manager.js       # File API load/save
├── assets/                       # Images from PoB
│   ├── tree/                     # Passive tree PNGs
│   ├── items/                    # Item slot and rarity icons
│   └── ui/                       # General UI assets
└── tools/                        # Build-time scripts
    └── convert-lua-data.js       # Lua table → JSON converter
```

## WebGL Passive Tree Renderer

### Rendering layers (back to front)
1. **Background** — Class-themed background image as textured quad
2. **Connections** — Lines between nodes (golden=allocated, grey=inactive)
3. **Nodes** — Instanced sprites from texture atlas (normal/notable/keystone/jewel/mastery × allocated/unallocated/can-allocate)
4. **Overlays** — Jewel radius circles, search highlights, path preview
5. **HTML overlay** — Tooltips, search bar, class selector, zoom controls

### Performance
- Texture atlas packing for minimal draw calls
- Instanced rendering (one draw call per node type)
- View frustum culling
- LOD at far zoom levels
- Dirty flag rendering (only re-render on state change)

### Interaction
- Pan: mouse drag / touch drag with momentum
- Zoom: mouse wheel / pinch with animated zoom-to-cursor
- Click: allocate/deallocate with shortest path
- Hover: rich tooltip with node stats
- Search: text input dims non-matching nodes
- Shift+click: path preview before allocation

### Camera
- Orthographic projection
- View matrix: pan offset + zoom level
- Smooth animated transitions

## Calculation Engine (Web Worker)

### Worker message protocol
```
UI → Worker:
  { type: 'calculate', payload: { build } }
  { type: 'loadData',  payload: { dataType, data } }
  { type: 'parseItem', payload: { itemText } }
  { type: 'parseMod',  payload: { modLine } }

Worker → UI:
  { type: 'result',   payload: { output, breakdowns } }
  { type: 'progress', payload: { phase, percent } }
  { type: 'error',    payload: { message, stack } }
```

### Calculation pipeline
1. **CalcSetup** — Build environment, aggregate mods from all sources (passives, items, gems, config), create ModDB instances
2. **CalcPerform** — Resolve base stats (attributes, life, mana, ES), apply increased/more multiplier stacking
3. **CalcOffence** — Per-skill: base damage, conversion chains, hit/crit/speed, DoT, final DPS. Handles minions, totems, triggers
4. **CalcDefence** — Resistances, armour/evasion/block, regen, leech, spell suppression, ES
5. **CalcSections** — Organize results into breakdown sections for display

### ModDB
```js
class ModDB {
  mods = new Map();       // modName → [mod, ...]
  conditions = new Map(); // conditionName → boolean
  addMod(mod) { ... }
  sum(type, name, ...tags) { ... }
  more(type, name, ...tags) { ... }
  flag(type, name, ...tags) { ... }
  list(type, name, ...tags) { ... }
}
```

### ModParser
Line-by-line pattern matching converting item/passive text to structured mod objects. Hundreds of regex patterns ported from the 632KB Lua original.

## UI System

### Layout
```
┌─────────────────────────────────────────────────────────┐
│  [Menu Bar] Build name ▼ | Class: ▼ | Level: [  ] | ⚙ │
├─────────────────────────────────────────────────────────┤
│  [Tree] [Skills] [Items] [Calcs] [Config] [Import] [Notes]
├────────────────────────────────┬────────────────────────┤
│                                │   Stat Sidebar         │
│    Active Tab Content          │   Life / ES / Mana     │
│    (fills available space)     │   DPS / Avg Hit        │
│                                │   Resistances          │
│                                │   Armour / Evasion     │
└────────────────────────────────┴────────────────────────┘
│  [Status Bar] Points: 121/123 | Ascendancy: 8/8        │
└─────────────────────────────────────────────────────────┘
```

### Design aesthetic
- Dark theme matching PoE aesthetic
- Colors: backgrounds (#0a0a0f, #1a1a2e), golden accents (#c8a03e), muted text (#b0b0b0)
- Stat colors: fire red, cold blue, lightning yellow, chaos purple
- Modern: subtle shadows, smooth transitions, rounded panel corners, clean typography
- Responsive: 1024px to ultrawide

### Component system
Vanilla JS classes managing their own DOM elements:
- **Component** — Base class with render/destroy/show/hide
- **TabPanel** — Tab switching with lazy initialization
- **Tooltip** — Rich tooltips with PoB color codes (^xRRGGBB), smart positioning
- **DropdownControl** — Searchable dropdown with keyboard nav
- **ListControl** — Virtual-scrolling for large datasets
- **EditControl** — Input with validation and autocomplete
- **StatSidebar** — Always-visible stat summary, updates on calc results

## Build I/O

### Storage
- XML format (compatible with desktop PoB)
- File API for load/save
- IndexedDB for auto-save and local build library

### Share codes
- Encode: `base64(pako.deflate(xmlString))` — pako.js for zlib
- Decode: `pako.inflate(base64decode(shareCode))`
- Compatible with desktop PoB share codes

### Import methods
1. File import (.xml from disk)
2. Share code paste (base64 decode)
3. Item paste (game client text → ModParser)
4. URL import (pob.trade / pobb.in URLs)

## Testing & Verification

### Strategy
- Export test builds from desktop PoB (existing `/spec/TestBuilds/`)
- Compare all output values between Lua and JS engines
- Automated regression tests for key stats (DPS, Life, Resistances)

### Test types
- Unit: ModParser (mod text → structured mod)
- Unit: Each CalcX module with known inputs/outputs
- Integration: Full build load → verify calculation results
- Tree: Node allocation and path-finding correctness

### Error handling
- Worker posts errors to UI with descriptive messages
- Invalid items/mods degrade gracefully (warning, skip bad data)
- Build XML parse errors show user-friendly messages

## Data Pipeline

### One-time conversion
A build script (`tools/convert-lua-data.js`) converts Lua tables to JSON:
- `ModItem.lua` (4MB) → chunked JSON files (~500KB each)
- `Gems.lua` → `gems.json`
- `tree.lua` per version → `tree/{version}.json`
- `ConfigOptions.lua` → `config-options.json`

### Lazy loading
- Core data loaded at startup (gems, base config)
- Tree data loaded when version selected (~1MB per version)
- Mod data loaded in chunks as needed
- Full data bundle: ~15-20MB (compressed JSON + tree PNGs)
