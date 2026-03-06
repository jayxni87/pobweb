// PoBWeb - CalcSetup (port of Modules/CalcSetup.lua)
// Initializes the environment for calculations.

import { ModDB } from './mod-db.js';
import { ModFlag } from './utils.js';

// Character constants (from Data/Misc.lua)
const characterConstants = {
  'base_maximum_all_resistances_%': 75,
  'maximum_block_%': 75,
  'base_maximum_spell_block_%': 75,
  'max_power_charges': 3,
  'max_frenzy_charges': 3,
  'max_endurance_charges': 3,
  'maximum_righteous_charges': 5,
  'maximum_blood_scythe_charges': 5,
  'base_number_of_totems_allowed': 1,
  'maximum_life_leech_rate_%_per_minute': 1200,
  'maximum_mana_leech_rate_%_per_minute': 1200,
  'impaled_debuff_number_of_reflected_hits': 5,
  'maximum_life_leech_amount_per_leech_%_max_life': 10,
  'maximum_mana_leech_amount_per_leech_%_max_mana': 10,
  'maximum_energy_shield_leech_amount_per_leech_%_max_energy_shield': 10,
};

export { characterConstants };

// Initialize modifier database with stats and conditions common to all actors
export function initModDB(modDB) {
  const c = characterConstants;

  // Resistance caps
  modDB.newMod('FireResistMax', 'BASE', c['base_maximum_all_resistances_%'], 'Base');
  modDB.newMod('ColdResistMax', 'BASE', c['base_maximum_all_resistances_%'], 'Base');
  modDB.newMod('LightningResistMax', 'BASE', c['base_maximum_all_resistances_%'], 'Base');
  modDB.newMod('ChaosResistMax', 'BASE', c['base_maximum_all_resistances_%'], 'Base');
  modDB.newMod('TotemFireResistMax', 'BASE', c['base_maximum_all_resistances_%'], 'Base');
  modDB.newMod('TotemColdResistMax', 'BASE', c['base_maximum_all_resistances_%'], 'Base');
  modDB.newMod('TotemLightningResistMax', 'BASE', c['base_maximum_all_resistances_%'], 'Base');
  modDB.newMod('TotemChaosResistMax', 'BASE', c['base_maximum_all_resistances_%'], 'Base');

  // Block caps
  modDB.newMod('BlockChanceMax', 'BASE', c['maximum_block_%'], 'Base');
  modDB.newMod('SpellBlockChanceMax', 'BASE', c['base_maximum_spell_block_%'], 'Base');
  modDB.newMod('SpellDodgeChanceMax', 'BASE', 75, 'Base');

  // Charge limits and duration
  modDB.newMod('ChargeDuration', 'BASE', 10, 'Base');
  modDB.newMod('PowerChargesMax', 'BASE', c['max_power_charges'], 'Base');
  modDB.newMod('FrenzyChargesMax', 'BASE', c['max_frenzy_charges'], 'Base');
  modDB.newMod('EnduranceChargesMax', 'BASE', c['max_endurance_charges'], 'Base');
  modDB.newMod('SiphoningChargesMax', 'BASE', 0, 'Base');
  modDB.newMod('ChallengerChargesMax', 'BASE', 0, 'Base');
  modDB.newMod('BlitzChargesMax', 'BASE', 0, 'Base');
  modDB.newMod('InspirationChargesMax', 'BASE', c['maximum_righteous_charges'], 'Base');
  modDB.newMod('CrabBarriersMax', 'BASE', 0, 'Base');
  modDB.newMod('BrutalChargesMax', 'BASE', 0, 'Base');
  modDB.newMod('AbsorptionChargesMax', 'BASE', 0, 'Base');
  modDB.newMod('AfflictionChargesMax', 'BASE', 0, 'Base');
  modDB.newMod('BloodChargesMax', 'BASE', c['maximum_blood_scythe_charges'], 'Base');

  // Leech rate caps
  modDB.newMod('MaxLifeLeechRate', 'BASE', c['maximum_life_leech_rate_%_per_minute'] / 60, 'Base');
  modDB.newMod('MaxManaLeechRate', 'BASE', c['maximum_mana_leech_rate_%_per_minute'] / 60, 'Base');
  modDB.newMod('MaxEnergyShieldLeechRate', 'BASE', 10, 'Base');
  modDB.newMod('MaxLifeLeechInstance', 'BASE', c['maximum_life_leech_amount_per_leech_%_max_life'], 'Base');
  modDB.newMod('MaxManaLeechInstance', 'BASE', c['maximum_mana_leech_amount_per_leech_%_max_mana'], 'Base');
  modDB.newMod('MaxEnergyShieldLeechInstance', 'BASE', c['maximum_energy_shield_leech_amount_per_leech_%_max_energy_shield'], 'Base');

  // Impale
  modDB.newMod('ImpaleStacksMax', 'BASE', c['impaled_debuff_number_of_reflected_hits'], 'Base');
  modDB.newMod('BleedStacksMax', 'BASE', 1, 'Base');

  // Totem limit
  modDB.newMod('ActiveTotemLimit', 'BASE', c['base_number_of_totems_allowed'], 'Base');

  // Base casting times
  modDB.newMod('TrapThrowingTime', 'BASE', 0.6, 'Base');
  modDB.newMod('MineLayingTime', 'BASE', 0.3, 'Base');
  modDB.newMod('WarcryCastTime', 'BASE', 0.8, 'Base');
  modDB.newMod('TotemPlacementTime', 'BASE', 0.6, 'Base');
  modDB.newMod('BallistaPlacementTime', 'BASE', 0.35, 'Base');

  // Other
  modDB.newMod('ShockStacksMax', 'BASE', 1, 'Base');
  modDB.newMod('ScorchStacksMax', 'BASE', 1, 'Base');
  modDB.newMod('CritChanceCap', 'BASE', 100, 'Base');

  // Conditional movement/damage mods
  modDB.newMod('MovementSpeed', 'INC', -30, 'Base', 0, 0,
    { type: 'Condition', var: 'Maimed' });
  modDB.newMod('DamageTaken', 'INC', 10, 'Base', ModFlag.Attack, 0,
    { type: 'Condition', var: 'Intimidated' });
  modDB.newMod('DamageTaken', 'INC', 10, 'Base', ModFlag.Spell, 0,
    { type: 'Condition', var: 'Unnerved' });
  modDB.newMod('PhysicalDamageReduction', 'BASE', -15, 'Base', 0, 0,
    { type: 'Condition', var: 'Crushed' });

  // Condition → flag mappings
  modDB.newMod('Condition:Burning', 'FLAG', true, 'Base', 0, 0,
    { type: 'IgnoreCond' }, { type: 'Condition', var: 'Ignited' });
  modDB.newMod('Blind', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'Blinded' });
  modDB.newMod('Chill', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'Chilled' });
  modDB.newMod('Freeze', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'Frozen' });
  modDB.newMod('Fortify', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'Fortify' });
  modDB.newMod('Fortified', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'Fortified' });
  modDB.newMod('Onslaught', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'Onslaught' });
  modDB.newMod('UnholyMight', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'UnholyMight' });
  modDB.newMod('Tailwind', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'Tailwind' });
  modDB.newMod('Adrenaline', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'Adrenaline' });
  modDB.newMod('Fanaticism', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'Fanaticism' });
  modDB.newMod('Convergence', 'FLAG', true, 'Base', 0, 0,
    { type: 'Condition', var: 'Convergence' });
}

