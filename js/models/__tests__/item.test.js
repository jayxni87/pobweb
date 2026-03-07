import { describe, it, expect } from 'vitest';
import {
  Item,
  parseItemText,
  parseSockets,
  getCatalystScalar,
  RARITY,
} from '../item.js';
import { BaseTypeRegistry } from '../../data/base-types.js';

describe('RARITY', () => {
  it('has expected values', () => {
    expect(RARITY.NORMAL).toBe('NORMAL');
    expect(RARITY.MAGIC).toBe('MAGIC');
    expect(RARITY.RARE).toBe('RARE');
    expect(RARITY.UNIQUE).toBe('UNIQUE');
  });
});

describe('parseSockets', () => {
  it('parses single socket', () => {
    const sockets = parseSockets('R');
    expect(sockets).toEqual([{ color: 'R', group: 0 }]);
  });

  it('parses linked sockets', () => {
    const sockets = parseSockets('R-G-B');
    expect(sockets).toHaveLength(3);
    expect(sockets[0]).toEqual({ color: 'R', group: 0 });
    expect(sockets[1]).toEqual({ color: 'G', group: 0 });
    expect(sockets[2]).toEqual({ color: 'B', group: 0 });
  });

  it('parses unlinked groups', () => {
    const sockets = parseSockets('R-G B-B');
    expect(sockets).toHaveLength(4);
    expect(sockets[0].group).toBe(0);
    expect(sockets[1].group).toBe(0);
    expect(sockets[2].group).toBe(1);
    expect(sockets[3].group).toBe(1);
  });

  it('parses 6-link', () => {
    const sockets = parseSockets('R-R-G-G-B-B');
    expect(sockets).toHaveLength(6);
    for (const s of sockets) expect(s.group).toBe(0);
  });

  it('handles white and abyss sockets', () => {
    const sockets = parseSockets('W-A');
    expect(sockets[0].color).toBe('W');
    expect(sockets[1].color).toBe('A');
  });
});

describe('getCatalystScalar', () => {
  it('returns 1 for no catalyst', () => {
    expect(getCatalystScalar(null, ['attack'], 20)).toBe(1);
  });

  it('returns scaled value for matching tags', () => {
    // Abrasive catalyst (index 0) matches 'attack' tag
    expect(getCatalystScalar(0, ['attack'], 20)).toBeCloseTo(1.2);
  });

  it('returns 1 for non-matching tags', () => {
    // Abrasive catalyst doesn't match 'speed'
    expect(getCatalystScalar(0, ['speed'], 20)).toBe(1);
  });

  it('uses quality for scaling', () => {
    expect(getCatalystScalar(0, ['attack'], 10)).toBeCloseTo(1.1);
  });

  it('defaults to quality 20', () => {
    expect(getCatalystScalar(0, ['attack'])).toBeCloseTo(1.2);
  });
});

describe('parseItemText', () => {
  it('parses a simple rare item', () => {
    const text = `Rarity: Rare
Havoc Bite
Vaal Axe
--------
Quality: +20%
Sockets: R-R-G-G-B-B
Item Level: 83
--------
Adds 10 to 20 Physical Damage
+50 to maximum Life
+40% to Fire Resistance`;

    const item = parseItemText(text);
    expect(item.rarity).toBe('RARE');
    expect(item.name).toBe('Havoc Bite');
    expect(item.baseName).toBe('Vaal Axe');
    expect(item.quality).toBe(20);
    expect(item.itemLevel).toBe(83);
    expect(item.sockets).toHaveLength(6);
    expect(item.explicitModLines).toHaveLength(3);
  });

  it('parses a unique item', () => {
    const text = `Rarity: Unique
Tabula Rasa
Simple Robe
--------
Sockets: W-W-W-W-W-W
--------
Item Level: 1`;

    const item = parseItemText(text);
    expect(item.rarity).toBe('UNIQUE');
    expect(item.name).toBe('Tabula Rasa');
    expect(item.baseName).toBe('Simple Robe');
    expect(item.sockets).toHaveLength(6);
  });

  it('parses a normal item', () => {
    const text = `Rarity: Normal
Iron Ring`;

    const item = parseItemText(text);
    expect(item.rarity).toBe('NORMAL');
    expect(item.name).toBe('Iron Ring');
  });

  it('detects corrupted items', () => {
    const text = `Rarity: Unique
Some Unique
Base Type
--------
Corrupted`;

    const item = parseItemText(text);
    expect(item.corrupted).toBe(true);
  });

  it('detects mirrored items', () => {
    const text = `Rarity: Rare
Mirror Item
Vaal Regalia
--------
Mirrored`;

    const item = parseItemText(text);
    expect(item.mirrored).toBe(true);
  });

  it('parses implicit mods', () => {
    const text = `Rarity: Rare
Storm Band
Ruby Ring
--------
+30% to Fire Resistance (implicit)
--------
+50 to maximum Life`;

    const item = parseItemText(text);
    expect(item.implicitModLines).toHaveLength(1);
    expect(item.implicitModLines[0]).toContain('Fire Resistance');
    expect(item.explicitModLines).toHaveLength(1);
  });

  it('parses requirements', () => {
    const text = `Rarity: Normal
Vaal Axe
--------
Requires Level 64, 158 Str, 76 Dex`;

    const item = parseItemText(text);
    expect(item.requirements.level).toBe(64);
    expect(item.requirements.str).toBe(158);
    expect(item.requirements.dex).toBe(76);
  });

  it('handles Item Class prefix', () => {
    const text = `Item Class: Body Armours
Rarity: Rare
Havoc Shell
Vaal Regalia
--------
+100 to maximum Energy Shield`;

    const item = parseItemText(text);
    expect(item.rarity).toBe('RARE');
    expect(item.name).toBe('Havoc Shell');
    expect(item.baseName).toBe('Vaal Regalia');
  });

  it('parses enchant mods', () => {
    const text = `Rarity: Rare
Test Helm
Royal Burgonet
--------
10% increased Fireball Damage (enchant)
--------
+50 to maximum Life`;

    const item = parseItemText(text);
    expect(item.enchantModLines).toHaveLength(1);
  });
});

