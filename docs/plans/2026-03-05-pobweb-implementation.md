# PoBWeb Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port Path of Building (Lua desktop app, ~45K lines of logic + 55MB data) to a browser-based JavaScript application that runs entirely client-side.

**Architecture:** Web Worker for calculation engine (ModDB, ModParser, CalcSetup/Perform/Offence/Defence), main thread for UI (vanilla JS + CSS). WebGL for passive tree rendering. Lua data tables converted to JSON via build-time script. XML build format preserved for desktop PoB compatibility.

**Tech Stack:** Vanilla JS (ES modules), WebGL2, Web Workers, pako.js (zlib), CSS custom properties, Vitest for testing

---

## Dependency Graph

```
Phase 1: Foundation
  Task 1: Project scaffolding
  Task 2: Lua-to-JSON data converter
  Task 3: Utility library (Common.lua port)

Phase 2: Core Data Model (depends on Phase 1)
  Task 4: Mod data structures & ModTools
  Task 5: ModStore & ModDB
  Task 6: ModList
  Task 7: ModParser (form/flag/keyword matching)
  Task 8: ModParser (mod line patterns - batch 1: defences, attributes, life/mana/ES)
  Task 9: ModParser (mod line patterns - batch 2: offence, damage, crit, speed)
  Task 10: ModParser (mod line patterns - batch 3: remaining patterns)

Phase 3: Calculation Engine (depends on Phase 2)
  Task 11: CalcTools & helper functions
  Task 12: CalcSetup - environment initialization
  Task 13: CalcPerform - base stats, life/mana/ES, attributes
  Task 14: CalcDefence - resistances, armour, evasion, block, suppression
  Task 15: CalcOffence - damage types, conversion, hit/crit (batch 1)
  Task 16: CalcOffence - DoT, ailments, DPS finalization (batch 2)
  Task 17: CalcActiveSkill - skill/support gem processing
  Task 18: CalcTriggers - trigger chain handling
  Task 19: Web Worker integration & message protocol

Phase 4: Data Models & Build I/O (depends on Phase 2)
  Task 20: Item model & parser
  Task 21: Skill/gem model
  Task 22: PassiveSpec model (tree allocation state)
  Task 23: Build model & XML serialization
  Task 24: Share code encode/decode (pako)
  Task 25: ConfigOptions model

Phase 5: Passive Tree Renderer (depends on Task 1, Task 22)
  Task 26: Tree data loader & graph structure
  Task 27: WebGL renderer - setup, texture atlas, instanced rendering
  Task 28: WebGL renderer - node/connection drawing, layers
  Task 29: Tree interaction - pan/zoom/click/hover
  Task 30: Tree path-finding & allocation logic
  Task 31: Tree search & highlight

Phase 6: UI Shell & Tabs (depends on Phase 3, 4, 5)
  Task 32: Component system & base classes
  Task 33: App shell - layout, tab panel, stat sidebar
  Task 34: Tree tab
  Task 35: Skills tab
  Task 36: Items tab
  Task 37: Calcs tab (breakdown display)
  Task 38: Config tab
  Task 39: Import tab & file manager
  Task 40: Notes tab

Phase 7: Integration & Verification (depends on all above)
  Task 41: End-to-end build loading & calc verification
  Task 42: Performance optimization & lazy loading
  Task 43: IndexedDB auto-save & build library
```

---

## Phase 1: Foundation

### Task 1: Project Scaffolding

**Files:**
- Create: `index.html`
- Create: `css/main.css`
- Create: `js/app.js`
- Create: `js/engine/worker.js`
- Create: `package.json`
- Create: `vitest.config.js`

**Step 1: Initialize the project**

```bash
cd /home/jayni/dev/pobweb
npm init -y
npm install -D vitest
```

**Step 2: Create package.json with scripts**

```json
{
  "name": "pobweb",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npx serve .",
    "test": "vitest run",
    "test:watch": "vitest",
    "convert-data": "node tools/convert-lua-data.js"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

**Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Path of Building</title>
  <link rel="stylesheet" href="css/main.css">
</head>
<body>
  <div id="app">
    <header id="menu-bar"></header>
    <nav id="tab-bar"></nav>
    <main id="tab-content"></main>
    <aside id="stat-sidebar"></aside>
    <footer id="status-bar"></footer>
  </div>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

**Step 4: Create css/main.css with PoE dark theme**

```css
:root {
  --bg-primary: #0a0a0f;
  --bg-secondary: #1a1a2e;
  --bg-tertiary: #16213e;
  --gold: #c8a03e;
  --gold-dim: #8a6d2b;
  --text-primary: #e0e0e0;
  --text-secondary: #b0b0b0;
  --text-muted: #707070;
  --fire: #e05030;
  --cold: #5080e0;
  --lightning: #e0d050;
  --chaos: #a050d0;
  --physical: #e0e0e0;
  --life: #e04040;
  --mana: #4060e0;
  --es: #6070b0;
  --border: #2a2a4e;
  --font-mono: 'Consolas', 'Monaco', monospace;
  --font-main: 'Segoe UI', system-ui, sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-main);
  font-size: 14px;
  overflow: hidden;
  height: 100vh;
}

#app {
  display: grid;
  grid-template-rows: 40px 36px 1fr 24px;
  grid-template-columns: 1fr 280px;
  grid-template-areas:
    "menu menu"
    "tabs tabs"
    "content sidebar"
    "status status";
  height: 100vh;
}

#menu-bar { grid-area: menu; background: var(--bg-secondary); border-bottom: 1px solid var(--border); }
#tab-bar { grid-area: tabs; background: var(--bg-secondary); border-bottom: 1px solid var(--border); }
#tab-content { grid-area: content; overflow: auto; }
#stat-sidebar { grid-area: sidebar; background: var(--bg-secondary); border-left: 1px solid var(--border); overflow-y: auto; }
#status-bar { grid-area: status; background: var(--bg-tertiary); border-top: 1px solid var(--border); }
```

**Step 5: Create js/app.js entry point**

```js
// PoBWeb - Entry point
const worker = new Worker('js/engine/worker.js', { type: 'module' });

worker.onmessage = (e) => {
  const { type, payload } = e.data;
  switch (type) {
    case 'result':
      console.log('Calc result:', payload);
      break;
    case 'error':
      console.error('Worker error:', payload);
      break;
  }
};

export function sendToWorker(type, payload) {
  worker.postMessage({ type, payload });
}
```

**Step 6: Create js/engine/worker.js stub**

```js
// PoBWeb - Calculation engine Web Worker
self.onmessage = (e) => {
  const { type, payload } = e.data;
  switch (type) {
    case 'calculate':
      // TODO: implement
      self.postMessage({ type: 'result', payload: {} });
      break;
    default:
      self.postMessage({ type: 'error', payload: { message: `Unknown message type: ${type}` } });
  }
};
```

**Step 7: Write a smoke test**

Create `js/__tests__/app.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('PoBWeb smoke test', () => {
  it('loads without error', () => {
    expect(true).toBe(true);
  });
});
```

**Step 8: Run tests**

```bash
npx vitest run
```
Expected: PASS

**Step 9: Commit**

```bash
git init
git add -A
git commit -m "feat: project scaffolding with HTML shell, CSS theme, worker stub, and vitest"
```

---

### Task 2: Lua-to-JSON Data Converter

**Files:**
- Create: `tools/convert-lua-data.js`
- Create: `tools/__tests__/convert-lua-data.test.js`

**Context:** The Lua data files use table syntax like `{ key = "value", [1] = { nested = true } }`. This needs a custom parser since it's not standard JSON. Key files to convert:
- `Data/Gems.lua` (375KB) — gem definitions
- `Data/Uniques/*.lua` (21 files) — unique item text blocks
- `Data/Bases/*.lua` (23 files) — base item definitions
- `Data/ModItem.lua` (4.1MB) — item mod pool definitions
- `Data/StatDescriptions/*.lua` (5.9MB) — stat text templates
- `TreeData/*/tree.lua` (~2.8MB per version) — passive tree node data
- `Modules/ConfigOptions.lua` — config with inline functions (needs special handling)

**Step 1: Write test for basic Lua table parsing**

```js
// tools/__tests__/convert-lua-data.test.js
import { describe, it, expect } from 'vitest';
import { parseLuaTable } from '../convert-lua-data.js';

