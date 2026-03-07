#!/usr/bin/env node
/**
 * Convert SkillStatMap.lua from PathOfBuilding to JSON.
 *
 * Reads PathOfBuilding/src/Data/SkillStatMap.lua and outputs
 * js/data/skill-stat-map.json with all stat-to-modifier mappings.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'PathOfBuilding', 'src', 'Data', 'SkillStatMap.lua');
const OUTPUT = path.join(ROOT, 'js', 'data', 'skill-stat-map.json');

// ---------------------------------------------------------------------------
// Flag/enum lookup tables
// ---------------------------------------------------------------------------

const ModFlag = {
  Attack:       0x00000001,
  Spell:        0x00000002,
  Hit:          0x00000004,
  Dot:          0x00000008,
  Cast:         0x00000010,
  Melee:        0x00000100,
  Area:         0x00000200,
  Projectile:   0x00000400,
  SourceMask:   0x00000600,
  Ailment:      0x00000800,
  MeleeHit:     0x00001000,
  Weapon:       0x00002000,
  Axe:          0x00010000,
  Bow:          0x00020000,
  Claw:         0x00040000,
  Dagger:       0x00080000,
  Mace:         0x00100000,
  Staff:        0x00200000,
  Sword:        0x00400000,
  Wand:         0x00800000,
  Unarmed:      0x01000000,
  Fishing:      0x02000000,
  WeaponMelee:  0x04000000,
  WeaponRanged: 0x08000000,
  Weapon1H:     0x10000000,
  Weapon2H:     0x20000000,
};

const KeywordFlag = {
  Aura:         0x00000001,
  Curse:        0x00000002,
  Warcry:       0x00000004,
  Movement:     0x00000008,
  Physical:     0x00000010,
  Fire:         0x00000020,
  Cold:         0x00000040,
  Lightning:    0x00000080,
  Chaos:        0x00000100,
  Vaal:         0x00000200,
  Bow:          0x00000400,
  Arrow:        0x00000800,
  Trap:         0x00001000,
  Mine:         0x00002000,
  Totem:        0x00004000,
  Minion:       0x00008000,
  Attack:       0x00010000,
  Spell:        0x00020000,
  Hit:          0x00040000,
  Ailment:      0x00080000,
  Brand:        0x00100000,
  Poison:       0x00200000,
  Bleed:        0x00400000,
  Ignite:       0x00800000,
  PhysicalDot:  0x01000000,
  LightningDot: 0x02000000,
  ColdDot:      0x04000000,
  FireDot:      0x08000000,
  ChaosDot:     0x10000000,
  MatchAll:     0x40000000,
};

const SkillType = {
  Attack: 1, Spell: 2, Projectile: 3, DualWieldOnly: 4, Buff: 5,
  Removed6: 6, MainHandOnly: 7, Removed8: 8, Minion: 9, Damage: 10,
  Area: 11, Duration: 12, RequiresShield: 13, ProjectileSpeed: 14,
  HasReservation: 15, ReservationBecomesCost: 16, Trappable: 17,
  Totemable: 18, Mineable: 19, ElementalStatus: 20, MinionsCanExplode: 21,
  Removed22: 22, Chains: 23, Melee: 24, MeleeSingleTarget: 25,
  Multicastable: 26, TotemCastsAlone: 27, Multistrikeable: 28,
  CausesBurning: 29, SummonsTotem: 30, TotemCastsWhenNotDetached: 31,
  Fire: 32, Cold: 33, Lightning: 34, Triggerable: 35, Trapped: 36,
  Movement: 37, Removed39: 38, DamageOverTime: 39, RemoteMined: 40,
  Triggered: 41, Vaal: 42, Aura: 43, Removed45: 44,
  CanTargetUnusableCorpse: 45, Removed47: 46, RangedAttack: 47,
  Removed49: 48, Chaos: 49, FixedSpeedProjectile: 50, Removed52: 51,
  ThresholdJewelArea: 52, ThresholdJewelProjectile: 53,
  ThresholdJewelDuration: 54, ThresholdJewelRangedAttack: 55,
  Removed57: 56, Channel: 57, DegenOnlySpellDamage: 58, Removed60: 59,
  InbuiltTrigger: 60, Golem: 61, Herald: 62, AuraAffectsEnemies: 63,
  NoRuthless: 64, ThresholdJewelSpellDamage: 65, Cascadable: 66,
  ProjectilesFromUser: 67, MirageArcherCanUse: 68, ProjectileSpiral: 69,
  SingleMainProjectile: 70, MinionsPersistWhenSkillRemoved: 71,
  ProjectileNumber: 72, Warcry: 73, Instant: 74, Brand: 75,
  DestroysCorpse: 76, NonHitChill: 77, ChillingArea: 78,
  AppliesCurse: 79, CanRapidFire: 80, AuraDuration: 81, AreaSpell: 82,
  OR: 83, AND: 84, NOT: 85, Physical: 86, AppliesMaim: 87,
  CreatesMinion: 88, Guard: 89, Travel: 90, Blink: 91,
  CanHaveBlessing: 92, ProjectilesNotFromUser: 93,
  AttackInPlaceIsDefault: 94, Nova: 95, InstantNoRepeatWhenHeld: 96,
  InstantShiftAttackForLeftMouse: 97, AuraNotOnCaster: 98, Banner: 99,
  Rain: 100, Cooldown: 101, ThresholdJewelChaining: 102, Slam: 103,
  Stance: 104, NonRepeatable: 105, OtherThingUsesSkill: 106, Steel: 107,
  Hex: 108, Mark: 109, Aegis: 110, Orb: 111, KillNoDamageModifiers: 112,
  RandomElement: 113, LateConsumeCooldown: 114, Arcane: 115,
  FixedCastTime: 116, RequiresOffHandNotWeapon: 117, Link: 118,
  Blessing: 119, ZeroReservation: 120, DynamicCooldown: 121,
  Microtransaction: 122, OwnerCannotUse: 123, ProjectilesNotFired: 124,
  TotemsAreBallistae: 125, SkillGrantedBySupport: 126,
  PreventHexTransfer: 127, MinionsAreUndamageable: 128, InnateTrauma: 129,
  DualWieldRequiresDifferentTypes: 130, NoVolley: 131, Retaliation: 132,
  NeverExertable: 133, DisallowTriggerSupports: 134,
  ProjectileCannotReturn: 135, Offering: 136, SupportedByBane: 137,
  WandAttack: 138,
};

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

function stripComments(src) {
  // Remove block comments: --[[ ... ]]
  src = src.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '');
  // Remove line comments, preserving strings
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
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    if (/\s/.test(src[i])) { i++; continue; }

    // Numbers (including hex)
    if (/[0-9]/.test(src[i]) || (src[i] === '.' && i + 1 < len && /[0-9]/.test(src[i + 1]))) {
      let num = '';
      if (src[i] === '0' && i + 1 < len && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        num += src[i] + src[i + 1];
        i += 2;
        while (i < len && /[0-9a-fA-F]/.test(src[i])) { num += src[i]; i++; }
      } else {
        while (i < len && /[0-9.]/.test(src[i])) { num += src[i]; i++; }
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Strings (double or single quoted)
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i];
      i++;
      let s = '';
      while (i < len && src[i] !== q) {
        if (src[i] === '\\') {
          i++;
          if (i < len) {
            if (src[i] === 'n') s += '\n';
            else if (src[i] === 't') s += '\t';
            else s += src[i];
          }
        } else {
          s += src[i];
        }
        i++;
      }
      if (i < len) i++; // skip closing quote
      tokens.push({ type: 'string', value: s });
      continue;
    }

    // Identifiers (including dotted like ModFlag.Attack, SkillType.Fire, bit.bor)
    if (/[a-zA-Z_]/.test(src[i])) {
      let id = '';
      while (i < len && /[a-zA-Z0-9_]/.test(src[i])) { id += src[i]; i++; }
      // Allow dotted identifiers
      while (i < len && src[i] === '.' && i + 1 < len && /[a-zA-Z_]/.test(src[i + 1])) {
        id += src[i]; i++;
        while (i < len && /[a-zA-Z0-9_]/.test(src[i])) { id += src[i]; i++; }
      }
      tokens.push({ type: 'identifier', value: id });
      continue;
    }

    // Symbols
    tokens.push({ type: 'symbol', value: src[i] });
    i++;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Recursive descent parser for token stream
// ---------------------------------------------------------------------------

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  next() {
    return this.tokens[this.pos++];
  }

  expect(type, value) {
    const tok = this.next();
    if (!tok || tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new Error(`Expected ${type} ${value || ''} at pos ${this.pos - 1}, got ${tok ? tok.type + ':' + tok.value : 'EOF'}`);
    }
    return tok;
  }

  match(type, value) {
    const tok = this.peek();
    if (tok && tok.type === type && (value === undefined || tok.value === value)) {
      this.pos++;
      return tok;
    }
    return null;
  }

  // Resolve a value expression that might be a reference or bit.bor() call
  resolveValue(tok) {
    if (tok.type === 'number') {
      return parseNumber(tok.value);
    }
    if (tok.type === 'identifier') {
      if (tok.value === 'nil') return null;
      if (tok.value === 'true') return true;
      if (tok.value === 'false') return false;
      if (tok.value === 'bit.bor') {
        return this.parseBitBor();
      }
      return resolveRef(tok.value);
    }
    throw new Error(`Unexpected token in value: ${tok.type}:${tok.value}`);
  }

  parseBitBor() {
    this.expect('symbol', '(');
    let result = 0;
    let first = true;
    while (!this.match('symbol', ')')) {
      if (!first) this.expect('symbol', ',');
      first = false;
      const tok = this.next();
      const val = this.resolveValue(tok);
      result |= val;
    }
    return result;
  }

  // Parse a Lua table: { ... }
  parseTable() {
    this.expect('symbol', '{');
    const obj = {};
    const arr = [];

    while (true) {
      const p = this.peek();
      if (!p || (p.type === 'symbol' && p.value === '}')) break;

      // Named field: key = value
      if (p.type === 'identifier' && this.tokens[this.pos + 1]?.type === 'symbol' && this.tokens[this.pos + 1]?.value === '=') {
        const key = this.next().value;
        this.expect('symbol', '=');
        const val = this.parseExpression();
        obj[key] = val;
      }
      // String-keyed field like ["key"] = value (shouldn't appear inside condition tables)
      else if (p.type === 'symbol' && p.value === '[') {
        // Not expected in condition tables; skip
        throw new Error('Unexpected [ inside table at pos ' + this.pos);
      }
      // Positional element
      else {
        const val = this.parseExpression();
        arr.push(val);
      }

      // optional comma
      this.match('symbol', ',');
    }
    this.expect('symbol', '}');

    // If we have both array and object entries, merge them
    if (arr.length > 0 && Object.keys(obj).length > 0) {
      // Store array items as indexed
      for (let i = 0; i < arr.length; i++) {
        obj[i + 1] = arr[i]; // 1-indexed like Lua
      }
      return obj;
    }
    if (arr.length > 0) return arr;
    return obj;
  }

  // Parse a single expression (value, table, function call, unary minus, bit.bor)
  parseExpression() {
    let result = this.parsePrimary();

    // Handle binary * operator (e.g., 60 * 100)
    while (this.peek()?.type === 'symbol' && this.peek()?.value === '*') {
      this.next();
      const right = this.parsePrimary();
      result = result * right;
    }

    return result;
  }

  // Parse a primary expression (atom)
  parsePrimary() {
    const tok = this.peek();
    if (!tok) throw new Error('Unexpected end of tokens');

    // Unary minus
    if (tok.type === 'symbol' && tok.value === '-') {
      this.next();
      const expr = this.parsePrimary();
      if (typeof expr === 'number') return -expr;
      throw new Error('Unary minus on non-number');
    }

    // Table literal
    if (tok.type === 'symbol' && tok.value === '{') {
      return this.parseTable();
    }

    // Number
    if (tok.type === 'number') {
      this.next();
      return parseNumber(tok.value);
    }

    // String
    if (tok.type === 'string') {
      this.next();
      return tok.value;
    }

    // Identifier - could be a keyword, reference, or function call
    if (tok.type === 'identifier') {
      this.next();
      // bit.bor(...)
      if (tok.value === 'bit.bor') {
        return this.parseBitBor();
      }
      // Function call
      if (this.peek()?.type === 'symbol' && this.peek()?.value === '(') {
        return this.parseFunctionCall(tok.value);
      }
      // Keyword/constant
      if (tok.value === 'nil') return null;
      if (tok.value === 'true') return true;
      if (tok.value === 'false') return false;
      return resolveRef(tok.value);
    }

    throw new Error(`Unexpected token: ${tok.type}:${tok.value} at pos ${this.pos}`);
  }

  // Parse arguments of a function call (opening paren already peeked)
  parseFunctionCall(name) {
    this.expect('symbol', '(');
    const args = [];
    let first = true;
    while (!(this.peek()?.type === 'symbol' && this.peek()?.value === ')')) {
      if (!first) this.expect('symbol', ',');
      first = false;
      args.push(this.parseExpression());
    }
    this.expect('symbol', ')');
    return { __call: name, args };
  }
}

function parseNumber(s) {
  if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s, 16);
  return s.includes('.') ? parseFloat(s) : parseInt(s, 10);
}

function resolveRef(name) {
  if (name.startsWith('ModFlag.')) {
    const key = name.slice(8);
    if (key in ModFlag) return ModFlag[key];
    throw new Error(`Unknown ModFlag: ${key}`);
  }
  if (name.startsWith('KeywordFlag.')) {
    const key = name.slice(12);
    if (key in KeywordFlag) return KeywordFlag[key];
    throw new Error(`Unknown KeywordFlag: ${key}`);
  }
  if (name.startsWith('SkillType.')) {
    const key = name.slice(10);
    if (key in SkillType) return SkillType[key];
    throw new Error(`Unknown SkillType: ${key}`);
  }
  throw new Error(`Unknown reference: ${name}`);
}

// ---------------------------------------------------------------------------
// Convert a function call object into a JSON mod entry
// ---------------------------------------------------------------------------

function convertFunctionCall(call) {
  const fnName = call.__call;
  const args = call.args;

  if (fnName === 'mod') {
    return convertModCall(args);
  } else if (fnName === 'skill' || fnName === 'flag' || fnName === 'value') {
    return convertSkillFlagValueCall(fnName, args);
  }
  throw new Error(`Unknown function: ${fnName}`);
}

function convertModCall(args) {
  // mod("Name", "TYPE", valueOrNil, flags?, keywordFlags?, ...conditions)
  // But the third arg could be a table literal (for LIST type), or nil/number
  const result = { fn: 'mod' };
  result.name = args[0];
  result.type = args[1];

  // Third arg: value. Could be null, number, or a table (for LIST mods like MinionModifier)
  const rawValue = args[2];
  if (rawValue !== null && rawValue !== undefined && typeof rawValue === 'object' && !Array.isArray(rawValue) && rawValue.__call === undefined) {
    // It's a table literal — this is the "value" for LIST type mods
    result.value = convertTableValue(rawValue);
  } else {
    result.value = rawValue === undefined ? null : rawValue;
  }

  // Fourth arg: flags (ModFlag)
  if (args.length > 3) {
    const flags = args[3];
    if (flags !== null && flags !== undefined && flags !== 0) {
      result.flags = flags;
    }
  }

  // Fifth arg: keywordFlags
  if (args.length > 4) {
    const kf = args[4];
    if (kf !== null && kf !== undefined && kf !== 0) {
      result.keywordFlags = kf;
    }
  }

  // Remaining args: conditions (table objects)
  if (args.length > 5) {
    const conditions = [];
    for (let i = 5; i < args.length; i++) {
      conditions.push(convertTableValue(args[i]));
    }
    if (conditions.length > 0) {
      result.conditions = conditions;
    }
  }

  return result;
}

function convertSkillFlagValueCall(fnName, args) {
  // skill("name", valueOrNil, ...conditions)
  // flag("name", ...conditions)
  // value("name", valueOrNil)
  const result = { fn: fnName };
  result.name = args[0];

  if (fnName === 'flag') {
    // flag("name", condition1?, condition2?, ...)
    if (args.length > 1) {
      const conditions = [];
      for (let i = 1; i < args.length; i++) {
        if (args[i] !== null && args[i] !== undefined && typeof args[i] === 'object') {
          conditions.push(convertTableValue(args[i]));
        }
      }
      if (conditions.length > 0) {
        result.conditions = conditions;
      }
    }
  } else {
    // skill/value: second arg is the value
    if (args.length > 1) {
      result.value = args[1] === undefined ? null : args[1];
    } else {
      result.value = null;
    }

    // Remaining args for skill(): conditions
    if (args.length > 2) {
      const conditions = [];
      for (let i = 2; i < args.length; i++) {
        if (args[i] !== null && args[i] !== undefined && typeof args[i] === 'object') {
          conditions.push(convertTableValue(args[i]));
        }
      }
      if (conditions.length > 0) {
        result.conditions = conditions;
      }
    }
  }

  return result;
}

/**
 * Recursively convert a parsed Lua table value to plain JSON.
 * Handles nested __call objects (e.g., mod(...) inside a table).
 */
function convertTableValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return val;
  if (val.__call) {
    // It's a function call — convert it
    return { __nestedCall: true, ...convertFunctionCall(val) };
  }
  if (Array.isArray(val)) {
    return val.map(convertTableValue);
  }
  const result = {};
  for (const [k, v] of Object.entries(val)) {
    result[k] = convertTableValue(v);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main conversion
// ---------------------------------------------------------------------------

function extractEntries(src) {
  src = stripComments(src);

  // Strip the `local mod, flag, skill = ...` and `return {` prefix
  // Find the opening of the return table
  const returnIdx = src.indexOf('return');
  if (returnIdx < 0) throw new Error('No return statement found');

  // Find the first { after return
  let braceStart = src.indexOf('{', returnIdx);
  if (braceStart < 0) throw new Error('No opening brace after return');

  // Find each ["key"] = { ... } entry using brace depth counting
  const entries = {};
  let i = braceStart + 1; // skip the opening brace of the return table

  while (i < src.length) {
    // Skip whitespace
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) break;

    // Check for closing brace of the return table
    if (src[i] === '}') break;

    // Expect ["key"] = { ... },
    if (src[i] === '[') {
      // Find the key string
      const keyMatch = src.slice(i).match(/^\["([^"]+)"\]\s*=\s*\{/);
      if (!keyMatch) {
        // Skip unexpected content
        i++;
        continue;
      }
      const key = keyMatch[1];
      i += keyMatch[0].length;

      // Now count braces to find the matching closing brace
      let depth = 1;
      let bodyStart = i;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        if (depth > 0) i++;
      }
      const body = src.slice(bodyStart, i);
      i++; // skip closing brace

      // Skip optional comma
      while (i < src.length && /\s/.test(src[i])) i++;
      if (i < src.length && src[i] === ',') i++;

      entries[key] = body;
    } else {
      // Skip unknown content
      i++;
    }
  }

  return entries;
}

