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
  'aura effect': 'AuraEffect',
  'effect of non-curse auras from your skills': 'AuraEffect',
  'effect of auras on you': 'AuraEffectOnSelf',
  'effect of your curses': 'CurseEffect',
  'curse effect': 'CurseEffect',
  'effect of your marks': { name: 'CurseEffect', tag: { type: 'SkillType', skillType: SkillType.Mark } },
  'effect of arcane surge on you': 'ArcaneSurgeEffect',
  'curse duration': { name: 'Duration', keywordFlags: KeywordFlag.Curse },
  'radius of auras': { name: 'AreaOfEffect', keywordFlags: KeywordFlag.Aura },
  'radius of curses': { name: 'AreaOfEffect', keywordFlags: KeywordFlag.Curse },
  'effect of buffs on you': 'BuffEffectOnSelf',
  'warcry effect': { name: 'BuffEffect', keywordFlags: KeywordFlag.Warcry },
  'maximum rage': 'MaximumRage',
  'rage effect': 'RageEffect',
  'maximum fortification': 'MaximumFortification',
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
  'maximum power charge': 'PowerChargesMax',
  'maximum power charges': 'PowerChargesMax',
  'minimum power charge': 'PowerChargesMin',
  'minimum power charges': 'PowerChargesMin',
  'power charge duration': 'PowerChargesDuration',
  'maximum frenzy charge': 'FrenzyChargesMax',
  'maximum frenzy charges': 'FrenzyChargesMax',
  'minimum frenzy charge': 'FrenzyChargesMin',
  'minimum frenzy charges': 'FrenzyChargesMin',
  'frenzy charge duration': 'FrenzyChargesDuration',
  'maximum endurance charge': 'EnduranceChargesMax',
  'maximum endurance charges': 'EnduranceChargesMax',
  'minimum endurance charge': 'EnduranceChargesMin',
  'minimum endurance charges': 'EnduranceChargesMin',
  'endurance charge duration': 'EnduranceChargesDuration',
  'minimum endurance, frenzy and power charges': ['PowerChargesMin', 'FrenzyChargesMin', 'EnduranceChargesMin'],
  'maximum frenzy charges and maximum power charges': ['FrenzyChargesMax', 'PowerChargesMax'],
  'maximum power charges and maximum endurance charges': ['PowerChargesMax', 'EnduranceChargesMax'],
  'maximum endurance, frenzy and power charges': ['EnduranceChargesMax', 'PowerChargesMax', 'FrenzyChargesMax'],
  'endurance, frenzy and power charge duration': ['PowerChargesDuration', 'FrenzyChargesDuration', 'EnduranceChargesDuration'],
  'maximum number of power charges': 'PowerChargesMax',
  'maximum number of frenzy charges': 'FrenzyChargesMax',
  'maximum number of endurance charges': 'EnduranceChargesMax',
  'charge duration': 'ChargeDuration',
  // On hit/kill/leech
  'life gained on kill': 'LifeOnKill',
  'life per enemy killed': 'LifeOnKill',
  'life on kill': 'LifeOnKill',
  'life per enemy hit': { name: 'LifeOnHit', flags: ModFlag.Hit },
  'life gained for each enemy hit': { name: 'LifeOnHit', flags: ModFlag.Hit },
  'life for each enemy hit': { name: 'LifeOnHit', flags: ModFlag.Hit },
  'mana gained on kill': 'ManaOnKill',
  'mana per enemy killed': 'ManaOnKill',
  'mana on kill': 'ManaOnKill',
  'mana per enemy hit': { name: 'ManaOnHit', flags: ModFlag.Hit },
  'mana gained for each enemy hit': { name: 'ManaOnHit', flags: ModFlag.Hit },
  'energy shield gained on kill': 'EnergyShieldOnKill',
  'energy shield on kill': 'EnergyShieldOnKill',
  'energy shield per enemy hit': { name: 'EnergyShieldOnHit', flags: ModFlag.Hit },
  'life leeched per second': 'LifeLeechRate',
  'mana leeched per second': 'ManaLeechRate',
  'total recovery per second from life leech': 'LifeLeechRate',
  'recovery per second from life leech': 'LifeLeechRate',
  'total recovery per second from energy shield leech': 'EnergyShieldLeechRate',
  'recovery per second from energy shield leech': 'EnergyShieldLeechRate',
  'total recovery per second from mana leech': 'ManaLeechRate',
  'recovery per second from mana leech': 'ManaLeechRate',
  'maximum recovery per life leech': 'MaxLifeLeechInstance',
  'maximum recovery per energy shield leech': 'MaxEnergyShieldLeechInstance',
  'maximum recovery per mana leech': 'MaxManaLeechInstance',
  'maximum total recovery per second from life leech': 'MaxLifeLeechRate',
  'maximum total life recovery per second from leech': 'MaxLifeLeechRate',
  'maximum total recovery per second from energy shield leech': 'MaxEnergyShieldLeechRate',
  'maximum total energy shield recovery per second from leech': 'MaxEnergyShieldLeechRate',
  'maximum total recovery per second from mana leech': 'MaxManaLeechRate',
  'maximum total mana recovery per second from leech': 'MaxManaLeechRate',
  'to impale enemies on hit': 'ImpaleChance',
  'impale effect': 'ImpaleEffect',
  'effect of impales you inflict': 'ImpaleEffect',
  // Projectile modifiers
  'projectile': 'ProjectileCount',
  'projectiles': 'ProjectileCount',
  'arrow': { name: 'ProjectileCount', keywordFlags: KeywordFlag.Arrow },
  'arrows': { name: 'ProjectileCount', keywordFlags: KeywordFlag.Arrow },
  'chain ': 'ChainCountMax',
  // Totem/trap/mine/brand modifiers
  'totem placement speed': 'TotemPlacementSpeed',
  'totem life': 'TotemLife',
  'totem duration': 'TotemDuration',
  'maximum number of summoned totems': 'ActiveTotemLimit',
  'trap throwing speed': 'TrapThrowingSpeed',
  'trap and mine throwing speed': ['TrapThrowingSpeed', 'MineLayingSpeed'],
  'trap trigger area of effect': 'TrapTriggerAreaOfEffect',
  'trap duration': 'TrapDuration',
  'cooldown recovery speed for throwing traps': { name: 'CooldownRecovery', keywordFlags: KeywordFlag.Trap },
  'cooldown recovery rate for throwing traps': { name: 'CooldownRecovery', keywordFlags: KeywordFlag.Trap },
  'mine laying speed': 'MineLayingSpeed',
  'mine throwing speed': 'MineLayingSpeed',
  'mine detonation area of effect': 'MineDetonationAreaOfEffect',
  'mine duration': 'MineDuration',
  'activation frequency': 'BrandActivationFrequency',
  'brand activation frequency': 'BrandActivationFrequency',
  'brand attachment range': 'BrandAttachmentRange',
  // Minion modifiers
  'maximum number of skeletons': 'ActiveSkeletonLimit',
  'maximum number of summoned skeletons': 'ActiveSkeletonLimit',
  'maximum number of zombies': 'ActiveZombieLimit',
  'maximum number of raised zombies': 'ActiveZombieLimit',
  'number of zombies allowed': 'ActiveZombieLimit',
  'maximum number of spectres': 'ActiveSpectreLimit',
  'maximum number of raised spectres': 'ActiveSpectreLimit',
  'maximum number of golems': 'ActiveGolemLimit',
  'maximum number of summoned golems': 'ActiveGolemLimit',
  'maximum number of animated weapons': 'ActiveAnimatedWeaponLimit',
  'maximum number of summoned raging spirits': 'ActiveRagingSpiritLimit',
  'maximum number of raging spirits': 'ActiveRagingSpiritLimit',
  'maximum number of raised spiders': 'ActiveSpiderLimit',
  'maximum number of summoned reapers': 'ActiveReaperLimit',
  'maximum number of summoned phantasms': 'ActivePhantasmLimit',
  'maximum number of summoned holy relics': 'ActiveHolyRelicLimit',
  'minion duration': { name: 'Duration', keywordFlags: KeywordFlag.Minion },
  // Ailment chances
  'to shock': 'EnemyShockChance',
  'shock chance': 'EnemyShockChance',
  'to freeze': 'EnemyFreezeChance',
  'freeze chance': 'EnemyFreezeChance',
  'to ignite': 'EnemyIgniteChance',
  'ignite chance': 'EnemyIgniteChance',
  'to freeze, shock and ignite': ['EnemyFreezeChance', 'EnemyShockChance', 'EnemyIgniteChance'],
  'to scorch enemies': 'EnemyScorchChance',
  'to inflict brittle': 'EnemyBrittleChance',
  'to sap enemies': 'EnemySapChance',
  // Ailment effects
  'effect of shock': 'EnemyShockEffect',
  'effect of shock you inflict': 'EnemyShockEffect',
  'effect of shocks you inflict': 'EnemyShockEffect',
  'effect of chill': 'EnemyChillEffect',
  'chill effect': 'EnemyChillEffect',
  'effect of chill you inflict': 'EnemyChillEffect',
  'effect of non-damaging ailments': ['EnemyShockEffect', 'EnemyChillEffect', 'EnemyFreezeEffect', 'EnemyScorchEffect', 'EnemyBrittleEffect', 'EnemySapEffect'],
  'effect of non-damaging ailments you inflict': ['EnemyShockEffect', 'EnemyChillEffect', 'EnemyFreezeEffect', 'EnemyScorchEffect', 'EnemyBrittleEffect', 'EnemySapEffect'],
  // Ailment durations
  'shock duration': 'EnemyShockDuration',
  'freeze duration': 'EnemyFreezeDuration',
  'chill duration': 'EnemyChillDuration',
  'ignite duration': 'EnemyIgniteDuration',
  'duration of elemental ailments': 'EnemyElementalAilmentDuration',
  'duration of ailments': 'EnemyAilmentDuration',
  'duration of ailments you inflict': 'EnemyAilmentDuration',
  // Poison/Bleed
  'to poison': 'PoisonChance',
  'to cause poison': 'PoisonChance',
  'to poison on hit': 'PoisonChance',
  'poison duration': 'EnemyPoisonDuration',
  'duration of poisons you inflict': 'EnemyPoisonDuration',
  'to cause bleeding': 'BleedChance',
  'to cause bleeding on hit': 'BleedChance',
  'to inflict bleeding': 'BleedChance',
  'to inflict bleeding on hit': 'BleedChance',
  'to bleed': 'BleedChance',
  'bleed duration': 'EnemyBleedDuration',
  'bleeding duration': 'EnemyBleedDuration',
  // Other skill modifiers
  'radius': 'AreaOfEffect',
  'radius of area skills': 'AreaOfEffect',
  'duration': 'Duration',
  'cooldown recovery': 'CooldownRecovery',
  'cooldown recovery speed': 'CooldownRecovery',
  'cooldown recovery rate': 'CooldownRecovery',
  'weapon range': 'WeaponRange',
  'melee range': 'MeleeWeaponRange',
  'melee weapon range': 'MeleeWeaponRange',
  'melee strike range': ['MeleeWeaponRange', 'UnarmedRange'],
  'to deal double damage': 'DoubleDamageChance',
  'to deal triple damage': 'TripleDamageChance',
  // Buffs
  'onslaught effect': 'OnslaughtEffect',
  'effect of onslaught on you': 'OnslaughtEffect',
  'effect of tailwind on you': 'TailwindEffectOnSelf',
  'elusive effect': 'ElusiveEffect',
  'effect of elusive on you': 'ElusiveEffect',
  // Buff conditions (FLAG form)
  'onslaught': 'Condition:Onslaught',
  'phasing': 'Condition:Phasing',
  'arcane surge': 'Condition:ArcaneSurge',
  'unholy might': 'Condition:UnholyMight',
  'elusive': 'Condition:CanBeElusive',
  'adrenaline': 'Condition:Adrenaline',
  'rampage': 'Condition:Rampage',
  // Flask expanded
  'effect of flasks': 'FlaskEffect',
  'amount recovered': 'FlaskRecovery',
  'life recovered': 'FlaskRecovery',
  'life recovery from flasks': 'FlaskLifeRecovery',
  'mana recovery from flasks': 'FlaskManaRecovery',
  'life and mana recovery from flasks': ['FlaskLifeRecovery', 'FlaskManaRecovery'],
  'recovery speed': 'FlaskRecoveryRate',
  'recovery rate': 'FlaskRecoveryRate',
  'flask recovery rate': 'FlaskRecoveryRate',
  'flask recovery speed': 'FlaskRecoveryRate',
  'extra charges': 'FlaskCharges',
  'maximum charges': 'FlaskCharges',
  'charges used': 'FlaskChargesUsed',
  'charges per use': 'FlaskChargesUsed',
  // Misc
  'action speed': 'ActionSpeed',
  'strength requirement': 'StrRequirement',
  'dexterity requirement': 'DexRequirement',
  'intelligence requirement': 'IntRequirement',
  'attribute requirements': ['StrRequirement', 'DexRequirement', 'IntRequirement'],
  'effect of socketed jewels': 'SocketedJewelEffect',
  'effect of socketed abyss jewels': 'SocketedJewelEffect',
  'to inflict fire exposure on hit': 'FireExposureChance',
  'to inflict cold exposure on hit': 'ColdExposureChance',
  'to inflict lightning exposure on hit': 'LightningExposureChance',
  // Gem
  'level of all skill gems': 'GemLevel',
  'level of all fire skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Fire },
  'level of all cold skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Cold },
  'level of all lightning skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Lightning },
  'level of all chaos skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Chaos },
  'level of all physical skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Physical },
  'level of all spell skill gems': { name: 'GemLevel', keywordFlags: KeywordFlag.Spell },
  // Damage over time specifics
  'physical damage over time': { name: 'PhysicalDamage', keywordFlags: KeywordFlag.PhysicalDot },
  'cold damage over time': { name: 'ColdDamage', keywordFlags: KeywordFlag.ColdDot },
  'chaos damage over time': { name: 'ChaosDamage', keywordFlags: KeywordFlag.ChaosDot },
  'damage with ignite': { name: 'Damage', keywordFlags: KeywordFlag.Ignite },
  'damage with ignites': { name: 'Damage', keywordFlags: KeywordFlag.Ignite },
  'damage with bleed': { name: 'Damage', keywordFlags: KeywordFlag.Bleed },
  'damage with bleeding': { name: 'Damage', keywordFlags: KeywordFlag.Bleed },
  'damage with poison': { name: 'Damage', keywordFlags: KeywordFlag.Poison },
  // Damage taken expanded
  'damage over time taken': 'DamageTakenOverTime',
  'damage taken from damage over time': 'DamageTakenOverTime',
  'attack damage taken': 'AttackDamageTaken',
  'spell damage taken': 'SpellDamageTaken',
  'physical damage from hits taken': 'PhysicalDamageFromHitsTaken',
  'physical damage taken when hit': 'PhysicalDamageTakenWhenHit',
  'physical damage taken from hits': 'PhysicalDamageTakenWhenHit',
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
  'unarmed': { flags: ModFlag.Unarmed | ModFlag.Hit },
  'with unarmed attacks': { flags: ModFlag.Unarmed | ModFlag.Hit },
  'with melee weapons': { flags: ModFlag.WeaponMelee },
  'with one handed melee weapons': { flags: ModFlag.Weapon1H | ModFlag.WeaponMelee | ModFlag.Hit },
  'with two handed melee weapons': { flags: ModFlag.Weapon2H | ModFlag.WeaponMelee | ModFlag.Hit },
  'with ranged weapons': { flags: ModFlag.WeaponRanged | ModFlag.Hit },
  // Skill types
  'for spells': { flags: ModFlag.Spell },
  'for spell damage': { flags: ModFlag.Spell },
  'with spell damage': { flags: ModFlag.Spell },
  'with spell skills': { keywordFlags: KeywordFlag.Spell },
  'by spells': { keywordFlags: KeywordFlag.Spell },
  'by attacks': { keywordFlags: KeywordFlag.Attack },
  'with attack skills': { keywordFlags: KeywordFlag.Attack },
  'for attacks': { flags: ModFlag.Attack },
  'for attack damage': { flags: ModFlag.Attack },
  'weapon': { flags: ModFlag.Weapon },
  'with weapons': { flags: ModFlag.Weapon },
  'on melee hit': { flags: ModFlag.Melee | ModFlag.Hit },
  'on hit': { flags: ModFlag.Hit },
  'with hits and ailments': { keywordFlags: KeywordFlag.Hit | KeywordFlag.Ailment },
  'with ailments': { flags: ModFlag.Ailment },
  'with ailments from attack skills': { flags: ModFlag.Ailment, keywordFlags: KeywordFlag.Attack },
  'with poison': { keywordFlags: KeywordFlag.Poison },
  'with bleeding': { keywordFlags: KeywordFlag.Bleed },
  'for ailments': { flags: ModFlag.Ailment },
  'for poison': { keywordFlags: KeywordFlag.Poison | KeywordFlag.MatchAll },
  'for bleeding': { keywordFlags: KeywordFlag.Bleed },
  'for ignite': { keywordFlags: KeywordFlag.Ignite },
  'against damage over time': { flags: ModFlag.Dot },
  'area': { flags: ModFlag.Area },
  // Trap/mine/totem/brand
  'mine': { keywordFlags: KeywordFlag.Mine },
  'with mines': { keywordFlags: KeywordFlag.Mine },
  'trap': { keywordFlags: KeywordFlag.Trap },
  'with traps': { keywordFlags: KeywordFlag.Trap },
  'for traps': { keywordFlags: KeywordFlag.Trap },
  'that place mines or throw traps': { keywordFlags: KeywordFlag.Mine | KeywordFlag.Trap },
  'that throw traps': { keywordFlags: KeywordFlag.Trap },
  'that throw mines': { keywordFlags: KeywordFlag.Mine },
  'brand': { keywordFlags: KeywordFlag.Brand },
  'totem': { keywordFlags: KeywordFlag.Totem },
  'with totem skills': { keywordFlags: KeywordFlag.Totem },
  'for skills used by totems': { keywordFlags: KeywordFlag.Totem },
  // Aura/curse/herald
  'of aura skills': { tag: { type: 'SkillType', skillType: SkillType.Aura } },
  'curse skills': { keywordFlags: KeywordFlag.Curse },
  'of curse skills': { keywordFlags: KeywordFlag.Curse },
  'with curse skills': { keywordFlags: KeywordFlag.Curse },
  'of herald skills': { tag: { type: 'SkillType', skillType: SkillType.Herald } },
  'with herald skills': { tag: { type: 'SkillType', skillType: SkillType.Herald } },
  'for curses': { keywordFlags: KeywordFlag.Curse },
  'warcry': { keywordFlags: KeywordFlag.Warcry },
  'vaal': { keywordFlags: KeywordFlag.Vaal },
  'vaal skill': { keywordFlags: KeywordFlag.Vaal },
  'with vaal skills': { keywordFlags: KeywordFlag.Vaal },
  'with movement skills': { keywordFlags: KeywordFlag.Movement },
  'of movement skills': { keywordFlags: KeywordFlag.Movement },
  // Element-specific skill flags
  'lightning skills': { keywordFlags: KeywordFlag.Lightning },
  'with lightning skills': { keywordFlags: KeywordFlag.Lightning },
  'with cold skills': { keywordFlags: KeywordFlag.Cold },
  'with fire skills': { keywordFlags: KeywordFlag.Fire },
  'with elemental skills': { keywordFlags: KeywordFlag.Lightning | KeywordFlag.Cold | KeywordFlag.Fire },
  'with chaos skills': { keywordFlags: KeywordFlag.Chaos },
  'with physical skills': { keywordFlags: KeywordFlag.Physical },
  // Minion postfix
  'minion': { addToMinion: true },
  // Slot-based
  'while dual wielding': { tag: { type: 'Condition', var: 'DualWielding' } },
  'while holding a shield': { tag: { type: 'Condition', var: 'UsingShield' } },
  'while wielding a staff': { tag: { type: 'Condition', var: 'UsingStaff' } },
  'from equipped shield': { tag: { type: 'SlotName', slotName: 'Weapon 2' } },
  'from body armour': { tag: { type: 'SlotName', slotName: 'Body Armour' } },
  'from your body armour': { tag: { type: 'SlotName', slotName: 'Body Armour' } },
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
