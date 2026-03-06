// PoBWeb - Mod Parser (port of Modules/ModParser.lua)
// Parses modifier text lines into mod objects.

import { ModFlag, KeywordFlag, SkillType, copyTable } from './utils.js';
import { createMod } from './mod-tools.js';

// --- Form patterns ---
// Each entry: [regex, formType, captureCount]
// Ordered by specificity (most specific first)
const formList = [
  [/^(\d+)% increased/, 'INC'],
  [/^(\d+)% faster/, 'INC'],
  [/^(\d+)% reduced/, 'RED'],
  [/^(\d+)% slower/, 'RED'],
  [/^(\d+)% more/, 'MORE'],
  [/^(\d+)% less/, 'LESS'],
  [/^([+-][\d.]+)%? to/, 'BASE'],
  [/^([+-][\d.]+)%? base/, 'BASE'],
  [/^([+-]?[\d.]+)%? additional/, 'BASE'],
  [/^([+-][\d.]+)%?/, 'BASE'],
  [/^([+-]?\d+)% chance to gain /, 'FLAG'],
  [/^([+-]?\d+)% chance/, 'CHANCE'],
  [/^([+-]?\d+)% additional chance/, 'CHANCE'],
  [/penetrates? (\d+)%/, 'PEN'],
  [/^([\d.]+) (.+) regenerated per second/, 'REGENFLAT'],
  [/^([\d.]+)% (.+) regenerated per second/, 'REGENPERCENT'],
  [/^([\d.]+)% of (.+) regenerated per second/, 'REGENPERCENT'],
  [/^regenerate ([\d.]+) (.*?) per second/, 'REGENFLAT'],
  [/^regenerate ([\d.]+)% (.*?) per second/, 'REGENPERCENT'],
  [/^regenerate ([\d.]+)% of (.*?) per second/, 'REGENPERCENT'],
  [/adds (\d+) to (\d+) (\w+) damage to attacks and spells/, 'DMGBOTH'],
  [/adds (\d+)-(\d+) (\w+) damage to attacks and spells/, 'DMGBOTH'],
  [/adds (\d+) to (\d+) (\w+) damage to spells and attacks/, 'DMGBOTH'],
  [/adds (\d+)-(\d+) (\w+) damage to spells and attacks/, 'DMGBOTH'],
  [/adds (\d+) to (\d+) (\w+) damage to hits/, 'DMGBOTH'],
  [/adds (\d+)-(\d+) (\w+) damage to hits/, 'DMGBOTH'],
  [/adds (\d+) to (\d+) (\w+) damage to attacks/, 'DMGATTACKS'],
  [/adds (\d+)-(\d+) (\w+) damage to attacks/, 'DMGATTACKS'],
  [/adds (\d+) to (\d+) (\w+) attack damage/, 'DMGATTACKS'],
  [/adds (\d+)-(\d+) (\w+) attack damage/, 'DMGATTACKS'],
  [/adds (\d+) to (\d+) (\w+) damage to spells/, 'DMGSPELLS'],
  [/adds (\d+)-(\d+) (\w+) damage to spells/, 'DMGSPELLS'],
  [/adds (\d+) to (\d+) (\w+) spell damage/, 'DMGSPELLS'],
  [/adds (\d+)-(\d+) (\w+) spell damage/, 'DMGSPELLS'],
  [/(\d+) to (\d+) added (\w+) damage/, 'DMG'],
  [/(\d+)-(\d+) added (\w+) damage/, 'DMG'],
  [/^(\d+) to (\d+) (\w+) damage/, 'DMG'],
  [/adds (\d+) to (\d+) (\w+) damage/, 'DMG'],
  [/adds (\d+)-(\d+) (\w+) damage/, 'DMG'],
  [/^you have /, 'FLAG'],
  [/^have /, 'FLAG'],
  [/^you are /, 'FLAG'],
  [/^are /, 'FLAG'],
  [/^gain /, 'FLAG'],
  [/^you gain /, 'FLAG'],
  [/^(\d+)/, 'BASE'],
];

