import { describe, it, expect } from 'vitest';
import { ModList } from '../mod-list.js';
import { createMod, compareModParams } from '../mod-tools.js';
import { ModFlag } from '../utils.js';

describe('ModList', () => {
  it('stores mods in a flat array', () => {
    const list = new ModList();
    list.addMod(createMod('Life', 'BASE', 50, 'Tree'));
    list.addMod(createMod('Mana', 'BASE', 30, 'Tree'));
    expect(list.mods).toHaveLength(2);
  });

  it('sums BASE mods', () => {
    const list = new ModList();
    list.addMod(createMod('Life', 'BASE', 50, 'Tree'));
    list.addMod(createMod('Life', 'BASE', 30, 'Item'));
    expect(list.sum('BASE', null, 'Life')).toBe(80);
  });

  it('calculates MORE multiplier', () => {
    const list = new ModList();
    list.addMod(createMod('Damage', 'MORE', 20, 'A'));
    list.addMod(createMod('Damage', 'MORE', 30, 'B'));
    expect(list.more(null, 'Damage')).toBeCloseTo(1.56, 2);
  });

  it('checks FLAG mods', () => {
    const list = new ModList();
    expect(list.flag(null, 'Onslaught')).toBe(false);
    list.addMod(createMod('Onslaught', 'FLAG', true, 'Config'));
    expect(list.flag(null, 'Onslaught')).toBe(true);
  });

  it('lists LIST mods', () => {
    const list = new ModList();
    list.addMod(createMod('Keystone', 'LIST', 'RT', 'Tree'));
    const result = list.list(null, 'Keystone');
    expect(result).toContain('RT');
  });

  it('addList adds array of mods', () => {
    const list = new ModList();
    list.addList([
      createMod('Life', 'BASE', 10, 'A'),
      createMod('Life', 'BASE', 20, 'B'),
    ]);
    expect(list.sum('BASE', null, 'Life')).toBe(30);
  });

  it('mergeMod combines values for matching params', () => {
    const list = new ModList();
    list.addMod(createMod('Life', 'BASE', 50, 'Tree'));
    list.mergeMod(createMod('Life', 'BASE', 30, 'Item'));
    // Params match (same name, type, flags) -> values merged
    expect(list.mods).toHaveLength(1);
    expect(list.sum('BASE', null, 'Life')).toBe(80);
  });

  it('mergeMod adds non-matching mods', () => {
    const list = new ModList();
    list.addMod(createMod('Life', 'BASE', 50, 'Tree'));
    list.mergeMod(createMod('Mana', 'BASE', 30, 'Tree'));
    expect(list.mods).toHaveLength(2);
  });

  it('mergeMod does not merge FLAG/LIST/OVERRIDE', () => {
    const list = new ModList();
    list.addMod(createMod('Onslaught', 'FLAG', true, 'A'));
    list.mergeMod(createMod('Onslaught', 'FLAG', true, 'B'));
    expect(list.mods).toHaveLength(2);
  });

  it('respects mod flags in queries', () => {
    const list = new ModList();
    list.addMod(createMod('Damage', 'INC', 20, 'Item', ModFlag.Attack));
    list.addMod(createMod('Damage', 'INC', 30, 'Item', ModFlag.Spell));
    expect(list.sum('INC', { flags: ModFlag.Attack, keywordFlags: 0 }, 'Damage')).toBe(20);
  });

  it('traverses parent chain', () => {
    const parent = new ModList();
    parent.addMod(createMod('Life', 'BASE', 100, 'Parent'));
    const child = new ModList(parent);
    child.addMod(createMod('Life', 'BASE', 50, 'Child'));
    expect(child.sum('BASE', null, 'Life')).toBe(150);
  });
});
