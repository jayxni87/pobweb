// PoBWeb - ModList (port of Classes/ModList.lua)
// Flat array of mods with same query interface as ModDB.

import { MatchKeywordFlags, round, copyTable } from './utils.js';
import { createMod, compareModParams } from './mod-tools.js';
import { ModDB } from './mod-db.js';

/**
 * ModList - stores mods in a flat array.
 * Used for node mod lists, item mod lists, etc.
 * Shares evalMod and condition/multiplier logic from ModDB.
 */
export class ModList {
  constructor(parent) {
    this.parent = parent || null;
    this.actor = (parent && parent.actor) || {};
    this.mods = [];
    this.conditions = {};
    this.multipliers = {};
  }

  addMod(mod) {
    this.mods.push(mod);
  }

  addList(modList) {
    if (modList) {
      for (let i = 0; i < modList.length; i++) {
        this.mods.push(modList[i]);
      }
    }
  }

  mergeMod(mod, skipNonAdditive) {
    if (mod.type === 'BASE' || mod.type === 'INC' || mod.type === 'MORE') {
      for (let i = 0; i < this.mods.length; i++) {
        if (compareModParams(this.mods[i], mod)) {
          this.mods[i] = copyTable(this.mods[i], true);
          this.mods[i].value = this.mods[i].value + mod.value;
          return;
        }
      }
    }
    if (!skipNonAdditive) {
      this.addMod(mod);
    }
  }

  mergeNewMod(...args) {
    this.mergeMod(createMod(...args));
  }

  newMod(...args) {
    this.addMod(createMod(...args));
  }

  // Reuse evalMod from ModDB prototype
  evalMod(mod, cfg, globalLimits) {
    return ModDB.prototype.evalMod.call(this, mod, cfg, globalLimits);
  }

  getCondition(variable, cfg, noMod) {
    return ModDB.prototype.getCondition.call(this, variable, cfg, noMod);
  }

  getMultiplier(variable, cfg, noMod) {
    return ModDB.prototype.getMultiplier.call(this, variable, cfg, noMod);
  }

  getStat(stat, cfg) {
    return ModDB.prototype.getStat.call(this, stat, cfg);
  }

  // --- Query helpers ---

  _extractCfg(cfg) {
    if (!cfg) return { flags: 0, keywordFlags: 0, source: undefined };
    return {
      flags: cfg.flags || 0,
      keywordFlags: cfg.keywordFlags || 0,
      source: cfg.source,
    };
  }

  _modMatches(mod, modName, modType, flags, keywordFlags, source) {
    return mod.name === modName &&
      mod.type === modType &&
      (flags & mod.flags) === mod.flags &&
      MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
      (!source || (mod.source && mod.source.split(':')[0] === source));
  }

  // --- Public query methods ---

  sum(modType, cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    let result = 0;
    for (const name of names) {
      for (let i = 0; i < this.mods.length; i++) {
        const mod = this.mods[i];
        if (this._modMatches(mod, name, modType, flags, keywordFlags, source)) {
          if (mod.tags && mod.tags.length > 0) {
            result += this.evalMod(mod, cfg) || 0;
          } else {
            result += mod.value;
          }
        }
      }
    }
    if (this.parent) {
      result += this.parent._sumInternal
        ? this.parent._sumInternal(modType, cfg, flags, keywordFlags, source, names)
        : this.parent.sum(modType, cfg, ...names);
    }
    return result;
  }

  more(cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    let result = 1;
    for (const name of names) {
      let modResult = 1;
      for (let i = 0; i < this.mods.length; i++) {
        const mod = this.mods[i];
        if (mod.name === name && mod.type === 'MORE' &&
            (flags & mod.flags) === mod.flags &&
            MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
            (!source || (mod.source && mod.source.split(':')[0] === source))) {
          let value;
          if (mod.tags && mod.tags.length > 0) {
            value = this.evalMod(mod, cfg) || 0;
          } else {
            value = mod.value || 0;
          }
          modResult *= (1 + value / 100);
        }
      }
      result *= round(modResult, 2);
    }
    if (this.parent) {
      result *= this.parent._moreInternal
        ? this.parent._moreInternal(cfg, flags, keywordFlags, source, names)
        : this.parent.more(cfg, ...names);
    }
    return result;
  }

