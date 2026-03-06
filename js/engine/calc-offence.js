// PoBWeb - CalcOffence (port of Modules/CalcOffence.lua first half)
// Damage calculation, crit, speed, DPS.

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
