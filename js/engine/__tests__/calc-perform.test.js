import { describe, it, expect } from 'vitest';
import { doActorAttribs, doActorLifeMana } from '../calc-perform.js';
import { ModDB } from '../mod-db.js';
import { ModFlag } from '../utils.js';

function makeActor(mods) {
  const modDB = new ModDB();
  if (mods) {
    for (const m of mods) modDB.newMod(...m);
  }
  return {
    modDB,
    output: {},
    itemList: {},
    weaponData1: { type: 'None' },
    weaponData2: {},
  };
}

describe('doActorAttribs', () => {
  it('calculates attributes from BASE mods', () => {
    const actor = makeActor([
      ['Str', 'BASE', 50, 'Tree'],
      ['Dex', 'BASE', 30, 'Tree'],
      ['Int', 'BASE', 40, 'Tree'],
    ]);
    doActorAttribs(actor);
    expect(actor.output.Str).toBe(50);
    expect(actor.output.Dex).toBe(30);
    expect(actor.output.Int).toBe(40);
  });

  it('applies INC to attributes', () => {
    const actor = makeActor([
      ['Str', 'BASE', 100, 'Tree'],
      ['Str', 'INC', 50, 'Item'],
      ['Dex', 'BASE', 100, 'Tree'],
      ['Int', 'BASE', 100, 'Tree'],
    ]);
    doActorAttribs(actor);
    expect(actor.output.Str).toBe(150); // 100 * 1.5
  });

  it('sets attribute comparison conditions', () => {
    const actor = makeActor([
      ['Str', 'BASE', 200, 'Tree'],
      ['Dex', 'BASE', 100, 'Tree'],
      ['Int', 'BASE', 50, 'Tree'],
    ]);
    doActorAttribs(actor);
    expect(actor.modDB.conditions.StrHigherThanDex).toBe(true);
    expect(actor.modDB.conditions.StrHigherThanInt).toBe(true);
    expect(actor.modDB.conditions.StrHighestAttribute).toBe(true);
    expect(actor.output.LowestAttribute).toBe(50);
  });

  it('adds Str bonus to Life (Str/2)', () => {
    const actor = makeActor([
      ['Str', 'BASE', 100, 'Tree'],
      ['Dex', 'BASE', 10, 'Tree'],
      ['Int', 'BASE', 10, 'Tree'],
    ]);
    doActorAttribs(actor);
    // Str 100 → +50 flat Life
    expect(actor.modDB.sum('BASE', null, 'Life')).toBe(50);
  });

  it('adds Str bonus to PhysicalDamage INC (Str/5 melee)', () => {
    const actor = makeActor([
      ['Str', 'BASE', 100, 'Tree'],
      ['Dex', 'BASE', 10, 'Tree'],
      ['Int', 'BASE', 10, 'Tree'],
    ]);
    doActorAttribs(actor);
    expect(actor.strDmgBonus).toBe(20); // floor(100/5)
    expect(actor.modDB.sum('INC', { flags: ModFlag.Melee, keywordFlags: 0 }, 'PhysicalDamage')).toBe(20);
  });

  it('adds Dex bonus to Accuracy (Dex*2)', () => {
    const actor = makeActor([
      ['Str', 'BASE', 10, 'Tree'],
      ['Dex', 'BASE', 100, 'Tree'],
      ['Int', 'BASE', 10, 'Tree'],
    ]);
    doActorAttribs(actor);
    expect(actor.modDB.sum('BASE', null, 'Accuracy')).toBe(200); // 100 * 2
  });

  it('adds Dex bonus to Evasion INC (Dex/5)', () => {
    const actor = makeActor([
      ['Str', 'BASE', 10, 'Tree'],
      ['Dex', 'BASE', 100, 'Tree'],
      ['Int', 'BASE', 10, 'Tree'],
    ]);
    doActorAttribs(actor);
    expect(actor.modDB.sum('INC', null, 'Evasion')).toBe(20); // floor(100/5)
  });

  it('adds Int bonus to Mana (Int/2) and ES INC (Int/5)', () => {
    const actor = makeActor([
      ['Str', 'BASE', 10, 'Tree'],
      ['Dex', 'BASE', 10, 'Tree'],
      ['Int', 'BASE', 100, 'Tree'],
    ]);
    doActorAttribs(actor);
    expect(actor.modDB.sum('BASE', null, 'Mana')).toBe(50); // floor(100/2)
    expect(actor.modDB.sum('INC', null, 'EnergyShield')).toBe(20); // floor(100/5)
  });

  it('calculates TotalAttr', () => {
    const actor = makeActor([
      ['Str', 'BASE', 100, 'Tree'],
      ['Dex', 'BASE', 80, 'Tree'],
      ['Int', 'BASE', 60, 'Tree'],
    ]);
    doActorAttribs(actor);
    expect(actor.output.TotalAttr).toBe(240);
  });
});

describe('doActorLifeMana', () => {
  it('calculates Life from BASE, INC, MORE', () => {
    const actor = makeActor([
      ['Life', 'BASE', 100, 'Base'],
      ['Life', 'INC', 50, 'Tree'],
      ['Life', 'MORE', 20, 'Keystone'],
    ]);
    doActorLifeMana(actor);
    // 100 * 1.5 * 1.2 = 180
    expect(actor.output.Life).toBe(180);
  });

  it('calculates Mana from BASE, INC, MORE', () => {
    const actor = makeActor([
      ['Mana', 'BASE', 80, 'Base'],
      ['Mana', 'INC', 100, 'Tree'],
    ]);
    doActorLifeMana(actor);
    // 80 * 2.0 = 160
    expect(actor.output.Mana).toBe(160);
  });

  it('handles ChaosInoculation (Life = 1)', () => {
    const actor = makeActor([
      ['ChaosInoculation', 'FLAG', true, 'Keystone'],
      ['Life', 'BASE', 500, 'Base'],
    ]);
    doActorLifeMana(actor);
    expect(actor.output.Life).toBe(1);
    expect(actor.output.ChaosInoculation).toBe(true);
    expect(actor.modDB.conditions.FullLife).toBe(true);
  });

  it('enforces minimum Life of 1', () => {
    const actor = makeActor([
      ['Life', 'BASE', 0, 'Base'],
    ]);
    doActorLifeMana(actor);
    expect(actor.output.Life).toBeGreaterThanOrEqual(1);
  });

  it('sets LowestOfMaximumLifeAndMaximumMana', () => {
    const actor = makeActor([
      ['Life', 'BASE', 200, 'Base'],
      ['Mana', 'BASE', 100, 'Base'],
    ]);
    doActorLifeMana(actor);
    expect(actor.output.LowestOfMaximumLifeAndMaximumMana).toBe(100);
  });
});