  flag(cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    for (const name of names) {
      for (let i = 0; i < this.mods.length; i++) {
        const mod = this.mods[i];
        if (mod.name === name && mod.type === 'FLAG' &&
            (flags & mod.flags) === mod.flags &&
            MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
            (!source || (mod.source && mod.source.split(':')[0] === source))) {
          if (mod.tags && mod.tags.length > 0) {
            if (this.evalMod(mod, cfg)) return true;
          } else if (mod.value) {
            return true;
          }
        }
      }
    }
    if (this.parent) {
      return this.parent._flagInternal
        ? this.parent._flagInternal(cfg, flags, keywordFlags, source, names)
        : this.parent.flag(cfg, ...names);
    }
    return false;
  }

  override(cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    for (const name of names) {
      for (let i = 0; i < this.mods.length; i++) {
        const mod = this.mods[i];
        if (mod.name === name && mod.type === 'OVERRIDE' &&
            (flags & mod.flags) === mod.flags &&
            MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
            (!source || (mod.source && mod.source.split(':')[0] === source))) {
          if (mod.tags && mod.tags.length > 0) {
            const value = this.evalMod(mod, cfg);
            if (value !== undefined) return value;
          } else if (mod.value !== undefined) {
            return mod.value;
          }
        }
      }
    }
    if (this.parent) {
      return this.parent._overrideInternal
        ? this.parent._overrideInternal(cfg, flags, keywordFlags, source, names)
        : this.parent.override(cfg, ...names);
    }
    return undefined;
  }

  list(cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    const result = [];
    for (const name of names) {
      for (let i = 0; i < this.mods.length; i++) {
        const mod = this.mods[i];
        if (mod.name === name && mod.type === 'LIST' &&
            (flags & mod.flags) === mod.flags &&
            MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
            (!source || (mod.source && mod.source.split(':')[0] === source))) {
          if (mod.tags && mod.tags.length > 0) {
            const value = this.evalMod(mod, cfg);
            if (value !== undefined) result.push(value);
          } else if (mod.value !== undefined) {
            result.push(mod.value);
          }
        }
      }
    }
    if (this.parent) {
      if (this.parent._listInternal) {
        this.parent._listInternal(result, cfg, flags, keywordFlags, source, names);
      } else {
        result.push(...this.parent.list(cfg, ...names));
      }
    }
    return result;
  }

  tabulate(modType, cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    const result = [];
    for (const name of names) {
      for (let i = 0; i < this.mods.length; i++) {
        const mod = this.mods[i];
        if (mod.name === name && (mod.type === modType || !modType) &&
            (flags & mod.flags) === mod.flags &&
            MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
            (!source || (mod.source && mod.source.split(':')[0] === source))) {
          let value;
          if (mod.tags && mod.tags.length > 0) {
            value = this.evalMod(mod, cfg);
          } else {
            value = mod.value;
          }
          if (value !== undefined && (value !== 0 || mod.type === 'OVERRIDE')) {
            result.push({ value, mod });
          }
        }
      }
    }
    if (this.parent) {
      if (this.parent._tabulateInternal) {
        this.parent._tabulateInternal(result, modType, cfg, flags, keywordFlags, source, names);
      } else {
        result.push(...this.parent.tabulate(modType, cfg, ...names));
      }
    }
    return result;
  }

  hasMod(modType, cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    for (const name of names) {
      for (let i = 0; i < this.mods.length; i++) {
        const mod = this.mods[i];
        if (this._modMatches(mod, name, modType, flags, keywordFlags, source)) {
          return true;
        }
      }
    }
    if (this.parent) {
      return this.parent._hasModInternal
        ? this.parent._hasModInternal(modType, flags, keywordFlags, source, names)
        : this.parent.hasMod(modType, cfg, ...names);
    }
    return false;
  }

  combine(modType, cfg, ...names) {
    if (modType === 'MORE') return this.more(cfg, ...names);
    if (modType === 'FLAG') return this.flag(cfg, ...names);
    if (modType === 'OVERRIDE') return this.override(cfg, ...names);
    if (modType === 'LIST') return this.list(cfg, ...names);
    return this.sum(modType, cfg, ...names);
  }

  // --- Convenience ---

  scaleAddMod(mod, scale) {
    return ModDB.prototype.scaleAddMod.call(this, mod, scale);
  }

  scaleAddList(modList, scale) {
    if (scale === 1) {
      this.addList(modList);
    } else {
      for (let i = 0; i < modList.length; i++) {
        this.scaleAddMod(modList[i], scale);
      }
    }
  }

  copyList(modList) {
    for (let i = 0; i < modList.length; i++) {
      this.addMod(copyTable(modList[i]));
    }
  }
}
