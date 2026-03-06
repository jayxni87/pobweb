import { describe, it, expect } from 'vitest';
import {
  dmgTypeFlags,
  damageStatsForTypes,
  buildConversionTable,
  calcDamage,
  calcCritChance,
  calcCritMultiplier,
  calcCritEffect,
  calcSpeed,
  calcAverageDamage,
  calcTotalDPS,
  DOT_DPS_CAP,
  ailmentData,
  calcAilmentChance,
  calcAilmentBaseDamage,
  calcAilmentDPS,
  calcAilmentDuration,
  calcDotMultiplier,
  calcDotEffMult,
  calcPoisonStacks,
  calcCombinedDPS,
  calcImpaleDPS,
  calcCullMultiplier,
} from '../calc-offence.js';
import { ModDB } from '../mod-db.js';

function makeSkill(mods, opts = {}) {
  const skillModList = new ModDB();
  if (mods) {
    for (const m of mods) skillModList.newMod(...m);
  }
  const output = opts.output || {};
  const conversionTable = opts.conversionTable || buildConversionTable(skillModList, null);
  return {
    skillModList,
    output,
    conversionTable,
    activeEffect: { grantedEffect: { castTime: opts.castTime || 1.0 } },
    skillData: opts.skillData || {},
    skillFlags: opts.skillFlags || {},
    cfg: opts.cfg || null,
    enemyDB: opts.enemyDB || new ModDB(),
  };
}

describe('dmgTypeFlags', () => {
  it('maps damage types to bit flags', () => {
    expect(dmgTypeFlags.Physical).toBe(0x01);
    expect(dmgTypeFlags.Lightning).toBe(0x02);
    expect(dmgTypeFlags.Cold).toBe(0x04);
    expect(dmgTypeFlags.Fire).toBe(0x08);
    expect(dmgTypeFlags.Elemental).toBe(0x0E);
    expect(dmgTypeFlags.Chaos).toBe(0x10);
  });
});

describe('damageStatsForTypes', () => {
  it('returns Damage for flag 0', () => {
    expect(damageStatsForTypes(0)).toEqual(['Damage']);
  });

  it('includes PhysicalDamage for Physical flag', () => {
    const names = damageStatsForTypes(0x01);
    expect(names).toContain('Damage');
    expect(names).toContain('PhysicalDamage');
  });

  it('includes Elemental types for Elemental flag', () => {
    const names = damageStatsForTypes(0x0E);
    expect(names).toContain('LightningDamage');
    expect(names).toContain('ColdDamage');
    expect(names).toContain('FireDamage');
    expect(names).toContain('ElementalDamage');
  });

  it('combines Physical + Fire flags', () => {
    const names = damageStatsForTypes(0x01 | 0x08);
    expect(names).toContain('PhysicalDamage');
    expect(names).toContain('FireDamage');
    expect(names).not.toContain('ColdDamage');
  });
});

describe('buildConversionTable', () => {
  it('returns identity table with no conversion mods', () => {
    const modList = new ModDB();
    const table = buildConversionTable(modList, null);
    expect(table.Physical.mult).toBeCloseTo(1);
    expect(table.Chaos.mult).toBe(1);
  });

  it('converts Physical to Fire', () => {
    const modList = new ModDB();
    modList.newMod('PhysicalDamageConvertToFire', 'BASE', 50, 'Skill');
    const table = buildConversionTable(modList, null);
    expect(table.Physical.mult).toBeCloseTo(0.5);
    expect(table.Physical.conversion.Fire).toBeCloseTo(0.5);
    expect(table.Physical.Fire).toBeCloseTo(0.5);
  });

  it('caps total conversion at 100%', () => {
    const modList = new ModDB();
    modList.newMod('PhysicalDamageConvertToFire', 'BASE', 60, 'Skill');
    modList.newMod('PhysicalDamageConvertToCold', 'BASE', 60, 'Skill');
    const table = buildConversionTable(modList, null);
    // Total conversion should not exceed 1.0
    expect(table.Physical.mult).toBeCloseTo(0);
    const totalConv = (table.Physical.conversion.Fire || 0) +
                      (table.Physical.conversion.Cold || 0) +
                      (table.Physical.conversion.Lightning || 0) +
                      (table.Physical.conversion.Chaos || 0);
    expect(totalConv).toBeCloseTo(1.0);
  });

  it('handles gained-as damage', () => {
    const modList = new ModDB();
    modList.newMod('PhysicalDamageGainAsFire', 'BASE', 20, 'Item');
    const table = buildConversionTable(modList, null);
    expect(table.Physical.mult).toBeCloseTo(1); // gain doesn't reduce source
    expect(table.Physical.gain.Fire).toBeCloseTo(0.2);
    expect(table.Physical.Fire).toBeCloseTo(0.2);
  });
});

