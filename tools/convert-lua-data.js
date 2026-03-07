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
    // Lua long strings strip the first newline after opening bracket
    if (pos < input.length && input[pos] === '\n') pos++;
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
      if (/^function\b/.test(rest)) { pos += 8; depth++; continue; }
      if (/^if\b/.test(rest)) { pos += 2; depth++; continue; }
      if (/^do\b/.test(rest)) { pos += 2; depth++; continue; }
      if (/^for\b/.test(rest)) { pos += 3; depth++; continue; }
      if (/^while\b/.test(rest)) { pos += 5; depth++; continue; }
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
        const beforePos = pos;
        value = parseValue();
        if (pos === beforePos) {
          // Parser didn't advance — skip character to avoid infinite loop
          pos++;
          continue;
        }
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

/**
 * Convert Lua base item files that use `itemBases["Name"] = { ... }` assignments.
 * Each .lua file becomes a JSON object mapping base names to their data.
 */
function convertBases(inputDir, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  for (const entry of readdirSync(inputDir)) {
    if (extname(entry) !== '.lua') continue;
    const fullPath = join(inputDir, entry);
    const lua = readFileSync(fullPath, 'utf-8');

    const result = {};
    // Match each itemBases["Name"] = { ... } assignment
    const assignRegex = /itemBases\["([^"]+)"\]\s*=\s*\{/g;
    let match;
    while ((match = assignRegex.exec(lua)) !== null) {
      const name = match[1];
      // Find the opening brace position for parseLuaTable
      const braceStart = match.index + match[0].length - 1; // position of '{'
      // Extract from '{' onward and parse with parseLuaTable
      const tableStr = lua.substring(braceStart);
      result[name] = parseLuaTable(tableStr);
    }

    const outName = basename(entry, '.lua') + '.json';
    const outputPath = join(outputDir, outName);
    writeFileSync(outputPath, JSON.stringify(result, null, 0));
    const inSize = (statSync(fullPath).size / 1024).toFixed(0);
    const outSize = (statSync(outputPath).size / 1024).toFixed(0);
    console.log(`  ${basename(entry)} (${inSize}KB) → ${outName} (${outSize}KB)`);
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
  convertBases(join(POB_SRC, 'Data', 'Bases'), join(OUT_DIR, 'bases'));

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