// --- Mod name map ---
// Maps lowercase text fragments to stat names
const modNameList = {
  // Attributes
  'strength': 'Str',
  'dexterity': 'Dex',
  'intelligence': 'Int',
  'omniscience': 'Omni',
  'strength and dexterity': ['Str', 'Dex', 'StrDex'],
  'strength and intelligence': ['Str', 'Int', 'StrInt'],
  'dexterity and intelligence': ['Dex', 'Int', 'DexInt'],
  'attributes': ['Str', 'Dex', 'Int', 'All'],
  'all attributes': ['Str', 'Dex', 'Int', 'All'],
  'devotion': 'Devotion',
  // Life/Mana
  'life': 'Life',
  'maximum life': 'Life',
  'mana': 'Mana',
  'maximum mana': 'Mana',
  'mana regeneration': 'ManaRegen',
  'mana regeneration rate': 'ManaRegen',
  'life regeneration rate': 'LifeRegen',
  'mana cost': 'ManaCost',
  'mana cost of skills': 'ManaCost',
  'total mana cost': 'ManaCost',
  'total cost': 'Cost',
  'cost of skills': 'Cost',
  'mana reserved': 'ManaReserved',
  'mana reservation': 'ManaReserved',
  'reservation': 'Reserved',
  'reservation efficiency': 'ReservationEfficiency',
  'mana reservation efficiency': 'ManaReservationEfficiency',
  'mana reservation efficiency of skills': 'ManaReservationEfficiency',
  'life reservation efficiency of skills': 'LifeReservationEfficiency',
  // Primary defences
  'maximum energy shield': 'EnergyShield',
  'energy shield': 'EnergyShield',
  'energy shield recharge rate': 'EnergyShieldRecharge',
  'armour': 'Armour',
  'evasion': 'Evasion',
  'evasion rating': 'Evasion',
  'ward': 'Ward',
  'armour and evasion': 'ArmourAndEvasion',
  'armour and evasion rating': 'ArmourAndEvasion',
  'armour and energy shield': 'ArmourAndEnergyShield',
  'evasion and energy shield': 'EvasionAndEnergyShield',
  'evasion rating and energy shield': 'EvasionAndEnergyShield',
  'armour, evasion and energy shield': 'Defences',
  'defences': 'Defences',
  'chance to evade': 'EvadeChance',
  'chance to evade attacks': 'EvadeChance',
  'chance to evade attack hits': 'EvadeChance',
  // Resistances
  'physical damage reduction': 'PhysicalDamageReduction',
  'fire resistance': 'FireResist',
  'maximum fire resistance': 'FireResistMax',
  'cold resistance': 'ColdResist',
  'maximum cold resistance': 'ColdResistMax',
  'lightning resistance': 'LightningResist',
  'maximum lightning resistance': 'LightningResistMax',
  'chaos resistance': 'ChaosResist',
  'maximum chaos resistance': 'ChaosResistMax',
  'fire and cold resistances': ['FireResist', 'ColdResist'],
  'fire and lightning resistances': ['FireResist', 'LightningResist'],
  'cold and lightning resistances': ['ColdResist', 'LightningResist'],
  'elemental resistance': 'ElementalResist',
  'elemental resistances': 'ElementalResist',
  'all elemental resistances': 'ElementalResist',
  'elemental and chaos resistances': ['ElementalResist', 'ChaosResist'],
  'all resistances': ['ElementalResist', 'ChaosResist'],
  'all maximum elemental resistances': 'ElementalResistMax',
  'all maximum resistances': ['ElementalResistMax', 'ChaosResistMax'],
  'fire and chaos resistances': ['FireResist', 'ChaosResist'],
  'cold and chaos resistances': ['ColdResist', 'ChaosResist'],
  'lightning and chaos resistances': ['LightningResist', 'ChaosResist'],
  // Damage taken
  'damage taken': 'DamageTaken',
  'damage taken when hit': 'DamageTakenWhenHit',
  'damage taken from hits': 'DamageTakenWhenHit',
  'physical damage taken': 'PhysicalDamageTaken',
  'fire damage taken': 'FireDamageTaken',
  'cold damage taken': 'ColdDamageTaken',
  'lightning damage taken': 'LightningDamageTaken',
  'chaos damage taken': 'ChaosDamageTaken',
  'elemental damage taken': 'ElementalDamageTaken',
  // Block
  'chance to block': 'BlockChance',
  'block chance': 'BlockChance',
  'to block': 'BlockChance',
  'to block attacks': 'BlockChance',
  'to block attack damage': 'BlockChance',
  'spell block chance': 'SpellBlockChance',
  'to block spells': 'SpellBlockChance',
  'to block spell damage': 'SpellBlockChance',
  'chance to block attacks and spells': ['BlockChance', 'SpellBlockChance'],
  'maximum block chance': 'BlockChanceMax',
  'maximum chance to block attack damage': 'BlockChanceMax',
  // Dodge / Suppress
  'to suppress spell damage': 'SpellSuppressionChance',
  'amount of suppressed spell damage prevented': 'SpellSuppressionEffect',
  // Other defences
  'life recovery rate': 'LifeRecoveryRate',
  'mana recovery rate': 'ManaRecoveryRate',
  'energy shield recovery rate': 'EnergyShieldRecoveryRate',
  'energy shield regeneration rate': 'EnergyShieldRegen',
  'to avoid being stunned': 'AvoidStun',
  'to avoid being shocked': 'AvoidShock',
  'to avoid being frozen': 'AvoidFreeze',
  'to avoid being chilled': 'AvoidChill',
  'to avoid being ignited': 'AvoidIgnite',
  'to avoid elemental ailments': 'AvoidElementalAilments',
  // Offence - damage
  'damage': 'Damage',
  'physical damage': 'PhysicalDamage',
  'fire damage': 'FireDamage',
  'cold damage': 'ColdDamage',
  'lightning damage': 'LightningDamage',
  'chaos damage': 'ChaosDamage',
  'elemental damage': 'ElementalDamage',
  'attack damage': { name: 'Damage', flags: ModFlag.Attack },
  'spell damage': { name: 'Damage', flags: ModFlag.Spell },
  'melee damage': { name: 'Damage', flags: ModFlag.Melee },
  'area damage': { name: 'Damage', flags: ModFlag.Area },
  'projectile damage': { name: 'Damage', flags: ModFlag.Projectile },
  'weapon damage': { name: 'Damage', flags: ModFlag.Weapon },
  'damage over time': { name: 'Damage', flags: ModFlag.Dot },
  'damage with hits': { name: 'Damage', keywordFlags: KeywordFlag.Hit },
  'attack physical damage': { name: 'PhysicalDamage', flags: ModFlag.Attack },
  'physical attack damage': { name: 'PhysicalDamage', flags: ModFlag.Attack },
  'melee physical damage': { name: 'PhysicalDamage', flags: ModFlag.Melee },
  'burning damage': { name: 'FireDamage', flags: ModFlag.Dot },
  'damage over time multiplier': { name: 'DotMultiplier' },
  'fire damage over time multiplier': { name: 'FireDotMultiplier' },
  'cold damage over time multiplier': { name: 'ColdDotMultiplier' },
  'chaos damage over time multiplier': { name: 'ChaosDotMultiplier' },
  'physical damage over time multiplier': { name: 'PhysicalDotMultiplier' },
  // Offence - crit
  'critical strike chance': 'CritChance',
  'critical strike multiplier': 'CritMultiplier',
  'global critical strike chance': 'CritChance',
  'global critical strike multiplier': 'CritMultiplier',
  'melee critical strike chance': { name: 'CritChance', flags: ModFlag.Melee },
  'melee critical strike multiplier': { name: 'CritMultiplier', flags: ModFlag.Melee },
  'critical strike chance for spells': { name: 'CritChance', flags: ModFlag.Spell },
  'spell critical strike chance': { name: 'CritChance', flags: ModFlag.Spell },
  // Offence - speed
  'attack speed': { name: 'Speed', flags: ModFlag.Attack },
  'cast speed': { name: 'Speed', flags: ModFlag.Spell },
  'attack and cast speed': 'Speed',
  'warcry speed': { name: 'WarcrySpeed', keywordFlags: KeywordFlag.Warcry },
  // Offence - accuracy
  'accuracy rating': 'Accuracy',
  'accuracy': 'Accuracy',
  'global accuracy rating': 'Accuracy',
  // Offence - projectile
  'projectile speed': 'ProjectileSpeed',
  'projectile damage': { name: 'Damage', flags: ModFlag.Projectile },
  // Offence - area
  'area of effect': 'AreaOfEffect',
  'area damage': { name: 'Damage', flags: ModFlag.Area },
  // Offence - penetration
  'fire penetration': { name: 'FirePenetration' },
  'cold penetration': { name: 'ColdPenetration' },
  'lightning penetration': { name: 'LightningPenetration' },
  'elemental penetration': { name: 'ElementalPenetration' },
  // Offence - other
  'attack rating': 'Accuracy',
  'movement speed': 'MovementSpeed',
  'light radius': 'LightRadius',
  'rarity of items found': 'LootRarity',
  'quantity of items found': 'LootQuantity',
  'item rarity': 'LootRarity',
  'item quantity': 'LootQuantity',
  'character size': 'LifeOnBlock',
  // Duration
  'skill effect duration': 'Duration',
  'buff effect': 'BuffEffect',
  'effect of non-curse auras from your skills': 'AuraEffect',
  'effect of your curses': 'CurseEffect',
  'effect of non-damaging ailments': 'EnemyNonDamageAilmentEffect',
  // Flask
  'flask effect duration': 'FlaskDuration',
  'flask charges gained': 'FlaskChargesGained',
  'flask charges used': 'FlaskChargesUsed',
  'flask life recovery rate': 'FlaskLifeRecoveryRate',
  'flask mana recovery rate': 'FlaskManaRecoveryRate',
  // Minion
  'minion damage': { name: 'Damage', addToMinion: true },
  'minion life': { name: 'Life', addToMinion: true },
  'minion movement speed': { name: 'MovementSpeed', addToMinion: true },
  'minion attack speed': { name: 'Speed', flags: ModFlag.Attack, addToMinion: true },
  'minion cast speed': { name: 'Speed', flags: ModFlag.Spell, addToMinion: true },
  'minion maximum life': { name: 'Life', addToMinion: true },
  'minion duration': { name: 'Duration', keywordFlags: KeywordFlag.Minion },
  // Charges
  'maximum power charges': 'PowerChargesMax',
  'maximum frenzy charges': 'FrenzyChargesMax',
  'maximum endurance charges': 'EnduranceChargesMax',
  'minimum power charges': 'PowerChargesMin',
  'minimum frenzy charges': 'FrenzyChargesMin',
  'minimum endurance charges': 'EnduranceChargesMin',
  'maximum number of power charges': 'PowerChargesMax',
  'maximum number of frenzy charges': 'FrenzyChargesMax',
  'maximum number of endurance charges': 'EnduranceChargesMax',
  // Gem
  'level of all skill gems': 'GemLevel',
  'level of all fire skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Fire },
  'level of all cold skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Cold },
  'level of all lightning skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Lightning },
  'level of all chaos skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Chaos },
  'level of all physical skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Physical },
  'level of all spell skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Spell },
};