describe('calcDamage', () => {
  it('calculates min/max from base damage with no mods', () => {
    const skill = makeSkill([]);
    skill.output.PhysicalMinBase = 100;
    skill.output.PhysicalMaxBase = 200;
    const [min, max] = calcDamage(skill, 'Physical');
    expect(min).toBe(100);
    expect(max).toBe(200);
  });

  it('applies INC modifier to damage', () => {
    const skill = makeSkill([
      ['PhysicalDamage', 'INC', 100, 'Tree'],
    ]);
    skill.output.PhysicalMinBase = 100;
    skill.output.PhysicalMaxBase = 200;
    const [min, max] = calcDamage(skill, 'Physical');
    expect(min).toBe(200); // 100 * 2.0
    expect(max).toBe(400); // 200 * 2.0
  });

  it('applies MORE modifier to damage', () => {
    const skill = makeSkill([
      ['PhysicalDamage', 'MORE', 50, 'Support'],
    ]);
    skill.output.PhysicalMinBase = 100;
    skill.output.PhysicalMaxBase = 200;
    const [min, max] = calcDamage(skill, 'Physical');
    expect(min).toBe(150);
    expect(max).toBe(300);
  });

  it('combines INC and MORE', () => {
    const skill = makeSkill([
      ['Damage', 'INC', 100, 'Tree'],
      ['PhysicalDamage', 'MORE', 50, 'Support'],
    ]);
    skill.output.PhysicalMinBase = 100;
    skill.output.PhysicalMaxBase = 100;
    const [min, max] = calcDamage(skill, 'Physical');
    // base * (1 + 100/100) * 1.5 = 100 * 2 * 1.5 = 300
    expect(min).toBe(300);
    expect(max).toBe(300);
  });

  it('handles conversion chain (Physical → Fire)', () => {
    const modList = new ModDB();
    modList.newMod('PhysicalDamageConvertToFire', 'BASE', 100, 'Skill');
    const table = buildConversionTable(modList, null);
    const skill = makeSkill([], { conversionTable: table });
    skill.output.PhysicalMinBase = 100;
    skill.output.PhysicalMaxBase = 100;
    skill.output.FireMinBase = 0;
    skill.output.FireMaxBase = 0;
    const [min, max] = calcDamage(skill, 'Fire');
    // Fire base is 0, but gets 100% of Physical converted = 100
    expect(min).toBe(100);
    expect(max).toBe(100);
  });

  it('returns 0 for damage type with no base and no conversion', () => {
    const skill = makeSkill([]);
    skill.output.ColdMinBase = 0;
    skill.output.ColdMaxBase = 0;
    const [min, max] = calcDamage(skill, 'Cold');
    expect(min).toBe(0);
    expect(max).toBe(0);
  });
});

describe('calcCritChance', () => {
  it('calculates crit from base + INC', () => {
    const modList = new ModDB();
    modList.newMod('CritChance', 'BASE', 0, 'Skill');
    modList.newMod('CritChance', 'INC', 100, 'Tree');
    modList.newMod('CritChanceCap', 'BASE', 100, 'Base');
    const crit = calcCritChance(modList, null, 5); // 5% base crit
    // (5 + 0) * (1 + 100/100) * 1 = 10
    expect(crit).toBeCloseTo(10, 1);
  });

  it('caps at CritChanceCap', () => {
    const modList = new ModDB();
    modList.newMod('CritChance', 'INC', 5000, 'Tree');
    modList.newMod('CritChanceCap', 'BASE', 100, 'Base');
    const crit = calcCritChance(modList, null, 7);
    expect(crit).toBeLessThanOrEqual(100);
  });

  it('returns 0 for NeverCrit', () => {
    const modList = new ModDB();
    modList.newMod('NeverCrit', 'FLAG', true, 'Keystone');
    modList.newMod('CritChanceCap', 'BASE', 100, 'Base');
    const crit = calcCritChance(modList, null, 5);
    expect(crit).toBe(0);
  });

  it('floors at 0 when effective base is positive', () => {
    const modList = new ModDB();
    // base 5 + BASE mod 0 = 5 (positive), but INC -200 makes result negative
    modList.newMod('CritChance', 'INC', -200, 'Curse');
    modList.newMod('CritChanceCap', 'BASE', 100, 'Base');
    const crit = calcCritChance(modList, null, 5);
    // (5 + 0) * (1 + (-200)/100) * 1 = 5 * -1 = -5, floored at 0
    expect(crit).toBe(0);
  });
});

