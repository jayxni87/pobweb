// PoBWeb - Utility library (port of Common.lua + Data/Global.lua)

// --- Core utility functions ---

export function round(val, dec) {
  if (dec !== undefined) {
    const mult = 10 ** dec;
    return Math.floor(val * mult + 0.5) / mult;
  }
  return Math.floor(val + 0.5);
}

export function floor(val, dec) {
  if (dec !== undefined) {
    const mult = 10 ** dec;
    return Math.floor(val * mult + 0.0001) / mult;
  }
  return Math.floor(val);
}

export function copyTable(tbl, noRecurse) {
  if (Array.isArray(tbl)) {
    if (noRecurse) return [...tbl];
    return tbl.map(v => (v && typeof v === 'object') ? copyTable(v) : v);
  }
  const out = {};
  for (const k in tbl) {
    if (!Object.prototype.hasOwnProperty.call(tbl, k)) continue;
    const v = tbl[k];
    if (!noRecurse && v && typeof v === 'object') {
      out[k] = copyTable(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function wipeTable(tbl) {
  if (!tbl) return {};
  for (const k in tbl) {
    if (Object.prototype.hasOwnProperty.call(tbl, k)) {
      delete tbl[k];
    }
  }
  return tbl;
}

export function isValueInTable(tbl, val) {
  for (const k in tbl) {
    if (tbl[k] === val) return k;
  }
  return undefined;
}

export function isValueInArray(arr, val) {
  const idx = arr.indexOf(val);
  return idx !== -1 ? idx : undefined;
}

export function stripEscapes(text) {
  return text.replace(/\^\d/g, '').replace(/\^x[0-9a-fA-F]{6}/g, '');
}

export function triangular(n) {
  return n * (n + 1) / 2;
}

// --- Color codes ---

export const colorCodes = {
  NORMAL: '^xC8C8C8',
  MAGIC: '^x8888FF',
  RARE: '^xFFFF77',
  UNIQUE: '^xAF6025',
  RELIC: '^x60C060',
  GEM: '^x1AA29B',
  PROPHECY: '^xB54BFF',
  CURRENCY: '^xAA9E82',
  CRAFTED: '^xB8DAF1',
  CUSTOM: '^x5CF0BB',
  SOURCE: '^x88FFFF',
  UNSUPPORTED: '^xF05050',
  WARNING: '^xFF9922',
  TIP: '^x80A080',
  FIRE: '^xB97123',
  COLD: '^x3F6DB3',
  LIGHTNING: '^xADAA47',
  CHAOS: '^xD02090',
  POSITIVE: '^x33FF77',
  NEGATIVE: '^xDD0022',
  HIGHLIGHT: '^xFF0000',
  OFFENCE: '^xE07030',
  DEFENCE: '^x8080E0',
  SCION: '^xFFF0F0',
  MARAUDER: '^xE05030',
  RANGER: '^x70FF70',
  WITCH: '^x7070FF',
  DUELIST: '^xE0E070',
  TEMPLAR: '^xC040FF',
  SHADOW: '^x30C0D0',
  MAINHAND: '^x50FF50',
  OFFHAND: '^xB7B7FF',
  SHAPER: '^x55BBFF',
  ELDER: '^xAA77CC',
  FRACTURED: '^xA29160',
  CRUCIBLE: '^xFFA500',
};
colorCodes.STRENGTH = colorCodes.MARAUDER;
colorCodes.DEXTERITY = colorCodes.RANGER;
colorCodes.INTELLIGENCE = colorCodes.WITCH;
colorCodes.LIFE = colorCodes.MARAUDER;
colorCodes.MANA = colorCodes.WITCH;
colorCodes.ES = colorCodes.SOURCE;
colorCodes.WARD = colorCodes.RARE;
colorCodes.ARMOUR = colorCodes.NORMAL;
colorCodes.EVASION = colorCodes.POSITIVE;
colorCodes.RAGE = colorCodes.WARNING;
colorCodes.PHYS = colorCodes.NORMAL;

// --- ModFlag ---

export const ModFlag = {
  // Damage modes
  Attack:       0x00000001,
  Spell:        0x00000002,
  Hit:          0x00000004,
  Dot:          0x00000008,
  Cast:         0x00000010,
  // Damage sources
  Melee:        0x00000100,
  Area:         0x00000200,
  Projectile:   0x00000400,
  SourceMask:   0x00000600,
  Ailment:      0x00000800,
  MeleeHit:     0x00001000,
  Weapon:       0x00002000,
  // Weapon types
  Axe:          0x00010000,
  Bow:          0x00020000,
  Claw:         0x00040000,
  Dagger:       0x00080000,
  Mace:         0x00100000,
  Staff:        0x00200000,
  Sword:        0x00400000,
  Wand:         0x00800000,
  Unarmed:      0x01000000,
  Fishing:      0x02000000,
  // Weapon classes
  WeaponMelee:  0x04000000,
  WeaponRanged: 0x08000000,
  Weapon1H:     0x10000000,
  Weapon2H:     0x20000000,
  WeaponMask:   0x2FFF0000,
};

// --- KeywordFlag ---

export const KeywordFlag = {
  // Skill keywords
  Aura:         0x00000001,
  Curse:        0x00000002,
  Warcry:       0x00000004,
  Movement:     0x00000008,
  Physical:     0x00000010,
  Fire:         0x00000020,
  Cold:         0x00000040,
  Lightning:    0x00000080,
  Chaos:        0x00000100,
  Vaal:         0x00000200,
  Bow:          0x00000400,
  Arrow:        0x00000800,
  // Skill types
  Trap:         0x00001000,
  Mine:         0x00002000,
  Totem:        0x00004000,
  Minion:       0x00008000,
  Attack:       0x00010000,
  Spell:        0x00020000,
  Hit:          0x00040000,
  Ailment:      0x00080000,
  Brand:        0x00100000,
  // Other effects
  Poison:       0x00200000,
  Bleed:        0x00400000,
  Ignite:       0x00800000,
  // Damage over Time types
  PhysicalDot:  0x01000000,
  LightningDot: 0x02000000,
  ColdDot:      0x04000000,
  FireDot:      0x08000000,
  ChaosDot:     0x10000000,
  // Match behavior
  MatchAll:     0x40000000,
};

const MatchAllMask = ~KeywordFlag.MatchAll;

export function MatchKeywordFlags(keywordFlags, modKeywordFlags) {
  const matchAll = (modKeywordFlags & KeywordFlag.MatchAll) !== 0;
  const modMasked = modKeywordFlags & MatchAllMask;
  const keywordMasked = keywordFlags & MatchAllMask;

  if (matchAll) {
    return (keywordMasked & modMasked) === modMasked;
  }
  return (modMasked === 0) || ((keywordMasked & modMasked) !== 0);
}

// --- Damage and ailment type lists ---

export const dmgTypeList = ['Physical', 'Lightning', 'Cold', 'Fire', 'Chaos'];

export const ailmentTypeList = ['Bleed', 'Poison', 'Ignite', 'Chill', 'Freeze', 'Shock', 'Scorch', 'Brittle', 'Sap'];

// --- SkillType (from ActiveSkillType.dat) ---

export const SkillType = {
  Attack: 1,
  Spell: 2,
  Projectile: 3,
  DualWieldOnly: 4,
  Buff: 5,
  MainHandOnly: 7,
  Minion: 9,
  Damage: 10,
  Area: 11,
  Duration: 12,
  RequiresShield: 13,
  ProjectileSpeed: 14,
  HasReservation: 15,
  ReservationBecomesCost: 16,
  Trappable: 17,
  Totemable: 18,
  Mineable: 19,
  ElementalStatus: 20,
  MinionsCanExplode: 21,
  Chains: 23,
  Melee: 24,
  MeleeSingleTarget: 25,
  Multicastable: 26,
  TotemCastsAlone: 27,
  Multistrikeable: 28,
  CausesBurning: 29,
  SummonsTotem: 30,
  TotemCastsWhenNotDetached: 31,
  Fire: 32,
  Cold: 33,
  Lightning: 34,
  Triggerable: 35,
  Trapped: 36,
  Movement: 37,
  DamageOverTime: 39,
  RemoteMined: 40,
  Triggered: 41,
  Vaal: 42,
  Aura: 43,
  CanTargetUnusableCorpse: 45,
  RangedAttack: 47,
  Chaos: 49,
  FixedSpeedProjectile: 50,
  ThresholdJewelArea: 52,
  ThresholdJewelProjectile: 53,
  ThresholdJewelDuration: 54,
  ThresholdJewelRangedAttack: 55,
  Channel: 57,
  DegenOnlySpellDamage: 58,
  InbuiltTrigger: 60,
  Golem: 61,
  Herald: 62,
  AuraAffectsEnemies: 63,
  NoRuthless: 64,
  ThresholdJewelSpellDamage: 65,
  Cascadable: 66,
  ProjectilesFromUser: 67,
  MirageArcherCanUse: 68,
  ProjectileSpiral: 69,
  SingleMainProjectile: 70,
  MinionsPersistWhenSkillRemoved: 71,
  ProjectileNumber: 72,
  Warcry: 73,
  Instant: 74,
  Brand: 75,
  DestroysCorpse: 76,
  NonHitChill: 77,
  ChillingArea: 78,
  AppliesCurse: 79,
  CanRapidFire: 80,
  AuraDuration: 81,
  AreaSpell: 82,
  OR: 83,
  AND: 84,
  NOT: 85,
  Physical: 86,
  AppliesMaim: 87,
  CreatesMinion: 88,
  Guard: 89,
  Travel: 90,
  Blink: 91,
  CanHaveBlessing: 92,
  ProjectilesNotFromUser: 93,
  AttackInPlaceIsDefault: 94,
  Nova: 95,
  InstantNoRepeatWhenHeld: 96,
  InstantShiftAttackForLeftMouse: 97,
  AuraNotOnCaster: 98,
  Banner: 99,
  Rain: 100,
  Cooldown: 101,
  ThresholdJewelChaining: 102,
  Slam: 103,
  Stance: 104,
  NonRepeatable: 105,
  OtherThingUsesSkill: 106,
  Steel: 107,
  Hex: 108,
  Mark: 109,
  Aegis: 110,
  Orb: 111,
  KillNoDamageModifiers: 112,
  RandomElement: 113,
  LateConsumeCooldown: 114,
  Arcane: 115,
  FixedCastTime: 116,
  RequiresOffHandNotWeapon: 117,
  Link: 118,
  Blessing: 119,
  ZeroReservation: 120,
  DynamicCooldown: 121,
  Microtransaction: 122,
  OwnerCannotUse: 123,
  ProjectilesNotFired: 124,
  TotemsAreBallistae: 125,
  SkillGrantedBySupport: 126,
  PreventHexTransfer: 127,
  MinionsAreUndamageable: 128,
  InnateTrauma: 129,
  DualWieldRequiresDifferentTypes: 130,
  NoVolley: 131,
  Retaliation: 132,
  NeverExertable: 133,
  DisallowTriggerSupports: 134,
  ProjectileCannotReturn: 135,
  Offering: 136,
  SupportedByBane: 137,
  WandAttack: 138,
};
