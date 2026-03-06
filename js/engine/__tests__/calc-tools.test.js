import { describe, it, expect } from 'vitest';
import { calcLib } from '../calc-tools.js';
import { ModList } from '../mod-list.js';
import { createMod } from '../mod-tools.js';
import { SkillType } from '../utils.js';

describe('calcLib.mod', () => {
  it('combines INC and MORE multipliers', () => {
    const store = new ModList();
    store.addMod(createMod('Damage', 'INC', 50, 'A'));
    store.addMod(createMod('Damage', 'MORE', 20, 'B'));
    // (1 + 50/100) * (1 + 20/100) = 1.5 * 1.2 = 1.8
    expect(calcLib.mod(store, null, 'Damage')).toBeCloseTo(1.8, 4);
  });

  it('returns 1 when no mods', () => {
    const store = new ModList();
    expect(calcLib.mod(store, null, 'Damage')).toBe(1);
  });

  it('handles multiple INC sources', () => {
    const store = new ModList();
    store.addMod(createMod('Life', 'INC', 30, 'A'));
    store.addMod(createMod('Life', 'INC', 20, 'B'));
    // (1 + 50/100) = 1.5
    expect(calcLib.mod(store, null, 'Life')).toBeCloseTo(1.5, 4);
  });
});

describe('calcLib.mods', () => {
  it('returns inc and more separately', () => {
    const store = new ModList();
    store.addMod(createMod('Damage', 'INC', 40, 'A'));
    store.addMod(createMod('Damage', 'MORE', 25, 'B'));
    const [inc, more] = calcLib.mods(store, null, 'Damage');
    expect(inc).toBeCloseTo(1.4, 4);
    expect(more).toBeCloseTo(1.25, 4);
  });
});

describe('calcLib.val', () => {
  it('calculates BASE * (1+INC) * MORE', () => {
    const store = new ModList();
    store.addMod(createMod('Life', 'BASE', 100, 'A'));
    store.addMod(createMod('Life', 'INC', 50, 'B'));
    store.addMod(createMod('Life', 'MORE', 20, 'C'));
    // 100 * 1.5 * 1.2 = 180
    expect(calcLib.val(store, 'Life')).toBeCloseTo(180, 4);
  });

  it('returns 0 when no BASE', () => {
    const store = new ModList();
    store.addMod(createMod('Life', 'INC', 50, 'B'));
    expect(calcLib.val(store, 'Life')).toBe(0);
  });
});

describe('calcLib.doesTypeExpressionMatch', () => {
  it('matches simple type', () => {
    const skillTypes = { [SkillType.Attack]: true, [SkillType.Melee]: true };
    expect(calcLib.doesTypeExpressionMatch([SkillType.Attack], skillTypes)).toBe(true);
    expect(calcLib.doesTypeExpressionMatch([SkillType.Spell], skillTypes)).toBe(false);
  });

  it('handles OR expression', () => {
    const skillTypes = { [SkillType.Attack]: true };
    // Attack OR Spell => true (Attack matches)
    expect(calcLib.doesTypeExpressionMatch(
      [SkillType.Attack, SkillType.Spell, SkillType.OR], skillTypes
    )).toBe(true);
  });

  it('handles AND expression', () => {
    const skillTypes = { [SkillType.Attack]: true, [SkillType.Melee]: true };
    // Attack AND Melee => true
    expect(calcLib.doesTypeExpressionMatch(
      [SkillType.Attack, SkillType.Melee, SkillType.AND], skillTypes
    )).toBe(true);
    // Attack AND Spell => false
    expect(calcLib.doesTypeExpressionMatch(
      [SkillType.Attack, SkillType.Spell, SkillType.AND], skillTypes
    )).toBe(false);
  });

  it('handles NOT expression', () => {
    const skillTypes = { [SkillType.Attack]: true };
    // NOT Spell => true
    expect(calcLib.doesTypeExpressionMatch(
      [SkillType.Spell, SkillType.NOT], skillTypes
    )).toBe(true);
    // NOT Attack => false
    expect(calcLib.doesTypeExpressionMatch(
      [SkillType.Attack, SkillType.NOT], skillTypes
    )).toBe(false);
  });
});

describe('calcLib.gemIsType', () => {
  const gem = { name: 'Fireball', tags: { fire: true, spell: true, projectile: true, grants_active_skill: true } };

  it('matches "all"', () => {
    expect(calcLib.gemIsType(gem, 'all')).toBe(true);
  });

  it('matches "elemental" for fire gem', () => {
    expect(calcLib.gemIsType(gem, 'elemental')).toBe(true);
  });

  it('matches by tag', () => {
    expect(calcLib.gemIsType(gem, 'spell')).toBe(true);
    expect(calcLib.gemIsType(gem, 'melee')).toBe(false);
  });

  it('matches by gem name (lowercase)', () => {
    expect(calcLib.gemIsType(gem, 'fireball')).toBe(true);
  });

  it('matches active skill type', () => {
    expect(calcLib.gemIsType(gem, 'active skill')).toBe(true);
  });

  it('does not match support as active skill', () => {
    const support = { name: 'Added Fire', tags: { support: true, fire: true } };
    expect(calcLib.gemIsType(support, 'active skill')).toBe(false);
  });
});

describe('calcLib.validateGemLevel', () => {
  it('clamps level to available range', () => {
    const gem = {
      level: 25,
      grantedEffect: {
        levels: { 1: {}, 2: {}, 3: {}, 20: {} },
      },
    };
    calcLib.validateGemLevel(gem);
    // Should clamp to max available level
    expect(gem.grantedEffect.levels[gem.level]).toBeTruthy();
  });

  it('keeps valid level unchanged', () => {
    const gem = {
      level: 3,
      grantedEffect: {
        levels: { 1: {}, 2: {}, 3: {}, 20: {} },
      },
    };
    calcLib.validateGemLevel(gem);
    expect(gem.level).toBe(3);
  });
});

describe('calcLib.getGemStatRequirement', () => {
  it('returns 0 for multi=0', () => {
    expect(calcLib.getGemStatRequirement(20, false, 0)).toBe(0);
  });

  it('returns 0 for low level requirement below threshold', () => {
    const result = calcLib.getGemStatRequirement(1, false, 10);
    expect(result).toBe(0); // too low to have a requirement
  });

  it('returns positive for high level', () => {
    const result = calcLib.getGemStatRequirement(20, false, 100);
    expect(result).toBeGreaterThan(0);
  });
});