function parseEntryBody(body, key) {
  const tokens = tokenize(body);
  if (tokens.length === 0) {
    // Empty entry (display only)
    return { mods: [] };
  }

  const parser = new Parser(tokens);
  const mods = [];
  const namedFields = {};

  while (parser.pos < parser.tokens.length) {
    const tok = parser.peek();
    if (!tok) break;

    // Check for named field: identifier = expression
    if (tok.type === 'identifier' &&
        parser.tokens[parser.pos + 1]?.type === 'symbol' &&
        parser.tokens[parser.pos + 1]?.value === '=' &&
        // Make sure this isn't a function call (identifier followed by '(')
        !['mod', 'flag', 'skill', 'bit.bor'].includes(tok.value)) {
      const name = parser.next().value;
      parser.expect('symbol', '=');
      const val = parser.parseExpression();
      namedFields[name] = val;
      parser.match('symbol', ',');
      continue;
    }

    // Otherwise it's a function call (mod, skill, flag, value)
    if (tok.type === 'identifier' && ['mod', 'flag', 'skill'].includes(tok.value)) {
      const expr = parser.parseExpression();
      if (expr && expr.__call) {
        mods.push(convertFunctionCall(expr));
      }
      parser.match('symbol', ',');
      continue;
    }

    // Unexpected token - skip
    parser.next();
  }

  const result = {};
  if (mods.length > 0) {
    result.mods = mods;
  } else {
    result.mods = [];
  }

  // Add named fields
  for (const [name, val] of Object.entries(namedFields)) {
    if (name === 'value') {
      // "value" is a named field that overrides the mod value
      result.value = val;
    } else {
      result[name] = val;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const src = fs.readFileSync(INPUT, 'utf8');
const rawEntries = extractEntries(src);

const output = {};
let errors = 0;

for (const [key, body] of Object.entries(rawEntries)) {
  try {
    output[key] = parseEntryBody(body, key);
  } catch (err) {
    console.error(`Error parsing entry "${key}": ${err.message}`);
    errors++;
  }
}

const totalEntries = Object.keys(output).length;
console.log(`Converted ${totalEntries} entries (${errors} errors)`);

fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
console.log(`Written to ${OUTPUT}`);
