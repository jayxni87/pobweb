import { describe, it, expect } from 'vitest';
import { ModDB } from '../mod-db.js';
import { createMod } from '../mod-tools.js';
import { ModFlag, KeywordFlag } from '../utils.js';

describe('ModDB', () => {
  it('stores and sums BASE mods', () => {
    const db = new ModDB();
    db.addMod(createMod('Life', 'BASE', 50, 'Tree'));
    db.addMod(createMod('Life', 'BASE', 30, 'Item'));
    expect(db.sum('BASE', null, 'Life')).toBe(80);
  });

  it('sums INC mods', () => {
    const db = new ModDB();
    db.addMod(createMod('Life', 'INC', 10, 'Tree'));
    db.addMod(createMod('Life', 'INC', 20, 'Item'));
    expect(db.sum('INC', null, 'Life')).toBe(30);
  });

  it('calculates MORE multiplier', () => {
    const db = new ModDB();
    db.addMod(createMod('Damage', 'MORE', 20, 'Skill'));
    db.addMod(createMod('Damage', 'MORE', 30, 'Support'));
    // (1 + 0.2) * (1 + 0.3) = 1.56
    expect(db.more(null, 'Damage')).toBeCloseTo(1.56, 2);
  });

  it('checks FLAG mods', () => {
    const db = new ModDB();
    expect(db.flag(null, 'Onslaught')).toBe(false);
    db.addMod(createMod('Onslaught', 'FLAG', true, 'Config'));
    expect(db.flag(null, 'Onslaught')).toBe(true);
  });

  it('traverses parent chain', () => {
    const parent = new ModDB();
    parent.addMod(createMod('Life', 'BASE', 100, 'Tree'));
    const child = new ModDB(parent);
    child.addMod(createMod('Life', 'BASE', 50, 'Item'));
    expect(child.sum('BASE', null, 'Life')).toBe(150);
  });

  it('handles OVERRIDE', () => {
    const db = new ModDB();
    db.addMod(createMod('CritChance', 'OVERRIDE', 100, 'Item'));
    expect(db.override(null, 'CritChance')).toBe(100);
  });

  it('override returns undefined when no override exists', () => {
    const db = new ModDB();
    expect(db.override(null, 'CritChance')).toBeUndefined();
  });

  it('lists LIST mods', () => {
    const db = new ModDB();
    db.addMod(createMod('Keystone', 'LIST', 'Resolute Technique', 'Tree'));
    db.addMod(createMod('Keystone', 'LIST', 'Iron Reflexes', 'Tree'));
    const result = db.list(null, 'Keystone');
    expect(result).toContain('Resolute Technique');
    expect(result).toContain('Iron Reflexes');
  });

  it('respects mod flags', () => {
    const db = new ModDB();
    db.addMod(createMod('Damage', 'INC', 20, 'Item', ModFlag.Attack));
    db.addMod(createMod('Damage', 'INC', 30, 'Item', ModFlag.Spell));
    // Querying with Attack flag should only get the first
    expect(db.sum('INC', { flags: ModFlag.Attack, keywordFlags: 0 }, 'Damage')).toBe(20);
  });

  it('respects keyword flags', () => {
    const db = new ModDB();
    db.addMod(createMod('Damage', 'INC', 25, 'Item', 0, KeywordFlag.Fire));
    db.addMod(createMod('Damage', 'INC', 15, 'Item', 0, KeywordFlag.Cold));
    expect(db.sum('INC', { flags: 0, keywordFlags: KeywordFlag.Fire }, 'Damage')).toBe(25);
  });

  it('sums multiple stat names', () => {
    const db = new ModDB();
    db.addMod(createMod('Life', 'BASE', 50, 'Tree'));
    db.addMod(createMod('Mana', 'BASE', 30, 'Tree'));
    expect(db.sum('BASE', null, 'Life', 'Mana')).toBe(80);
  });

  it('addList adds array of mods', () => {
    const db = new ModDB();
    const mods = [
      createMod('Life', 'BASE', 10, 'A'),
      createMod('Life', 'BASE', 20, 'B'),
    ];
    db.addList(mods);
    expect(db.sum('BASE', null, 'Life')).toBe(30);
  });

  it('addDB merges another ModDB', () => {
    const db1 = new ModDB();
    db1.addMod(createMod('Life', 'BASE', 50, 'Tree'));
    const db2 = new ModDB();
    db2.addMod(createMod('Life', 'BASE', 30, 'Item'));
    db1.addDB(db2);
    expect(db1.sum('BASE', null, 'Life')).toBe(80);
  });

  it('tabulate returns mod objects with values', () => {
    const db = new ModDB();
    db.addMod(createMod('Life', 'BASE', 50, 'Tree'));
    db.addMod(createMod('Life', 'BASE', 30, 'Item'));
    const result = db.tabulate('BASE', null, 'Life');
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(50);
    expect(result[0].mod.source).toBe('Tree');
  });

  it('hasMod returns true when mod exists', () => {
    const db = new ModDB();
    db.addMod(createMod('Life', 'BASE', 50, 'Tree'));
    expect(db.hasMod('BASE', null, 'Life')).toBe(true);
    expect(db.hasMod('INC', null, 'Life')).toBe(false);
  });

  it('conditions and multipliers work', () => {
    const db = new ModDB();
    db.conditions['Onslaught'] = true;
    db.multipliers['FrenzyCharge'] = 3;
    expect(db.getCondition('Onslaught')).toBe(true);
    expect(db.getCondition('Missing')).toBeFalsy();
    expect(db.getMultiplier('FrenzyCharge')).toBe(3);
    expect(db.getMultiplier('Missing')).toBe(0);
  });

  it('evaluates Condition tags', () => {
    const db = new ModDB();
    db.conditions['Onslaught'] = true;
    db.addMod(createMod('Speed', 'INC', 20, 'Buff', 0, 0,
      { type: 'Condition', var: 'Onslaught' }));
    db.addMod(createMod('Speed', 'INC', 10, 'Buff', 0, 0,
      { type: 'Condition', var: 'Missing' }));
    expect(db.sum('INC', null, 'Speed')).toBe(20);
  });

  it('evaluates negative Condition tags', () => {
    const db = new ModDB();
    db.conditions['DualWielding'] = true;
    db.addMod(createMod('Damage', 'INC', 30, 'Tree', 0, 0,
      { type: 'Condition', var: 'DualWielding', neg: true }));
    // Condition is met, but neg inverts it, so mod should NOT apply
    expect(db.sum('INC', null, 'Damage')).toBe(0);
  });

  it('evaluates Multiplier tags', () => {
    const db = new ModDB();
    db.multipliers['FrenzyCharge'] = 3;
    db.addMod(createMod('Speed', 'INC', 4, 'Tree', 0, 0,
      { type: 'Multiplier', var: 'FrenzyCharge' }));
    // 4 * 3 = 12
    expect(db.sum('INC', null, 'Speed')).toBe(12);
  });

  it('parent MORE multiplies with child', () => {
    const parent = new ModDB();
    parent.addMod(createMod('Damage', 'MORE', 50, 'Skill'));
    const child = new ModDB(parent);
    child.addMod(createMod('Damage', 'MORE', 20, 'Support'));
    // (1+0.2) * (1+0.5) = 1.8
    expect(child.more(null, 'Damage')).toBeCloseTo(1.8, 2);
  });
});