describe('Item class', () => {
  it('constructs from raw text', () => {
    const item = new Item(`Rarity: Rare
Test Ring
Ruby Ring
--------
+30% to Fire Resistance (implicit)
--------
+50 to maximum Life`);
    expect(item.name).toBe('Test Ring');
    expect(item.rarity).toBe('RARE');
  });

  it('maxLinks returns correct value', () => {
    const item = new Item(`Rarity: Normal
Test
Base
--------
Sockets: R-R-G B-B`);
    expect(item.maxLinks()).toBe(3);
  });

  it('numSockets returns correct count', () => {
    const item = new Item(`Rarity: Normal
Test
Base
--------
Sockets: R-G-B-R`);
    expect(item.numSockets()).toBe(4);
  });
});

describe('Item with base resolution', () => {
  const registry = new BaseTypeRegistry();

  it('resolves weapon base stats', () => {
    const item = new Item(`Rarity: Rare
Havoc Bite
Rusted Sword
--------
Quality: +20%
--------
Adds 10 to 20 Physical Damage
15% increased Attack Speed`);
    item.resolveBase(registry);
    expect(item.baseData).toBeDefined();
    expect(item.baseData.weapon).toBeDefined();
    expect(item.baseData.weapon.PhysicalMin).toBe(4);
  });

  it('computes weapon DPS with quality and flat phys', () => {
    const item = new Item(`Rarity: Rare
Havoc Bite
Rusted Sword
--------
Quality: +20%
--------
Adds 10 to 20 Physical Damage`);
    item.resolveBase(registry);
    item.buildModList();
    expect(item.weaponData).toBeDefined();
    // Base 4-9 + flat 10-20 = 14-29
    // Quality 20%: * 1.2 -> round(16.8)=17, round(34.8)=35
    // Attack rate: 1.55 (no local speed mod)
    // DPS: (17+35)/2 * 1.55 = 40.3
    expect(item.weaponData.PhysicalMin).toBe(17);
    expect(item.weaponData.PhysicalMax).toBe(35);
    expect(item.weaponData.AttackRate).toBeCloseTo(1.55, 2);
    expect(item.weaponData.PhysicalDPS).toBeCloseTo(40.3, 0);
  });

  it('computes weapon attack speed with local inc', () => {
    const item = new Item(`Rarity: Rare
Test
Rusted Sword
--------
15% increased Attack Speed`);
    item.resolveBase(registry);
    item.buildModList();
    // 1.55 * (1 + 15/100) = 1.55 * 1.15 = 1.7825 -> round to 1.78
    expect(item.weaponData.AttackRate).toBeCloseTo(1.78, 2);
  });

  it('computes armour values with quality', () => {
    const item = new Item(`Rarity: Rare
Glyph Ward
Plate Vest
--------
Quality: +20%
--------
50% increased Armour`);
    item.resolveBase(registry);
    item.buildModList();
    expect(item.armourData).toBeDefined();
    // Base avg: (19+27)/2 = 23
    // Quality 20%: 23 * 1.2 = 27.6
    // Local 50% inc: 27.6 * 1.5 = 41.4 -> round = 41
    expect(item.armourData.Armour).toBe(41);
  });

  it('returns null weaponData for non-weapon items', () => {
    const item = new Item(`Rarity: Normal
Iron Ring`);
    item.resolveBase(registry);
    item.buildModList();
    expect(item.weaponData).toBeNull();
  });

  it('resolves base from name when baseName not set (normal items)', () => {
    const item = new Item(`Rarity: Normal
Rusted Sword`);
    item.resolveBase(registry);
    expect(item.baseData).toBeDefined();
    expect(item.baseData.weapon).toBeDefined();
  });
});
