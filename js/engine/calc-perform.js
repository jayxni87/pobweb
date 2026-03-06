// PoBWeb - CalcPerform (port of Modules/CalcPerform.lua)
// Core stat calculation functions.

import { ModFlag, round } from './utils.js';
import { calcLib } from './calc-tools.js';

// Misc data constants
const misc = {
  AccuracyPerDexBase: 2,
  LowPoolThreshold: 0.5,
};

// Calculate Life and Mana pools
export function doActorLifeMana(actor) {
  const modDB = actor.modDB;
  const output = actor.output;
  const condList = modDB.conditions;

  const lowLifePerc = modDB.sum('BASE', null, 'LowLifePercentage');
  output.LowLifePercentage = 100.0 * (lowLifePerc > 0 ? lowLifePerc : misc.LowPoolThreshold);
  const fullLifePerc = modDB.sum('BASE', null, 'FullLifePercentage');
  output.FullLifePercentage = 100.0 * (fullLifePerc > 0 ? fullLifePerc : 1.0);

  output.ChaosInoculation = modDB.flag(null, 'ChaosInoculation');

  if (output.ChaosInoculation) {
    output.Life = 1;
    condList.FullLife = true;
  } else {
    const base = modDB.sum('BASE', null, 'Life');
    const inc = modDB.sum('INC', null, 'Life');
    const more = modDB.more(null, 'Life');
    const override = modDB.override(null, 'Life');
    const conv = modDB.sum('BASE', null, 'LifeConvertToEnergyShield');
    output.Life = override !== undefined
      ? override
      : Math.max(round(base * (1 + inc / 100) * more * (1 - conv / 100)), 1);
  }

  const manaConv = modDB.sum('BASE', null, 'ManaConvertToArmour');
  output.Mana = round(calcLib.val(modDB, 'Mana') * (1 - manaConv / 100));

  output.LowestOfMaximumLifeAndMaximumMana = Math.min(output.Life, output.Mana);
}

// Calculate attributes and set conditions
export function doActorAttribs(actor, options) {
  const modDB = actor.modDB;
  const output = actor.output;
  const condList = modDB.conditions;
  const opts = options || {};

  // Calculate attributes (two passes for circular dependency)
  for (let pass = 1; pass <= 2; pass++) {
    for (const stat of ['Str', 'Dex', 'Int']) {
      output[stat] = Math.max(round(calcLib.val(modDB, stat)), 0);
    }

    const stats = [output.Str, output.Dex, output.Int].sort((a, b) => a - b);
    output.LowestAttribute = stats[0];
    condList.TwoHighestAttributesEqual = stats[1] === stats[2];

    condList.DexHigherThanInt = output.Dex > output.Int;
    condList.StrHigherThanInt = output.Str > output.Int;
    condList.IntHigherThanDex = output.Int > output.Dex;
    condList.StrHigherThanDex = output.Str > output.Dex;
    condList.IntHigherThanStr = output.Int > output.Str;
    condList.DexHigherThanStr = output.Dex > output.Str;

    condList.StrHighestAttribute = output.Str >= output.Dex && output.Str >= output.Int;
    condList.IntHighestAttribute = output.Int >= output.Str && output.Int >= output.Dex;
    condList.DexHighestAttribute = output.Dex >= output.Str && output.Dex >= output.Int;
  }

  output.TotalAttr = output.Str + output.Dex + output.Int;

  // Devotion
  output.Devotion = modDB.sum('BASE', null, 'Devotion');

  // Add attribute bonuses
  if (!modDB.flag(null, 'NoAttributeBonuses')) {
    if (!modDB.flag(null, 'NoStrengthAttributeBonuses')) {
      if (!modDB.flag(null, 'NoStrBonusToLife')) {
        modDB.newMod('Life', 'BASE', Math.floor(output.Str / 2), 'Strength');
      }
      const strDmgBonusRatioOverride = modDB.sum('BASE', null, 'StrDmgBonusRatioOverride');
      const dexIntToMelee = modDB.sum('BASE', null, 'DexIntToMeleeBonus');
      if (strDmgBonusRatioOverride > 0) {
        actor.strDmgBonus = Math.floor((output.Str + dexIntToMelee) * strDmgBonusRatioOverride);
      } else {
        actor.strDmgBonus = Math.floor((output.Str + dexIntToMelee) / 5);
      }
      modDB.newMod('PhysicalDamage', 'INC', actor.strDmgBonus, 'Strength', ModFlag.Melee);
    }
    if (!modDB.flag(null, 'NoDexterityAttributeBonuses')) {
      const accOverride = modDB.override(null, 'DexAccBonusOverride');
      const accPerDex = accOverride !== undefined ? accOverride : misc.AccuracyPerDexBase;
      modDB.newMod('Accuracy', 'BASE', output.Dex * accPerDex, 'Dexterity');
      if (!modDB.flag(null, 'NoDexBonusToEvasion')) {
        modDB.newMod('Evasion', 'INC', Math.floor(output.Dex / 5), 'Dexterity');
      }
    }
    if (!modDB.flag(null, 'NoIntelligenceAttributeBonuses')) {
      if (!modDB.flag(null, 'NoIntBonusToMana')) {
        modDB.newMod('Mana', 'BASE', Math.floor(output.Int / 2), 'Intelligence');
      }
      if (!modDB.flag(null, 'NoIntBonusToES')) {
        modDB.newMod('EnergyShield', 'INC', Math.floor(output.Int / 5), 'Intelligence');
      }
    }
  }
}

// Combined: attributes first, then life/mana
export function doActorStats(actor, options) {
  doActorAttribs(actor, options);
  doActorLifeMana(actor);
}