// Create a minimal calculation environment
export function initEnv(options) {
  const opts = options || {};

  const playerModDB = new ModDB();
  const enemyDB = new ModDB();

  // Initialize both with base mods
  initModDB(playerModDB);
  initModDB(enemyDB);

  const env = {
    mode: opts.mode || 'MAIN',
    mode_buffs: opts.buffs !== false,
    mode_combat: opts.combat !== false,
    mode_effective: opts.effective !== false,

    player: {
      modDB: playerModDB,
      itemList: {},
      activeSkillList: [],
      output: {},
      outputTable: {},
      actor: { player: true },
    },
    enemyDB,

    // Tracking tables
    radiusJewelList: [],
    extraRadiusNodeList: [],
    allocNodes: {},
    grantedPassives: {},
    grantedSkillsNodes: {},
    grantedSkillsItems: {},
    flasks: {},
    tinctures: {},
    requirementsTableItems: {},
    requirementsTableGems: {},
    auxSkillList: [],
  };

  // Wire up actor references
  env.player.modDB.actor = env.player.actor;
  env.player.actor.modDB = env.player.modDB;
  env.player.actor.enemy = { modDB: enemyDB };

  // Set standard conditions
  playerModDB.conditions.Buffed = env.mode_buffs;
  playerModDB.conditions.Combat = env.mode_combat;
  playerModDB.conditions.Effective = env.mode_effective;

  enemyDB.conditions.Buffed = env.mode_buffs;
  enemyDB.conditions.Combat = env.mode_combat;
  enemyDB.conditions.Effective = env.mode_effective;

  return env;
}