describe('parseLuaTable', () => {
  it('parses simple key-value table', () => {
    const input = '{ name = "Fireball", level = 20, active = true }';
    expect(parseLuaTable(input)).toEqual({ name: 'Fireball', level: 20, active: true });
  });

  it('parses nested tables', () => {
    const input = '{ tags = { fire = true, spell = true }, reqInt = 100 }';
    expect(parseLuaTable(input)).toEqual({ tags: { fire: true, spell: true }, reqInt: 100 });
  });

  it('parses array-style tables', () => {
    const input = '{ "Physical", "Lightning", "Cold", "Fire", "Chaos" }';
    expect(parseLuaTable(input)).toEqual(['Physical', 'Lightning', 'Cold', 'Fire', 'Chaos']);
  });

  it('parses numeric keys', () => {
    const input = '{ [1] = "first", [2] = "second" }';
    expect(parseLuaTable(input)).toEqual(['first', 'second']);
  });

  it('parses string keys with brackets', () => {
    const input = '{ ["Metadata/Items/Gems/Fireball"] = { name = "Fireball" } }';
    expect(parseLuaTable(input)).toEqual({ 'Metadata/Items/Gems/Fireball': { name: 'Fireball' } });
  });

  it('handles multiline strings', () => {
    const input = '{ desc = [[\nline1\nline2\n]] }';
    expect(parseLuaTable(input)).toEqual({ desc: 'line1\nline2\n' });
  });

  it('handles hex numbers', () => {
    const input = '{ flags = 0x0E }';
    expect(parseLuaTable(input)).toEqual({ flags: 14 });
  });

  it('handles negative numbers', () => {
    const input = '{ val = -30 }';
    expect(parseLuaTable(input)).toEqual({ val: -30 });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tools/__tests__/convert-lua-data.test.js
```
Expected: FAIL — module not found

**Step 3: Implement Lua table parser**

Create `tools/convert-lua-data.js` with a recursive descent parser for Lua table syntax. This parser needs to handle:
- String keys (`name = value`, `["key"] = value`)
- Numeric keys (`[1] = value`)
- Implicit array entries (sequential values without keys)
- Nested tables
- Multiline strings (`[[...]]`)
- Numbers (int, float, hex `0x...`, negative)
- Booleans (`true`, `false`)
- `nil`
- Comments (`--` line comments, `--[[...]]` block comments)
- Trailing commas

The parser should skip Lua function definitions (replace with `null` or a marker) and handle the `return` statement wrapping most data files.

```js
// tools/convert-lua-data.js

/**
 * Recursive descent parser for Lua table literals.
 * Converts Lua table syntax to JavaScript objects/arrays.
 */
export function parseLuaTable(input) {
  let pos = 0;

  function peek() { return input[pos]; }
  function advance() { return input[pos++]; }
  function isEnd() { return pos >= input.length; }

  function skipWhitespaceAndComments() {
    while (pos < input.length) {
      // Skip whitespace
      if (/\s/.test(input[pos])) { pos++; continue; }
      // Line comment
      if (input[pos] === '-' && input[pos + 1] === '-') {
        if (input[pos + 2] === '[' && input[pos + 3] === '[') {
          // Block comment
          pos += 4;
          while (pos < input.length - 1 && !(input[pos] === ']' && input[pos + 1] === ']')) pos++;
          pos += 2;
        } else {
          while (pos < input.length && input[pos] !== '\n') pos++;
        }
        continue;
      }
      break;
    }
  }

  function parseString(quote) {
    advance(); // skip opening quote
    let str = '';
    while (!isEnd() && peek() !== quote) {
      if (peek() === '\\') {
        advance();
        const esc = advance();
        switch (esc) {
          case 'n': str += '\n'; break;
          case 't': str += '\t'; break;
          case '\\': str += '\\'; break;
          case '"': str += '"'; break;
          case "'": str += "'"; break;
          default: str += esc;
        }
      } else {
        str += advance();
      }
    }
    advance(); // skip closing quote
    return str;
  }

  function parseLongString() {
    // Already consumed first [, check for =* pattern
    let level = 0;
    while (peek() === '=') { advance(); level++; }
    advance(); // skip second [
    // Find matching ]=*]
    const closePattern = ']' + '='.repeat(level) + ']';
    let str = '';
    while (pos < input.length) {
      if (input.substring(pos, pos + closePattern.length) === closePattern) {
        pos += closePattern.length;
        return str;
      }
      str += advance();
    }
    return str;
  }

  function parseNumber() {
    let numStr = '';
    if (peek() === '-') numStr += advance();
    if (peek() === '0' && (input[pos + 1] === 'x' || input[pos + 1] === 'X')) {
      numStr += advance(); // 0
      numStr += advance(); // x
      while (!isEnd() && /[0-9a-fA-F]/.test(peek())) numStr += advance();
      return parseInt(numStr, 16);
    }
    while (!isEnd() && /[0-9.]/.test(peek())) numStr += advance();
    if (peek() === 'e' || peek() === 'E') {
      numStr += advance();
      if (peek() === '+' || peek() === '-') numStr += advance();
      while (!isEnd() && /[0-9]/.test(peek())) numStr += advance();
    }
    return Number(numStr);
  }

  function parseFunction() {
    // Skip function(...) ... end
    let depth = 1;
    while (pos < input.length && depth > 0) {
      // Skip strings inside functions
      if (peek() === '"' || peek() === "'") {
        parseString(peek());
        continue;
      }
      if (input[pos] === '[' && input[pos + 1] === '[') {
        pos += 2;
        parseLongString();
        continue;
      }
      // Match keywords
      const rest = input.substring(pos);
      if (/^function\b/.test(rest) || /^if\b/.test(rest) || /^do\b/.test(rest) || /^for\b/.test(rest) || /^while\b/.test(rest)) {
        // Crude: only count function/if/do/for/while as depth increasers
        if (/^function\b/.test(rest)) { pos += 8; depth++; continue; }
        if (/^if\b/.test(rest)) { pos += 2; depth++; continue; }
        if (/^do\b/.test(rest)) { pos += 2; depth++; continue; }
        if (/^for\b/.test(rest)) { pos += 3; depth++; continue; }
        if (/^while\b/.test(rest)) { pos += 5; depth++; continue; }
      }
      if (/^end\b/.test(rest)) {
        depth--;
        pos += 3;
        continue;
      }
      pos++;
    }
    return null; // functions become null in JSON
  }

  function parseValue() {
    skipWhitespaceAndComments();
    if (isEnd()) return undefined;

    const ch = peek();

    // String
    if (ch === '"' || ch === "'") return parseString(ch);

    // Long string
    if (ch === '[' && (input[pos + 1] === '[' || input[pos + 1] === '=')) {
      advance(); // skip first [
      return parseLongString();
    }

    // Table
    if (ch === '{') return parseTable();

    // Function
    if (input.substring(pos, pos + 8) === 'function') {
      pos += 8;
      return parseFunction();
    }

    // Boolean / nil
    if (input.substring(pos, pos + 4) === 'true') { pos += 4; return true; }
    if (input.substring(pos, pos + 5) === 'false') { pos += 5; return false; }
    if (input.substring(pos, pos + 3) === 'nil') { pos += 3; return null; }

    // math.huge
    if (input.substring(pos, pos + 9) === 'math.huge') { pos += 9; return Infinity; }

    // Number (including negative)
    if (/[-0-9.]/.test(ch)) return parseNumber();

    // Identifier (for enums/constants referenced in data — store as string)
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (!isEnd() && /[a-zA-Z0-9_.]/.test(peek())) ident += advance();
      return `__REF:${ident}`;
    }

    return undefined;
  }

  function parseTable() {
    advance(); // skip {
    skipWhitespaceAndComments();

    const obj = {};
    const arr = [];
    let arrayIndex = 1;
    let isArray = true;
    let hasStringKeys = false;

    while (!isEnd() && peek() !== '}') {
      skipWhitespaceAndComments();
      if (peek() === '}') break;

      let key, value;

      // [key] = value
      if (peek() === '[') {
        advance();
        skipWhitespaceAndComments();
        if (peek() === '[') {
          // long string key [[...]]
          advance();
          key = parseLongString();
        } else if (peek() === '"' || peek() === "'") {
          key = parseString(peek());
        } else {
          // numeric key
          key = parseValue();
        }
        skipWhitespaceAndComments();
        advance(); // skip ]
        skipWhitespaceAndComments();
        advance(); // skip =
        value = parseValue();

        if (typeof key === 'number' && key === arrayIndex) {
          arr.push(value);
          arrayIndex++;
        } else {
          isArray = false;
          hasStringKeys = true;
          obj[key] = value;
        }
      }
      // key = value (identifier key)
      else if (/[a-zA-Z_]/.test(peek())) {
        const savedPos = pos;
        let ident = '';
        while (!isEnd() && /[a-zA-Z0-9_]/.test(peek())) ident += advance();
        skipWhitespaceAndComments();
        if (peek() === '=') {
          advance(); // skip =
          value = parseValue();
          isArray = false;
          hasStringKeys = true;
          obj[ident] = value;
        } else {
          // Not a key=value, rewind and parse as value
          pos = savedPos;
          value = parseValue();
          arr.push(value);
          arrayIndex++;
        }
      }
      // bare value (array element)
      else {
        value = parseValue();
        arr.push(value);
        arrayIndex++;
      }

      skipWhitespaceAndComments();
      if (peek() === ',' || peek() === ';') advance();
    }

    if (!isEnd()) advance(); // skip }

    // Decide if result is array or object
    if (arr.length > 0 && hasStringKeys) {
      // Mixed: merge array into object with numeric keys
      for (let i = 0; i < arr.length; i++) {
        obj[i + 1] = arr[i];
      }
      return obj;
    }
    if (arr.length > 0 && !hasStringKeys) {
      return arr;
    }
    return obj;
  }

  // Handle "return { ... }" wrapper
  skipWhitespaceAndComments();
  if (input.substring(pos, pos + 6) === 'return') pos += 6;
  skipWhitespaceAndComments();

  return parseValue();
}

// CLI entry point for batch conversion
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname, extname } from 'path';

const POB_SRC = join(dirname(new URL(import.meta.url).pathname), '..', 'PathOfBuilding', 'src');
const OUT_DIR = join(dirname(new URL(import.meta.url).pathname), '..', 'js', 'data');

function convertFile(inputPath, outputPath) {
  const lua = readFileSync(inputPath, 'utf-8');
  const data = parseLuaTable(lua);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(data, null, 0));
  const inSize = (statSync(inputPath).size / 1024).toFixed(0);
  const outSize = (statSync(outputPath).size / 1024).toFixed(0);
  console.log(`  ${basename(inputPath)} (${inSize}KB) → ${basename(outputPath)} (${outSize}KB)`);
}

function convertDirectory(inputDir, outputDir) {
  for (const entry of readdirSync(inputDir)) {
    const fullPath = join(inputDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      convertDirectory(fullPath, join(outputDir, entry));
    } else if (extname(entry) === '.lua') {
      const outName = basename(entry, '.lua') + '.json';
      convertFile(fullPath, join(outputDir, outName));
    }
  }
}

// Only run CLI when executed directly
if (process.argv[1] && process.argv[1].includes('convert-lua-data')) {
  console.log('Converting Lua data to JSON...');
  console.log(`Source: ${POB_SRC}`);
  console.log(`Output: ${OUT_DIR}`);

  // Core data files
  console.log('\n--- Gems ---');
  convertFile(join(POB_SRC, 'Data', 'Gems.lua'), join(OUT_DIR, 'gems.json'));

  console.log('\n--- Bases ---');
  convertDirectory(join(POB_SRC, 'Data', 'Bases'), join(OUT_DIR, 'bases'));

  console.log('\n--- Uniques ---');
  convertDirectory(join(POB_SRC, 'Data', 'Uniques'), join(OUT_DIR, 'uniques'));

  console.log('\n--- Mod pools ---');
  for (const f of readdirSync(join(POB_SRC, 'Data')).filter(f => f.startsWith('Mod') && f.endsWith('.lua'))) {
    convertFile(join(POB_SRC, 'Data', f), join(OUT_DIR, 'mods', basename(f, '.lua') + '.json'));
  }

  console.log('\n--- Stat descriptions ---');
  convertDirectory(join(POB_SRC, 'Data', 'StatDescriptions'), join(OUT_DIR, 'stat-descriptions'));

  // Tree data (latest version only for now)
  console.log('\n--- Tree data ---');
  const treeVersions = readdirSync(join(POB_SRC, 'TreeData')).filter(d =>
    statSync(join(POB_SRC, 'TreeData', d)).isDirectory() && /^\d/.test(d)
  );
  for (const ver of treeVersions) {
    const treeLua = join(POB_SRC, 'TreeData', ver, 'tree.lua');
    try {
      statSync(treeLua);
      convertFile(treeLua, join(OUT_DIR, 'tree', `${ver}.json`));
    } catch { /* tree.lua not present in this version dir */ }
  }

  console.log('\nDone.');
}
```

**Step 4: Run tests**

```bash
npx vitest run tools/__tests__/convert-lua-data.test.js
```
Expected: PASS

**Step 5: Run actual data conversion and validate output**

```bash
node tools/convert-lua-data.js
ls -la js/data/
```
Expected: JSON files created under `js/data/`

**Step 6: Commit**

```bash
git add tools/ js/data/ vitest.config.js
git commit -m "feat: Lua-to-JSON data converter with recursive descent parser"
```

---

### Task 3: Utility Library (Common.lua Port)

**Files:**
- Create: `js/engine/utils.js`
- Create: `js/engine/__tests__/utils.test.js`

**Context:** Port utility functions from `Common.lua:1-200` and `Data/Global.lua`. Key items:
- `round()`, `copyTable()`, `wipeTable()`
- Bitwise flag constants: `ModFlag`, `KeywordFlag`
- Character constants
- Color code parser (`^xRRGGBB`, `^7`, etc.)
- `StripEscapes()` function

**Step 1: Write tests for utility functions**

```js
import { describe, it, expect } from 'vitest';
import { round, copyTable, wipeTable, stripEscapes, ModFlag, KeywordFlag } from '../utils.js';

describe('round', () => {
  it('rounds to specified decimals', () => {
    expect(round(1.2345, 2)).toBe(1.23);
    expect(round(1.235, 2)).toBe(1.24);
    expect(round(100, 0)).toBe(100);
  });
});

describe('copyTable', () => {
  it('deep copies an object', () => {
    const orig = { a: 1, b: { c: 2 } };
    const copy = copyTable(orig);
    copy.b.c = 99;
    expect(orig.b.c).toBe(2);
  });

  it('deep copies arrays', () => {
    const orig = [1, [2, 3]];
    const copy = copyTable(orig);
    copy[1][0] = 99;
    expect(orig[1][0]).toBe(2);
  });
});

describe('stripEscapes', () => {
  it('removes ^digit color codes', () => {
    expect(stripEscapes('^7Hello ^1World')).toBe('Hello World');
  });
  it('removes ^xRRGGBB color codes', () => {
    expect(stripEscapes('^xE05030fire ^x5080E0cold')).toBe('fire cold');
  });
});

describe('ModFlag', () => {
  it('has expected bit values', () => {
    expect(ModFlag.Attack).toBeDefined();
    expect(ModFlag.Spell).toBeDefined();
    expect(typeof ModFlag.Attack).toBe('number');
  });
});

describe('KeywordFlag', () => {
  it('has expected bit values', () => {
    expect(KeywordFlag.Fire).toBeDefined();
    expect(KeywordFlag.Cold).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run js/engine/__tests__/utils.test.js
```
Expected: FAIL

**Step 3: Implement utils.js**

Port the following from `Common.lua` and `Data/Global.lua`:
- `round(val, decimal)` — round to N decimal places
- `copyTable(tbl)` — deep clone
- `wipeTable(tbl)` — clear all keys
- `stripEscapes(text)` — remove PoB color codes
- `ModFlag` — bitwise flags for mod categories (Attack, Spell, Hit, Dot, etc.)
- `KeywordFlag` — bitwise flags for keywords (Fire, Cold, Lightning, Chaos, etc.)
- `MatchKeywordFlags(keyword, modKeyword)` — keyword flag matching logic
- `dmgTypeList`, `ailmentTypeList` — damage/ailment type arrays
- `data.misc` — miscellaneous game constants
- `data.characterConstants` — base character stat values

Reference `Data/Global.lua` for exact flag values.

**Step 4: Run tests**

```bash
npx vitest run js/engine/__tests__/utils.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add js/engine/utils.js js/engine/__tests__/utils.test.js
git commit -m "feat: utility library with ModFlag, KeywordFlag, round, copyTable"
```

---

## Phase 2: Core Data Model

### Task 4: Mod Data Structures & ModTools

**Files:**
- Create: `js/engine/mod-tools.js`
- Create: `js/engine/__tests__/mod-tools.test.js`

**Context:** Port `Modules/ModTools.lua` (236 lines). The `createMod` function is the foundation — every modifier in the system is created through it. A mod is a plain object: `{ name, type, value, flags, keywordFlags, source, ...tags }`.

**Step 1: Write tests**

```js
import { describe, it, expect } from 'vitest';
import { createMod, formatMod, formatFlags, compareModParams } from '../mod-tools.js';
import { ModFlag, KeywordFlag } from '../utils.js';

describe('createMod', () => {
  it('creates a basic mod', () => {
    const mod = createMod('Life', 'BASE', 50, 'Tree:1234');
    expect(mod.name).toBe('Life');
    expect(mod.type).toBe('BASE');
    expect(mod.value).toBe(50);
    expect(mod.source).toBe('Tree:1234');
    expect(mod.flags).toBe(0);
    expect(mod.keywordFlags).toBe(0);
  });

  it('creates a mod with flags', () => {
    const mod = createMod('Damage', 'INC', 20, 'Item:1', ModFlag.Attack, KeywordFlag.Fire);
    expect(mod.flags).toBe(ModFlag.Attack);
    expect(mod.keywordFlags).toBe(KeywordFlag.Fire);
  });

  it('creates a mod with tags', () => {
    const mod = createMod('Damage', 'MORE', 10, 'Skill', 0, 0,
      { type: 'Condition', var: 'Onslaught' });
    expect(mod.tags).toHaveLength(1);
    expect(mod.tags[0].type).toBe('Condition');
  });
});

describe('compareModParams', () => {
  it('returns true for identical params', () => {
    const a = createMod('Life', 'BASE', 50, 'A');
    const b = createMod('Life', 'BASE', 100, 'A');
    expect(compareModParams(a, b)).toBe(true);
  });

  it('returns false for different names', () => {
    const a = createMod('Life', 'BASE', 50, 'A');
    const b = createMod('Mana', 'BASE', 50, 'A');
    expect(compareModParams(a, b)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement mod-tools.js**

Port `createMod`, `compareModParams`, `formatMod`, `formatFlags`, `formatTag`, `formatTags`, `formatValue`, `setSource`, `mergeKeystones`, `parseTags`, `parseFormattedSourceMod` from `ModTools.lua`.

Key difference from Lua: tags are stored in a `tags` array property instead of the array part of the table (Lua tables mix array and hash parts).

**Step 4: Run tests, verify PASS**

**Step 5: Commit**

---

### Task 5: ModStore & ModDB

**Files:**
- Create: `js/engine/mod-db.js`
- Create: `js/engine/__tests__/mod-db.test.js`

**Context:** Port `Classes/ModStore.lua` (879 lines) and `Classes/ModDB.lua` (317 lines). ModDB is the core data structure — all calculation queries go through it. ModStore is the base class with `EvalMod`, condition/multiplier handling. ModDB adds the `mods` map indexed by mod name.

Key methods to port:
- `ModDB.AddMod`, `AddList`, `AddDB`
- `ModDB.SumInternal`, `MoreInternal`, `FlagInternal`, `OverrideInternal`, `ListInternal`, `TabulateInternal`
- `ModStore.EvalMod` — evaluates conditional tags on a mod
- `ModStore.ScaleAddMod` — adds a mod with a scale factor
- Parent chain traversal (ModDB can have a parent ModDB)

**Step 1: Write tests**

```js
import { describe, it, expect } from 'vitest';
import { ModDB } from '../mod-db.js';
import { createMod } from '../mod-tools.js';

describe('ModDB', () => {
  it('stores and sums BASE mods', () => {
    const db = new ModDB();
    db.addMod(createMod('Life', 'BASE', 50, 'Tree'));
    db.addMod(createMod('Life', 'BASE', 30, 'Item'));
    expect(db.sum('BASE', null, 'Life')).toBe(80);
  });

  it('calculates MORE multiplier', () => {
    const db = new ModDB();
    db.addMod(createMod('Damage', 'MORE', 20, 'Skill'));
    db.addMod(createMod('Damage', 'MORE', 30, 'Support'));
    // (1 + 0.2) * (1 + 0.3) = 1.56
    expect(db.more(null, 'Damage')).toBeCloseTo(1.56, 2);
  });

  it('checks FLAG mods', () => {
    const db = new ModDB();
    expect(db.flag(null, 'Onslaught')).toBe(false);
    db.addMod(createMod('Onslaught', 'FLAG', true, 'Config'));
    expect(db.flag(null, 'Onslaught')).toBe(true);
  });

  it('traverses parent chain', () => {
    const parent = new ModDB();
    parent.addMod(createMod('Life', 'BASE', 100, 'Tree'));
    const child = new ModDB(parent);
    child.addMod(createMod('Life', 'BASE', 50, 'Item'));
    expect(child.sum('BASE', null, 'Life')).toBe(150);
  });

  it('handles OVERRIDE', () => {
    const db = new ModDB();
    db.addMod(createMod('CritChance', 'OVERRIDE', 100, 'Item'));
    expect(db.override(null, 'CritChance')).toBe(100);
  });

  it('lists LIST mods', () => {
    const db = new ModDB();
    db.addMod(createMod('Keystone', 'LIST', 'Resolute Technique', 'Tree'));
    db.addMod(createMod('Keystone', 'LIST', 'Iron Reflexes', 'Tree'));
    const result = db.list(null, 'Keystone');
    expect(result).toContain('Resolute Technique');
    expect(result).toContain('Iron Reflexes');
  });

  it('respects mod flags', () => {
    const db = new ModDB();
    const { ModFlag } = await import('../utils.js');
    db.addMod(createMod('Damage', 'INC', 20, 'Item', ModFlag.Attack));
    db.addMod(createMod('Damage', 'INC', 30, 'Item', ModFlag.Spell));
    // Querying with Attack flag should only get the first
    expect(db.sum('INC', { flags: ModFlag.Attack, keywordFlags: 0 }, 'Damage')).toBe(20);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement mod-db.js**

Port ModStore and ModDB. The JS version should:
- Use a `Map` for `this.mods` (mod name → mod array)
- Use `Map` for `this.conditions` and `this.multipliers`
- Implement `EvalMod` for tag evaluation (Condition, Multiplier, MultiplierThreshold, PercentStat, PerStat, etc.)
- Support parent chain via constructor parameter

Reference `ModStore.lua:1-879` and `ModDB.lua:1-317` for exact logic.

**Step 4: Run tests, verify PASS**

**Step 5: Commit**

---

### Task 6: ModList

**Files:**
- Create: `js/engine/mod-list.js`
- Create: `js/engine/__tests__/mod-list.test.js`

**Context:** Port `Classes/ModList.lua` (224 lines). ModList is a simpler flat array of mods used for intermediate storage (e.g., node mod lists, item mod lists). It extends ModStore but stores mods in a flat array instead of a name-indexed map.

**Step 1: Write tests for ModList operations (add, merge, scale)**

**Step 2: Run to verify fail**

**Step 3: Implement ModList extending ModStore base, with MergeNewMod**

**Step 4: Run tests, verify PASS**

**Step 5: Commit**

---

### Task 7: ModParser — Form/Flag/Keyword Matching

**Files:**
- Create: `js/engine/mod-parser.js`
- Create: `js/engine/__tests__/mod-parser.test.js`

**Context:** Port `Modules/ModParser.lua` (6,641 lines). This is the largest single module. Break it into 3 tasks. This first task covers the infrastructure: form matching (`"^(%d+)%% increased"` → `INC`), flag word matching (`"attack"` → `ModFlag.Attack`), keyword matching (`"fire"` → `KeywordFlag.Fire`), and the overall `parseMod(line)` dispatch.

Reference `ModParser.lua:63-200` for `formList`, `ModParser.lua:200-400` for flag/keyword tables, and the main `parseMod` function structure.

**Step 1: Write tests for form/flag/keyword extraction**

```js
import { describe, it, expect } from 'vitest';
import { parseMod } from '../mod-parser.js';

describe('ModParser forms', () => {
  it('parses increased form', () => {
    const mod = parseMod('10% increased Maximum Life');
    expect(mod).toBeTruthy();
    expect(mod.type).toBe('INC');
    expect(mod.value).toBe(10);
  });

  it('parses more form', () => {
    const mod = parseMod('20% more Attack Speed');
    expect(mod).toBeTruthy();
    expect(mod.type).toBe('MORE');
    expect(mod.value).toBe(20);
  });

  it('parses base addition form', () => {
    const mod = parseMod('+50 to Maximum Life');
    expect(mod).toBeTruthy();
    expect(mod.type).toBe('BASE');
    expect(mod.value).toBe(50);
  });
});
```

**Step 2: Run to verify fail**

**Step 3: Implement form list, flag/keyword word lists, and parseMod dispatch skeleton**

**Step 4: Run tests, verify PASS**

**Step 5: Commit**

---

### Task 8: ModParser — Mod Line Patterns Batch 1 (Defences, Attributes, Life/Mana/ES)

**Files:**
- Modify: `js/engine/mod-parser.js`
- Modify: `js/engine/__tests__/mod-parser.test.js`

**Context:** Port the mod line matching patterns from `ModParser.lua` for:
- Life, Mana, Energy Shield mods
- Attribute mods (Str, Dex, Int)
- Resistance mods
- Armour, Evasion, Block mods
- Regen, Leech mods

This covers roughly `ModParser.lua:400-2500` (the defense-related pattern block).

**Step 1: Write tests for specific mod lines**

```js
describe('ModParser defence patterns', () => {
  it('parses life', () => {
    const mod = parseMod('+50 to Maximum Life');
    expect(mod.name).toBe('Life');
    expect(mod.value).toBe(50);
  });

  it('parses resistance', () => {
    const mod = parseMod('+30% to Fire Resistance');
    expect(mod.name).toBe('FireResist');
    expect(mod.value).toBe(30);
  });

  it('parses energy shield', () => {
    const mod = parseMod('15% increased Maximum Energy Shield');
    expect(mod.name).toBe('EnergyShield');
    expect(mod.type).toBe('INC');
    expect(mod.value).toBe(15);
  });

  it('parses attributes', () => {
    const mod = parseMod('+20 to Strength');
    expect(mod.name).toBe('Str');
    expect(mod.value).toBe(20);
  });
});
```

**Step 2–5:** Add patterns, test, commit.

---

### Task 9: ModParser — Mod Line Patterns Batch 2 (Offence, Damage, Crit, Speed)

**Files:**
- Modify: `js/engine/mod-parser.js`
- Modify: `js/engine/__tests__/mod-parser.test.js`

**Context:** Port patterns for:
- Damage mods (physical, elemental, chaos)
- Damage conversion
- Critical strike chance/multiplier
- Attack/cast speed
- Accuracy
- Penetration

Covers roughly `ModParser.lua:2500-4500`.

**Step 1: Write tests for offence mod lines**

**Step 2–5:** Add patterns, test, commit.

---

### Task 10: ModParser — Mod Line Patterns Batch 3 (Remaining)

**Files:**
- Modify: `js/engine/mod-parser.js`
- Modify: `js/engine/__tests__/mod-parser.test.js`

**Context:** Port remaining patterns:
- Gem/skill mods
- Flask mods
- Jewel-specific mods
- Minion mods
- Aura/curse/mark mods
- Trap/mine/totem mods
- Special mods (radius jewel conversions, conqueror jewels, etc.)

Covers roughly `ModParser.lua:4500-6641`.

**Step 1: Write tests, then implement, then commit.**

---

## Phase 3: Calculation Engine

### Task 11: CalcTools & Helper Functions

**Files:**
- Create: `js/engine/calc-tools.js`
- Create: `js/engine/__tests__/calc-tools.test.js`

**Context:** Port `Modules/CalcTools.lua` (291 lines). Contains:
- `calcMod` — evaluates a mod value with multiplier stacking
- `validateGem` — checks gem validity
- `matchesSkillTypes` — checks if support applies to active
- `gemIsType` — determines gem classification
- `buildStatTable` — builds stat table for a skill

**Step 1–5:** TDD cycle, implement, commit.

---

### Task 12: CalcSetup — Environment Initialization

**Files:**
- Create: `js/engine/calc-setup.js`
- Create: `js/engine/__tests__/calc-setup.test.js`

**Context:** Port `Modules/CalcSetup.lua` (1,764 lines). Initializes the calculation environment:
- Creates ModDB instances for player and enemy
- Adds base mods (resistance caps, charge limits, etc.)
- Processes passive tree allocations → mods
- Processes items → mods
- Processes gems/skills
- Handles bandits, pantheons
- Special handling for radius jewels, abyss jewels, flasks

**Step 1: Write test that creates a minimal calc environment and verifies base mods are present**

**Step 2–5:** Implement `initModDB`, `initEnv`, item/passive processing, commit.

---

### Task 13: CalcPerform — Base Stats

**Files:**
- Create: `js/engine/calc-perform.js`
- Create: `js/engine/__tests__/calc-perform.test.js`

**Context:** Port `Modules/CalcPerform.lua` (3,596 lines). Core stat calculation:
- `doActorLifeMana` — calculates Life, Mana, ES with INC/MORE stacking
- Attribute calculations (Str → Life, Dex → Evasion, Int → ES)
- Charge calculations
- Buff/debuff merging
- Main skill selection and active skill building

**Step 1: Write test with known build data → verify Life, Mana, ES, attribute outputs**

**Step 2–5:** Implement, test, commit.

---

### Task 14: CalcDefence

**Files:**
- Create: `js/engine/calc-defence.js`
- Create: `js/engine/__tests__/calc-defence.test.js`

**Context:** Port `Modules/CalcDefence.lua` (3,802 lines):
- Resistances (fire/cold/lightning/chaos) with cap logic
- Armour calculation (physical damage reduction)
- Evasion calculation (chance to evade)
- Block (attack/spell block chance with cap)
- Spell suppression
- Energy shield recharge
- Life/mana/ES leech and regen
- Damage taken modifiers

**Step 1: Write tests comparing known build outputs**

**Step 2–5:** Implement, test, commit.

---

### Task 15: CalcOffence — Damage, Hit, Crit (Batch 1)

**Files:**
- Create: `js/engine/calc-offence.js`
- Create: `js/engine/__tests__/calc-offence.test.js`

**Context:** Port `Modules/CalcOffence.lua:1-3000`. First half:
- `calcDamage` — min/max damage per type with conversion chains
- Hit damage calculation
- Critical strike chance and multiplier
- Attack/cast speed
- Accuracy and hit chance
- Base DPS calculation

**Step 1: Write tests with known skill → damage output comparisons**

**Step 2–5:** Implement, test, commit.

---

### Task 16: CalcOffence — DoT, Ailments, DPS (Batch 2)

**Files:**
- Modify: `js/engine/calc-offence.js`
- Modify: `js/engine/__tests__/calc-offence.test.js`

**Context:** Port `CalcOffence.lua:3000-5879`. Second half:
- Damage over Time calculation
- Ailment calculations (ignite, bleed, poison, freeze, shock, etc.)
- Impale calculations
- Total DPS finalization
- Minion/totem/trap/mine damage delegation

**Step 1–5:** TDD cycle, implement, commit.

---

### Task 17: CalcActiveSkill

**Files:**
- Create: `js/engine/calc-active-skill.js`
- Create: `js/engine/__tests__/calc-active-skill.test.js`

**Context:** Port `Modules/CalcActiveSkill.lua` (902 lines):
- Building active skill from gem data + support gems
- Skill mod list construction
- Skill type validation
- Support gem applicability checking

**Step 1–5:** TDD cycle, implement, commit.

---

### Task 18: CalcTriggers

**Files:**
- Create: `js/engine/calc-triggers.js`
- Create: `js/engine/__tests__/calc-triggers.test.js`

**Context:** Port trigger handling from CalcOffence.lua:
- Cast on Critical Strike
- Cast when Damage Taken
- Spellslinger, Arcanist Brand
- Cooldown and trigger rate calculations

**Step 1–5:** TDD cycle, implement, commit.

---

### Task 19: Web Worker Integration & Message Protocol

**Files:**
- Modify: `js/engine/worker.js`
- Create: `js/engine/__tests__/worker.test.js`

**Context:** Wire all calc modules together in the Web Worker:

```
UI → Worker:
  { type: 'calculate', payload: { build } }
  { type: 'parseItem', payload: { itemText } }
  { type: 'parseMod',  payload: { modLine } }

Worker → UI:
  { type: 'result',   payload: { output, breakdowns } }
  { type: 'progress', payload: { phase, percent } }
  { type: 'error',    payload: { message } }
```

Wire up: `loadData` → `CalcSetup.initEnv` → `CalcPerform` → `CalcOffence` → `CalcDefence` → return results.

**Step 1: Write integration test that sends a minimal build and verifies a result message**

**Step 2–5:** Wire up modules, test, commit.

---

## Phase 4: Data Models & Build I/O

### Task 20: Item Model & Parser

**Files:**
- Create: `js/models/item.js`
- Create: `js/models/__tests__/item.test.js`

**Context:** Port `Classes/Item.lua` (1,831 lines):
- `ParseRaw` — parses game item text into structured Item
- Item properties: base type, rarity, sockets, links, quality, influences
- Mod line parsing (implicit, explicit, crafted, enchant, etc.)
- Catalyst quality scaling
- Item tooltip generation

**Step 1: Write test that parses a known item text and verifies properties**

**Step 2–5:** Implement, test, commit.

---

### Task 21: Skill/Gem Model

**Files:**
- Create: `js/models/skill.js`
- Create: `js/models/__tests__/skill.test.js`

**Context:** Port skill/gem data model:
- Gem lookup from `gems.json`
- Skill group (linked gem set) management
- Active vs support gem classification
- Gem level/quality scaling

**Step 1–5:** TDD cycle, implement, commit.

---

### Task 22: PassiveSpec Model

**Files:**
- Create: `js/models/passive-spec.js`
- Create: `js/models/__tests__/passive-spec.test.js`

**Context:** Port `Classes/PassiveSpec.lua` (2,123 lines):
- Tree allocation state (set of allocated node IDs)
- Shortest path calculation (for allocating/deallocating nodes)
- Node validity checking (connected to class start)
- Ascendancy node handling
- Jewel socket tracking
- Cluster jewel handling
- Anoint handling

**Step 1: Write tests for allocation/deallocation/path-finding**

**Step 2–5:** Implement, test, commit.

---

### Task 23: Build Model & XML Serialization

**Files:**
- Create: `js/models/build.js`
- Create: `js/io/build-xml.js`
- Create: `js/io/__tests__/build-xml.test.js`

**Context:** Port build save/load from `Modules/Build.lua`:
- Build XML schema (compatible with desktop PoB)
- XML parse → Build object
- Build object → XML string
- Build sections: Tree, Items, Skills, Config, Notes, etc.

Use the browser's DOMParser for XML parsing.

**Step 1: Write test that parses a real PoB XML build and verifies structure**

Use a test build from `spec/TestBuilds/3.13/` — export its XML content.

**Step 2–5:** Implement, test, commit.

---

### Task 24: Share Code Encode/Decode

**Files:**
- Create: `js/io/share-code.js`
- Create: `js/io/__tests__/share-code.test.js`

**Context:** PoB share codes are `base64(zlib_deflate(xml_string))`.

**Step 1: Install pako**

```bash
npm install pako
```

**Step 2: Write test with known share code ↔ XML**

```js
import { describe, it, expect } from 'vitest';
import { encodeShareCode, decodeShareCode } from '../share-code.js';

describe('share codes', () => {
  it('round-trips XML through encode/decode', () => {
    const xml = '<Build><Tree>test</Tree></Build>';
    const code = encodeShareCode(xml);
    expect(typeof code).toBe('string');
    expect(decodeShareCode(code)).toBe(xml);
  });
});
```

**Step 3: Implement**

```js
import pako from 'pako';

export function encodeShareCode(xmlString) {
  const compressed = pako.deflate(new TextEncoder().encode(xmlString));
  return btoa(String.fromCharCode(...compressed));
}

export function decodeShareCode(shareCode) {
  const binary = atob(shareCode);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const decompressed = pako.inflate(bytes);
  return new TextDecoder().decode(decompressed);
}
```

**Step 4: Test PASS**

**Step 5: Commit**

---

### Task 25: ConfigOptions Model

**Files:**
- Create: `js/models/config-options.js`
- Create: `js/models/__tests__/config-options.test.js`

**Context:** Port `Modules/ConfigOptions.lua`. This file contains config options with inline `apply` functions. The Lua-to-JSON converter will have replaced these with `null`. We need to manually port the apply logic to JS for each config option.

Config options include: conditions (checkboxes like "Is the enemy a Boss?"), counts (numbers like "Number of nearby enemies"), dropdowns (like "Map mod tier").

**Step 1–5:** TDD cycle for config apply functions, implement, commit.

---

## Phase 5: Passive Tree Renderer

### Task 26: Tree Data Loader & Graph Structure

**Files:**
- Create: `js/tree/tree-data.js`
- Create: `js/tree/__tests__/tree-data.test.js`

**Context:** Load tree JSON (from converted `tree.lua`) and build a traversable graph:
- Node objects with position, stats, type (normal/notable/keystone/jewel/mastery/ascendancy)
- Adjacency lists for connections
- Group structures (orbital positions)
- Class start positions
- Keystones by name lookup

**Step 1: Write test that loads a tree JSON and verifies node counts, class starts**

**Step 2–5:** Implement, test, commit.

---

### Task 27: WebGL Renderer — Setup, Texture Atlas, Instanced Rendering

**Files:**
- Create: `js/tree/tree-renderer.js`
- Create: `js/tree/shaders/node.vert.glsl`
- Create: `js/tree/shaders/node.frag.glsl`
- Create: `js/tree/shaders/connection.vert.glsl`
- Create: `js/tree/shaders/connection.frag.glsl`

**Context:** WebGL2 setup for the passive tree:
- Canvas element with WebGL2 context
- Texture atlas loaded from tree sprite sheets
- Instanced rendering for nodes (one draw call per node type)
- Orthographic camera with view/projection matrices

**Step 1: Write test that creates a WebGL context (use OffscreenCanvas or mock)**

**Step 2–5:** Implement shaders, atlas packing, instanced draw, commit.

---

### Task 28: WebGL Renderer — Node/Connection Drawing, Layers

**Files:**
- Modify: `js/tree/tree-renderer.js`

**Context:** Implement the 5-layer rendering pipeline:
1. Background — class-themed background image
2. Connections — lines between nodes (allocated=gold, inactive=grey)
3. Nodes — instanced sprites (normal/notable/keystone × allocated/unallocated/can-allocate)
4. Overlays — jewel radius circles, search highlights, path preview
5. HTML overlay — tooltips, search bar (CSS positioned over canvas)

**Step 1–5:** Implement each layer, visual verification, commit.

---

### Task 29: Tree Interaction — Pan/Zoom/Click/Hover

**Files:**
- Create: `js/tree/tree-interaction.js`

**Context:** Event handling for the tree canvas:
- Mouse drag / touch drag for panning (with momentum)
- Mouse wheel / pinch for zoom (animated zoom-to-cursor)
- Click to allocate/deallocate (with shortest path)
- Hover for tooltips
- Shift+click for path preview
- View frustum culling for performance
- Dirty flag rendering

**Step 1–5:** Implement event handlers, camera updates, commit.

---

### Task 30: Tree Path-Finding & Allocation Logic

**Files:**
- Modify: `js/tree/tree-interaction.js`
- Reference: `js/models/passive-spec.js` (Task 22)

**Context:** When a user clicks a node:
1. Find shortest path from currently allocated nodes to target
2. Validate path (all intermediate nodes must be allocable)
3. Update PassiveSpec with new allocations
4. Re-render tree with updated state
5. Trigger recalculation in worker

**Step 1–5:** Implement path-finding (BFS), allocation, recalc trigger, commit.

---

### Task 31: Tree Search & Highlight

**Files:**
- Create: `js/tree/tree-search.js`

**Context:** Text search over tree nodes:
- Search input field (HTML overlay)
- Filter nodes by name/stats matching search text
- Dim non-matching nodes
- Highlight matching nodes with glow effect
- Show match count

**Step 1–5:** Implement search, highlighting, commit.

---

## Phase 6: UI Shell & Tabs

### Task 32: Component System & Base Classes

**Files:**
- Create: `js/ui/component.js`
- Create: `js/ui/tooltip.js`
- Create: `js/ui/dropdown.js`
- Create: `js/ui/list-control.js`
- Create: `js/ui/edit-control.js`
- Create: `js/ui/modal.js`
- Create: `css/components.css`

**Context:** Vanilla JS component system matching PoB's control classes:
- `Component` base class with `render()`, `destroy()`, `show()`, `hide()`
- `Tooltip` with PoB color code rendering (`^xRRGGBB` → CSS)
- `DropdownControl` with search and keyboard navigation
- `ListControl` with virtual scrolling for large datasets
- `EditControl` with validation
- `Modal` for popups

**Step 1–5:** Implement each component, commit.

---

### Task 33: App Shell — Layout, Tab Panel, Stat Sidebar

**Files:**
- Modify: `js/app.js`
- Create: `js/ui/tab-panel.js`
- Create: `js/ui/stat-sidebar.js`
- Create: `css/tabs.css`

**Context:** Main app layout:
- Menu bar (build name, class selector, level input, settings)
- Tab bar (Tree, Skills, Items, Calcs, Config, Import, Notes)
- Tab content area (lazy-initialized tabs)
- Stat sidebar (always visible, updates on calc results)
- Status bar (skill points, ascendancy points)

**Step 1–5:** Implement layout, tab switching, sidebar updates, commit.

---

### Task 34: Tree Tab

**Files:**
- Create: `js/tabs/tree-tab.js`
- Create: `css/tree.css`

**Context:** Integrates the WebGL tree renderer (Tasks 26-31) into the tab system:
- Canvas element filling tab content
- Class selector dropdown
- Ascendancy selector
- Tree version selector
- Search bar overlay
- Zoom controls

**Step 1–5:** Wire up tree renderer to tab, commit.

---

### Task 35: Skills Tab

**Files:**
- Create: `js/tabs/skills-tab.js`

**Context:** Port `Classes/SkillsTab.lua` (1,345 lines):
- Socket group list (each group = linked gems)
- Gem selector with search
- Gem level/quality inputs
- Active skill selector
- Support gem enabling/disabling

**Step 1–5:** Implement skill group UI, gem selection, commit.

---

### Task 36: Items Tab

**Files:**
- Create: `js/tabs/items-tab.js`

**Context:** Port `Classes/ItemsTab.lua` (4,047 lines — largest tab):
- Item slot list (Helmet, Body, Gloves, Boots, weapons, rings, amulet, belt, flasks, jewels)
- Item editor (paste item text)
- Item set management
- Unique item database with search
- Rare item crafting templates
- Socket/link display
- Item comparison tooltips

**Step 1–5:** Implement slot list, editor, database, commit.

---

### Task 37: Calcs Tab (Breakdown Display)

**Files:**
- Create: `js/tabs/calcs-tab.js`

**Context:** Port `Classes/CalcsTab.lua` (660 lines):
- Collapsible stat sections (Offence, Defence, etc.)
- Stat breakdown display (click a stat to see calculation details)
- Per-skill stat display
- Comparison mode (show stat changes when hovering items/nodes)

**Step 1–5:** Implement sections, breakdowns, commit.

---

### Task 38: Config Tab

**Files:**
- Create: `js/tabs/config-tab.js`

**Context:** Port `Classes/ConfigTab.lua`:
- Generates UI from `config-options.js` definitions
- Checkboxes, number inputs, dropdowns
- Sections: General, Skill Options, Map Mods, etc.
- Each option applies mods to the calc environment via its `apply` function

**Step 1–5:** Implement config form generation, commit.

---

### Task 39: Import Tab & File Manager

**Files:**
- Create: `js/tabs/import-tab.js`
- Create: `js/io/file-manager.js`

**Context:**
- Share code paste → decode → load build
- File import (File API → read XML → load build)
- Character import (paste JSON from game client)
- File save (Blob → download)
- Build comparison

**Step 1–5:** Implement import methods, commit.

---

### Task 40: Notes Tab

**Files:**
- Create: `js/tabs/notes-tab.js`

**Context:** Simple textarea for build notes, saved in build XML.

**Step 1–5:** Implement, commit.

---

## Phase 7: Integration & Verification

### Task 41: End-to-End Build Loading & Calc Verification

**Files:**
- Create: `js/__tests__/integration.test.js`

**Context:** Use the test builds from `PathOfBuilding/spec/TestBuilds/3.13/` (5 builds with known expected outputs). For each:
1. Load build XML
2. Run full calculation pipeline
3. Compare key output values (DPS, Life, Resistances, etc.) with Lua expected values
4. Allow tolerance of ±0.01% for floating point differences

**Step 1: Extract test build data into JSON fixtures**

```bash
# From each .lua test build, extract the xml and expected output
# Store as JSON: { xml: "...", expectedOutput: { TotalDPS: 12345, ... } }
```

**Step 2: Write integration test**

```js
import { describe, it, expect } from 'vitest';
import testBuilds from './fixtures/test-builds.json';

describe('End-to-end calculation verification', () => {
  for (const [name, build] of Object.entries(testBuilds)) {
    it(`matches Lua output for ${name}`, async () => {
      const result = await calculateBuild(build.xml);
      for (const [key, expected] of Object.entries(build.expectedOutput)) {
        const actual = result.output[key];
        if (typeof expected === 'number') {
          expect(actual).toBeCloseTo(expected, 2);
        } else {
          expect(actual).toBe(expected);
        }
      }
    });
  }
});
```

**Step 3: Fix discrepancies until all builds match**

**Step 4: Commit**

---

### Task 42: Performance Optimization & Lazy Loading

**Files:**
- Create: `js/data/loader.js`
- Modify: `js/app.js`

**Context:**
- Lazy load data files (only load gem data at startup, defer mod pools and tree data)
- Chunk large JSON files (ModItem 4MB → split into ~500KB chunks)
- Add loading progress indicator
- Profile Web Worker calculation time, optimize hot paths
- Add dirty flag rendering to tree (skip re-render when state unchanged)
- Implement LOD for tree at far zoom levels

**Step 1–5:** Implement lazy loader, chunking, profiling, commit.

---

### Task 43: IndexedDB Auto-Save & Build Library

**Files:**
- Create: `js/io/build-storage.js`
- Create: `js/io/__tests__/build-storage.test.js`

**Context:**
- IndexedDB store for builds (auto-save every 30 seconds)
- Build library UI (list saved builds, rename, delete, duplicate)
- Export all builds as zip
- Import builds from zip

**Step 1–5:** Implement IndexedDB wrapper, auto-save, UI, commit.

---

## Appendix: Key Reference Files

| JS Module | Lua Source | Lines |
|-----------|-----------|-------|
| `mod-parser.js` | `Modules/ModParser.lua` | 6,641 |
| `calc-offence.js` | `Modules/CalcOffence.lua` | 5,879 |
| `calc-defence.js` | `Modules/CalcDefence.lua` | 3,802 |
| `calc-perform.js` | `Modules/CalcPerform.lua` | 3,596 |
| `calc-setup.js` | `Modules/CalcSetup.lua` | 1,764 |
| `mod-db.js` | `Classes/ModDB.lua` + `ModStore.lua` | 1,196 |
| `item.js` | `Classes/Item.lua` | 1,831 |
| `passive-spec.js` | `Classes/PassiveSpec.lua` | 2,123 |
| `items-tab.js` | `Classes/ItemsTab.lua` | 4,047 |
| `tree-tab.js` | `Classes/TreeTab.lua` | 2,495 |
| `skills-tab.js` | `Classes/SkillsTab.lua` | 1,345 |
| `build-xml.js` | `Modules/Build.lua` | 1,947 |
| `utils.js` | `Modules/Common.lua` + `Data/Global.lua` | 976+ |
| `calc-tools.js` | `Modules/CalcTools.lua` | 291 |
| `mod-tools.js` | `Modules/ModTools.lua` | 236 |

**Total core logic to port: ~45,000 lines of Lua → ~35,000 lines of JS (estimated)**

## Appendix: External Dependencies

| Dependency | Purpose | JS Equivalent |
|-----------|---------|---------------|
| `lcurl` | HTTP requests | `fetch` API |
| `xml` | XML parsing | `DOMParser` |
| `base64` | Base64 encoding | `btoa`/`atob` |
| `sha1` | SHA-1 hashing | `crypto.subtle` |
| `lzip` (Deflate) | Zlib compression | `pako` npm package |
| `SimpleGraphic` | 2D rendering | WebGL2 + Canvas 2D |
| `lua-utf8` | UTF-8 string handling | Native JS (UTF-16) |
