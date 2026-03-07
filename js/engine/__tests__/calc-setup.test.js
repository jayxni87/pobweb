import { describe, it, expect } from 'vitest';
import { initModDB, initEnv, mergeItemMods } from '../calc-setup.js';
import { ModDB } from '../mod-db.js';
import { Item } from '../../models/item.js';
import { BaseTypeRegistry } from '../../data/base-types.js';

describe('initModDB', () => {
  it('creates resistance caps at 75%', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'FireResistMax')).toBe(75);
    expect(modDB.sum('BASE', null, 'ColdResistMax')).toBe(75);
    expect(modDB.sum('BASE', null, 'LightningResistMax')).toBe(75);
    expect(modDB.sum('BASE', null, 'ChaosResistMax')).toBe(75);
  });

  it('sets block chance max at 75%', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'BlockChanceMax')).toBe(75);
    expect(modDB.sum('BASE', null, 'SpellBlockChanceMax')).toBe(75);
  });

  it('sets charge limits', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'PowerChargesMax')).toBe(3);
    expect(modDB.sum('BASE', null, 'FrenzyChargesMax')).toBe(3);
    expect(modDB.sum('BASE', null, 'EnduranceChargesMax')).toBe(3);
  });

  it('sets charge duration at 10s', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'ChargeDuration')).toBe(10);
  });

  it('sets leech rate caps', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'MaxLifeLeechRate')).toBeGreaterThan(0);
    expect(modDB.sum('BASE', null, 'MaxManaLeechRate')).toBeGreaterThan(0);
    expect(modDB.sum('BASE', null, 'MaxEnergyShieldLeechRate')).toBe(10);
  });

  it('sets totem limit', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'ActiveTotemLimit')).toBe(1);
  });

  it('sets impale stacks', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'ImpaleStacksMax')).toBe(5);
  });

  it('sets trap/mine/totem/warcry cast times', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'TrapThrowingTime')).toBe(0.6);
    expect(modDB.sum('BASE', null, 'MineLayingTime')).toBe(0.3);
    expect(modDB.sum('BASE', null, 'WarcryCastTime')).toBe(0.8);
    expect(modDB.sum('BASE', null, 'TotemPlacementTime')).toBe(0.6);
  });

  it('sets crit chance cap', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'CritChanceCap')).toBe(100);
  });

  it('sets conditional flag mods (onslaught etc)', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    // These are FLAG mods with conditions, so they won't return true without conditions met
    // But we can verify they exist via hasMod
    expect(modDB.hasMod('FLAG', null, 'Onslaught')).toBe(true);
    expect(modDB.hasMod('FLAG', null, 'Fortify')).toBe(true);
  });
});

describe('initEnv', () => {
  it('creates env with player and enemy ModDBs', () => {
    const env = initEnv();
    expect(env.player).toBeTruthy();
    expect(env.player.modDB).toBeInstanceOf(ModDB);
    expect(env.enemyDB).toBeInstanceOf(ModDB);
  });

  it('initializes base mods on player modDB', () => {
    const env = initEnv();
    expect(env.player.modDB.sum('BASE', null, 'FireResistMax')).toBe(75);
    expect(env.player.modDB.sum('BASE', null, 'PowerChargesMax')).toBe(3);
  });

  it('initializes base mods on enemy modDB', () => {
    const env = initEnv();
    expect(env.enemyDB.sum('BASE', null, 'FireResistMax')).toBe(75);
  });
});

describe('mergeItemMods', () => {
  const registry = new BaseTypeRegistry();

  function makeItem(text) {
    const item = new Item(text);
    item.resolveBase(registry);
    item.buildModList();
    return item;
  }

  it('merges flat life mod from equipped ring', () => {
    const env = initEnv();
    const items = {
      'Ring 1': makeItem(`Rarity: Rare
Storm Band
Ruby Ring
--------
+30% to Fire Resistance (implicit)
--------
+50 to maximum Life`),
    };
    mergeItemMods(env, items);
    expect(env.player.modDB.sum('BASE', null, 'Life')).toBe(50);
  });

  it('merges resistance mods', () => {
    const env = initEnv();
    const items = {
      'Ring 1': makeItem(`Rarity: Rare
Test Ring
Ruby Ring
--------
+30% to Fire Resistance (implicit)
--------
+40% to Cold Resistance`),
    };
    mergeItemMods(env, items);
    expect(env.player.modDB.sum('BASE', null, 'FireResist')).toBe(30);
    expect(env.player.modDB.sum('BASE', null, 'ColdResist')).toBe(40);
  });

  it('does not merge local weapon damage mods globally', () => {
    const env = initEnv();
    const items = {
      'Weapon 1': makeItem(`Rarity: Rare
Test Sword
Rusted Sword
--------
Quality: +20%
--------
Adds 10 to 20 Physical Damage`),
    };
    mergeItemMods(env, items);
    // Local flat phys on weapon should NOT appear in global modDB
    expect(env.player.modDB.sum('BASE', null, 'PhysicalMin')).toBe(0);
    expect(env.player.modDB.sum('BASE', null, 'PhysicalMax')).toBe(0);
  });

  it('stores weaponData on env for Weapon 1', () => {
    const env = initEnv();
    const items = {
      'Weapon 1': makeItem(`Rarity: Rare
Test Sword
Rusted Sword
--------
Quality: +20%
--------
Adds 10 to 20 Physical Damage`),
    };
    mergeItemMods(env, items);
    expect(env.player.weaponData1).toBeDefined();
    expect(env.player.weaponData1.PhysicalDPS).toBeGreaterThan(0);
  });

  it('merges mods from multiple slots', () => {
    const env = initEnv();
    const items = {
      'Ring 1': makeItem(`Rarity: Rare
Ring One
Ruby Ring
--------
+50 to maximum Life`),
      'Ring 2': makeItem(`Rarity: Rare
Ring Two
Ruby Ring
--------
+30 to maximum Life`),
    };
    mergeItemMods(env, items);
    expect(env.player.modDB.sum('BASE', null, 'Life')).toBe(80);
  });

  it('does not merge local armour INC mods globally', () => {
    const env = initEnv();
    const items = {
      'Body Armour': makeItem(`Rarity: Rare
Test Vest
Plate Vest
--------
50% increased Armour`),
    };
    mergeItemMods(env, items);
    // Local armour INC should NOT appear in global modDB
    expect(env.player.modDB.sum('INC', null, 'Armour')).toBe(0);
  });
});