describe('calcCritMultiplier', () => {
  it('calculates crit multiplier from base extra damage', () => {
    const modList = new ModDB();
    modList.newMod('CritMultiplier', 'BASE', 50, 'Base'); // default PoE 50%
    const multi = calcCritMultiplier(modList, null);
    // 1 + max(0, 50/100) = 1.5
    expect(multi).toBeCloseTo(1.5);
  });

  it('applies additional crit multi', () => {
    const modList = new ModDB();
    modList.newMod('CritMultiplier', 'BASE', 50, 'Base');
    modList.newMod('CritMultiplier', 'BASE', 30, 'Item');
    const multi = calcCritMultiplier(modList, null);
    // 1 + max(0, 80/100) = 1.8
    expect(multi).toBeCloseTo(1.8);
  });

  it('returns 1 with NoCritMultiplier flag', () => {
    const modList = new ModDB();
    modList.newMod('CritMultiplier', 'BASE', 50, 'Base');
    modList.newMod('NoCritMultiplier', 'FLAG', true, 'Keystone');
    const multi = calcCritMultiplier(modList, null);
    expect(multi).toBe(1);
  });

  it('floors extra damage at 0', () => {
    const modList = new ModDB();
    modList.newMod('CritMultiplier', 'BASE', -200, 'Curse');
    const multi = calcCritMultiplier(modList, null);
    expect(multi).toBe(1);
  });
});

describe('calcCritEffect', () => {
  it('weights crit and non-crit damage', () => {
    // 50% crit chance, 1.5x multiplier
    const effect = calcCritEffect(50, 1.5);
    // (1 - 0.5) + 0.5 * 1.5 = 0.5 + 0.75 = 1.25
    expect(effect).toBeCloseTo(1.25);
  });

  it('returns 1 with 0% crit chance', () => {
    expect(calcCritEffect(0, 2.0)).toBe(1);
  });

  it('returns multiplier at 100% crit chance', () => {
    expect(calcCritEffect(100, 1.5)).toBeCloseTo(1.5);
  });
});

describe('calcSpeed', () => {
  it('calculates cast speed from base time', () => {
    const modList = new ModDB();
    const speed = calcSpeed(modList, null, 1.0, false);
    expect(speed).toBeCloseTo(1.0); // 1 / 1.0
  });

  it('applies INC and MORE speed modifiers', () => {
    const modList = new ModDB();
    modList.newMod('Speed', 'INC', 100, 'Tree');
    const speed = calcSpeed(modList, null, 1.0, false);
    // 1 / (1.0 / ((1 + 100/100) * 1)) = 1 / (1 / 2) = 2
    expect(speed).toBeCloseTo(2.0);
  });

  it('handles attack speed with base rate', () => {
    const modList = new ModDB();
    modList.newMod('Speed', 'INC', 50, 'Tree');
    // baseTime = 1 / attackRate, then modified by inc/more
    const speed = calcSpeed(modList, null, 0.5, false); // 0.5s base time
    // 1 / (0.5 / (1.5 * 1)) = 1 / (0.333) = 3.0
    expect(speed).toBeCloseTo(3.0);
  });
});

describe('calcAverageDamage', () => {
  it('averages crit and non-crit damage', () => {
    // totalHitAvg = 100, totalCritAvg = 150, critChance = 50
    const avg = calcAverageDamage(100, 150, 50);
    // 100 * 0.5 + 150 * 0.5 = 125
    expect(avg).toBeCloseTo(125);
  });

  it('returns non-crit average at 0% crit', () => {
    expect(calcAverageDamage(100, 200, 0)).toBe(100);
  });
});

describe('calcTotalDPS', () => {
  it('calculates DPS from average damage, speed, hit chance', () => {
    // avgDmg=100, speed=2, hitChance=80%, dpsMultiplier=1
    const dps = calcTotalDPS(100, 2, 80);
    // 100 * 2 * 0.8 = 160
    expect(dps).toBeCloseTo(160);
  });

  it('applies dpsMultiplier', () => {
    const dps = calcTotalDPS(100, 1, 100, 2);
    expect(dps).toBeCloseTo(200);
  });

  it('returns 0 with 0 speed', () => {
    expect(calcTotalDPS(100, 0, 100)).toBe(0);
  });
});

// --- DoT / Ailment Tests ---

