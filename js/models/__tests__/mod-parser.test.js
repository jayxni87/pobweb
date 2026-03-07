import { describe, it, expect } from 'vitest';
import { parseMod } from '../mod-parser.js';
import { ModFlag } from '../../engine/utils.js';

// Helper: extract just the fields we care about for comparison.
// createMod adds flags/keywordFlags/source/tags, so we pick what matters.
function simplify(mods) {
  return mods.map(m => {
    const o = { name: m.name, type: m.type, value: m.value };
    if (m.flags) o.flags = m.flags;
    if (m.keywordFlags) o.keywordFlags = m.keywordFlags;
    return o;
  });
}

describe('parseMod', () => {
  // --- Flat additions ---
  describe('flat additions', () => {
    it('parses +N to maximum Life', () => {
      const mods = parseMod('+50 to maximum Life');
      expect(simplify(mods)).toEqual([
        { name: 'Life', type: 'BASE', value: 50 },
      ]);
    });

    it('parses +N to maximum Mana', () => {
      const mods = parseMod('+80 to maximum Mana');
      expect(simplify(mods)).toEqual([
        { name: 'Mana', type: 'BASE', value: 80 },
      ]);
    });

    it('parses +N to Strength', () => {
      const mods = parseMod('+20 to Strength');
      expect(simplify(mods)).toEqual([
        { name: 'Str', type: 'BASE', value: 20 },
      ]);
    });

    it('parses +N to all Attributes', () => {
      const mods = parseMod('+10 to all Attributes');
      expect(simplify(mods)).toEqual([
        { name: 'Str', type: 'BASE', value: 10 },
        { name: 'Dex', type: 'BASE', value: 10 },
        { name: 'Int', type: 'BASE', value: 10 },
      ]);
    });
  });

  // --- Resistances ---
  describe('resistances', () => {
    it('parses +N% to Fire Resistance', () => {
      const mods = parseMod('+40% to Fire Resistance');
      expect(simplify(mods)).toEqual([
        { name: 'FireResist', type: 'BASE', value: 40 },
      ]);
    });

    it('parses +N% to all Elemental Resistances', () => {
      const mods = parseMod('+15% to all Elemental Resistances');
      expect(simplify(mods)).toEqual([
        { name: 'FireResist', type: 'BASE', value: 15 },
        { name: 'ColdResist', type: 'BASE', value: 15 },
        { name: 'LightningResist', type: 'BASE', value: 15 },
      ]);
    });

    it('parses +N% to Chaos Resistance', () => {
      const mods = parseMod('+20% to Chaos Resistance');
      expect(simplify(mods)).toEqual([
        { name: 'ChaosResist', type: 'BASE', value: 20 },
      ]);
    });
  });

  // --- Percentage increases ---
  describe('percentage increases', () => {
    it('parses N% increased maximum Life', () => {
      const mods = parseMod('10% increased maximum Life');
      expect(simplify(mods)).toEqual([
        { name: 'Life', type: 'INC', value: 10 },
      ]);
    });

    it('parses N% increased Attack Speed', () => {
      const mods = parseMod('15% increased Attack Speed');
      expect(simplify(mods)).toEqual([
        { name: 'Speed', type: 'INC', value: 15, flags: ModFlag.Attack },
      ]);
    });

    it('parses N% reduced Movement Speed', () => {
      const mods = parseMod('10% reduced Movement Speed');
      expect(simplify(mods)).toEqual([
        { name: 'MovementSpeed', type: 'INC', value: -10 },
      ]);
    });
  });

  // --- Flat damage ---
  describe('flat damage', () => {
    it('parses Adds N to N Physical Damage', () => {
      const mods = parseMod('Adds 10 to 20 Physical Damage');
      expect(simplify(mods)).toEqual([
        { name: 'PhysicalMin', type: 'BASE', value: 10 },
        { name: 'PhysicalMax', type: 'BASE', value: 20 },
      ]);
    });

    it('parses Adds N to N Fire Damage', () => {
      const mods = parseMod('Adds 5 to 10 Fire Damage');
      expect(simplify(mods)).toEqual([
        { name: 'FireMin', type: 'BASE', value: 5 },
        { name: 'FireMax', type: 'BASE', value: 10 },
      ]);
    });
  });

  // --- Defences ---
  describe('defences', () => {
    it('parses +N to Armour', () => {
      const mods = parseMod('+100 to Armour');
      expect(simplify(mods)).toEqual([
        { name: 'Armour', type: 'BASE', value: 100 },
      ]);
    });

    it('parses N% increased Armour', () => {
      const mods = parseMod('50% increased Armour');
      expect(simplify(mods)).toEqual([
        { name: 'Armour', type: 'INC', value: 50 },
      ]);
    });

    it('parses +N to maximum Energy Shield', () => {
      const mods = parseMod('+40 to maximum Energy Shield');
      expect(simplify(mods)).toEqual([
        { name: 'EnergyShield', type: 'BASE', value: 40 },
      ]);
    });

    it('parses +N to Evasion Rating', () => {
      const mods = parseMod('+200 to Evasion Rating');
      expect(simplify(mods)).toEqual([
        { name: 'Evasion', type: 'BASE', value: 200 },
      ]);
    });
  });

  // --- Crit ---
  describe('crit', () => {
    it('parses N% increased Critical Strike Chance', () => {
      const mods = parseMod('25% increased Critical Strike Chance');
      expect(simplify(mods)).toEqual([
        { name: 'CritChance', type: 'INC', value: 25 },
      ]);
    });

    it('parses +N% to Global Critical Strike Multiplier', () => {
      const mods = parseMod('+30% to Global Critical Strike Multiplier');
      expect(simplify(mods)).toEqual([
        { name: 'CritMultiplier', type: 'BASE', value: 30 },
      ]);
    });
  });

  // --- Unrecognized ---
  describe('unrecognized', () => {
    it('returns empty array for unknown mod text', () => {
      const mods = parseMod('Some completely unknown mod text');
      expect(mods).toEqual([]);
    });
  });

  // --- Prefix/suffix stripping ---
  describe('prefix/suffix stripping', () => {
    it('strips {crafted} prefix', () => {
      const mods = parseMod('{crafted}+50 to maximum Life');
      expect(simplify(mods)).toEqual([
        { name: 'Life', type: 'BASE', value: 50 },
      ]);
    });

    it('strips {range:N.N} prefix', () => {
      const mods = parseMod('{range:0.5}+50 to maximum Life');
      expect(simplify(mods)).toEqual([
        { name: 'Life', type: 'BASE', value: 50 },
      ]);
    });

    it('strips (implicit) suffix', () => {
      const mods = parseMod('+30% to Fire Resistance (implicit)');
      expect(simplify(mods)).toEqual([
        { name: 'FireResist', type: 'BASE', value: 30 },
      ]);
    });

    it('strips (enchant) suffix', () => {
      const mods = parseMod('15% increased Attack Speed (enchant)');
      expect(simplify(mods)).toEqual([
        { name: 'Speed', type: 'INC', value: 15, flags: ModFlag.Attack },
      ]);
    });
  });
});
