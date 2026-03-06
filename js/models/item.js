// PoBWeb - Item Model (port of Classes/Item.lua)
// Parses game item text into structured data.

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
}
