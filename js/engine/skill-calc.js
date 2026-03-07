/**
 * skill-calc.js — Stat interpolation, stat resolution, and active skill list builder.
 *
 * Provides the bridge between skill/gem data and the calc engine:
 *   - interpolateStat: resolves a single stat value given its interpolation type
 *   - resolveSkillStats: resolves all stats for a skill at a given gem level
 *   - buildActiveSkillList: builds the list of active skills from socket groups
 */

/**
 * Interpolate a stat value based on its interpolation type.
 *
 * @param {number} type - Interpolation type (1 = direct, 2 = linear/direct, 3 = effectiveness-based)
 * @param {number} rawValue - The raw value from the level table
 * @param {object} skillDef - The skill definition (needs baseEffectiveness, incrementalEffectiveness for type 3)
 * @param {number} [level=1] - The gem level (used for type 3 scaling)
 * @returns {number} The resolved stat value
 */
export function interpolateStat(type, rawValue, skillDef, level = 1) {
  if (type === 3) {
    const base = skillDef.baseEffectiveness || 0;
    const inc = skillDef.incrementalEffectiveness || 0;
    return Math.round(base * Math.pow(1 + inc, level - 1) * rawValue);
  }
  // Type 1 (direct), type 2 (linear, treated as direct), and unknown types
  return rawValue;
}

/**
 * Resolve all stat values for a skill at a specific gem level.
 *
 * @param {object|null} skillDef - The skill definition from skills.json
 * @param {number} level - The gem level
 * @returns {object|null} Resolved stats object, or null if skillDef is missing/invalid
 */
export function resolveSkillStats(skillDef, level) {
  if (!skillDef || !skillDef.levels) return null;

  // Get sorted numeric level keys
  const levelKeys = Object.keys(skillDef.levels)
    .map(Number)
    .sort((a, b) => a - b);

  if (levelKeys.length === 0) return null;

  // Clamp level to available range
  const minLevel = levelKeys[0];
  const maxLevel = levelKeys[levelKeys.length - 1];
  const clampedLevel = Math.max(minLevel, Math.min(maxLevel, level));

  // Find highest key <= clamped level
  let bestKey = levelKeys[0];
  for (const key of levelKeys) {
    if (key <= clampedLevel) {
      bestKey = key;
    } else {
      break;
    }
  }

  const levelData = skillDef.levels[String(bestKey)];
  const stats = {};

  // Resolve positional stats
  const statNames = skillDef.stats || [];
  const values = levelData.values || [];
  const interpolations = levelData.statInterpolation || [];

  for (let i = 0; i < statNames.length; i++) {
    const value = i < values.length ? values[i] : 0;
    const interpType = i < interpolations.length ? interpolations[i] : 1;
    stats[statNames[i]] = interpolateStat(interpType, value, skillDef, clampedLevel);
  }

  // Add constant stats
  const constantStats = skillDef.constantStats || [];
  for (const [statName, value] of constantStats) {
    stats[statName] = value;
  }

  return {
    stats,
    critChance: levelData.critChance ?? null,
    damageEffectiveness: levelData.damageEffectiveness ?? null,
    cost: levelData.cost ?? null,
    levelRequirement: levelData.levelRequirement ?? null,
    manaMultiplier: levelData.manaMultiplier ?? null,
    castTime: skillDef.castTime ?? null,
  };
}

/**
 * Determine if a gem is an active skill gem.
 * @param {object} gem - The gem instance
 * @param {object} skillsData - The full skills.json data
 * @returns {boolean}
 */
function isActiveGem(gem, skillsData) {
  if (gem.gemData?.tags?.grants_active_skill) return true;
  const skillId = gem.gemData?.grantedEffectId || gem.skillId;
  const def = skillsData[skillId];
  if (def && !def.support) return true;
  return false;
}

/**
 * Determine if a gem is a support gem.
 * @param {object} gem - The gem instance
 * @param {object} skillsData - The full skills.json data
 * @returns {boolean}
 */
function isSupportGem(gem, skillsData) {
  if (gem.gemData?.tags?.support) return true;
  const skillId = gem.gemData?.grantedEffectId || gem.skillId;
  const def = skillsData[skillId];
  if (def?.support) return true;
  return false;
}

/**
 * Build the list of active skills from socket groups.
 *
 * For each enabled group, separates gems into active and support gems,
 * then creates an active skill object for each active gem with its supports.
 *
 * @param {Array} groups - Array of socket groups from build.skills
 * @param {object} skillsData - The full skills.json data
 * @returns {Array} Array of active skill objects
 */
export function buildActiveSkillList(groups, skillsData) {
  const activeSkills = [];

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];

    // Skip disabled groups
    if (group.enabled === false) continue;

    const gems = group.gems || [];

    // Filter to enabled gems with gemData
    const enabledGems = gems.filter(gem => gem.enabled !== false && gem.gemData);

    // Separate active and support gems
    const activeGems = enabledGems.filter(gem => isActiveGem(gem, skillsData));
    const supportGems = enabledGems.filter(gem => isSupportGem(gem, skillsData));

    // Create an active skill for each active gem
    for (const gem of activeGems) {
      const skillId = gem.gemData.grantedEffectId || gem.skillId;
      const skillDef = skillsData[skillId] || null;
      const level = gem.level || 1;
      const quality = gem.quality || 0;

      // Resolve stats for the active gem
      const resolvedStats = skillDef ? resolveSkillStats(skillDef, level) : null;

      // Resolve supports
      const supports = supportGems.map(sup => {
        const supSkillId = sup.gemData.grantedEffectId || sup.skillId;
        const supDef = skillsData[supSkillId] || null;
        const supLevel = sup.level || 1;
        const supQuality = sup.quality || 0;

        return {
          skillId: supSkillId,
          skillDef: supDef,
          level: supLevel,
          quality: supQuality,
          resolvedStats: supDef ? resolveSkillStats(supDef, supLevel) : null,
        };
      });

      activeSkills.push({
        skillId,
        name: skillDef?.name || gem.name || skillId,
        skillDef,
        level,
        quality,
        resolvedStats,
        supports,
        groupIndex,
        baseFlags: skillDef?.baseFlags || {},
        castTime: skillDef?.castTime ?? null,
      });
    }
  }

  return activeSkills;
}
