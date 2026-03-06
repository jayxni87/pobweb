// PoBWeb - CalcOffence (port of Modules/CalcOffence.lua)
// Damage calculation, crit, speed, DPS, DoT, ailments.

import { round } from './utils.js';

// Damage type order (conversion flows left to right)
const dmgTypeList = ['Physical', 'Lightning', 'Cold', 'Fire', 'Chaos'];

// Damage type flags for modifier lookup
export const dmgTypeFlags = {
  Physical:  0x01,
  Lightning: 0x02,
  Cold:      0x04,
  Fire:      0x08,
  Elemental: 0x0E,
  Chaos:     0x10,
};

const dmgTypeFlagOrder = ['Physical', 'Lightning', 'Cold', 'Fire', 'Elemental', 'Chaos'];

const isElemental = { Physical: false, Lightning: true, Cold: true, Fire: true, Chaos: false };

// Build mod name list for a given combination of type flags
// Caches results for repeated lookups
const _statsCache = new Map();

export function damageStatsForTypes(typeFlags) {
  if (_statsCache.has(typeFlags)) return _statsCache.get(typeFlags);
  const modNames = ['Damage'];
  for (const type of dmgTypeFlagOrder) {
    const flag = dmgTypeFlags[type];
    if ((typeFlags & flag) !== 0) {
      modNames.push(type + 'Damage');
    }
  }
  _statsCache.set(typeFlags, modNames);
  return modNames;
}

// Build conversion table from skill mod list
// Mirrors CalcOffence.lua buildConversionTable
export function buildConversionTable(skillModList, cfg) {
  const conversionTable = {};

  for (let i = 0; i < 4; i++) {
    const damageType = dmgTypeList[i];
    const globalConv = {};
    const skillConv = {};
    const add = {};
    let globalTotal = 0;
    let skillTotal = 0;

    for (let j = i + 1; j < 5; j++) {
      const otherType = dmgTypeList[j];

      // Global conversions
      const convNames = [damageType + 'DamageConvertTo' + otherType];
      if (isElemental[damageType]) convNames.push('ElementalDamageConvertTo' + otherType);
      if (damageType !== 'Chaos') convNames.push('NonChaosDamageConvertTo' + otherType);
      globalConv[otherType] = Math.max(skillModList.sum('BASE', cfg, ...convNames), 0);
      globalTotal += globalConv[otherType];

      // Skill-specific conversions
      skillConv[otherType] = Math.max(skillModList.sum('BASE', cfg, 'Skill' + damageType + 'DamageConvertTo' + otherType), 0);
      skillTotal += skillConv[otherType];

      // Gained-as
      const gainNames = [damageType + 'DamageGainAs' + otherType];
      if (isElemental[damageType]) gainNames.push('ElementalDamageGainAs' + otherType);
      if (damageType !== 'Chaos') gainNames.push('NonChaosDamageGainAs' + otherType);
      add[otherType] = Math.max(skillModList.sum('BASE', cfg, ...gainNames), 0);
    }

    // Scale down if total conversion exceeds 100%
    if (skillTotal > 100) {
      const factor = 100 / skillTotal;
      for (const type in skillConv) skillConv[type] *= factor;
      for (const type in globalConv) globalConv[type] = 0;
      globalTotal = 0;
    } else if (globalTotal + skillTotal > 100) {
      const factor = (100 - skillTotal) / globalTotal;
      for (const type in globalConv) globalConv[type] *= factor;
      globalTotal *= factor;
    }

    const dmgTable = { conversion: {}, gain: {} };
    for (const type in globalConv) {
      dmgTable.conversion[type] = (globalConv[type] + skillConv[type]) / 100;
      dmgTable.gain[type] = add[type] / 100;
      dmgTable[type] = (globalConv[type] + skillConv[type] + add[type]) / 100;
    }
    dmgTable.mult = 1 - Math.min((globalTotal + skillTotal) / 100, 1);
    conversionTable[damageType] = dmgTable;
  }

  conversionTable['Chaos'] = { mult: 1, conversion: {}, gain: {} };
  return conversionTable;
}

