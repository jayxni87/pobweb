// PoBWeb - Mod Parser
// Converts item mod text lines into structured modifier objects.

import { ModFlag, KeywordFlag } from '../engine/utils.js';
import { createMod } from '../engine/mod-tools.js';

// --- Attribute name mappings ---
const ATTR_MAP = {
  Strength: 'Str',
  Dexterity: 'Dex',
  Intelligence: 'Int',
};

// --- Resistance name mappings ---
const RESIST_MAP = {
  Fire: 'FireResist',
  Cold: 'ColdResist',
  Lightning: 'LightningResist',
  Chaos: 'ChaosResist',
};

// --- Defence stat mappings ---
const DEFENCE_FLAT_MAP = {
  Armour: 'Armour',
  'Evasion Rating': 'Evasion',
  'Energy Shield': 'EnergyShield',
  Ward: 'Ward',
};

// --- Damage type names (for "Adds X to Y <type> Damage") ---
const DAMAGE_TYPES = ['Physical', 'Fire', 'Cold', 'Lightning', 'Chaos'];

// --- Pattern list: each entry is { regex, handler(match) -> mod[] } ---
const PATTERNS = [
  // +N to all Attributes
  {
    regex: /^\+(\d+) to all Attributes$/,
    handler(m) {
      const val = parseInt(m[1], 10);
      return [
        createMod('Str', 'BASE', val, 'Item'),
        createMod('Dex', 'BASE', val, 'Item'),
        createMod('Int', 'BASE', val, 'Item'),
      ];
    },
  },

  // +N to Strength/Dexterity/Intelligence
  {
    regex: /^\+(\d+) to (Strength|Dexterity|Intelligence)$/,
    handler(m) {
      const val = parseInt(m[1], 10);
      const name = ATTR_MAP[m[2]];
      return [createMod(name, 'BASE', val, 'Item')];
    },
  },

  // +N% to all Elemental Resistances
  {
    regex: /^\+(\d+)% to all Elemental Resistances$/,
    handler(m) {
      const val = parseInt(m[1], 10);
      return [
        createMod('FireResist', 'BASE', val, 'Item'),
        createMod('ColdResist', 'BASE', val, 'Item'),
        createMod('LightningResist', 'BASE', val, 'Item'),
      ];
    },
  },

  // +N% to Fire/Cold/Lightning/Chaos Resistance
  {
    regex: /^\+(\d+)% to (Fire|Cold|Lightning|Chaos) Resistance$/,
    handler(m) {
      const val = parseInt(m[1], 10);
      const name = RESIST_MAP[m[2]];
      return [createMod(name, 'BASE', val, 'Item')];
    },
  },

  // +N% to Global Critical Strike Multiplier
  {
    regex: /^\+(\d+)% to Global Critical Strike Multiplier$/,
    handler(m) {
      const val = parseInt(m[1], 10);
      return [createMod('CritMultiplier', 'BASE', val, 'Item')];
    },
  },

  // +N to maximum Life/Mana/Energy Shield
  {
    regex: /^\+(\d+) to maximum (Life|Mana|Energy Shield)$/,
    handler(m) {
      const val = parseInt(m[1], 10);
      const statMap = { Life: 'Life', Mana: 'Mana', 'Energy Shield': 'EnergyShield' };
      const name = statMap[m[2]];
      return [createMod(name, 'BASE', val, 'Item')];
    },
  },

  // +N to Armour / Evasion Rating / Ward
  {
    regex: /^\+(\d+) to (Armour|Evasion Rating|Ward)$/,
    handler(m) {
      const val = parseInt(m[1], 10);
      const name = DEFENCE_FLAT_MAP[m[2]];
      return [createMod(name, 'BASE', val, 'Item')];
    },
  },

  // +N to Accuracy Rating
  {
    regex: /^\+(\d+) to Accuracy Rating$/,
    handler(m) {
      const val = parseInt(m[1], 10);
      return [createMod('Accuracy', 'BASE', val, 'Item')];
    },
  },

  // Adds N to N <type> Damage
  {
    regex: new RegExp(
      `^Adds (\\d+) to (\\d+) (${DAMAGE_TYPES.join('|')}) Damage$`
    ),
    handler(m) {
      const min = parseInt(m[1], 10);
      const max = parseInt(m[2], 10);
      const type = m[3];
      return [
        createMod(`${type}Min`, 'BASE', min, 'Item'),
        createMod(`${type}Max`, 'BASE', max, 'Item'),
      ];
    },
  },

  // N% increased/reduced Attack Speed
  {
    regex: /^(\d+)% (increased|reduced) Attack Speed$/,
    handler(m) {
      const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
      return [createMod('Speed', 'INC', val, 'Item', ModFlag.Attack)];
    },
  },

  // N% increased/reduced Cast Speed
  {
    regex: /^(\d+)% (increased|reduced) Cast Speed$/,
    handler(m) {
      const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
      return [createMod('Speed', 'INC', val, 'Item', ModFlag.Cast)];
    },
  },

  // N% increased/reduced Movement Speed
  {
    regex: /^(\d+)% (increased|reduced) Movement Speed$/,
    handler(m) {
      const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
      return [createMod('MovementSpeed', 'INC', val, 'Item')];
    },
  },

  // N% increased/reduced Critical Strike Chance
  {
    regex: /^(\d+)% (increased|reduced) Critical Strike Chance$/,
    handler(m) {
      const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
      return [createMod('CritChance', 'INC', val, 'Item')];
    },
  },

  // N% increased Global Accuracy Rating
  {
    regex: /^(\d+)% (increased|reduced) Global Accuracy Rating$/,
    handler(m) {
      const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
      return [createMod('Accuracy', 'INC', val, 'Item')];
    },
  },

  // N% increased/reduced maximum Life/Mana/Energy Shield
  {
    regex: /^(\d+)% (increased|reduced) maximum (Life|Mana|Energy Shield)$/,
    handler(m) {
      const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
      const statMap = { Life: 'Life', Mana: 'Mana', 'Energy Shield': 'EnergyShield' };
      const name = statMap[m[3]];
      return [createMod(name, 'INC', val, 'Item')];
    },
  },

  // N% increased/reduced Armour / Evasion Rating / Energy Shield
  {
    regex: /^(\d+)% (increased|reduced) (Armour|Evasion Rating|Energy Shield)$/,
    handler(m) {
      const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
      const defMap = { Armour: 'Armour', 'Evasion Rating': 'Evasion', 'Energy Shield': 'EnergyShield' };
      const name = defMap[m[3]];
      return [createMod(name, 'INC', val, 'Item')];
    },
  },

  // N% increased/reduced Physical/Fire/Cold/Lightning/Chaos Damage
  {
    regex: new RegExp(
      `^(\\d+)% (increased|reduced) (${DAMAGE_TYPES.join('|')}) Damage$`
    ),
    handler(m) {
      const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
      const name = `${m[3]}Damage`;
      return [createMod(name, 'INC', val, 'Item')];
    },
  },

  // N% increased/reduced Elemental Damage
  {
    regex: /^(\d+)% (increased|reduced) Elemental Damage$/,
    handler(m) {
      const val = parseInt(m[1], 10) * (m[2] === 'reduced' ? -1 : 1);
      return [createMod('ElementalDamage', 'INC', val, 'Item')];
    },
  },
];