describe('ailmentData constants', () => {
  it('has correct ignite data', () => {
    expect(ailmentData.Ignite.percentBase).toBe(0.9);
    expect(ailmentData.Ignite.durationBase).toBe(4);
    expect(ailmentData.Ignite.associatedType).toBe('Fire');
  });

  it('has correct bleed data', () => {
    expect(ailmentData.Bleed.percentBase).toBe(0.7);
    expect(ailmentData.Bleed.durationBase).toBe(5);
    expect(ailmentData.Bleed.associatedType).toBe('Physical');
  });

  it('has correct poison data', () => {
    expect(ailmentData.Poison.percentBase).toBe(0.3);
    expect(ailmentData.Poison.durationBase).toBe(2);
    expect(ailmentData.Poison.associatedType).toBe('Chaos');
  });
});

describe('calcAilmentChance', () => {
  it('returns hit chance when no crit', () => {
    // 100% chance on hit, 0% crit
    expect(calcAilmentChance(100, 100, 0)).toBeCloseTo(100);
  });

  it('weights hit and crit chances', () => {
    // 50% on hit, 100% on crit, 50% crit chance
    // 50 * 0.5 + 100 * 0.5 = 75
    expect(calcAilmentChance(50, 100, 50)).toBeCloseTo(75);
  });

  it('returns crit chance when always critting', () => {
    expect(calcAilmentChance(0, 80, 100)).toBeCloseTo(80);
  });

  it('returns 0 with 0% chance on both', () => {
    expect(calcAilmentChance(0, 0, 50)).toBe(0);
  });
});

describe('calcAilmentBaseDamage', () => {
  it('returns hit damage with no crit', () => {
    const base = calcAilmentBaseDamage(1000, 1500, 100, 100, 0);
    expect(base).toBeCloseTo(1000);
  });

  it('returns crit damage at 100% crit', () => {
    const base = calcAilmentBaseDamage(1000, 1500, 100, 100, 100);
    expect(base).toBeCloseTo(1500);
  });

  it('weights based on chance proportions', () => {
    // 50% on hit, 100% on crit, 50% crit chance
    // chanceFromHit = 50 * 0.5 = 25, chanceFromCrit = 100 * 0.5 = 50
    // base = 1000 * 25/75 + 1500 * 50/75 = 333.33 + 1000 = 1333.33
    const base = calcAilmentBaseDamage(1000, 1500, 50, 100, 50);
    expect(base).toBeCloseTo(1333.33, 1);
  });

  it('returns 0 when no chance', () => {
    expect(calcAilmentBaseDamage(1000, 1500, 0, 0, 50)).toBe(0);
  });
});

describe('calcAilmentDPS', () => {
  it('calculates ignite DPS', () => {
    // 1000 base * 0.9 percent * 1.0 effect * 1.0 rate * 1.0 eff * 1 stack = 900
    expect(calcAilmentDPS(1000, 0.9, 1, 1, 1, 1)).toBeCloseTo(900);
  });

  it('applies effect modifier', () => {
    // 1000 * 0.9 * 1.5 * 1 * 1 * 1 = 1350
    expect(calcAilmentDPS(1000, 0.9, 1.5, 1, 1, 1)).toBeCloseTo(1350);
  });

  it('applies stacks', () => {
    // 1000 * 0.3 * 1 * 1 * 1 * 5 = 1500 (5 poison stacks)
    expect(calcAilmentDPS(1000, 0.3, 1, 1, 1, 5)).toBeCloseTo(1500);
  });

  it('caps at DOT_DPS_CAP', () => {
    const dps = calcAilmentDPS(1e12, 1, 1, 1, 1, 1);
    expect(dps).toBe(DOT_DPS_CAP);
  });

  it('returns 0 for 0 base damage', () => {
    expect(calcAilmentDPS(0, 0.9, 1, 1, 1, 1)).toBe(0);
  });

  it('applies resistance via effMult', () => {
    // 1000 * 0.7 * 1 * 1 * 0.25 * 1 = 175 (75% resist)
    expect(calcAilmentDPS(1000, 0.7, 1, 1, 0.25, 1)).toBeCloseTo(175);
  });
});

describe('calcAilmentDuration', () => {
  it('returns base * mod', () => {
    expect(calcAilmentDuration(4, 1.5)).toBeCloseTo(6);
  });

  it('floors duration mod at 0', () => {
    expect(calcAilmentDuration(4, -0.5)).toBe(0);
  });
});

