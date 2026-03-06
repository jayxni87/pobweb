// PoBWeb - CalcActiveSkill (port of Modules/CalcActiveSkill.lua)
// Active skill creation, support gem validation, modifier list building.

import { ModFlag, KeywordFlag, SkillType, copyTable } from './utils.js';

// Check if a support granted effect can support an active skill
export function canSupportActiveSkill(supportGrantedEffect, activeSkill) {
  const skillTypes = activeSkill.skillTypes;

  // Check excluded types
  if (supportGrantedEffect.excludeSkillTypes) {
    for (const type in supportGrantedEffect.excludeSkillTypes) {
      if (supportGrantedEffect.excludeSkillTypes[type] && skillTypes[type]) {
        return false;
      }
    }
  }

  // Check required types (at least one must be present)
  if (supportGrantedEffect.requireSkillTypes) {
    let hasRequired = false;
    for (const type in supportGrantedEffect.requireSkillTypes) {
      if (supportGrantedEffect.requireSkillTypes[type] && skillTypes[type]) {
        hasRequired = true;
        break;
      }
    }
    if (!hasRequired) return false;
  }

  return true;
}

// Create an active skill from an active effect and support list
export function createActiveSkill(activeEffect, supportList, actor) {
  const activeSkill = {
    activeEffect,
    supportList,
    actor,
    skillData: {},
    buffList: [],
    effectList: [activeEffect],
  };

  const activeGrantedEffect = activeEffect.grantedEffect;

  // Initialize skill types
  activeSkill.skillTypes = copyTable(activeGrantedEffect.skillTypes || {});

  // Initialize skill flags
  const skillFlags = copyTable(activeGrantedEffect.baseFlags || {});
  activeSkill.skillFlags = skillFlags;

  // Set hit flag for damage/attack/projectile skills
  skillFlags.hit = skillFlags.hit ||
    activeSkill.skillTypes[SkillType.Attack] ||
    activeSkill.skillTypes[SkillType.Damage] ||
    activeSkill.skillTypes[SkillType.Projectile] ||
    false;

  // Pass 1: Add skill types from compatible supports
  for (const supportEffect of supportList) {
    if (supportEffect.grantedEffect.support) {
      if (canSupportActiveSkill(supportEffect.grantedEffect, activeSkill)) {
        if (supportEffect.grantedEffect.addSkillTypes) {
          for (const skillType in supportEffect.grantedEffect.addSkillTypes) {
            activeSkill.skillTypes[skillType] = true;
          }
        }
      }
    }
  }

  // Pass 2: Add all compatible supports to effect list
  for (const supportEffect of supportList) {
    if (supportEffect.grantedEffect.support) {
      if (canSupportActiveSkill(supportEffect.grantedEffect, activeSkill)) {
        activeSkill.effectList.push(supportEffect);
        if (supportEffect.grantedEffect.addFlags) {
          for (const k in supportEffect.grantedEffect.addFlags) {
            skillFlags[k] = true;
          }
        }
      }
    }
  }

  return activeSkill;
}

// Build skill modifier flags from skill flags
export function buildSkillModFlags(skillFlags) {
  let flags = 0;
  if (skillFlags.hit) flags |= ModFlag.Hit;

  if (skillFlags.attack) {
    flags |= ModFlag.Attack;
  } else {
    flags |= ModFlag.Cast;
    if (skillFlags.spell) flags |= ModFlag.Spell;
  }

  if (skillFlags.melee) {
    flags |= ModFlag.Melee;
  } else if (skillFlags.projectile) {
    flags |= ModFlag.Projectile;
  }

  if (skillFlags.area) flags |= ModFlag.Area;

  return flags;
}

// Build skill keyword flags from skill flags and skill types
export function buildSkillKeywordFlags(skillFlags, skillTypes) {
  let kf = 0;

  if (skillFlags.hit) kf |= KeywordFlag.Hit;
  if (skillTypes[SkillType.Aura]) kf |= KeywordFlag.Aura;
  if (skillTypes[SkillType.AppliesCurse]) kf |= KeywordFlag.Curse;
  if (skillTypes[SkillType.Warcry]) kf |= KeywordFlag.Warcry;
  if (skillTypes[SkillType.Movement]) kf |= KeywordFlag.Movement;
  if (skillTypes[SkillType.Vaal]) kf |= KeywordFlag.Vaal;
  if (skillTypes[SkillType.Lightning]) kf |= KeywordFlag.Lightning;
  if (skillTypes[SkillType.Cold]) kf |= KeywordFlag.Cold;
  if (skillTypes[SkillType.Fire]) kf |= KeywordFlag.Fire;
  if (skillTypes[SkillType.Chaos]) kf |= KeywordFlag.Chaos;
  if (skillTypes[SkillType.Physical]) kf |= KeywordFlag.Physical;

  if (skillFlags.brand) kf |= KeywordFlag.Brand;
  if (skillFlags.arrow) kf |= KeywordFlag.Arrow;

  if (skillFlags.totem) {
    kf |= KeywordFlag.Totem;
  } else if (skillFlags.trap) {
    kf |= KeywordFlag.Trap;
  } else if (skillFlags.mine) {
    kf |= KeywordFlag.Mine;
  }

  if (skillTypes[SkillType.Attack]) kf |= KeywordFlag.Attack;
  if (skillTypes[SkillType.Spell] && !skillFlags.cast) kf |= KeywordFlag.Spell;

  return kf;
}

// Get weapon flags from weapon info
export function getWeaponFlags(weaponInfo, weaponType) {
  if (!weaponInfo) return 0;

  let flags = ModFlag[weaponInfo.flag] || 0;

  if (weaponType !== 'None') {
    flags |= ModFlag.Weapon;
    if (weaponInfo.oneHand) {
      flags |= ModFlag.Weapon1H;
    } else {
      flags |= ModFlag.Weapon2H;
    }
    if (weaponInfo.melee) {
      flags |= ModFlag.WeaponMelee;
    } else {
      flags |= ModFlag.WeaponRanged;
    }
  }

  return flags;
}

// Merge skill instance stats into a mod list using the stat map
export function mergeSkillInstanceMods(modList, stats, statMap, baseMods) {
  for (const stat in stats) {
    const statValue = stats[stat];
    const map = statMap[stat];
    if (!map) continue;

    for (const modOrGroup of map) {
      if (modOrGroup.name) {
        // Single mod
        const value = modOrGroup.value !== undefined && modOrGroup.value !== null
          ? modOrGroup.value
          : statValue * (modOrGroup.mult || 1) / (modOrGroup.div || 1) + (modOrGroup.base || 0);
        modList.newMod(modOrGroup.name, modOrGroup.type, value, 'Skill');
      } else if (Array.isArray(modOrGroup)) {
        // Group of mods sharing the same value
        const groupValue = modOrGroup.value !== undefined && modOrGroup.value !== null
          ? modOrGroup.value
          : statValue * (modOrGroup.mult || 1) / (modOrGroup.div || 1) + (modOrGroup.base || 0);
        for (const mod of modOrGroup) {
          if (mod.name) {
            modList.newMod(mod.name, mod.type, groupValue, 'Skill');
          }
        }
      }
    }
  }

  // Add base mods from granted effect
  if (baseMods) {
    for (const mod of baseMods) {
      modList.addMod(mod);
    }
  }
}
