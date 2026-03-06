// PoBWeb - CalcTools (port of Modules/CalcTools.lua)
// Various functions used by the calculation modules.

import { SkillType, round, copyTable } from './utils.js';

export const calcLib = {};

// Calculate and combine INC/MORE modifiers for the given modifier names
calcLib.mod = function (modStore, cfg, ...names) {
  return (1 + modStore.sum('INC', cfg, ...names) / 100) * modStore.more(cfg, ...names);
};

// Returns inc and more separately
calcLib.mods = function (modStore, cfg, ...names) {
  const inc = 1 + modStore.sum('INC', cfg, ...names) / 100;
  const more = modStore.more(cfg, ...names);
  return [inc, more];
};

// Calculate value: BASE * (1+INC) * MORE
calcLib.val = function (modStore, name, cfg) {
  const baseVal = modStore.sum('BASE', cfg, name);
  if (baseVal !== 0) {
    return baseVal * calcLib.mod(modStore, cfg, name);
  }
  return 0;
};

// Validate the level of the given gem instance
calcLib.validateGemLevel = function (gemInstance) {
  const grantedEffect = gemInstance.grantedEffect ||
    (gemInstance.gemData && gemInstance.gemData.grantedEffect);
  if (!grantedEffect) return;

  if (!grantedEffect.levels[gemInstance.level]) {
    // Try limiting to the level range of the skill
    gemInstance.level = Math.max(1, gemInstance.level);
    const levelKeys = Object.keys(grantedEffect.levels).map(Number).sort((a, b) => a - b);
    if (levelKeys.length > 0) {
      gemInstance.level = Math.min(levelKeys[levelKeys.length - 1], gemInstance.level);
    }
  }
  if (!grantedEffect.levels[gemInstance.level] && gemInstance.gemData && gemInstance.gemData.naturalMaxLevel) {
    gemInstance.level = gemInstance.gemData.naturalMaxLevel;
  }
  if (!grantedEffect.levels[gemInstance.level]) {
    // Grab any level
    const keys = Object.keys(grantedEffect.levels);
    if (keys.length > 0) {
      gemInstance.level = Number(keys[0]);
    }
  }
};

// Evaluate a skill type postfix expression
calcLib.doesTypeExpressionMatch = function (checkTypes, skillTypes, minionTypes) {
  const stack = [];
  for (const skillType of checkTypes) {
    if (skillType === SkillType.OR) {
      const other = stack.pop();
      stack[stack.length - 1] = stack[stack.length - 1] || other;
    } else if (skillType === SkillType.AND) {
      const other = stack.pop();
      stack[stack.length - 1] = stack[stack.length - 1] && other;
    } else if (skillType === SkillType.NOT) {
      stack[stack.length - 1] = !stack[stack.length - 1];
    } else {
      stack.push(
        !!(skillTypes[skillType] || (minionTypes && minionTypes[skillType]))
      );
    }
  }
  for (const val of stack) {
    if (val) return true;
  }
  return false;
};

// Check if given gem is of the given type
calcLib.gemIsType = function (gem, type, includeTransfigured) {
  if (type === 'all') return true;
  if (type === 'elemental' && (gem.tags.fire || gem.tags.cold || gem.tags.lightning)) return true;
  if (type === 'aoe' && gem.tags.area) return true;
  if (type === 'trap or mine' && (gem.tags.trap || gem.tags.mine)) return true;
  if ((type === 'active skill' || type === 'grants_active_skill' || type === 'skill') &&
      gem.tags.grants_active_skill && !gem.tags.support) return true;
  if (type === 'non-vaal' && !gem.tags.vaal) return true;
  if (type === 'non-exceptional' && !gem.tags.exceptional) return true;
  if (type === gem.name.toLowerCase()) return true;
  if (type === gem.name.toLowerCase().replace(/^vaal /, '')) return true;
  if (type !== 'active skill' && type !== 'grants_active_skill' && type !== 'skill' && gem.tags[type]) return true;
  return false;
};