/**
 * Strip PoB metadata prefixes and suffixes from mod text.
 * Examples:
 *   "{crafted}+50 to maximum Life" -> "+50 to maximum Life"
 *   "{range:0.5}+50 to maximum Life" -> "+50 to maximum Life"
 *   "+30% to Fire Resistance (implicit)" -> "+30% to Fire Resistance"
 *   "15% increased Attack Speed (enchant)" -> "15% increased Attack Speed"
 */
function stripModText(text) {
  // Strip curly-brace prefixes like {crafted}, {range:0.5}
  let cleaned = text.replace(/^\{[^}]*\}/g, '');
  // Strip parenthesized suffixes like (implicit), (enchant), (crafted)
  cleaned = cleaned.replace(/\s*\((?:implicit|enchant|crafted|fractured|scourge|crucible)\)\s*$/i, '');
  return cleaned.trim();
}

/**
 * Parse an item mod text line into an array of modifier objects.
 *
 * @param {string} text - Raw mod text, e.g. "+50 to maximum Life"
 * @returns {Array<object>} Array of mod objects (empty if unrecognized)
 */
export function parseMod(text) {
  const cleaned = stripModText(text);

  for (const pattern of PATTERNS) {
    const match = cleaned.match(pattern.regex);
    if (match) {
      return pattern.handler(match);
    }
  }

  // Unrecognized mod
  return [];
}
