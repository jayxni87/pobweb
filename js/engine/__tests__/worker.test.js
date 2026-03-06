import { describe, it, expect, beforeEach } from 'vitest';
// Test the worker pipeline by importing the calc modules directly
// (Worker can't run in Node/Vitest, so we test the pipeline logic)
import { ModDB } from '../mod-db.js';
import { initEnv } from '../calc-setup.js';
import { doActorAttribs, doActorLifeMana } from '../calc-perform.js';
import { calcResistances, calcBlock, calcDefences } from '../calc-defence.js';
import {
  buildConversionTable,
  calcDamage,
  calcCritChance,
  calcCritMultiplier,
  calcCritEffect,
  calcSpeed,
  calcAverageDamage,
  calcTotalDPS,
  calcCombinedDPS,
} from '../calc-offence.js';

function runCalcPipeline(build) {
  const env = initEnv(build.options || {});
  const { player } = env;
  const modDB = player.modDB;

  if (build.mods) {
    for (const mod of build.mods) {
      modDB.newMod(mod.name, mod.type, mod.value, mod.source);
    }
  }

  doActorAttribs(player, build.options || {});
  doActorLifeMana(player);
  calcResistances(player);
  calcBlock(player);
  calcDefences(player);

  const offence = {};
  if (build.skill) {
    const skillModList = new ModDB(modDB);
    if (build.skill.mods) {
      for (const mod of build.skill.mods) {
        skillModList.newMod(mod.name, mod.type, mod.value, mod.source);
      }
    }

    const convTable = buildConversionTable(skillModList, null);
    const skillOutput = {};
    const skill = { skillModList, output: skillOutput, conversionTable: convTable, cfg: null };

    if (build.skill.baseDamage) {
      for (const [key, val] of Object.entries(build.skill.baseDamage)) {
        skillOutput[key] = val;
      }
    }

    const dmgTypeList = ['Physical', 'Lightning', 'Cold', 'Fire', 'Chaos'];
    let totalMin = 0, totalMax = 0;
    for (const dt of dmgTypeList) {
      const [min, max] = calcDamage(skill, dt);
      skillOutput[dt + 'Min'] = min;
      skillOutput[dt + 'Max'] = max;
      skillOutput[dt + 'HitAverage'] = (min + max) / 2;
      totalMin += min;
      totalMax += max;
    }

    const totalHitAvg = (totalMin + totalMax) / 2;
    const baseCrit = build.skill.baseCrit || 5;
    const critChance = calcCritChance(skillModList, null, baseCrit);
    const critMultiplier = calcCritMultiplier(skillModList, null);
    const critEffect = calcCritEffect(critChance, critMultiplier);
    const totalCritAvg = totalHitAvg * critMultiplier;
    const baseTime = build.skill.castTime || 1.0;
    const speed = calcSpeed(skillModList, null, baseTime, !!build.skill.isAttack);
    const hitChance = build.skill.hitChance || 100;
    const averageHit = calcAverageDamage(totalHitAvg, totalCritAvg, critChance);
    const averageDamage = averageHit * hitChance / 100;
    const totalDPS = calcTotalDPS(averageDamage, speed, 100, build.skill.dpsMultiplier);

    offence.CritChance = critChance;
    offence.CritMultiplier = critMultiplier;
    offence.Speed = speed;
    offence.AverageHit = averageHit;
    offence.AverageDamage = averageDamage;
    offence.TotalDPS = totalDPS;
    offence.CombinedDPS = calcCombinedDPS({ hitDPS: totalDPS });
  }

  return {
    output: {
      ...player.output,
      ...offence,
    },
  };
}

describe('Worker calc pipeline', () => {
  it('returns base stats with no mods', () => {
    const result = runCalcPipeline({});
    expect(result.output).toBeDefined();
    expect(result.output.Life).toBeGreaterThan(0);
    expect(result.output.FireResist).toBeDefined();
  });

  it('calculates life from Strength', () => {
    const result = runCalcPipeline({
      mods: [
        { name: 'Str', type: 'BASE', value: 100, source: 'Tree' },
      ],
    });
    // Str/2 = 50 added to Life base
    expect(result.output.Life).toBeGreaterThanOrEqual(50);
  });

  it('calculates resistances from mods', () => {
    const result = runCalcPipeline({
      mods: [
        { name: 'FireResist', type: 'BASE', value: 40, source: 'Item' },
        { name: 'ColdResist', type: 'BASE', value: -20, source: 'Debuff' },
      ],
    });
    expect(result.output.FireResist).toBe(40);
    expect(result.output.ColdResist).toBe(-20);
  });

  it('runs full offence pipeline with skill', () => {
    const result = runCalcPipeline({
      mods: [
        { name: 'CritChanceCap', type: 'BASE', value: 100, source: 'Base' },
        { name: 'CritMultiplier', type: 'BASE', value: 50, source: 'Base' },
      ],
      skill: {
        baseDamage: {
          PhysicalMinBase: 100,
          PhysicalMaxBase: 200,
        },
        baseCrit: 5,
        castTime: 1.0,
        hitChance: 100,
      },
    });
    expect(result.output.TotalDPS).toBeGreaterThan(0);
    expect(result.output.CritChance).toBeCloseTo(5);
    expect(result.output.Speed).toBeCloseTo(1.0);
    expect(result.output.AverageHit).toBeGreaterThan(100);
  });

  it('applies INC damage to skill DPS', () => {
    const base = runCalcPipeline({
      mods: [
        { name: 'CritChanceCap', type: 'BASE', value: 100, source: 'Base' },
        { name: 'CritMultiplier', type: 'BASE', value: 50, source: 'Base' },
      ],
      skill: {
        baseDamage: { PhysicalMinBase: 100, PhysicalMaxBase: 100 },
        baseCrit: 0,
        castTime: 1.0,
        hitChance: 100,
      },
    });

    const boosted = runCalcPipeline({
      mods: [
        { name: 'CritChanceCap', type: 'BASE', value: 100, source: 'Base' },
        { name: 'CritMultiplier', type: 'BASE', value: 50, source: 'Base' },
        { name: 'Damage', type: 'INC', value: 100, source: 'Tree' },
      ],
      skill: {
        baseDamage: { PhysicalMinBase: 100, PhysicalMaxBase: 100 },
        baseCrit: 0,
        castTime: 1.0,
        hitChance: 100,
      },
    });

    // 100% INC damage should roughly double DPS
    expect(boosted.output.TotalDPS).toBeCloseTo(base.output.TotalDPS * 2);
  });

  it('handles skill with conversion', () => {
    const result = runCalcPipeline({
      mods: [
        { name: 'CritChanceCap', type: 'BASE', value: 100, source: 'Base' },
        { name: 'CritMultiplier', type: 'BASE', value: 50, source: 'Base' },
        { name: 'PhysicalDamageConvertToFire', type: 'BASE', value: 50, source: 'Skill' },
      ],
      skill: {
        baseDamage: { PhysicalMinBase: 100, PhysicalMaxBase: 100 },
        baseCrit: 0,
        castTime: 1.0,
        hitChance: 100,
      },
    });
    // Should still have DPS (damage didn't disappear)
    expect(result.output.TotalDPS).toBeGreaterThan(0);
  });
});
