// PoBWeb - Config Options Model (port of Modules/ConfigOptions.lua)
// Defines configuration options and their apply functions for the calc engine.

export const CONFIG_TYPES = ['check', 'count', 'countAllowZero', 'list'];

function makeMod(name, type, value, source, flags, keywordFlags, ...conditions) {
  return { name, type, value, source: source || 'Config', flags: flags || 0, keywordFlags: keywordFlags || 0, conditions };
}

// Apply function generators for common patterns
function conditionApply(condName, target) {
  return (val, modList, enemyModList) => {
    if (!val) return;
    const list = target === 'enemy' ? enemyModList : modList;
    list.addMod(makeMod(`Condition:${condName}`, 'FLAG', true, 'Config'));
  };
}

function multiplierApply(multName) {
  return (val, modList) => {
    if (!val) return;
    modList.addMod(makeMod(`Multiplier:${multName}`, 'BASE', val, 'Config'));
  };
}

function enemyStatApply(statName) {
  return (val, modList, enemyModList) => {
    if (!val) return;
    enemyModList.addMod(makeMod(statName, 'BASE', val, 'Config'));
  };
}

// Config option definitions with apply functions
// This is a representative subset of the ~538 options in desktop PoB.
// Additional options are added as needed by skills/mechanics.
export const configOptions = [
  // --- General conditions ---
  { var: 'conditionMoving', type: 'check', label: 'Are you always moving?',
    apply: conditionApply('Moving') },
  { var: 'conditionFullLife', type: 'check', label: 'Are you always on Full Life?',
    apply: conditionApply('FullLife') },
  { var: 'conditionLowLife', type: 'check', label: 'Are you always on Low Life?',
    apply: conditionApply('LowLife') },
  { var: 'conditionFullMana', type: 'check', label: 'Are you always on Full Mana?',
    apply: conditionApply('FullMana') },
  { var: 'conditionLowMana', type: 'check', label: 'Are you always on Low Mana?',
    apply: conditionApply('LowMana') },
  { var: 'conditionFullEnergyShield', type: 'check', label: 'Are you always on Full Energy Shield?',
    apply: conditionApply('FullEnergyShield') },
  { var: 'conditionLowEnergyShield', type: 'check', label: 'Are you always on Low Energy Shield?',
    apply: conditionApply('LowEnergyShield') },
  { var: 'conditionHaveEnergyShield', type: 'check', label: 'Do you always have Energy Shield?',
    apply: conditionApply('HaveEnergyShield') },

  // --- Recently conditions ---
  { var: 'conditionUsedSkillRecently', type: 'check', label: 'Have you used a Skill Recently?',
    apply: conditionApply('UsedSkillRecently') },
  { var: 'conditionAttackedRecently', type: 'check', label: 'Have you Attacked Recently?',
    apply: conditionApply('AttackedRecently') },
  { var: 'conditionCastSpellRecently', type: 'check', label: 'Have you Cast a Spell Recently?',
    apply: conditionApply('CastSpellRecently') },
  { var: 'conditionKilledRecently', type: 'check', label: 'Have you Killed Recently?',
    apply: conditionApply('KilledRecently') },
  { var: 'conditionTakenHitRecently', type: 'check', label: 'Have you been Hit Recently?',
    apply: conditionApply('BeenHitRecently') },
  { var: 'conditionCritRecently', type: 'check', label: 'Have you Crit Recently?',
    apply: conditionApply('CritRecently') },
  { var: 'conditionBlockedRecently', type: 'check', label: 'Have you Blocked Recently?',
    apply: conditionApply('BlockedRecently') },

  // --- Charges ---
  { var: 'usePowerCharges', type: 'check', label: 'Do you use Power Charges?',
    apply: conditionApply('UsePowerCharges') },
  { var: 'useFrenzyCharges', type: 'check', label: 'Do you use Frenzy Charges?',
    apply: conditionApply('UseFrenzyCharges') },
  { var: 'useEnduranceCharges', type: 'check', label: 'Do you use Endurance Charges?',
    apply: conditionApply('UseEnduranceCharges') },
  { var: 'multiplierPowerCharges', type: 'count', label: '# of Power Charges:',
    apply: multiplierApply('PowerCharge') },
  { var: 'multiplierFrenzyCharges', type: 'count', label: '# of Frenzy Charges:',
    apply: multiplierApply('FrenzyCharge') },
  { var: 'multiplierEnduranceCharges', type: 'count', label: '# of Endurance Charges:',
    apply: multiplierApply('EnduranceCharge') },

  // --- Kill/Minion conditions ---
  { var: 'conditionKilledAffectedByDoT', type: 'check', label: 'Killed enemy affected by your DoT Recently?',
    apply: conditionApply('KilledAffectedByDotRecently') },
  { var: 'conditionFrozenEnemyRecently', type: 'check', label: 'Have you Frozen an enemy Recently?',
    apply: conditionApply('FrozenEnemyRecently') },
  { var: 'conditionShatteredEnemyRecently', type: 'check', label: 'Have you Shattered an enemy Recently?',
    apply: conditionApply('ShatteredEnemyRecently') },
  { var: 'conditionIgnitedEnemyRecently', type: 'check', label: 'Have you Ignited an enemy Recently?',
    apply: conditionApply('IgnitedEnemyRecently') },
  { var: 'conditionShockedEnemyRecently', type: 'check', label: 'Have you Shocked an enemy Recently?',
    apply: conditionApply('ShockedEnemyRecently') },

  // --- Multipliers ---
  { var: 'multiplierNearbyEnemies', type: 'count', label: '# of Nearby Enemies:',
    apply: multiplierApply('NearbyEnemy') },
  { var: 'multiplierNearbyAllies', type: 'count', label: '# of Nearby Allies:',
    apply: multiplierApply('NearbyAlly') },
  { var: 'multiplierNearbyCorpses', type: 'count', label: '# of Nearby Corpses:',
    apply: multiplierApply('NearbyCorpse') },
  { var: 'multiplierRage', type: 'count', label: 'Rage:',
    apply: multiplierApply('Rage') },

  // --- Onslaught / buffs ---
  { var: 'buffOnslaught', type: 'check', label: 'Do you have Onslaught?',
    apply: conditionApply('Onslaught') },
  { var: 'buffUnholyMight', type: 'check', label: 'Do you have Unholy Might?',
    apply: conditionApply('UnholyMight') },
  { var: 'buffPhasing', type: 'check', label: 'Do you have Phasing?',
    apply: conditionApply('Phasing') },
  { var: 'buffFortification', type: 'check', label: 'Do you have Fortification?',
    apply: conditionApply('Fortification') },
  { var: 'buffTailwind', type: 'check', label: 'Do you have Tailwind?',
    apply: conditionApply('Tailwind') },
  { var: 'buffAdrenaline', type: 'check', label: 'Do you have Adrenaline?',
    apply: conditionApply('Adrenaline') },

  // --- Enemy conditions ---
  { var: 'conditionEnemyRareOrUnique', type: 'check', label: 'Is the enemy Rare or Unique?',
    apply: conditionApply('RareOrUnique', 'enemy') },
  { var: 'conditionEnemyMoving', type: 'check', label: 'Is the enemy Moving?',
    apply: conditionApply('Moving', 'enemy') },
  { var: 'conditionEnemyBleeding', type: 'check', label: 'Is the enemy Bleeding?',
    apply: conditionApply('Bleeding', 'enemy') },
  { var: 'conditionEnemyPoisoned', type: 'check', label: 'Is the enemy Poisoned?',
    apply: conditionApply('Poisoned', 'enemy') },
  { var: 'conditionEnemyBurning', type: 'check', label: 'Is the enemy Burning?',
    apply: conditionApply('Burning', 'enemy') },
  { var: 'conditionEnemyIgnited', type: 'check', label: 'Is the enemy Ignited?',
    apply: conditionApply('Ignited', 'enemy') },
  { var: 'conditionEnemyChilled', type: 'check', label: 'Is the enemy Chilled?',
    apply: conditionApply('Chilled', 'enemy') },
  { var: 'conditionEnemyFrozen', type: 'check', label: 'Is the enemy Frozen?',
    apply: conditionApply('Frozen', 'enemy') },
  { var: 'conditionEnemyShocked', type: 'check', label: 'Is the enemy Shocked?',
    apply: conditionApply('Shocked', 'enemy') },
  { var: 'conditionEnemyIntimidated', type: 'check', label: 'Is the enemy Intimidated?',
    apply: conditionApply('Intimidated', 'enemy') },
  { var: 'conditionEnemyCursed', type: 'check', label: 'Is the enemy Cursed?',
    apply: conditionApply('Cursed', 'enemy') },
  { var: 'conditionEnemyMaimed', type: 'check', label: 'Is the enemy Maimed?',
    apply: conditionApply('Maimed', 'enemy') },

  // --- Enemy stats ---
  { var: 'enemyPhysicalReduction', type: 'count', label: 'Enemy Physical Damage Reduction:',
    apply: enemyStatApply('PhysicalDamageReduction') },
  { var: 'enemyFireResist', type: 'count', label: 'Enemy Fire Resistance:',
    apply: enemyStatApply('FireResist') },
  { var: 'enemyColdResist', type: 'count', label: 'Enemy Cold Resistance:',
    apply: enemyStatApply('ColdResist') },
  { var: 'enemyLightningResist', type: 'count', label: 'Enemy Lightning Resistance:',
    apply: enemyStatApply('LightningResist') },
  { var: 'enemyChaosResist', type: 'count', label: 'Enemy Chaos Resistance:',
    apply: enemyStatApply('ChaosResist') },

  // --- Boss type ---
  { var: 'enemyIsBoss', type: 'list', label: 'Is the enemy a Boss?',
    list: [
      { val: 'None', label: 'No' },
      { val: 'Boss', label: 'Standard Boss' },
      { val: 'Pinnacle', label: 'Guardian/Pinnacle Boss' },
      { val: 'Uber', label: 'Uber Pinnacle Boss' },
    ],
    apply: (val, modList, enemyModList) => {
      if (!val || val === 'None') return;
      enemyModList.addMod(makeMod('Condition:RareOrUnique', 'FLAG', true, 'Config'));
      enemyModList.addMod(makeMod('Condition:Boss', 'FLAG', true, 'Config'));
      if (val === 'Pinnacle' || val === 'Uber') {
        enemyModList.addMod(makeMod('Condition:PinnacleBoss', 'FLAG', true, 'Config'));
      }
      if (val === 'Uber') {
        enemyModList.addMod(makeMod('Condition:UberBoss', 'FLAG', true, 'Config'));
      }
    },
  },

  // --- Effective DPS ---
  { var: 'conditionLeeching', type: 'check', label: 'Are you Leeching?',
    apply: conditionApply('Leeching') },
  { var: 'conditionLeechingLife', type: 'check', label: 'Are you Leeching Life?',
    apply: conditionApply('LeechingLife') },
  { var: 'conditionLeechingMana', type: 'check', label: 'Are you Leeching Mana?',
    apply: conditionApply('LeechingMana') },
  { var: 'conditionLeechingEnergyShield', type: 'check', label: 'Are you Leeching Energy Shield?',
    apply: conditionApply('LeechingEnergyShield') },
];

// Index by var name for quick lookup
const optionsByVar = new Map();
for (const opt of configOptions) {
  optionsByVar.set(opt.var, opt);
}

export function getConfigOption(varName) {
  return optionsByVar.get(varName);
}

export function applyConfigOption(varName, value, modList, enemyModList) {
  const opt = optionsByVar.get(varName);
  if (!opt || !opt.apply) return;

  // For check types, skip if falsy
  if (opt.type === 'check' && !value) return;
  // For count types, skip if zero (unless countAllowZero)
  if (opt.type === 'count' && !value) return;

  opt.apply(value, modList, enemyModList);
}

// Apply all config values from a config object (as stored in Build)
export function applyAllConfigOptions(config, modList, enemyModList) {
  for (const [key, value] of Object.entries(config)) {
    applyConfigOption(key, value, modList, enemyModList);
  }
}
