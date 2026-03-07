/**
 * GemRegistry - indexes gems.json data for fast lookup by gameId, name,
 * grantedEffectId, and variant. Used by the skills UI and calc engine.
 */
export class GemRegistry {
  /**
   * @param {Object} gemsData - raw gems.json object (gameId -> gem entry)
   */
  constructor(gemsData) {
    /** @type {Map<string, Object>} gameId -> first gem entry */
    this._byGameId = new Map();
    /** @type {Map<string, Object>} lowercase name -> gem entry */
    this._byName = new Map();
    /** @type {Map<string, Object>} grantedEffectId -> gem entry */
    this._bySkillId = new Map();
    /** @type {Map<string, Map<string, Object>>} gameId -> (variantId -> gem entry) */
    this._byVariant = new Map();
    /** @type {string[]} sorted gem names */
    this._nameList = [];

    const names = [];

    for (const [gameId, gem] of Object.entries(gemsData)) {
      // gameId index: first entry wins (base variant)
      if (!this._byGameId.has(gameId)) {
        this._byGameId.set(gameId, gem);
      }

      // name index: lowercase for case-insensitive lookup
      const lowerName = gem.name.toLowerCase();
      if (!this._byName.has(lowerName)) {
        this._byName.set(lowerName, gem);
      }

      // skillId (grantedEffectId) index: first match wins
      if (gem.grantedEffectId && !this._bySkillId.has(gem.grantedEffectId)) {
        this._bySkillId.set(gem.grantedEffectId, gem);
      }

      // variant index: gameId -> variantId -> gem
      if (!this._byVariant.has(gameId)) {
        this._byVariant.set(gameId, new Map());
      }
      if (gem.variantId) {
        this._byVariant.get(gameId).set(gem.variantId, gem);
      }

      names.push(gem.name);
    }

    this._nameList = names.sort();
  }

  /**
   * Exact match by gameId key.
   * @param {string} gameId
   * @returns {Object|null}
   */
  findByGameId(gameId) {
    return this._byGameId.get(gameId) ?? null;
  }

  /**
   * Case-insensitive match by gem name field.
   * @param {string} name
   * @returns {Object|null}
   */
  findByName(name) {
    return this._byName.get(name.toLowerCase()) ?? null;
  }

  /**
   * Match by grantedEffectId field.
   * @param {string} skillId
   * @returns {Object|null}
   */
  findBySkillId(skillId) {
    return this._bySkillId.get(skillId) ?? null;
  }

  /**
   * Match by gameId + variantId. Multiple gems can share the same gameId
   * (transfigurations), so this uses the nested variant index.
   * @param {string} gameId
   * @param {string} variantId
   * @returns {Object|null}
   */
  findByVariant(gameId, variantId) {
    const variants = this._byVariant.get(gameId);
    if (!variants) return null;
    return variants.get(variantId) ?? null;
  }

  /**
   * Returns sorted array of all gem names (for dropdown autocomplete).
   * @returns {string[]}
   */
  getNameList() {
    return this._nameList;
  }

  /**
   * Case-insensitive substring search across all gem names.
   * Returns array of matching gem entries.
   * @param {string} query
   * @returns {Object[]}
   */
  search(query) {
    const lowerQuery = query.toLowerCase();
    const results = [];
    for (const [lowerName, gem] of this._byName) {
      if (lowerName.includes(lowerQuery)) {
        results.push(gem);
      }
    }
    return results;
  }
}
