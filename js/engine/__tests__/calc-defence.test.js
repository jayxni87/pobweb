import { describe, it, expect } from 'vitest';
import { hitChance, armourReduction, armourReductionF, calcResistances, calcBlock, calcDefences } from '../calc-defence.js';
import { ModDB } from '../mod-db.js';
import { initModDB } from '../calc-setup.js';

function makeActor(mods) {
  const modDB = new ModDB();
  initModDB(modDB);
  if (mods) {
    for (const m of mods) modDB.newMod(...m);
  }
  return {
    modDB,
    output: {},
    itemList: {},
    enemy: { modDB: new ModDB() },
  };
}

describe('hitChance', () => {
  it('calculates hit chance from accuracy and evasion', () => {
    const chance = hitChance(1000, 2000);
    expect(chance).toBeGreaterThan(50);
    expect(chance).toBeLessThanOrEqual(100);
  });

  it('returns 5 for negative accuracy', () => {
    expect(hitChance(1000, -10)).toBe(5);
  });

  it('caps at 100', () => {
    expect(hitChance(100, 100000)).toBe(100);
  });

  it('floors at 5', () => {
    expect(hitChance(100000, 1)).toBe(5);
  });
});

describe('armourReduction', () => {
  it('calculates damage reduction from armour', () => {
    const reduction = armourReduction(10000, 1000);
    // 10000 / (10000 + 5000) * 100 = 66.67%
    expect(reduction).toBeCloseTo(67, 0);
  });

  it('returns 0 for zero armour and damage', () => {
    expect(armourReductionF(0, 0)).toBe(0);
  });

  it('returns higher reduction for higher armour', () => {
    const low = armourReduction(1000, 1000);
    const high = armourReduction(10000, 1000);
    expect(high).toBeGreaterThan(low);
  });
});

describe('calcResistances', () => {
  it('calculates capped fire resistance', () => {
    const actor = makeActor([
      ['FireResist', 'BASE', 100, 'Item'],
    ]);
    calcResistances(actor);
    expect(actor.output.FireResist).toBe(75); // capped at 75
    expect(actor.output.FireResistTotal).toBe(100);
    expect(actor.output.FireResistOverCap).toBe(25);
  });

  it('allows negative resistance', () => {
    const actor = makeActor([
      ['ColdResist', 'BASE', -50, 'Curse'],
    ]);
    calcResistances(actor);
    expect(actor.output.ColdResist).toBe(-50);
  });

  it('floors resistance at -200', () => {
    const actor = makeActor([
      ['LightningResist', 'BASE', -300, 'Curse'],
    ]);
    calcResistances(actor);
    expect(actor.output.LightningResist).toBe(-200);
  });

  it('applies increased max resistance', () => {
    const actor = makeActor([
      ['FireResist', 'BASE', 100, 'Item'],
      ['FireResistMax', 'BASE', 5, 'Item'],
    ]);
    calcResistances(actor);
    expect(actor.output.FireResist).toBe(80); // 75 + 5 cap
  });

  it('caps max resistance at 90', () => {
    const actor = makeActor([
      ['FireResist', 'BASE', 200, 'Item'],
      ['FireResistMax', 'BASE', 50, 'Item'],
    ]);
    calcResistances(actor);
    // Base max 75 + 50 = 125, but capped at 90
    expect(actor.output.FireResist).toBe(90);
  });

  it('handles elemental resist applying to all three', () => {
    const actor = makeActor([
      ['ElementalResist', 'BASE', 30, 'Item'],
    ]);
    calcResistances(actor);
    expect(actor.output.FireResist).toBe(30);
    expect(actor.output.ColdResist).toBe(30);
    expect(actor.output.LightningResist).toBe(30);
  });

  it('calculates chaos resistance independently', () => {
    const actor = makeActor([
      ['ChaosResist', 'BASE', 40, 'Item'],
    ]);
    calcResistances(actor);
    expect(actor.output.ChaosResist).toBe(40);
  });
});

describe('calcBlock', () => {
  it('calculates block chance', () => {
    const actor = makeActor([
      ['BlockChance', 'BASE', 30, 'Shield'],
    ]);
    calcBlock(actor);
    expect(actor.output.BlockChance).toBe(30);
  });

  it('caps block at BlockChanceMax', () => {
    const actor = makeActor([
      ['BlockChance', 'BASE', 85, 'Shield'],
    ]);
    calcBlock(actor);
    expect(actor.output.BlockChance).toBe(75); // default max is 75
    expect(actor.output.BlockChanceOverCap).toBe(10);
  });

  it('calculates spell block', () => {
    const actor = makeActor([
      ['SpellBlockChance', 'BASE', 20, 'Item'],
    ]);
    calcBlock(actor);
    expect(actor.output.SpellBlockChance).toBe(20);
  });
});

describe('calcDefences', () => {
  it('calculates armour from BASE+INC+MORE', () => {
    const actor = makeActor([
      ['Armour', 'BASE', 1000, 'Item'],
      ['Armour', 'INC', 50, 'Tree'],
    ]);
    calcDefences(actor);
    expect(actor.output.Armour).toBe(1500); // 1000 * 1.5
  });

  it('calculates evasion from BASE+INC+MORE', () => {
    const actor = makeActor([
      ['Evasion', 'BASE', 500, 'Item'],
      ['Evasion', 'INC', 100, 'Tree'],
    ]);
    calcDefences(actor);
    expect(actor.output.Evasion).toBe(1000);
  });

  it('calculates energy shield from BASE+INC+MORE', () => {
    const actor = makeActor([
      ['EnergyShield', 'BASE', 200, 'Item'],
      ['EnergyShield', 'INC', 50, 'Tree'],
    ]);
    calcDefences(actor);
    expect(actor.output.EnergyShield).toBe(300);
  });

  it('converts evasion to armour with Iron Reflexes', () => {
    const actor = makeActor([
      ['IronReflexes', 'FLAG', true, 'Keystone'],
      ['Armour', 'BASE', 1000, 'Item'],
      ['Evasion', 'BASE', 500, 'Item'],
    ]);
    calcDefences(actor);
    expect(actor.output.Armour).toBe(1500); // 1000 + 500
    expect(actor.output.Evasion).toBe(0);
  });

  it('calculates spell suppression', () => {
    const actor = makeActor([
      ['SpellSuppressionChance', 'BASE', 50, 'Item'],
    ]);
    calcDefences(actor);
    expect(actor.output.SpellSuppressionChance).toBe(50);
  });
});
