import { describe, it, expect } from 'vitest';
import { initModDB, initEnv } from '../calc-setup.js';
import { ModDB } from '../mod-db.js';

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
