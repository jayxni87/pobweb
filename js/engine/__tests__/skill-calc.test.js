import { describe, it, expect } from 'vitest';
import { interpolateStat, resolveSkillStats, buildActiveSkillList } from '../skill-calc.js';

describe('interpolateStat', () => {
  it('type 1: returns direct value', () => {
    expect(interpolateStat(1, 42, {})).toBe(42);
  });

  it('type 2: returns direct value (treated as type 1)', () => {
    expect(interpolateStat(2, 42, {})).toBe(42);
  });

  it('type 3: effectiveness-based scaling', () => {
    const skillDef = { baseEffectiveness: 2.0, incrementalEffectiveness: 0.04 };
    const result = interpolateStat(3, 0.8, skillDef, 10);
    // 2.0 * (1.04)^9 * 0.8
    const expected = Math.round(2.0 * Math.pow(1.04, 9) * 0.8);
    expect(result).toBe(expected);
  });

  it('type 3 at level 1: no scaling beyond base', () => {
    const skillDef = { baseEffectiveness: 1.5, incrementalEffectiveness: 0.05 };
    const result = interpolateStat(3, 1.0, skillDef, 1);
    // 1.5 * (1.05)^0 * 1.0 = 1.5 → round = 2
    expect(result).toBe(Math.round(1.5));
  });

  it('defaults to type 1 for unknown type', () => {
    expect(interpolateStat(99, 42, {})).toBe(42);
  });
});

describe('resolveSkillStats', () => {
  const skillDef = {
    castTime: 0.75,
    stats: ['spell_minimum_base_fire_damage', 'spell_maximum_base_fire_damage'],
    constantStats: [['base_cast_speed_+%', 10]],
    levels: {
      '1': {
        values: [0.8, 1.2],
        critChance: 6,
        damageEffectiveness: 2.4,
        levelRequirement: 1,
        statInterpolation: [3, 3],
        cost: { Mana: 6 },
      },
      '20': {
        values: [0.8, 1.2],
        critChance: 6.5,
        damageEffectiveness: 3.0,
        levelRequirement: 70,
        statInterpolation: [3, 3],
        cost: { Mana: 25 },
      },
    },
    baseEffectiveness: 1.0,
    incrementalEffectiveness: 0.04,
  };

  it('resolves stats at level 1', () => {
    const result = resolveSkillStats(skillDef, 1);
    expect(result.stats).toHaveProperty('spell_minimum_base_fire_damage');
    expect(result.stats).toHaveProperty('spell_maximum_base_fire_damage');
    expect(result.stats['base_cast_speed_+%']).toBe(10);
    expect(result.critChance).toBe(6);
    expect(result.damageEffectiveness).toBe(2.4);
    expect(result.cost).toEqual({ Mana: 6 });
    expect(result.castTime).toBe(0.75);
  });

  it('resolves stats at level 20', () => {
    const result = resolveSkillStats(skillDef, 20);
    expect(result.critChance).toBe(6.5);
    expect(result.damageEffectiveness).toBe(3.0);
    expect(result.levelRequirement).toBe(70);
  });

  it('clamps to max level', () => {
    const result = resolveSkillStats(skillDef, 25);
    expect(result.critChance).toBe(6.5); // uses level 20
  });

  it('clamps to min level', () => {
    const result = resolveSkillStats(skillDef, 0);
    expect(result.critChance).toBe(6); // uses level 1
  });

  it('returns null for missing skillDef', () => {
    expect(resolveSkillStats(null, 1)).toBeNull();
    expect(resolveSkillStats({}, 1)).toBeNull();
  });
});

describe('buildActiveSkillList', () => {
  const skillsData = {
    'Fireball': {
      name: 'Fireball', support: false, castTime: 0.75,
      baseFlags: { spell: true, projectile: true },
      stats: ['spell_minimum_base_fire_damage'],
      constantStats: [],
      levels: { '20': { values: [100], critChance: 6, damageEffectiveness: 2.4, levelRequirement: 70, statInterpolation: [1], cost: { Mana: 20 } } },
      baseEffectiveness: 1, incrementalEffectiveness: 0,
    },
    'SupportSpellEcho': {
      name: 'Spell Echo', support: true,
      stats: ['support_repeat_count'],
      constantStats: [],
      levels: { '20': { values: [1], levelRequirement: 70, statInterpolation: [1], manaMultiplier: 40 } },
      baseEffectiveness: 0, incrementalEffectiveness: 0,
    },
  };

  it('builds active skill with supports', () => {
    const groups = [{
      enabled: true, gems: [
        { name: 'Fireball', skillId: 'Fireball', level: 20, quality: 0, enabled: true,
          gemData: { grantedEffectId: 'Fireball', tags: { grants_active_skill: true } } },
        { name: 'Spell Echo Support', skillId: 'SupportSpellEcho', level: 20, quality: 0, enabled: true,
          gemData: { grantedEffectId: 'SupportSpellEcho', tags: { support: true } } },
      ],
    }];
    const result = buildActiveSkillList(groups, skillsData);
    expect(result).toHaveLength(1);
    expect(result[0].skillId).toBe('Fireball');
    expect(result[0].supports).toHaveLength(1);
    expect(result[0].supports[0].skillId).toBe('SupportSpellEcho');
    expect(result[0].resolvedStats).not.toBeNull();
  });

  it('skips disabled gems', () => {
    const groups = [{
      enabled: true, gems: [
        { name: 'Fireball', skillId: 'Fireball', level: 20, quality: 0, enabled: false,
          gemData: { grantedEffectId: 'Fireball', tags: { grants_active_skill: true } } },
      ],
    }];
    expect(buildActiveSkillList(groups, skillsData)).toHaveLength(0);
  });

  it('skips disabled groups', () => {
    const groups = [{
      enabled: false, gems: [
        { name: 'Fireball', skillId: 'Fireball', level: 20, quality: 0, enabled: true,
          gemData: { grantedEffectId: 'Fireball', tags: { grants_active_skill: true } } },
      ],
    }];
    expect(buildActiveSkillList(groups, skillsData)).toHaveLength(0);
  });

  it('skips gems without gemData', () => {
    const groups = [{
      enabled: true, gems: [
        { name: 'Unknown', level: 20, quality: 0, enabled: true, gemData: null },
      ],
    }];
    expect(buildActiveSkillList(groups, skillsData)).toHaveLength(0);
  });

  it('handles multiple groups', () => {
    const groups = [
      {
        enabled: true, gems: [
          { name: 'Fireball', skillId: 'Fireball', level: 20, quality: 0, enabled: true,
            gemData: { grantedEffectId: 'Fireball', tags: { grants_active_skill: true } } },
        ],
      },
      {
        enabled: true, gems: [
          { name: 'Fireball', skillId: 'Fireball', level: 10, quality: 0, enabled: true,
            gemData: { grantedEffectId: 'Fireball', tags: { grants_active_skill: true } } },
        ],
      },
    ];
    const result = buildActiveSkillList(groups, skillsData);
    expect(result).toHaveLength(2);
    expect(result[0].groupIndex).toBe(0);
    expect(result[1].groupIndex).toBe(1);
  });
});