// Calculate min/max damage for a given damage type, following conversion chains
// skill: { skillModList, output, conversionTable, cfg }
export function calcDamage(skill, damageType, convDst) {
  const { skillModList, output, conversionTable, cfg } = skill;
  const typeFlags = dmgTypeFlags[damageType] || 0;

  // Calculate conversions from earlier types in the chain
  let addMin = 0;
  let addMax = 0;
  for (const otherType of dmgTypeList) {
    if (otherType === damageType) break;
    const entry = conversionTable[otherType];
    if (!entry) continue;
    const convMult = entry[damageType] || 0;
    if (convMult > 0) {
      const [min, max] = calcDamage(skill, otherType, damageType);
      addMin += min * convMult;
      addMax += max * convMult;
    }
  }
  if (addMin !== 0 && addMax !== 0) {
    addMin = round(addMin);
    addMax = round(addMax);
  }

  const baseMin = output[damageType + 'MinBase'] || 0;
  const baseMax = output[damageType + 'MaxBase'] || 0;

  if (baseMin === 0 && baseMax === 0) {
    return [addMin, addMax];
  }

  // Combine modifiers
  const modNames = damageStatsForTypes(typeFlags);
  const inc = 1 + skillModList.sum('INC', cfg, ...modNames) / 100;
  const more = skillModList.more(cfg, ...modNames);
  const genericMoreMinDamage = skillModList.more(cfg, 'MinDamage');
  const genericMoreMaxDamage = skillModList.more(cfg, 'MaxDamage');
  const moreMinDamage = skillModList.more(cfg, 'Min' + damageType + 'Damage');
  const moreMaxDamage = skillModList.more(cfg, 'Max' + damageType + 'Damage');

  return [
    round(((baseMin * inc * more) * genericMoreMinDamage + addMin) * moreMinDamage),
    round(((baseMax * inc * more) * genericMoreMaxDamage + addMax) * moreMaxDamage),
  ];
}

// Calculate crit chance
// baseCrit: base crit chance from weapon/skill (e.g. 5%)
export function calcCritChance(skillModList, cfg, baseCrit) {
  if (skillModList.flag(cfg, 'NeverCrit')) return 0;

  const critOverride = skillModList.override(cfg, 'CritChance');
  if (critOverride === 100) return 100;

  let base = 0;
  let inc = 0;
  let more = 1;
  if (critOverride === undefined) {
    base = skillModList.sum('BASE', cfg, 'CritChance');
    inc = skillModList.sum('INC', cfg, 'CritChance');
    more = skillModList.more(cfg, 'CritChance');
  }

  let critChance = (baseCrit + base) * (1 + inc / 100) * more;
  const cap = skillModList.override(null, 'CritChanceCap') ??
              skillModList.sum('BASE', cfg, 'CritChanceCap');
  critChance = Math.min(critChance, cap);

  if ((baseCrit + base) > 0) {
    critChance = Math.max(critChance, 0);
  }

  return critChance;
}

// Calculate crit multiplier
export function calcCritMultiplier(skillModList, cfg) {
  if (skillModList.flag(cfg, 'NoCritMultiplier')) return 1;

  let extraDamage = skillModList.sum('BASE', cfg, 'CritMultiplier') / 100;
  const multiOverride = skillModList.override(cfg, 'CritMultiplier');
  if (multiOverride !== undefined) {
    extraDamage = (multiOverride - 100) / 100;
  }

  return 1 + Math.max(0, extraDamage);
}

// Calculate weighted crit effect
// critChance: 0-100, critMultiplier: e.g. 1.5
export function calcCritEffect(critChance, critMultiplier) {
  const p = critChance / 100;
  return (1 - p) + p * critMultiplier;
}

// Calculate attack/cast speed
// baseTime: base cast/attack time in seconds
export function calcSpeed(skillModList, cfg, baseTime, isAttack) {
  if (baseTime === 0) return 0;

  const inc = skillModList.sum('INC', cfg, 'Speed');
  const more = skillModList.more(cfg, 'Speed');

  const time = baseTime / ((1 + inc / 100) * more);
  if (time <= 0) return 0;
  return 1 / time;
}

// Calculate average hit damage (weighted by crit)
export function calcAverageDamage(totalHitAvg, totalCritAvg, critChance) {
  const p = critChance / 100;
  return totalHitAvg * (1 - p) + totalCritAvg * p;
}

// Calculate total DPS
export function calcTotalDPS(averageDamage, speed, hitChance, dpsMultiplier) {
  const mult = dpsMultiplier || 1;
  return averageDamage * speed * (hitChance / 100) * mult;
}

// --- DoT / Ailment Constants ---

export const DOT_DPS_CAP = 35791394; // data.misc.DotDpsCap

export const ailmentData = {
  Ignite: {
    percentBase: 0.9,         // data.misc.IgnitePercentBase = 90% per second of fire damage
    durationBase: 4,          // data.misc.IgniteDurationBase = 4 seconds
    associatedType: 'Fire',
    dotType: 'FireDotMultiplier',
  },
  Bleed: {
    percentBase: 0.7,         // data.misc.BleedPercentBase = 70% per second
    durationBase: 5,          // data.misc.BleedDurationBase = 5 seconds
    associatedType: 'Physical',
    dotType: 'PhysicalDotMultiplier',
  },
  Poison: {
    percentBase: 0.3,         // data.misc.PoisonPercentBase = 30% per second
    durationBase: 2,          // data.misc.PoisonDurationBase = 2 seconds
    associatedType: 'Chaos',
    dotType: 'ChaosDotMultiplier',
  },
};

