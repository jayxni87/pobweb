// PoBWeb - Item Model (port of Classes/Item.lua)
// Parses game item text into structured data.

import { parseMod } from './mod-parser.js';
import { round } from '../engine/utils.js';

export const RARITY = {
  NORMAL: 'NORMAL',
  MAGIC: 'MAGIC',
  RARE: 'RARE',
  UNIQUE: 'UNIQUE',
  RELIC: 'RELIC',
  GEM: 'GEM',
  CURRENCY: 'CURRENCY',
};

const catalystTags = [
  ['attack'],
  ['speed'],
  ['life', 'mana', 'resource'],
  ['caster'],
  ['jewellery_attribute', 'attribute'],
  ['physical_damage', 'chaos_damage'],
  ['jewellery_resistance', 'resistance'],
  ['jewellery_defense', 'defences'],
  ['jewellery_elemental', 'elemental_damage'],
  ['critical'],
];

// Get catalyst quality scalar for a mod's tags
export function getCatalystScalar(catalystId, tags, quality) {
  if (catalystId === null || catalystId === undefined || !tags || tags.length === 0) return 1;
  if (quality === undefined) quality = 20;
  if (!catalystTags[catalystId]) return 1;

  const tagSet = new Set(tags);
  for (const catTag of catalystTags[catalystId]) {
    if (tagSet.has(catTag)) {
      return (100 + quality) / 100;
    }
  }
  return 1;
}

// Parse socket string (e.g. "R-G-B W-R") into socket objects
export function parseSockets(socketStr) {
  const sockets = [];
  let group = 0;
  for (let i = 0; i < socketStr.length; i++) {
    const c = socketStr[i];
    if (/[RGBWA]/.test(c)) {
      sockets.push({ color: c, group });
    } else if (c === ' ') {
      group++;
    }
    // '-' means linked (same group), skip
  }
  return sockets;
}

