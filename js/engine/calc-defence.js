// PoBWeb - CalcDefence (port of Modules/CalcDefence.lua)
// Defence calculations: resistances, armour, evasion, block, suppression.

import { round } from './utils.js';
import { calcLib } from './calc-tools.js';

// Constants
const misc = {
  ResistFloor: -200,
  MaxResistCap: 90,
  BlockChanceCap: 90,
};

const resistTypeList = ['Fire', 'Cold', 'Lightning', 'Chaos'];
const isElemental = { Fire: true, Cold: true, Lightning: true, Chaos: false };

// Calculate hit chance from evasion and accuracy
export function hitChance(evasion, accuracy) {
  if (accuracy < 0) return 5;
  const rawChance = accuracy / (accuracy + Math.pow(evasion / 5, 0.9)) * 125;
  return Math.max(Math.min(round(rawChance), 100), 5);
}

// Calculate damage reduction from armour (float)
export function armourReductionF(armour, raw) {
  if (armour === 0 && raw === 0) return 0;
  return armour / (armour + raw * 5) * 100;
}

// Calculate damage reduction from armour (integer)
export function armourReduction(armour, raw) {
  return round(armourReductionF(armour, raw));
}

// Calculate resistances for an actor
export function calcResistances(actor) {
  const modDB = actor.modDB;
  const output = actor.output;

  output.PhysicalResist = 0;

  for (const elem of resistTypeList) {
    const elemIsElemental = isElemental[elem];
    const max = modDB.override(null, elem + 'ResistMax');
    const effectiveMax = max !== undefined
      ? max
      : Math.min(misc.MaxResistCap, modDB.sum('BASE', null, elem + 'ResistMax', ...(elemIsElemental ? ['ElementalResistMax'] : [])));

    let total = modDB.override(null, elem + 'Resist');
    if (total === undefined) {
      const base = modDB.sum('BASE', null, elem + 'Resist', ...(elemIsElemental ? ['ElementalResist'] : []));
      const inc = Math.max(calcLib.mod(modDB, null, elem + 'Resist', ...(elemIsElemental ? ['ElementalResist'] : [])), 0);
      total = base * inc;
    }

    // Fractional resistances are truncated
    total = Math.trunc(total);
    const min = Math.trunc(misc.ResistFloor);
    const maxTrunc = Math.trunc(effectiveMax);

    const final = Math.max(Math.min(total, maxTrunc), min);

    output[elem + 'Resist'] = final;
    output[elem + 'ResistTotal'] = total;
    output[elem + 'ResistOverCap'] = Math.max(0, total - maxTrunc);
    output[elem + 'ResistOver75'] = Math.max(0, final - 75);
    output['Missing' + elem + 'Resist'] = Math.max(0, maxTrunc - final);
  }
}

// Calculate block chances for an actor
export function calcBlock(actor) {
  const modDB = actor.modDB;
  const output = actor.output;

  // Block chance max
  output.BlockChanceMax = Math.min(modDB.sum('BASE', null, 'BlockChanceMax'), misc.BlockChanceCap);
  output.BlockChanceOverCap = 0;
  output.SpellBlockChanceOverCap = 0;

  // Attack block
  const totalBlockChance = modDB.sum('BASE', null, 'BlockChance') * calcLib.mod(modDB, null, 'BlockChance');
  output.BlockChance = Math.min(totalBlockChance, output.BlockChanceMax);
  output.BlockChanceOverCap = Math.max(0, totalBlockChance - output.BlockChanceMax);

  // Spell block
  if (modDB.flag(null, 'SpellBlockChanceMaxIsBlockChanceMax')) {
    output.SpellBlockChanceMax = output.BlockChanceMax;
  } else {
    output.SpellBlockChanceMax = Math.min(modDB.sum('BASE', null, 'SpellBlockChanceMax'), misc.BlockChanceCap);
  }

  if (modDB.flag(null, 'SpellBlockChanceIsBlockChance')) {
    output.SpellBlockChance = output.BlockChance;
    output.SpellBlockChanceOverCap = output.BlockChanceOverCap;
  } else {
    const totalSpellBlockChance = modDB.sum('BASE', null, 'SpellBlockChance') * calcLib.mod(modDB, null, 'SpellBlockChance');
    output.SpellBlockChance = Math.min(totalSpellBlockChance, output.SpellBlockChanceMax);
    output.SpellBlockChanceOverCap = Math.max(0, totalSpellBlockChance - output.SpellBlockChanceMax);
  }

  if (modDB.flag(null, 'CannotBlockAttacks')) {
    output.BlockChance = 0;
  }
  if (modDB.flag(null, 'CannotBlockSpells')) {
    output.SpellBlockChance = 0;
  }
}

// Calculate primary defences: armour, evasion, energy shield
export function calcDefences(actor) {
  const modDB = actor.modDB;
  const output = actor.output;

  const ironReflexes = modDB.flag(null, 'IronReflexes');

  // Base values from mods (gear is added via BASE mods)
  let armourBase = modDB.sum('BASE', null, 'Armour');
  let evasionBase = modDB.sum('BASE', null, 'Evasion');
  let esBase = modDB.sum('BASE', null, 'EnergyShield');

  // Apply INC and MORE
  let armour = round(armourBase * calcLib.mod(modDB, null, 'Armour', 'ArmourAndEvasion', 'ArmourAndEnergyShield', 'Defences'));
  let evasion = round(evasionBase * calcLib.mod(modDB, null, 'Evasion', 'ArmourAndEvasion', 'EvasionAndEnergyShield', 'Defences'));
  let energyShield = round(esBase * calcLib.mod(modDB, null, 'EnergyShield', 'ArmourAndEnergyShield', 'EvasionAndEnergyShield', 'Defences'));

  // Iron Reflexes: convert evasion to armour
  if (ironReflexes) {
    armour = armour + evasion;
    evasion = 0;
  }

  output.Armour = Math.max(armour, 0);
  output.Evasion = Math.max(evasion, 0);
  output.EnergyShield = Math.max(energyShield, 0);

  // Ward
  const wardBase = modDB.sum('BASE', null, 'Ward');
  output.Ward = Math.max(round(wardBase * calcLib.mod(modDB, null, 'Ward', 'Defences')), 0);

  // Spell suppression
  const suppressionBase = modDB.sum('BASE', null, 'SpellSuppressionChance');
  output.SpellSuppressionChance = Math.min(Math.max(suppressionBase, 0), 100);
  const suppressionEffect = 50 + modDB.sum('BASE', null, 'SpellSuppressionEffect');
  output.SpellSuppressionEffect = suppressionEffect;

  // Physical damage reduction from armour (at reference hit)
  const refHit = 1000; // reference hit for display
  if (output.Armour > 0) {
    output.PhysicalDamageReduction = armourReduction(output.Armour, refHit);
  } else {
    output.PhysicalDamageReduction = 0;
  }

  // Evade chance (if we have accuracy info from enemy)
  if (output.Evasion > 0) {
    const enemyAccuracy = (actor.enemy && actor.enemy.modDB)
      ? actor.enemy.modDB.sum('BASE', null, 'Accuracy') || 500
      : 500;
    output.EvadeChance = 100 - hitChance(output.Evasion, enemyAccuracy);
  } else {
    output.EvadeChance = 0;
  }
}