// In-game formula for gem stat requirements
calcLib.getGemStatRequirement = function (level, isSupport, multi) {
  if (multi === 0) return 0;
  const statType = isSupport ? 0.5 : 0.7;
  const req = round((20 + (level - 3) * 3) * Math.pow(multi / 100, 0.9) * statType);
  return req < 14 ? 0 : req;
};

// Build table of stats for the given skill instance
calcLib.buildSkillInstanceStats = function (skillInstance, grantedEffect) {
  const stats = {};
  if (skillInstance.quality > 0 && grantedEffect.qualityStats) {
    const qualityId = skillInstance.qualityId || 'Default';
    let qualityStats = grantedEffect.qualityStats[qualityId];
    if (!qualityStats) {
      qualityStats = grantedEffect.qualityStats;
    }
    if (Array.isArray(qualityStats)) {
      for (const stat of qualityStats) {
        const key = stat[0];
        stats[key] = (stats[key] || 0) + Math.trunc(stat[1] * skillInstance.quality);
      }
    }
  }
  const level = grantedEffect.levels[skillInstance.level] || {};
  const actorLevel = skillInstance.actorLevel || level.levelRequirement || 1;
  let availableEffectiveness;

  if (grantedEffect.stats) {
    for (let index = 0; index < grantedEffect.stats.length; index++) {
      const stat = grantedEffect.stats[index];
      let statValue = level[index] || 1;

      if (level.statInterpolation) {
        if (level.statInterpolation[index] === 3) {
          // Effectiveness interpolation
          if (availableEffectiveness === undefined) {
            const baseEff = grantedEffect.baseEffectiveness || 1;
            const incEff = grantedEffect.incrementalEffectiveness || 0;
            availableEffectiveness = baseEff * Math.pow(1 + incEff, actorLevel - 1);
          }
          statValue = round(availableEffectiveness * level[index]);
        } else if (level.statInterpolation[index] === 2) {
          // Linear interpolation
          const orderedLevels = Object.keys(grantedEffect.levels).map(Number).sort((a, b) => a - b);
          let currentLevelIndex = orderedLevels.indexOf(skillInstance.level);
          if (currentLevelIndex === -1) currentLevelIndex = 0;

          if (orderedLevels.length > 1) {
            const nextLevelIndex = Math.min(currentLevelIndex + 1, orderedLevels.length - 1);
            const nextReq = grantedEffect.levels[orderedLevels[nextLevelIndex]].levelRequirement;
            const prevReq = grantedEffect.levels[orderedLevels[nextLevelIndex - 1]].levelRequirement;
            const nextStat = grantedEffect.levels[orderedLevels[nextLevelIndex]][index];
            const prevStat = grantedEffect.levels[orderedLevels[nextLevelIndex - 1]][index];
            statValue = round(prevStat + (nextStat - prevStat) * (actorLevel - prevReq) / (nextReq - prevReq));
          } else {
            statValue = round(grantedEffect.levels[orderedLevels[currentLevelIndex]][index]);
          }
        }
      }
      stats[stat] = (stats[stat] || 0) + statValue;
    }
  }

  if (grantedEffect.constantStats) {
    for (const stat of grantedEffect.constantStats) {
      stats[stat[0]] = (stats[stat[0]] || 0) + (stat[1] || 0);
    }
  }
  return stats;
};

// Correct tags on conversion with multipliers
calcLib.getConvertedModTags = function (mod, multiplier, minionMods) {
  const modifiers = [];
  if (!mod.tags) return modifiers;
  for (let k = 0; k < mod.tags.length; k++) {
    const value = mod.tags[k];
    if (minionMods && value.type === 'ActorCondition' && value.actor === 'parent') {
      modifiers[k] = { type: 'Condition', var: value.var };
    } else if (value.limitTotal) {
      const copy = copyTable(value);
      copy.limit = copy.limit * multiplier;
      modifiers[k] = copy;
    } else {
      modifiers[k] = copyTable(value);
    }
  }
  return modifiers;
};