// Parse a number from a spec value (strips % and other characters)
function specToNumber(str) {
  const m = str.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// Parse requirements line like "Requires Level 64, 158 Str, 76 Dex"
function parseRequirements(line) {
  const reqs = { level: 0, str: 0, dex: 0, int: 0 };
  const levelMatch = line.match(/Level\s+(\d+)/);
  if (levelMatch) reqs.level = parseInt(levelMatch[1], 10);
  const strMatch = line.match(/(\d+)\s+Str/);
  if (strMatch) reqs.str = parseInt(strMatch[1], 10);
  const dexMatch = line.match(/(\d+)\s+Dex/);
  if (dexMatch) reqs.dex = parseInt(dexMatch[1], 10);
  const intMatch = line.match(/(\d+)\s+Int/);
  if (intMatch) reqs.int = parseInt(intMatch[1], 10);
  return reqs;
}

// Parse raw item text into structured item data
export function parseItemText(raw) {
  const item = {
    raw,
    name: '?',
    baseName: null,
    rarity: RARITY.UNIQUE,
    quality: 0,
    itemLevel: 0,
    sockets: [],
    requirements: { level: 0, str: 0, dex: 0, int: 0 },
    implicitModLines: [],
    explicitModLines: [],
    enchantModLines: [],
    crucibleModLines: [],
    corrupted: false,
    mirrored: false,
    split: false,
    fractured: false,
    synthesised: false,
  };

  // Split into non-blank lines
  const rawLines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let i = 0;

  // Check for Item Class line
  if (rawLines[i] && rawLines[i].startsWith('Item Class:')) {
    i++;
  }

  // Check for Rarity line
  if (rawLines[i]) {
    const rarityMatch = rawLines[i].match(/^Rarity:\s*(\w+)/);
    if (rarityMatch) {
      const r = rarityMatch[1].toUpperCase();
      if (RARITY[r]) item.rarity = r;
      i++;
    }
  }

  // Name line
  if (rawLines[i]) {
    item.name = rawLines[i];
    i++;
  }

  // For rare/unique, next line is base type
  if (item.rarity === RARITY.RARE || item.rarity === RARITY.UNIQUE || item.rarity === RARITY.RELIC) {
    if (rawLines[i] && rawLines[i] !== '--------') {
      item.baseName = rawLines[i];
      i++;
    }
  }

  // Parse remaining lines
  let inSection = false;
  let foundImplicit = false;
  let afterSeparator = false;

  while (i < rawLines.length) {
    const line = rawLines[i];
    i++;

    if (line === '--------') {
      afterSeparator = true;
      continue;
    }

    // Status flags
    if (line === 'Corrupted') { item.corrupted = true; continue; }
    if (line === 'Mirrored') { item.mirrored = true; continue; }
    if (line === 'Split') { item.split = true; continue; }
    if (line === 'Fractured Item') { item.fractured = true; continue; }
    if (line === 'Synthesised Item') { item.synthesised = true; continue; }
    if (line === 'Requirements:') continue;
    if (line === 'Unidentified') continue;

    // Check for spec lines
    const specMatch = line.match(/^([A-Za-z ]+):\s+(.+)$/);
    if (specMatch) {
      const [, specName, specVal] = specMatch;
      if (specName === 'Quality') {
        item.quality = specToNumber(specVal);
        continue;
      }
      if (specName === 'Item Level') {
        item.itemLevel = specToNumber(specVal);
        continue;
      }
      if (specName === 'Sockets') {
        item.sockets = parseSockets(specVal);
        continue;
      }
    }

    // Check for requirements
    const reqMatch = line.match(/^Requires\s+(.+)$/);
    if (reqMatch) {
      item.requirements = parseRequirements(reqMatch[1]);
      continue;
    }

    // Check for mod type tags
    if (line.includes('(implicit)')) {
      item.implicitModLines.push(line.replace(/\s*\(implicit\)/, ''));
      foundImplicit = true;
      continue;
    }
    if (line.includes('(enchant)')) {
      item.enchantModLines.push(line.replace(/\s*\(enchant\)/, ''));
      continue;
    }
    if (line.includes('(crucible)')) {
      item.crucibleModLines.push(line.replace(/\s*\(crucible\)/, ''));
      continue;
    }

    // Any other line after implicits is an explicit mod
    if (afterSeparator || foundImplicit) {
      // Skip non-mod lines
      if (/^\d+ to \d+ \w+ Damage$/.test(line)) continue; // base damage line
      if (/^(Armour|Evasion|Energy Shield|Ward):/.test(line)) continue;
      if (/^(Physical Damage|Elemental Damage|Critical Strike Chance|Attacks per Second):/.test(line)) continue;

      item.explicitModLines.push(line);
    }
  }

  return item;
}

// Item class wrapping parseItemText
export class Item {
  constructor(raw) {
    const parsed = parseItemText(raw);
    Object.assign(this, parsed);
  }

  numSockets() {
    return this.sockets.length;
  }

  maxLinks() {
    if (this.sockets.length === 0) return 0;
    const groupCounts = {};
    for (const s of this.sockets) {
      groupCounts[s.group] = (groupCounts[s.group] || 0) + 1;
    }
    return Math.max(...Object.values(groupCounts));
  }

  /**
   * Look up this item's base type in the registry and store it.
   * @param {import('../data/base-types.js').BaseTypeRegistry} registry
   */
  resolveBase(registry) {
    this.baseData = registry.get(this.baseName || this.name);
  }

  /**
   * Parse all mod lines and compute local weapon/armour stats.
   * Must call resolveBase() first.
   */
  buildModList() {
    this.weaponData = null;
    this.armourData = null;
    this.parsedMods = [];

    if (!this.baseData) return;

    // Parse all mod lines from every source
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

  /** @private Compute local weapon stats (damage, attack rate, crit). */
  _calcWeapon() {
    const weapon = this.baseData.weapon;
    const quality = this.quality || 0;

    const DAMAGE_TYPES = ['Physical', 'Fire', 'Cold', 'Lightning', 'Chaos'];

    // Collect local flat damage (BASE with flags===0) and local INC mods
    let physInc = 0;
    let attackSpeedInc = 0;
    let critInc = 0;
    const flatDmg = {};
    for (const type of DAMAGE_TYPES) {
      flatDmg[`${type}Min`] = 0;
      flatDmg[`${type}Max`] = 0;
    }

    for (const mod of this.parsedMods) {
      // Local flat damage: BASE type with flags===0 for *Min/*Max names
      if (mod.type === 'BASE' && mod.flags === 0) {
        for (const type of DAMAGE_TYPES) {
          if (mod.name === `${type}Min`) flatDmg[`${type}Min`] += mod.value;
          if (mod.name === `${type}Max`) flatDmg[`${type}Max`] += mod.value;
        }
      }
      // Local % increased Physical Damage (INC, flags===0)
      if (mod.type === 'INC' && mod.name === 'PhysicalDamage' && mod.flags === 0) {
        physInc += mod.value;
      }
      // Local attack speed (INC with Attack flag)
      if (mod.type === 'INC' && mod.name === 'Speed' && (mod.flags & 0x00000001) !== 0) {
        attackSpeedInc += mod.value;
      }
      // Local crit chance (INC, flags===0)
      if (mod.type === 'INC' && mod.name === 'CritChance' && mod.flags === 0) {
        critInc += mod.value;
      }
    }

    const data = {};
    let totalDPS = 0;

    for (const type of DAMAGE_TYPES) {
      const baseMin = (weapon[`${type}Min`] || 0) + flatDmg[`${type}Min`];
      const baseMax = (weapon[`${type}Max`] || 0) + flatDmg[`${type}Max`];

      let finalMin, finalMax;
      if (type === 'Physical') {
        // Quality and physInc are multiplicative
        finalMin = round(baseMin * (1 + physInc / 100) * (1 + quality / 100));
        finalMax = round(baseMax * (1 + physInc / 100) * (1 + quality / 100));
      } else {
        // Non-physical: no quality scaling, no local inc (just flat)
        finalMin = round(baseMin);
        finalMax = round(baseMax);
      }

      if (finalMin > 0 || finalMax > 0) {
        data[`${type}Min`] = finalMin;
        data[`${type}Max`] = finalMax;
        const typeDPS = (finalMin + finalMax) / 2 * round(weapon.AttackRateBase * (1 + attackSpeedInc / 100), 2);
        data[`${type}DPS`] = typeDPS;
        totalDPS += typeDPS;
      }
    }

    data.AttackRate = round(weapon.AttackRateBase * (1 + attackSpeedInc / 100), 2);
    data.CritChance = round(weapon.CritChanceBase * (1 + critInc / 100), 2);
    data.Range = weapon.Range || 0;
    data.TotalDPS = totalDPS;

    this.weaponData = data;
  }

  /** @private Compute local armour stats (armour, evasion, ES, block). */
  _calcArmour() {
    const armour = this.baseData.armour;
    const quality = this.quality || 0;

    // Collect local INC mods for defences
    let armourInc = 0;
    let evasionInc = 0;
    let esInc = 0;

    for (const mod of this.parsedMods) {
      if (mod.type === 'INC' && mod.flags === 0) {
        if (mod.name === 'Armour') armourInc += mod.value;
        if (mod.name === 'Evasion') evasionInc += mod.value;
        if (mod.name === 'EnergyShield') esInc += mod.value;
      }
    }

    const data = {};

    // Armour
    if (armour.ArmourBaseMin !== undefined || armour.ArmourBaseMax !== undefined) {
      const base = ((armour.ArmourBaseMin || 0) + (armour.ArmourBaseMax || 0)) / 2;
      data.Armour = round(base * (1 + quality / 100) * (1 + armourInc / 100));
    }

    // Evasion
    if (armour.EvasionBaseMin !== undefined || armour.EvasionBaseMax !== undefined) {
      const base = ((armour.EvasionBaseMin || 0) + (armour.EvasionBaseMax || 0)) / 2;
      data.Evasion = round(base * (1 + quality / 100) * (1 + evasionInc / 100));
    }

    // Energy Shield
    if (armour.EnergyShieldBaseMin !== undefined || armour.EnergyShieldBaseMax !== undefined) {
      const base = ((armour.EnergyShieldBaseMin || 0) + (armour.EnergyShieldBaseMax || 0)) / 2;
      data.EnergyShield = round(base * (1 + quality / 100) * (1 + esInc / 100));
    }

    // Block chance (flat, no scaling)
    if (armour.BlockChance !== undefined) {
      data.BlockChance = armour.BlockChance;
    }

    this.armourData = data;
  }
}