// Sorted by length (longest first) for greedy matching
const modNameKeys = Object.keys(modNameList).sort((a, b) => b.length - a.length);

// --- Damage type map ---
const dmgTypes = {
  'physical': 'Physical',
  'fire': 'Fire',
  'cold': 'Cold',
  'lightning': 'Lightning',
  'chaos': 'Chaos',
};

// --- Penetration types ---
const penTypes = {
  'fire': 'FirePenetration',
  'cold': 'ColdPenetration',
  'lightning': 'LightningPenetration',
  'elemental': 'ElementalPenetration',
  'chaos': 'ChaosPenetration',
  'non-chaos elemental': 'ElementalPenetration',
};
const penTypeKeys = Object.keys(penTypes).sort((a, b) => b.length - a.length);

// --- Regen types ---
const regenTypes = {
  'life': 'LifeRegen',
  'mana': 'ManaRegen',
  'energy shield': 'EnergyShieldRegen',
};

// --- Mod flag list (post-fix flags) ---
const modFlagList = {
  'with attacks': { keywordFlags: KeywordFlag.Attack },
  'for attacks': { flags: ModFlag.Attack },
  'with spells': { keywordFlags: KeywordFlag.Spell },
  'for spells': { flags: ModFlag.Spell },
  'with hits': { keywordFlags: KeywordFlag.Hit },
  'with hits and ailments': { keywordFlags: KeywordFlag.Hit | KeywordFlag.Ailment },
  'with ailments': { flags: ModFlag.Ailment },
  'melee': { flags: ModFlag.Melee },
  'with melee attacks': { flags: ModFlag.Melee },
  'spell': { flags: ModFlag.Spell },
  'with axes': { flags: ModFlag.Axe | ModFlag.Hit },
  'with bows': { flags: ModFlag.Bow | ModFlag.Hit },
  'with claws': { flags: ModFlag.Claw | ModFlag.Hit },
  'with daggers': { flags: ModFlag.Dagger | ModFlag.Hit },
  'with maces': { flags: ModFlag.Mace | ModFlag.Hit },
  'with staves': { flags: ModFlag.Staff | ModFlag.Hit },
  'with swords': { flags: ModFlag.Sword | ModFlag.Hit },
  'with wands': { flags: ModFlag.Wand | ModFlag.Hit },
  'with one handed weapons': { flags: ModFlag.Weapon1H | ModFlag.Hit },
  'with two handed weapons': { flags: ModFlag.Weapon2H | ModFlag.Hit },
  'while dual wielding': { tag: { type: 'Condition', var: 'DualWielding' } },
  'while holding a shield': { tag: { type: 'Condition', var: 'UsingShield' } },
  'while wielding a staff': { tag: { type: 'Condition', var: 'UsingStaff' } },
  'global': { tag: { type: 'Global' } },
  'on critical strike': { tag: { type: 'Condition', var: 'CriticalStrike' } },
};
const modFlagKeys = Object.keys(modFlagList).sort((a, b) => b.length - a.length);