// Calculate ailment chance from hit and crit chances
// chanceOnHit: 0-100, chanceOnCrit: 0-100, critChance: 0-100
export function calcAilmentChance(chanceOnHit, chanceOnCrit, critChance) {
  const chanceFromHit = chanceOnHit * (1 - critChance / 100);
  const chanceFromCrit = chanceOnCrit * critChance / 100;
  return chanceFromHit + chanceFromCrit;
}

// Calculate ailment base damage from hit/crit source damage
// Weighted average based on what portion of ailments come from crits vs non-crits
export function calcAilmentBaseDamage(sourceHitDmg, sourceCritDmg, chanceOnHit, chanceOnCrit, critChance) {
  const chanceFromHit = chanceOnHit * (1 - critChance / 100);
  const chanceFromCrit = chanceOnCrit * critChance / 100;
  const totalChance = chanceFromHit + chanceFromCrit;
  if (totalChance <= 0) return 0;
  const baseFromHit = sourceHitDmg * chanceFromHit / totalChance;
  const baseFromCrit = sourceCritDmg * chanceFromCrit / totalChance;
  return baseFromHit + baseFromCrit;
}

// Calculate DoT DPS for a specific ailment type
// baseDamage: ailment source base damage
// percentBase: damage per second as fraction of base (e.g. 0.9 for ignite)
// effectMod: ailment effect modifier
// rateMod: rate modifier (faster burning etc.)
// effMult: effective multiplier (resistance, taken mods)
// stacks: number of active stacks (1 for non-stacking)
export function calcAilmentDPS(baseDamage, percentBase, effectMod, rateMod, effMult, stacks) {
  if (baseDamage <= 0) return 0;
  const uncapped = baseDamage * percentBase * effectMod * rateMod * stacks * effMult;
  return Math.min(uncapped, DOT_DPS_CAP);
}

// Calculate ailment duration
// durationBase: base duration in seconds
// durationMod: duration modifier (INC/MORE combined)
export function calcAilmentDuration(durationBase, durationMod) {
  return durationBase * Math.max(durationMod, 0);
}

// Calculate DoT multiplier for an ailment
// dotMultBase + typeDotMult combined
export function calcDotMultiplier(skillModList, cfg, specificDotMultName) {
  const overrideDotMult = skillModList.override(cfg, 'DotMultiplier');
  if (overrideDotMult !== undefined) return 1 + overrideDotMult / 100;
  const base = skillModList.sum('BASE', cfg, 'DotMultiplier');
  const specific = specificDotMultName ? skillModList.sum('BASE', cfg, specificDotMultName) : 0;
  return 1 + (base + specific) / 100;
}

// Calculate effective damage multiplier for DoT against enemy
// resist: enemy resistance (0-100 or negative)
// takenInc: enemy INC damage taken
// takenMore: enemy MORE damage taken
export function calcDotEffMult(resist, takenInc, takenMore) {
  return (1 - resist / 100) * (1 + takenInc / 100) * takenMore;
}

// Calculate poison stacks from hit rate and duration
// hitChance: 0-100
// poisonChance: 0-100 (combined ailment chance)
// speed: hits per second
// duration: poison duration in seconds
// dpsMultiplier: skill's dps multiplier (projectiles, etc.)
export function calcPoisonStacks(hitChance, poisonChance, speed, duration, dpsMultiplier) {
  if (speed <= 0) return 0;
  return (hitChance / 100) * (poisonChance / 100) * speed * duration * (dpsMultiplier || 1);
}

// Calculate combined DPS from all sources
export function calcCombinedDPS(opts) {
  const {
    hitDPS = 0,
    dotDPS = 0,
    bleedDPS = 0,
    igniteDPS = 0,
    poisonDPS = 0,
    impaleDPS = 0,
    decayDPS = 0,
  } = opts;
  const totalDotDPS = Math.min(
    dotDPS + bleedDPS + igniteDPS + poisonDPS + decayDPS,
    DOT_DPS_CAP
  );
  return hitDPS + totalDotDPS + impaleDPS;
}

// Calculate impale DPS
// storedHitAvg: average physical hit stored for impale
// impaleModifier: impale effect modifier (e.g. 1.1)
// hitChance: 0-100
// speed: hits per second
// dpsMultiplier: skill's dps multiplier
export function calcImpaleDPS(storedHitAvg, impaleModifier, hitChance, speed, dpsMultiplier) {
  const baseDPS = storedHitAvg * ((impaleModifier || 1) - 1) * (hitChance / 100) * (dpsMultiplier || 1);
  return baseDPS * speed;
}

// Calculate culling multiplier
// cullPercent: cull threshold (e.g. 10 for 10%)
export function calcCullMultiplier(cullPercent) {
  if (cullPercent <= 0) return 1;
  return 1 / (1 - cullPercent / 100);
}
