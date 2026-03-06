// PoBWeb - CalcTriggers (port of trigger handling from CalcOffence.lua)
// Cooldown, trigger rate/time, skill duration calculations.

import { calcLib } from './calc-tools.js';

export const SERVER_TICK_RATE = 10000 / 300; // ~33.33 ticks per second

// Calculate skill cooldown
// Returns { cooldown, rounded, addedCooldown }
export function calcSkillCooldown(skillModList, cfg, skillData) {
  const cooldownOverride = skillModList.override(cfg, 'CooldownRecovery');
  const addedCooldown = skillModList.sum('BASE', cfg, 'CooldownRecovery');
  const baseCooldown = (skillData.cooldown || 0) + addedCooldown;

  let cooldown;
  if (cooldownOverride !== undefined) {
    cooldown = cooldownOverride;
  } else {
    const recoveryMod = calcLib.mod(skillModList, cfg, 'CooldownRecovery');
    cooldown = baseCooldown / Math.max(0.001, recoveryMod);
  }

  if (cooldown <= 0) return { cooldown: 0, rounded: false, addedCooldown };

  // Skills with stored uses don't round to server ticks
  const hasStoredUses =
    (skillData.storedUses && skillData.storedUses > 1) ||
    (skillData.VaalStoredUses && skillData.VaalStoredUses > 1) ||
    skillModList.sum('BASE', cfg, 'AdditionalCooldownUses') > 0;

  if (hasStoredUses) {
    return { cooldown, rounded: false, addedCooldown };
  }

  // Round up to nearest server tick
  cooldown = Math.ceil(cooldown * SERVER_TICK_RATE) / SERVER_TICK_RATE;
  return { cooldown, rounded: true, addedCooldown };
}

// Calculate trigger time and speed for triggered skills
// Returns { time, speed } or null if not triggered
export function calcTriggerTime(skillModList, cfg, skillData) {
  if (!skillData.triggered) return null;

  if (skillData.triggerRate) {
    return {
      time: 1 / skillData.triggerRate,
      speed: skillData.triggerRate,
    };
  }

  if (skillData.triggerTime) {
    const cooldownRecovery = 1 + skillModList.sum('INC', cfg, 'CooldownRecovery') / 100;
    const activeSkillsLinked = skillModList.sum('BASE', cfg, 'ActiveSkillsLinkedToTrigger');

    let time;
    if (activeSkillsLinked > 0) {
      time = skillData.triggerTime / cooldownRecovery * activeSkillsLinked;
    } else {
      time = skillData.triggerTime / cooldownRecovery;
    }

    return {
      time,
      speed: time > 0 ? 1 / time : 0,
    };
  }

  return null;
}

// Calculate effective trigger rate limited by cooldown
// attackRate: base attack/cast rate in hits per second
// cooldown: skill cooldown in seconds (0 = no cooldown limit)
export function calcTriggerRate(attackRate, cooldown) {
  if (cooldown <= 0) return attackRate;
  return Math.min(attackRate, 1 / cooldown);
}

// Calculate skill duration
export function calcSkillDuration(skillModList, cfg, skillData) {
  const durationBase = (skillData.duration || 0) + skillModList.sum('BASE', cfg, 'Duration');
  const durationMod = Math.max(calcLib.mod(skillModList, cfg, 'Duration'), 0);
  return durationBase * durationMod;
}
