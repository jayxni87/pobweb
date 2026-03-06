import { describe, it, expect } from 'vitest';
import {
  configOptions,
  applyConfigOption,
  getConfigOption,
  CONFIG_TYPES,
} from '../config-options.js';

// Mock modList that collects mods
function mockModList() {
  const mods = [];
  return {
    mods,
    addMod(mod) { mods.push(mod); },
  };
}

describe('configOptions', () => {
  it('exports an array of option definitions', () => {
    expect(Array.isArray(configOptions)).toBe(true);
    expect(configOptions.length).toBeGreaterThan(0);
  });

  it('each option has required fields', () => {
    for (const opt of configOptions) {
      expect(opt).toHaveProperty('var');
      expect(opt).toHaveProperty('type');
      expect(opt).toHaveProperty('label');
      expect(CONFIG_TYPES).toContain(opt.type);
    }
  });

  it('list options have a list array', () => {
    const listOpts = configOptions.filter(o => o.type === 'list');
    for (const opt of listOpts) {
      expect(Array.isArray(opt.list)).toBe(true);
      expect(opt.list.length).toBeGreaterThan(0);
      for (const item of opt.list) {
        expect(item).toHaveProperty('val');
        expect(item).toHaveProperty('label');
      }
    }
  });
});

describe('getConfigOption', () => {
  it('finds option by var name', () => {
    const opt = getConfigOption('conditionMoving');
    expect(opt).toBeDefined();
    expect(opt.type).toBe('check');
  });

  it('returns undefined for unknown var', () => {
    expect(getConfigOption('nonExistentVar')).toBeUndefined();
  });
});

describe('applyConfigOption', () => {
  it('applies check condition to modList', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('conditionMoving', true, modList, enemyModList);
    expect(modList.mods.length).toBe(1);
    expect(modList.mods[0].name).toBe('Condition:Moving');
    expect(modList.mods[0].type).toBe('FLAG');
    expect(modList.mods[0].value).toBe(true);
  });

  it('applies check condition for full life', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('conditionFullLife', true, modList, enemyModList);
    expect(modList.mods[0].name).toBe('Condition:FullLife');
  });

  it('applies check condition for low life', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('conditionLowLife', true, modList, enemyModList);
    expect(modList.mods[0].name).toBe('Condition:LowLife');
  });

  it('applies count multiplier', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('multiplierPowerCharges', 3, modList, enemyModList);
    expect(modList.mods.length).toBe(1);
    expect(modList.mods[0].name).toBe('Multiplier:PowerCharge');
    expect(modList.mods[0].value).toBe(3);
  });

  it('applies enemy condition', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('conditionEnemyRareOrUnique', true, modList, enemyModList);
    expect(enemyModList.mods.length).toBe(1);
    expect(enemyModList.mods[0].name).toBe('Condition:RareOrUnique');
  });

  it('applies enemy boss list', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('enemyIsBoss', 'Boss', modList, enemyModList);
    // Should set enemy conditions for standard boss
    const condNames = enemyModList.mods.map(m => m.name);
    expect(condNames).toContain('Condition:RareOrUnique');
    expect(condNames).toContain('Condition:Boss');
  });

  it('applies pinnacle boss conditions', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('enemyIsBoss', 'Pinnacle', modList, enemyModList);
    const condNames = enemyModList.mods.map(m => m.name);
    expect(condNames).toContain('Condition:RareOrUnique');
    expect(condNames).toContain('Condition:Boss');
    expect(condNames).toContain('Condition:PinnacleBoss');
  });

  it('applies uber pinnacle boss conditions', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('enemyIsBoss', 'Uber', modList, enemyModList);
    const condNames = enemyModList.mods.map(m => m.name);
    expect(condNames).toContain('Condition:PinnacleBoss');
    expect(condNames).toContain('Condition:UberBoss');
  });

  it('does nothing for unknown var', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('unknownVar', true, modList, enemyModList);
    expect(modList.mods.length).toBe(0);
    expect(enemyModList.mods.length).toBe(0);
  });

  it('does nothing for falsy check value', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('conditionMoving', false, modList, enemyModList);
    expect(modList.mods.length).toBe(0);
  });

  it('does nothing for zero count value', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('multiplierPowerCharges', 0, modList, enemyModList);
    expect(modList.mods.length).toBe(0);
  });

  it('applies frenzy charge multiplier', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('multiplierFrenzyCharges', 5, modList, enemyModList);
    expect(modList.mods[0].name).toBe('Multiplier:FrenzyCharge');
    expect(modList.mods[0].value).toBe(5);
  });

  it('applies endurance charge multiplier', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('multiplierEnduranceCharges', 4, modList, enemyModList);
    expect(modList.mods[0].name).toBe('Multiplier:EnduranceCharge');
    expect(modList.mods[0].value).toBe(4);
  });

  it('applies enemy physical damage reduction', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('enemyPhysicalReduction', 30, modList, enemyModList);
    expect(enemyModList.mods[0].name).toBe('PhysicalDamageReduction');
    expect(enemyModList.mods[0].value).toBe(30);
  });

  it('applies enemy fire resistance', () => {
    const modList = mockModList();
    const enemyModList = mockModList();
    applyConfigOption('enemyFireResist', 40, modList, enemyModList);
    expect(enemyModList.mods[0].name).toBe('FireResist');
    expect(enemyModList.mods[0].value).toBe(40);
  });
});
