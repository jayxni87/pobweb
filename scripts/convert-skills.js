#!/usr/bin/env node
/**
 * Convert Lua skill data files from PathOfBuilding to JSON.
 *
 * Reads PathOfBuilding/src/Data/Skills/*.lua (excluding spectre.lua)
 * and outputs js/data/skills.json with all skill entries.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'PathOfBuilding', 'src', 'Data', 'Skills');
const OUTPUT = path.join(ROOT, 'js', 'data', 'skills.json');

const FILES = [
  'act_str.lua', 'act_dex.lua', 'act_int.lua',
  'sup_str.lua', 'sup_dex.lua', 'sup_int.lua',
  'other.lua', 'glove.lua', 'minion.lua',
];

// ---------------------------------------------------------------------------
// Lua comment stripping
// ---------------------------------------------------------------------------

/**
 * Remove Lua line comments (--) and block comments (--[[ ... ]]).
 * Preserves strings (double-quoted) so we don't mangle string contents.
 */
function stripComments(src) {
  // Remove block comments first: --[[ ... ]]  (possibly with = signs like --[==[...]==])
  src = src.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '');
  // Remove line comments, but not inside strings.
  // Simple approach: process line by line, skip if inside a string.
  const lines = src.split('\n');
  const result = [];
  for (const line of lines) {
    let out = '';
    let inStr = false;
    let strChar = '';
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (inStr) {
        out += ch;
        if (ch === '\\') {
          // escaped char
          i++;
          if (i < line.length) out += line[i];
        } else if (ch === strChar) {
          inStr = false;
        }
      } else {
        if (ch === '"' || ch === "'") {
          inStr = true;
          strChar = ch;
          out += ch;
        } else if (ch === '-' && i + 1 < line.length && line[i + 1] === '-') {
          // line comment
          break;
        } else {
          out += ch;
        }
      }
      i++;
    }
    result.push(out);
  }
  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Tokenizer — very simple Lua tokenizer for the skill data subset
// ---------------------------------------------------------------------------