// --- Scan function ---
// Finds the best (earliest, longest) matching pattern in a text
function scanPlain(line, keys, map) {
  const lower = line.toLowerCase();
  let bestIndex = -1;
  let bestEnd = -1;
  let bestKey = null;

  for (const key of keys) {
    const idx = lower.indexOf(key);
    if (idx !== -1) {
      const end = idx + key.length;
      if (bestKey === null || idx < bestIndex || (idx === bestIndex && end > bestEnd)) {
        bestIndex = idx;
        bestEnd = end;
        bestKey = key;
      }
    }
  }

  if (bestKey !== null) {
    const remaining = line.substring(0, bestIndex) + line.substring(bestEnd);
    return [map[bestKey], remaining.trim()];
  }
  return [null, line];
}

// --- Main parseMod function ---
const cache = {};

export function parseMod(line) {
  if (cache[line]) return cache[line];

  const result = parseModInternal(line);
  cache[line] = result;
  return result;
}

function parseModInternal(line) {
  let workLine = line.trim();
  if (!workLine) return null;

  const lineLower = workLine.toLowerCase();

  // Append space for matching (like Lua version)
  workLine = workLine + ' ';

  // Scan for form
  let formType = null;
  let formCaps = [];
  let remaining = workLine;

  const formLower = remaining.toLowerCase();
  for (const [regex, form] of formList) {
    const match = formLower.match(regex);
    if (match) {
      formType = form;
      formCaps = match.slice(1);
      // Remove matched portion
      remaining = remaining.substring(0, match.index) + remaining.substring(match.index + match[0].length);
      break;
    }
  }

  if (!formType) return null;

  // Handle damage forms specially
  if (formType === 'DMG' || formType === 'DMGATTACKS' || formType === 'DMGSPELLS' || formType === 'DMGBOTH') {
    const dmgType = dmgTypes[formCaps[2] ? formCaps[2].toLowerCase() : ''];
    if (!dmgType) return null;
    const min = Number(formCaps[0]);
    const max = Number(formCaps[1]);
    let keywordFlags = 0;
    if (formType === 'DMGATTACKS') keywordFlags = KeywordFlag.Attack;
    else if (formType === 'DMGSPELLS') keywordFlags = KeywordFlag.Spell;
    else if (formType === 'DMGBOTH') keywordFlags = KeywordFlag.Attack | KeywordFlag.Spell;
    return [
      { name: dmgType + 'Min', type: 'BASE', value: min, flags: 0, keywordFlags, tags: [] },
      { name: dmgType + 'Max', type: 'BASE', value: max, flags: 0, keywordFlags, tags: [] },
    ];
  }

  // Handle PEN form
  if (formType === 'PEN') {
    const penValue = Number(formCaps[0]);
    const penLower = remaining.toLowerCase().trim();
    for (const key of penTypeKeys) {
      if (penLower.includes(key)) {
        return [{ name: penTypes[key], type: 'BASE', value: penValue, flags: 0, keywordFlags: 0, tags: [] }];
      }
    }
    return null;
  }

  // Handle regen forms
  if (formType === 'REGENFLAT' || formType === 'REGENPERCENT') {
    const regenValue = Number(formCaps[0]);
    const regenText = (formCaps[1] || '').toLowerCase().trim();
    for (const key in regenTypes) {
      if (regenText.includes(key)) {
        const suffix = formType === 'REGENPERCENT' ? 'Percent' : '';
        return [{ name: regenTypes[key] + suffix, type: 'BASE', value: regenValue, flags: 0, keywordFlags: 0, tags: [] }];
      }
    }
    return null;
  }

  // Determine value and type
  let modValue = Number(formCaps[0]) || 0;
  let modType = 'BASE';

  if (formType === 'INC') {
    modType = 'INC';
  } else if (formType === 'RED') {
    modValue = -modValue;
    modType = 'INC';
  } else if (formType === 'MORE') {
    modType = 'MORE';
  } else if (formType === 'LESS') {
    modValue = -modValue;
    modType = 'MORE';
  } else if (formType === 'FLAG') {
    modType = 'FLAG';
    modValue = true;
  } else if (formType === 'CHANCE') {
    // Keep as BASE
  }

  // Scan for mod name
  const [modNameEntry, afterName] = scanPlain(remaining, modNameKeys, modNameList);
  if (!modNameEntry) return null;
  remaining = afterName;

  // Resolve mod name entry
  let modNames;
  let extraFlags = 0;
  let extraKeywordFlags = 0;
  let extraTags = [];
  let addToMinion = false;

  if (typeof modNameEntry === 'string') {
    modNames = [modNameEntry];
  } else if (Array.isArray(modNameEntry)) {
    modNames = modNameEntry;
  } else if (typeof modNameEntry === 'object') {
    modNames = [modNameEntry.name];
    extraFlags = modNameEntry.flags || 0;
    extraKeywordFlags = modNameEntry.keywordFlags || 0;
    if (modNameEntry.tag) extraTags.push(modNameEntry.tag);
    if (modNameEntry.addToMinion) addToMinion = true;
  }

  // Scan for post-fix flags
  const [flagEntry] = scanPlain(remaining, modFlagKeys, modFlagList);
  if (flagEntry) {
    extraFlags |= flagEntry.flags || 0;
    extraKeywordFlags |= flagEntry.keywordFlags || 0;
    if (flagEntry.tag) extraTags.push(flagEntry.tag);
  }

  // Build mod list
  const modList = [];
  for (const name of modNames) {
    const mod = {
      name,
      type: modType,
      value: modValue,
      flags: extraFlags,
      keywordFlags: extraKeywordFlags,
      tags: [...extraTags],
    };

    if (addToMinion) {
      modList.push({
        name: 'MinionModifier',
        type: 'LIST',
        value: { mod },
        flags: 0,
        keywordFlags: 0,
        tags: [],
      });
    } else {
      modList.push(mod);
    }
  }

  return modList.length > 0 ? modList : null;
}
