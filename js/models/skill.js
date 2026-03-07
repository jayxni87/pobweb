// PoBWeb - Skill/Gem Model
// Gem instances, skill groups, gem data lookup.

// Check if gem data represents a support gem
export function isSupport(gemData) {
  if (!gemData || !gemData.tags) return false;
  return !!gemData.tags.support;
}

// Get level data for a gem, clamping to available levels
export function getGemLevelData(levels, level) {
  if (!levels) return null;
  const keys = Object.keys(levels).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return null;

  const clamped = Math.max(keys[0], Math.min(keys[keys.length - 1], level));
  // Find exact or closest lower level
  let best = keys[0];
  for (const k of keys) {
    if (k <= clamped) best = k;
  }
  return levels[best];
}

// Scale a stat value by gem quality
export function scaleGemQuality(baseValue, quality, perQuality) {
  return baseValue + quality * perQuality;
}

// Represents a single gem socketed in a skill group
export class GemInstance {
  constructor(opts = {}) {
    this.name = opts.name || '';
    this.level = opts.level || 1;
    this.quality = opts.quality || 0;
    this.qualityId = opts.qualityId || 'Default';
    this.enabled = opts.enabled !== undefined ? opts.enabled : true;
    this.gemData = opts.gemData || null;
    this.skillPart = opts.skillPart || null;
    this.gemId = opts.gemId || null;
    this.skillId = opts.skillId || null;
    this.count = opts.count || 1;
  }

  /**
   * Resolve this gem's gemData using a GemRegistry.
   * Priority: gemId > skillId > name.
   * @param {Object} registry - GemRegistry instance
   */
  resolveGem(registry) {
    let found = null;

    if (this.gemId) {
      found = registry.findByGameId(this.gemId);
      if (found) {
        this.gemData = found;
        this.name = found.name;
        this.skillId = found.grantedEffectId || this.skillId;
        return;
      }
    }

    if (this.skillId) {
      found = registry.findBySkillId(this.skillId);
      if (found) {
        this.gemData = found;
        this.name = found.name;
        this.gemId = found.gameId || this.gemId;
        return;
      }
    }

    if (this.name) {
      found = registry.findByName(this.name);
      if (found) {
        this.gemData = found;
        this.gemId = found.gameId || this.gemId;
        this.skillId = found.grantedEffectId || this.skillId;
        return;
      }
    }

    this.gemData = null;
  }
}

// Represents a group of linked gems (one socket group)
export class SkillGroup {
  constructor(opts = {}) {
    this.gems = [];
    this.enabled = opts.enabled !== undefined ? opts.enabled : true;
    this.slot = opts.slot || null;
    this.label = opts.label || '';
    this.mainActiveSkill = opts.mainActiveSkill || 1;
    this.includeInFullDPS = opts.includeInFullDPS !== undefined ? opts.includeInFullDPS : false;
    this.source = opts.source || null;
  }

  addGem(opts) {
    const gem = opts instanceof GemInstance ? opts : new GemInstance(opts);
    this.gems.push(gem);
    return gem;
  }

  removeGem(index) {
    this.gems.splice(index, 1);
  }

  getEnabledGems() {
    return this.gems.filter(g => g.enabled);
  }

  getActiveGems() {
    return this.gems.filter(g => g.gemData && !isSupport(g.gemData));
  }

  getSupportGems() {
    return this.gems.filter(g => g.gemData && isSupport(g.gemData));
  }

  /**
   * Resolve gemData for all gems in this group.
   * @param {Object} registry - GemRegistry instance
   */
  resolveAll(registry) {
    for (const gem of this.gems) {
      gem.resolveGem(registry);
    }
  }
}