/**
 * Token types: string, number, identifier, symbol
 */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    // skip whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // number (including negative via unary minus handled at parse level)
    if (/[0-9]/.test(src[i]) || (src[i] === '.' && i + 1 < len && /[0-9]/.test(src[i + 1]))) {
      let num = '';
      // hex?
      if (src[i] === '0' && i + 1 < len && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        num += src[i] + src[i + 1];
        i += 2;
        while (i < len && /[0-9a-fA-F]/.test(src[i])) { num += src[i]; i++; }
      } else {
        while (i < len && /[0-9.]/.test(src[i])) { num += src[i]; i++; }
        // scientific notation
        if (i < len && (src[i] === 'e' || src[i] === 'E')) {
          num += src[i]; i++;
          if (i < len && (src[i] === '+' || src[i] === '-')) { num += src[i]; i++; }
          while (i < len && /[0-9]/.test(src[i])) { num += src[i]; i++; }
        }
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // string (double or single quoted)
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i];
      let s = '';
      i++; // skip opening quote
      while (i < len && src[i] !== q) {
        if (src[i] === '\\') {
          i++;
          if (i < len) {
            switch (src[i]) {
              case 'n': s += '\n'; break;
              case 't': s += '\t'; break;
              case 'r': s += '\r'; break;
              case '\\': s += '\\'; break;
              case '"': s += '"'; break;
              case "'": s += "'"; break;
              default: s += src[i]; break;
            }
          }
        } else {
          s += src[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: 'string', value: s });
      continue;
    }

    // long string [[ ... ]]
    if (src[i] === '[' && i + 1 < len && src[i + 1] === '[') {
      i += 2;
      let s = '';
      while (i + 1 < len && !(src[i] === ']' && src[i + 1] === ']')) {
        s += src[i]; i++;
      }
      i += 2; // skip ]]
      tokens.push({ type: 'string', value: s });
      continue;
    }

    // identifier or keyword
    if (/[a-zA-Z_]/.test(src[i])) {
      let id = '';
      while (i < len && /[a-zA-Z0-9_]/.test(src[i])) { id += src[i]; i++; }
      tokens.push({ type: 'identifier', value: id });
      continue;
    }

    // symbols
    tokens.push({ type: 'symbol', value: src[i] });
    i++;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser — recursive descent over token stream
// ---------------------------------------------------------------------------

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  next() {
    return this.tokens[this.pos++];
  }

  expect(type, value) {
    const t = this.next();
    if (!t || t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${type}${value !== undefined ? ' ' + value : ''} but got ${t ? t.type + ' ' + t.value : 'EOF'} at pos ${this.pos - 1}`);
    }
    return t;
  }

  atEnd() {
    return this.pos >= this.tokens.length;
  }

  /**
   * Parse a Lua value: number, string, nil, true, false, table constructor, function call, etc.
   * Returns a JS value.
   */
  parseValue() {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of input');

    // Unary minus
    if (t.type === 'symbol' && t.value === '-') {
      this.next();
      const val = this.parseValue();
      if (typeof val === 'number') return -val;
      return val; // fallback
    }

    // nil
    if (t.type === 'identifier' && t.value === 'nil') {
      this.next();
      return null;
    }

    // true/false
    if (t.type === 'identifier' && (t.value === 'true' || t.value === 'false')) {
      this.next();
      return t.value === 'true';
    }

    // number
    if (t.type === 'number') {
      this.next();
      return parseFloat(t.value);
    }

    // string
    if (t.type === 'string') {
      this.next();
      return t.value;
    }

    // table constructor
    if (t.type === 'symbol' && t.value === '{') {
      return this.parseTable();
    }

    // function call or dotted identifier:  mod(...), skill(...), flag(...), bit.bor(...)
    // or prefixed identifier: SkillType.Spell, ModFlag.Attack, KeywordFlag.Hit
    if (t.type === 'identifier') {
      return this.parseIdentifierExpr();
    }

    // If we can't parse, skip the token
    this.next();
    return undefined;
  }

  /**
   * Parse an identifier expression:
   *   - Simple identifier: SkillType
   *   - Dotted: SkillType.Spell, bit.bor(...)
   *   - Function call: mod(...), skill(...), flag(...)
   */
  parseIdentifierExpr() {
    const id = this.next(); // identifier token

    // Check for dot access (handle chained: a.b.c.d)
    if (this.peek() && this.peek().type === 'symbol' && this.peek().value === '.') {
      let name = id.value;
      while (this.peek() && this.peek().type === 'symbol' && this.peek().value === '.') {
        this.next(); // consume '.'
        const field = this.next(); // field name
        name += '.' + field.value;
      }

      // Function call: bit.bor(...), bit.band(...)
      if (this.peek() && this.peek().type === 'symbol' && this.peek().value === '(') {
        return this.parseFunctionCall(name);
      }

      // SkillType.X -> "X"
      if (id.value === 'SkillType') {
        return name.slice('SkillType.'.length);
      }

      // Cross-skill reference: skills.ExplosiveTrap.statMap -> { _ref: "ExplosiveTrap", _field: "statMap" }
      if (id.value === 'skills') {
        const parts = name.split('.');
        if (parts.length === 3) {
          return { _ref: parts[1], _field: parts[2] };
        }
      }

      // ModFlag.X / KeywordFlag.X -> keep as string "ModFlag.X" / "KeywordFlag.X"
      return name;
    }

    // Function call: mod(...), skill(...), flag(...)
    if (this.peek() && this.peek().type === 'symbol' && this.peek().value === '(') {
      return this.parseFunctionCall(id.value);
    }

    // local, function, end keywords when we encounter inline Lua code
    if (id.value === 'local' || id.value === 'function' || id.value === 'end') {
      return { _luaCode: true, keyword: id.value };
    }

    // Bare identifier
    return id.value;
  }

  /**
   * Parse a function call: name(arg1, arg2, ...)
   * Returns a serialized object.
   */
  parseFunctionCall(name) {
    this.expect('symbol', '(');
    const args = [];
    let depth = 1;

    // For known functions, parse arguments properly
    if (name === 'mod' || name === 'skill' || name === 'flag' || name === 'bit.bor' || name === 'bit.band') {
      while (!this.atEnd()) {
        if (this.peek().type === 'symbol' && this.peek().value === ')') {
          this.next();
          break;
        }
        if (this.peek().type === 'symbol' && this.peek().value === ',') {
          this.next();
          continue;
        }
        args.push(this.parseValue());
      }
    } else {
      // Unknown function — skip balanced parens
      while (!this.atEnd()) {
        const tok = this.next();
        if (tok.type === 'symbol' && tok.value === '(') depth++;
        if (tok.type === 'symbol' && tok.value === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      return { fn: name, _raw: true };
    }

    if (name === 'bit.bor') {
      return { fn: 'bit.bor', args };
    }
    if (name === 'bit.band') {
      return { fn: 'bit.band', args };
    }
    if (name === 'mod') {
      const result = { fn: 'mod' };
      if (args.length >= 1) result.name = args[0];
      if (args.length >= 2) result.type = args[1];
      if (args.length >= 3) result.value = args[2];
      // Additional arguments (flags, keyword flags, conditions)
      const extra = [];
      for (let i = 3; i < args.length; i++) {
        extra.push(args[i]);
      }
      if (extra.length > 0) result.extra = extra;
      return result;
    }
    if (name === 'skill') {
      const result = { fn: 'skill' };
      if (args.length >= 1) result.name = args[0];
      if (args.length >= 2) result.value = args[1];
      const extra = [];
      for (let i = 2; i < args.length; i++) {
        extra.push(args[i]);
      }
      if (extra.length > 0) result.extra = extra;
      return result;
    }
    if (name === 'flag') {
      const result = { fn: 'flag' };
      if (args.length >= 1) result.name = args[0];
      const extra = [];
      for (let i = 1; i < args.length; i++) {
        extra.push(args[i]);
      }
      if (extra.length > 0) result.extra = extra;
      return result;
    }

    return { fn: name, args };
  }

  /**
   * Parse a Lua table constructor: { ... }
   * Returns either a JS array (if all keys are sequential integers) or a JS object.
   * For mixed tables (positional + named), returns { _positional: [...], key1: val1, ... }
   */
  parseTable() {
    this.expect('symbol', '{');
    const entries = []; // { key, value, isPositional }
    let positionalIdx = 1;

    while (!this.atEnd()) {
      // closing brace
      if (this.peek().type === 'symbol' && this.peek().value === '}') {
        this.next();
        break;
      }

      // Skip commas and semicolons
      if (this.peek().type === 'symbol' && (this.peek().value === ',' || this.peek().value === ';')) {
        this.next();
        continue;
      }

      // [key] = value  (bracket key)
      if (this.peek().type === 'symbol' && this.peek().value === '[') {
        this.next(); // consume '['
        const key = this.parseValue();
        this.expect('symbol', ']');
        this.expect('symbol', '=');
        const value = this.parseValue();
        entries.push({ key: String(key), value, isPositional: false });
        continue;
      }

      // identifier = value (named key) — check for '=' after identifier
      if (this.peek().type === 'identifier') {
        const pk2 = this.peek(1);
        if (pk2 && pk2.type === 'symbol' && pk2.value === '=') {
          const key = this.next().value;
          this.next(); // consume '='
          const value = this.parseValue();
          entries.push({ key, value, isPositional: false });
          continue;
        }
      }

      // Positional value
      const value = this.parseValue();
      if (value !== undefined) {
        entries.push({ key: positionalIdx, value, isPositional: true });
        positionalIdx++;
      }
    }

    // Determine output format
    const hasPositional = entries.some(e => e.isPositional);
    const hasNamed = entries.some(e => !e.isPositional);
    const allPositional = entries.every(e => e.isPositional);

    if (allPositional) {
      return entries.map(e => e.value);
    }

    // If it has both positional and named, it's likely a "level entry" or similar mixed table
    const obj = {};
    if (hasPositional) {
      // This is the mixed-table case (like level entries)
      // Mark positional values separately — caller (levels parser) will handle
      obj._positional = entries.filter(e => e.isPositional).map(e => e.value);
    }
    for (const e of entries) {
      if (!e.isPositional) {
        obj[e.key] = e.value;
      }
    }
    return obj;
  }
}

// ---------------------------------------------------------------------------
// Skill entry extraction — find "skills[...] = { ... }" blocks
// ---------------------------------------------------------------------------

/**
 * Find all skill entries in the tokenized source.
 * Each entry starts with: skills [ "Name" ] = { ... }
 */
function extractSkillEntries(tokens) {
  const skills = {};
  const parser = new Parser(tokens);

  while (!parser.atEnd()) {
    const t = parser.peek();

    // Look for: skills [ "Name" ] = {
    if (t.type === 'identifier' && t.value === 'skills') {
      const savedPos = parser.pos;
      try {
        parser.next(); // 'skills'
        parser.expect('symbol', '[');
        const nameToken = parser.next();
        if (nameToken.type !== 'string') {
          // Not a skill entry pattern, skip
          parser.pos = savedPos + 1;
          continue;
        }
        const skillName = nameToken.value;
        parser.expect('symbol', ']');
        parser.expect('symbol', '=');

        // Now parse the table — but we might hit inline Lua functions.
        // Use our special handler that can skip function bodies.
        const skillData = parseSkillTable(parser);
        if (skillData) {
          skills[skillName] = skillData;
        }
      } catch (e) {
        // If parsing fails, try to recover by finding next "skills[" pattern
        parser.pos = savedPos + 1;
      }
      continue;
    }

    parser.next(); // skip tokens we don't care about
  }

  return skills;
}

/**
 * Parse a skill's top-level table. Handles inline function bodies by
 * skipping them (storing a placeholder).
 */
function parseSkillTable(parser) {
  parser.expect('symbol', '{');
  const entries = {};

  while (!parser.atEnd()) {
    // closing brace
    if (parser.peek().type === 'symbol' && parser.peek().value === '}') {
      parser.next();
      break;
    }

    // Skip commas
    if (parser.peek().type === 'symbol' && (parser.peek().value === ',' || parser.peek().value === ';')) {
      parser.next();
      continue;
    }

    // identifier = value (named key)
    if (parser.peek().type === 'identifier') {
      const pk2 = parser.peek(1);
      if (pk2 && pk2.type === 'symbol' && pk2.value === '=') {
        const key = parser.next().value;
        parser.next(); // consume '='

        // Special case: function value (preDamageFunc = function(...) ... end,)
        if (parser.peek() && parser.peek().type === 'identifier' && parser.peek().value === 'function') {
          skipLuaFunctionBody(parser);
          entries[key] = { _luaFunction: true };
          continue;
        }

        const value = parser.parseValue();
        entries[key] = value;
        continue;
      }
    }

    // [key] = value
    if (parser.peek().type === 'symbol' && parser.peek().value === '[') {
      parser.next(); // [
      const key = parser.parseValue();
      parser.expect('symbol', ']');
      parser.expect('symbol', '=');
      const value = parser.parseValue();
      entries[String(key)] = value;
      continue;
    }

    // Skip anything else
    parser.next();
  }

  return entries;
}

/**
 * Skip a Lua inline function body: function(...) ... end
 * Uses simple depth counting of function/end keywords and brace matching.
 */
function skipLuaFunctionBody(parser) {
  parser.next(); // consume 'function'
  // Skip parameter list (...)
  let depth = 0;
  if (parser.peek() && parser.peek().type === 'symbol' && parser.peek().value === '(') {
    parser.next();
    depth = 1;
    while (!parser.atEnd() && depth > 0) {
      const t = parser.next();
      if (t.type === 'symbol' && t.value === '(') depth++;
      if (t.type === 'symbol' && t.value === ')') depth--;
    }
  }

  // Now skip until matching 'end', counting nested function/if/for/do/end
  let blockDepth = 1;
  while (!parser.atEnd() && blockDepth > 0) {
    const t = parser.next();
    if (t.type === 'identifier') {
      if (t.value === 'function' || t.value === 'if' || t.value === 'for' || t.value === 'while') {
        blockDepth++;
      } else if (t.value === 'end') {
        blockDepth--;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Post-processing of parsed skill data
// ---------------------------------------------------------------------------

function processSkillData(raw, skillId) {
  const skill = {};

  // Direct scalar fields
  const scalarFields = [
    'name', 'baseTypeName', 'color', 'description', 'castTime',
    'baseEffectiveness', 'incrementalEffectiveness',
    'support', 'hidden', 'fromItem', 'fromTree',
    'cannotBeSupported', 'isTrigger', 'ignoreMinionTypes',
    'plusVersionOf', 'statDescriptionScope',
    'skillTotemId', 'minionHasItemSet',
  ];
  for (const f of scalarFields) {
    if (raw[f] !== undefined) {
      skill[f] = raw[f];
    }
  }

  // baseFlags — already an object
  if (raw.baseFlags) {
    skill.baseFlags = raw.baseFlags;
  }

  // skillTypes — { [SkillType.Spell]: true, ... } -> ["Spell", ...]
  // After parsing, skillTypes is an object with SkillType string keys
  if (raw.skillTypes) {
    skill.skillTypes = extractSkillTypeStrings(raw.skillTypes);
  }

  // minionSkillTypes
  if (raw.minionSkillTypes) {
    skill.minionSkillTypes = extractSkillTypeStrings(raw.minionSkillTypes);
  }

  // requireSkillTypes, addSkillTypes, excludeSkillTypes — arrays of SkillType strings
  for (const f of ['requireSkillTypes', 'addSkillTypes', 'excludeSkillTypes']) {
    if (raw[f]) {
      skill[f] = normalizeSkillTypeArray(raw[f]);
    }
  }

  // stats — array of strings
  if (raw.stats) {
    skill.stats = Array.isArray(raw.stats) ? raw.stats : [];
  }

  // notMinionStat — array of strings
  if (raw.notMinionStat) {
    skill.notMinionStat = Array.isArray(raw.notMinionStat) ? raw.notMinionStat : [];
  }

  // constantStats — array of [statName, value]
  if (raw.constantStats) {
    skill.constantStats = normalizeConstantStats(raw.constantStats);
  }

  // qualityStats — { Default: [[statName, perQuality], ...] }
  if (raw.qualityStats) {
    skill.qualityStats = normalizeQualityStats(raw.qualityStats);
  }

  // statMap — object mapping stat names to arrays of mod/skill/flag calls
  if (raw.statMap) {
    skill.statMap = normalizeStatMap(raw.statMap);
  }

  // baseMods — array of mod/skill/flag call objects
  if (raw.baseMods) {
    skill.baseMods = normalizeBaseMods(raw.baseMods);
  }

  // levels — object with string keys
  if (raw.levels) {
    skill.levels = normalizeLevels(raw.levels);
  }

  // parts — array of part objects
  if (raw.parts) {
    skill.parts = normalizeParts(raw.parts);
  }

  // minionList — array of strings
  if (raw.minionList) {
    skill.minionList = Array.isArray(raw.minionList) ? raw.minionList : [];
  }

  // minionUses — object
  if (raw.minionUses) {
    skill.minionUses = raw.minionUses;
  }

  return skill;
}

/**
 * Extract SkillType strings from the parsed skillTypes table.
 * The parser produces: { "Spell": true, "Damage": true, ... } for
 * { [SkillType.Spell] = true, ... } because SkillType.X resolves to "X".
 * But the keys in the parsed table are the SkillType strings.
 */
function extractSkillTypeStrings(obj) {
  if (Array.isArray(obj)) {
    // Shouldn't happen for skillTypes, but handle gracefully
    return obj.filter(v => typeof v === 'string');
  }
  // Object with string keys -> true values
  return Object.keys(obj).filter(k => obj[k] === true);
}

/**
 * Normalize SkillType arrays: the parser gives us arrays of SkillType strings
 * like ["Damage", "Attack"]. AND markers are kept as "AND".
 */
function normalizeSkillTypeArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(v => typeof v === 'string' ? v : String(v));
}

/**
 * constantStats: array of [statName, value] pairs.
 * Parser gives us array of arrays: [["stat_name", value], ...]
 */
function normalizeConstantStats(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(entry => {
    if (Array.isArray(entry) && entry.length >= 2) {
      return [entry[0], entry[1]];
    }
    return entry;
  });
}

/**
 * qualityStats: { Default: [[statName, perQuality], ...], ... }
 */
function normalizeQualityStats(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const result = {};
  for (const [key, arr] of Object.entries(obj)) {
    if (Array.isArray(arr)) {
      result[key] = arr.map(entry => {
        if (Array.isArray(entry) && entry.length >= 2) {
          return [entry[0], entry[1]];
        }
        return entry;
      });
    } else {
      result[key] = arr;
    }
  }
  return result;
}

/**
 * statMap: object mapping stat names to arrays of mod calls + optional extra fields.
 * Parser gives us: { "stat_name": { ... mixed table with positional mod calls and named fields } }
 * or arrays of mod calls.
 */
function normalizeStatMap(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const result = {};
  for (const [statName, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      // Array of mod/skill/flag calls
      result[statName] = value.filter(v => v && typeof v === 'object');
    } else if (typeof value === 'object' && value !== null) {
      // Object — might have _positional + named fields (like div)
      const entry = {};
      if (value._positional) {
        entry.mods = value._positional.filter(v => v && typeof v === 'object');
        delete value._positional;
      }
      // Copy named fields
      for (const [k, v] of Object.entries(value)) {
        if (k === '_positional') continue;
        entry[k] = v;
      }
      // If no mods were set but there are mod-like objects at top level, extract them
      if (!entry.mods) {
        entry.mods = [];
      }
      result[statName] = entry;
    } else {
      result[statName] = value;
    }
  }
  return result;
}

/**
 * baseMods: array of mod/skill/flag call objects.
 */
function normalizeBaseMods(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(v => v && typeof v === 'object');
}

/**
 * levels: parse the level entries. Each entry may be a mixed table
 * with positional values + named fields.
 */
function normalizeLevels(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const result = {};
  for (const [levelNum, entry] of Object.entries(obj)) {
    if (typeof entry === 'object' && entry !== null) {
      const levelData = {};

      if (entry._positional) {
        levelData.values = entry._positional;
      } else if (Array.isArray(entry)) {
        // Pure positional array (shouldn't happen for levels, but handle it)
        levelData.values = entry;
      }

      // Copy named fields
      for (const [k, v] of Object.entries(entry)) {
        if (k === '_positional') continue;
        levelData[k] = v;
      }

      // Ensure values array exists even if empty
      if (!levelData.values) {
        levelData.values = [];
      }

      result[levelNum] = levelData;
    }
  }
  return result;
}

/**
 * parts: array of part objects { name, area, ... }
 */
function normalizeParts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(p => {
    if (typeof p === 'object' && p !== null) {
      return p;
    }
    return p;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const allSkills = {};
  let totalParsed = 0;
  let totalErrors = 0;

  for (const file of FILES) {
    const filePath = path.join(SKILLS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Warning: ${filePath} not found, skipping.`);
      continue;
    }

    console.log(`Processing ${file}...`);
    let src = fs.readFileSync(filePath, 'utf8');
    src = stripComments(src);
    const tokens = tokenize(src);
    const skills = extractSkillEntries(tokens);

    const count = Object.keys(skills).length;
    console.log(`  Found ${count} skills.`);
    totalParsed += count;

    for (const [name, data] of Object.entries(skills)) {
      allSkills[name] = data;
    }
  }

  console.log(`\nTotal skills parsed: ${totalParsed}`);

  // Post-processing: resolve cross-skill references like { _ref: "ExplosiveTrap", _field: "statMap" }
  // This runs on raw data before processSkillData transforms it.
  let resolvedCount = 0;
  for (const [skillId, rawData] of Object.entries(allSkills)) {
    for (const [key, value] of Object.entries(rawData)) {
      if (value && typeof value === 'object' && value._ref && value._field) {
        const refRaw = allSkills[value._ref];
        if (refRaw && refRaw[value._field] !== undefined) {
          rawData[key] = refRaw[value._field];
          resolvedCount++;
        } else {
          console.warn(`  Warning: could not resolve skills.${value._ref}.${value._field} for ${skillId}.${key}`);
        }
      }
    }
  }
  if (resolvedCount > 0) {
    console.log(`Resolved ${resolvedCount} cross-skill reference(s).`);
  }

  // Now run processSkillData on each raw skill entry
  for (const [skillId, rawData] of Object.entries(allSkills)) {
    allSkills[skillId] = processSkillData(rawData, skillId);
  }

  // Write output
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(allSkills, null, 2));
  console.log(`Written to ${OUTPUT}`);
  console.log(`Output size: ${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2)} MB`);
}

main();
