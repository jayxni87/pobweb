// PoBWeb - Calculation engine Web Worker
// Wires all calc modules together.

import { parseMod } from './mod-parser.js';
import { ModDB } from './mod-db.js';
import { initModDB, initEnv } from './calc-setup.js';
import { doActorAttribs, doActorLifeMana } from './calc-perform.js';
import { calcResistances, calcBlock, calcDefences } from './calc-defence.js';
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
} from './calc-offence.js';

function sendProgress(phase, percent) {
  self.postMessage({ type: 'progress', payload: { phase, percent } });
}

function performCalculation(build) {
  sendProgress('setup', 0);

  // Initialize environment
  const env = initEnv(build.options || {});
  const { player } = env;
  const modDB = player.modDB;

  // Apply build mods (tree, items, config, etc.)
  if (build.mods) {
    for (const mod of build.mods) {
      modDB.newMod(mod.name, mod.type, mod.value, mod.source, mod.flags, mod.keywordFlags, ...(mod.tags || []));
    }
  }

  sendProgress('attributes', 20);

  // Calculate attributes (two-pass)
  doActorAttribs(player, build.options || {});

  sendProgress('life_mana', 30);

  // Calculate life/mana/ES pools
  doActorLifeMana(player);

  sendProgress('defence', 50);

  // Calculate defences
  calcResistances(player);
  calcBlock(player);
  calcDefences(player);

  sendProgress('offence', 70);

  // Calculate offence (if skill data provided)
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
    const skill = {
      skillModList,
      output: skillOutput,
      conversionTable: convTable,
      cfg: null,
    };

    // Set base damage
    if (build.skill.baseDamage) {
      for (const [key, val] of Object.entries(build.skill.baseDamage)) {
        skillOutput[key] = val;
      }
    }

    // Calculate per-type damage
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

    // Crit
    const baseCrit = build.skill.baseCrit || 5;
    const critChance = calcCritChance(skillModList, null, baseCrit);
    const critMultiplier = calcCritMultiplier(skillModList, null);
    const critEffect = calcCritEffect(critChance, critMultiplier);
    const totalCritAvg = totalHitAvg * critMultiplier;

    // Speed
    const baseTime = build.skill.castTime || 1.0;
    const speed = calcSpeed(skillModList, null, baseTime, !!build.skill.isAttack);

    // Hit chance
    const hitChance = build.skill.hitChance || 100;

    // Average damage and DPS
    const averageHit = calcAverageDamage(totalHitAvg, totalCritAvg, critChance);
    const averageDamage = averageHit * hitChance / 100;
    const totalDPS = calcTotalDPS(averageDamage, speed, 100, build.skill.dpsMultiplier);

    offence.CritChance = critChance;
    offence.CritMultiplier = critMultiplier;
    offence.CritEffect = critEffect;
    offence.Speed = speed;
    offence.AverageHit = averageHit;
    offence.AverageDamage = averageDamage;
    offence.TotalDPS = totalDPS;
    offence.HitChance = hitChance;
    offence.CombinedDPS = calcCombinedDPS({ hitDPS: totalDPS });
  }

  sendProgress('complete', 100);

  return {
    output: {
      ...player.output,
      ...offence,
    },
  };
}

self.onmessage = (e) => {
  const { type, payload } = e.data;
  try {
    switch (type) {
      case 'calculate': {
        const result = performCalculation(payload.build || {});
        self.postMessage({ type: 'result', payload: result });
        break;
      }
      case 'parseMod': {
        const mod = parseMod(payload.modLine);
        self.postMessage({ type: 'result', payload: { mod } });
        break;
      }
      default:
        self.postMessage({ type: 'error', payload: { message: `Unknown message type: ${type}` } });
    }
  } catch (err) {
    self.postMessage({ type: 'error', payload: { message: err.message } });
  }
};