describe('calcDotMultiplier', () => {
  it('calculates from base DotMultiplier', () => {
    const modList = new ModDB();
    modList.newMod('DotMultiplier', 'BASE', 50, 'Tree');
    const multi = calcDotMultiplier(modList, null, null);
    expect(multi).toBeCloseTo(1.5);
  });

  it('adds specific dot multiplier', () => {
    const modList = new ModDB();
    modList.newMod('DotMultiplier', 'BASE', 30, 'Tree');
    modList.newMod('FireDotMultiplier', 'BASE', 20, 'Item');
    const multi = calcDotMultiplier(modList, null, 'FireDotMultiplier');
    // 1 + (30 + 20)/100 = 1.5
    expect(multi).toBeCloseTo(1.5);
  });

  it('respects override', () => {
    const modList = new ModDB();
    modList.newMod('DotMultiplier', 'BASE', 50, 'Tree');
    modList.newMod('DotMultiplier', 'OVERRIDE', 100, 'Unique');
    const multi = calcDotMultiplier(modList, null, null);
    expect(multi).toBeCloseTo(2.0);
  });
});

describe('calcDotEffMult', () => {
  it('calculates with 0% resist', () => {
    expect(calcDotEffMult(0, 0, 1)).toBeCloseTo(1);
  });

  it('reduces for positive resist', () => {
    // 75% resist: (1 - 0.75) * 1 * 1 = 0.25
    expect(calcDotEffMult(75, 0, 1)).toBeCloseTo(0.25);
  });

  it('amplifies for negative resist', () => {
    // -50% resist: (1 + 0.5) * 1 * 1 = 1.5
    expect(calcDotEffMult(-50, 0, 1)).toBeCloseTo(1.5);
  });

  it('applies takenInc and takenMore', () => {
    // 0% resist, 20% takenInc, 1.1 takenMore
    // 1 * 1.2 * 1.1 = 1.32
    expect(calcDotEffMult(0, 20, 1.1)).toBeCloseTo(1.32);
  });
});

describe('calcPoisonStacks', () => {
  it('calculates stacks from hit rate and duration', () => {
    // 80% hit chance, 100% poison chance, 2 attacks/s, 2s duration
    // 0.8 * 1.0 * 2 * 2 = 3.2 stacks
    expect(calcPoisonStacks(80, 100, 2, 2, 1)).toBeCloseTo(3.2);
  });

  it('returns 0 with 0 speed', () => {
    expect(calcPoisonStacks(100, 100, 0, 2, 1)).toBe(0);
  });

  it('applies dps multiplier', () => {
    // 100% hit, 100% poison, 1 aps, 2s dur, 3x dps mult
    expect(calcPoisonStacks(100, 100, 1, 2, 3)).toBeCloseTo(6);
  });
});

describe('calcCombinedDPS', () => {
  it('sums hit and dot sources', () => {
    const combined = calcCombinedDPS({
      hitDPS: 10000,
      bleedDPS: 1000,
      igniteDPS: 2000,
      poisonDPS: 500,
    });
    expect(combined).toBeCloseTo(13500);
  });

  it('caps dot portion at DOT_DPS_CAP', () => {
    const combined = calcCombinedDPS({
      hitDPS: 1000,
      poisonDPS: DOT_DPS_CAP + 1000,
    });
    expect(combined).toBe(1000 + DOT_DPS_CAP);
  });

  it('handles only hit DPS', () => {
    expect(calcCombinedDPS({ hitDPS: 5000 })).toBe(5000);
  });

  it('includes impale (uncapped)', () => {
    const combined = calcCombinedDPS({
      hitDPS: 10000,
      impaleDPS: 3000,
    });
    expect(combined).toBe(13000);
  });
});

describe('calcImpaleDPS', () => {
  it('calculates impale DPS', () => {
    // 1000 stored avg, 1.1 modifier, 90% hit, 2 aps, 1x mult
    // 1000 * 0.1 * 0.9 * 1 * 2 = 180
    const dps = calcImpaleDPS(1000, 1.1, 90, 2, 1);
    expect(dps).toBeCloseTo(180);
  });

  it('returns 0 with no impale modifier bonus', () => {
    expect(calcImpaleDPS(1000, 1.0, 100, 2, 1)).toBe(0);
  });
});

describe('calcCullMultiplier', () => {
  it('returns correct multiplier for 10% cull', () => {
    // 1 / (1 - 0.1) = 1.1111
    expect(calcCullMultiplier(10)).toBeCloseTo(1 / 0.9);
  });

  it('returns 1 for 0% cull', () => {
    expect(calcCullMultiplier(0)).toBe(1);
  });

  it('returns correct multiplier for 20% cull', () => {
    expect(calcCullMultiplier(20)).toBeCloseTo(1.25);
  });
});
