// PoBWeb - ModStore & ModDB (port of Classes/ModStore.lua + ModDB.lua)

import { MatchKeywordFlags, round, copyTable } from './utils.js';
import { createMod } from './mod-tools.js';

/**
 * ModDB - Stores modifiers indexed by stat name.
 * Provides sum/more/flag/override/list queries with flag filtering,
 * parent chain traversal, and conditional tag evaluation.
 */
export class ModDB {
  constructor(parent) {
    this.parent = parent || null;
    this.actor = (parent && parent.actor) || {};
    this.mods = {};
    this.conditions = {};
    this.multipliers = {};
  }

  addMod(mod) {
    const name = mod.name;
    if (!this.mods[name]) this.mods[name] = [];
    this.mods[name].push(mod);
  }

  addList(modList) {
    for (let i = 0; i < modList.length; i++) {
      this.addMod(modList[i]);
    }
  }

  addDB(modDB) {
    for (const modName in modDB.mods) {
      if (!this.mods[modName]) this.mods[modName] = [];
      const src = modDB.mods[modName];
      const dst = this.mods[modName];
      for (let i = 0; i < src.length; i++) {
        dst.push(src[i]);
      }
    }
  }

  newMod(...args) {
    this.addMod(createMod(...args));
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

  _modMatches(mod, modType, flags, keywordFlags, source) {
    return mod.type === modType &&
      (flags & mod.flags) === mod.flags &&
      MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
      (!source || (mod.source && mod.source.split(':')[0] === source));
  }

  // --- EvalMod: evaluates conditional tags ---

  evalMod(mod, cfg, globalLimits) {
    let value = mod.value;
    const tags = mod.tags;
    if (!tags || tags.length === 0) return value;

    for (const tag of tags) {
      if (tag.type === 'Condition') {
        let match = false;
        if (tag.varList) {
          for (const v of tag.varList) {
            if (this.getCondition(v, cfg) || (cfg && cfg.skillCond && cfg.skillCond[v])) {
              match = true;
              break;
            }
          }
        } else {
          match = this.getCondition(tag.var, cfg) || (cfg && cfg.skillCond && cfg.skillCond[tag.var]) || false;
        }
        if (tag.neg) match = !match;
        if (!match) return undefined;
      } else if (tag.type === 'ActorCondition') {
        let target = this;
        if (tag.actor && this.actor[tag.actor]) {
          target = this.actor[tag.actor].modDB;
        } else if (tag.actor) {
          if (cfg && tag.actor === cfg.actor) {
            // match via cfg
          } else {
            return undefined;
          }
        }
        let match = false;
        if (tag.varList) {
          for (const v of tag.varList) {
            if (target.getCondition(v, cfg)) { match = true; break; }
          }
        } else if (tag.var) {
          match = target.getCondition(tag.var, cfg) || false;
        } else if (tag.actor && cfg && tag.actor === cfg.actor) {
          match = true;
        }
        if (tag.neg) match = !match;
        if (!match) return undefined;
      } else if (tag.type === 'Multiplier') {
        let target = this;
        if (tag.actor && this.actor[tag.actor]) {
          target = this.actor[tag.actor].modDB;
        } else if (tag.actor) {
          return undefined;
        }
        let base = 0;
        if (tag.varList) {
          for (const v of tag.varList) base += target.getMultiplier(v, cfg);
        } else {
          base = target.getMultiplier(tag.var, cfg);
        }
        let mult = Math.floor(base / (tag.div || 1) + 0.0001);
        if (tag.noFloor) mult = base / (tag.div || 1);

        let limitTotal, limitNegTotal;
        if (tag.limit !== undefined || tag.limitVar) {
          const limit = tag.limit !== undefined ? tag.limit :
            (tag.limitVar ? this.getMultiplier(tag.limitVar, cfg) : Infinity);
          if (tag.limitTotal) { limitTotal = limit; }
          else if (tag.limitNegTotal) { limitNegTotal = limit; }
          else { mult = Math.min(mult, limit); }
        }
        if (tag.invert && mult !== 0) mult = 1 / mult;
        if (value && typeof value === 'object') {
          value = copyTable(value);
          const sub = value.mod || value;
          const key = value.mod ? 'value' : 'value';
          sub.value = sub.value * mult + (tag.base || 0);
          if (limitTotal !== undefined) sub.value = Math.min(sub.value, limitTotal);
          if (limitNegTotal !== undefined) sub.value = Math.max(sub.value, limitNegTotal);
        } else {
          value = value * mult + (tag.base || 0);
          if (limitTotal !== undefined) value = Math.min(value, limitTotal);
          if (limitNegTotal !== undefined) value = Math.max(value, limitNegTotal);
        }
      } else if (tag.type === 'MultiplierThreshold') {
        let target = this;
        if (tag.actor && this.actor[tag.actor]) {
          target = this.actor[tag.actor].modDB;
        } else if (tag.actor) {
          return undefined;
        }
        let mult = 0;
        if (tag.varList) {
          for (const v of tag.varList) mult += target.getMultiplier(v, cfg);
        } else {
          mult = target.getMultiplier(tag.var, cfg);
        }
        const threshold = tag.threshold !== undefined ? tag.threshold :
          target.getMultiplier(tag.thresholdVar, cfg);
        if ((tag.upper && mult > threshold) || (tag.equals && mult !== threshold) || (!(tag.upper && tag.exact) && mult < threshold)) {
          return undefined;
        }
      } else if (tag.type === 'PerStat') {
        let target = this;
        if (tag.actor && this.actor[tag.actor]) {
          target = this.actor[tag.actor].modDB;
        }
        let base = 0;
        if (tag.statList) {
          for (const stat of tag.statList) base += target.getStat(stat, cfg);
        } else {
          base = target.getStat(tag.stat, cfg);
        }
        let mult = Math.floor(base / (tag.div || 1) + 0.0001);
        let limitTotal;
        if (tag.limit !== undefined || tag.limitVar) {
          const limit = tag.limit !== undefined ? tag.limit :
            this.getMultiplier(tag.limitVar, cfg);
          if (tag.limitTotal) { limitTotal = limit; }
          else { mult = Math.min(mult, limit); }
        }
        if (value && typeof value === 'object') {
          value = copyTable(value);
          const sub = value.mod || value;
          sub.value = sub.value * mult + (tag.base || 0);
          if (limitTotal !== undefined) sub.value = Math.min(sub.value, limitTotal);
        } else {
          value = value * mult + (tag.base || 0);
          if (limitTotal !== undefined) value = Math.min(value, limitTotal);
        }
      } else if (tag.type === 'PercentStat') {
        let target = this;
        if (tag.actor && this.actor[tag.actor]) {
          target = this.actor[tag.actor].modDB;
        }
        let base = 0;
        if (tag.statList) {
          for (const stat of tag.statList) base += target.getStat(stat, cfg);
        } else {
          base = target.getStat(tag.stat, cfg);
        }
        const percent = tag.percent !== undefined ? tag.percent :
          this.getMultiplier(tag.percentVar, cfg);
        let mult = base * (percent / 100);
        if (tag.floor) mult = Math.floor(mult);
        let limitTotal;
        if (tag.limit !== undefined || tag.limitVar) {
          const limit = tag.limit !== undefined ? tag.limit :
            this.getMultiplier(tag.limitVar, cfg);
          if (tag.limitTotal) { limitTotal = limit; }
          else { mult = Math.min(mult, limit); }
        }
        if (value && typeof value === 'object') {
          value = copyTable(value);
          const sub = value.mod || value;
          sub.value = Math.ceil(sub.value * mult + (tag.base || 0));
          if (limitTotal !== undefined) sub.value = Math.min(sub.value, limitTotal);
        } else {
          value = Math.ceil(value * mult + (tag.base || 0));
          if (limitTotal !== undefined) value = Math.min(value, limitTotal);
        }
      } else if (tag.type === 'StatThreshold') {
        let stat = 0;
        if (tag.statList) {
          for (const s of tag.statList) stat += this.getStat(s, cfg);
        } else {
          stat = this.getStat(tag.stat, cfg);
        }
        const threshold = tag.threshold !== undefined ? tag.threshold :
          this.getStat(tag.thresholdStat, cfg);
        if ((tag.upper && stat > threshold) || (!tag.upper && stat < threshold)) {
          return undefined;
        }
      } else if (tag.type === 'DistanceRamp') {
        if (!cfg || cfg.skillDist === undefined) return undefined;
        const ramp = tag.ramp;
        if (cfg.skillDist <= ramp[0][0]) {
          value = value * ramp[0][1];
        } else if (cfg.skillDist >= ramp[ramp.length - 1][0]) {
          value = value * ramp[ramp.length - 1][1];
        } else {
          for (let i = 0; i < ramp.length - 1; i++) {
            if (cfg.skillDist <= ramp[i + 1][0]) {
              value = value * (ramp[i][1] + (ramp[i + 1][1] - ramp[i][1]) * (cfg.skillDist - ramp[i][0]) / (ramp[i + 1][0] - ramp[i][0]));
              break;
            }
          }
        }
      } else if (tag.type === 'Limit') {
        const limit = tag.limit !== undefined ? tag.limit :
          this.getMultiplier(tag.limitVar, cfg);
        value = Math.min(value, limit);
      } else if (tag.type === 'SkillName') {
        let matchName = tag.summonSkill ? (cfg && cfg.summonSkillName || '') : (cfg && cfg.skillName || '');
        matchName = matchName.toLowerCase();
        let match = false;
        if (tag.skillNameList) {
          for (const name of tag.skillNameList) {
            if (name.toLowerCase() === matchName) { match = true; break; }
          }
        } else {
          match = tag.skillName && tag.skillName.toLowerCase() === matchName;
        }
        if (tag.neg) match = !match;
        if (!match) return undefined;
      } else if (tag.type === 'SkillType') {
        let match = false;
        if (tag.skillTypeList) {
          for (const type of tag.skillTypeList) {
            if (cfg && cfg.skillTypes && cfg.skillTypes[type]) { match = true; break; }
          }
        } else {
          match = cfg && cfg.skillTypes && cfg.skillTypes[tag.skillType];
        }
        if (tag.neg) match = !match;
        if (!match) return undefined;
      } else if (tag.type === 'SkillId') {
        if (!cfg || !cfg.skillGrantedEffect || cfg.skillGrantedEffect.id !== tag.skillId) return undefined;
      } else if (tag.type === 'SkillPart') {
        if (!cfg) return undefined;
        let match = false;
        if (tag.skillPartList) {
          match = tag.skillPartList.includes(cfg.skillPart);
        } else {
          match = tag.skillPart === cfg.skillPart;
        }
        if (tag.neg) match = !match;
        if (!match) return undefined;
      } else if (tag.type === 'SlotName') {
        if (!cfg) return undefined;
        let match = false;
        if (tag.slotNameList) {
          match = tag.slotNameList.includes(cfg.slotName);
        } else {
          match = tag.slotName === cfg.slotName;
        }
        if (tag.neg) match = !match;
        if (!match) return undefined;
      } else if (tag.type === 'ModFlagOr') {
        if (!cfg || !cfg.flags) return undefined;
        if ((cfg.flags & tag.modFlags) === 0) return undefined;
      } else if (tag.type === 'KeywordFlagAnd') {
        if (!cfg || !cfg.keywordFlags) return undefined;
        if ((cfg.keywordFlags & tag.keywordFlags) !== tag.keywordFlags) return undefined;
      }
      // Other tag types (SocketedIn, ItemCondition, MonsterTag, MeleeProximity)
      // are more niche — stub them as pass-through for now
    }

    // Apply global limits
    if (globalLimits && tags) {
      for (const tag of tags) {
        if (tag.globalLimit && tag.globalLimitKey) {
          value = value || 0;
          globalLimits[tag.globalLimitKey] = globalLimits[tag.globalLimitKey] || 0;
          if (globalLimits[tag.globalLimitKey] + value > tag.globalLimit) {
            value = tag.globalLimit - globalLimits[tag.globalLimitKey];
          }
          globalLimits[tag.globalLimitKey] += value;
        }
      }
    }

    return value;
  }

  // --- Condition/Multiplier/Stat accessors ---

  getCondition(variable, cfg, noMod) {
    return this.conditions[variable] ||
      (this.parent && this.parent.getCondition(variable, cfg, true)) ||
      (!noMod && this.flag(cfg, `Condition:${variable}`)) ||
      false;
  }

  getMultiplier(variable, cfg, noMod) {
    const overrideVal = !noMod && this.override(cfg, `Multiplier:${variable}`);
    if (overrideVal !== undefined) return overrideVal;
    return (this.multipliers[variable] || 0) +
      (this.parent ? this.parent.getMultiplier(variable, cfg, true) : 0) +
      (!noMod ? this.sum('BASE', cfg, `Multiplier:${variable}`) : 0);
  }

  getStat(stat, cfg) {
    return (this.actor.output && this.actor.output[stat]) ||
      (cfg && cfg.skillStats && cfg.skillStats[stat]) || 0;
  }

  // --- Public query methods ---

  sum(modType, cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    return this._sumInternal(modType, cfg, flags, keywordFlags, source, names);
  }

  more(cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    return this._moreInternal(cfg, flags, keywordFlags, source, names);
  }

  flag(cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    return this._flagInternal(cfg, flags, keywordFlags, source, names);
  }

  override(cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    return this._overrideInternal(cfg, flags, keywordFlags, source, names);
  }

  list(cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    const result = [];
    this._listInternal(result, cfg, flags, keywordFlags, source, names);
    return result;
  }

  tabulate(modType, cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    const result = [];
    this._tabulateInternal(result, modType, cfg, flags, keywordFlags, source, names);
    return result;
  }

  hasMod(modType, cfg, ...names) {
    const { flags, keywordFlags, source } = this._extractCfg(cfg);
    return this._hasModInternal(modType, flags, keywordFlags, source, names);
  }

  combine(modType, cfg, ...names) {
    if (modType === 'MORE') return this.more(cfg, ...names);
    if (modType === 'FLAG') return this.flag(cfg, ...names);
    if (modType === 'OVERRIDE') return this.override(cfg, ...names);
    if (modType === 'LIST') return this.list(cfg, ...names);
    return this.sum(modType, cfg, ...names);
  }

  // --- Internal query methods ---

  _sumInternal(modType, cfg, flags, keywordFlags, source, names) {
    let result = 0;
    const globalLimits = {};
    for (const name of names) {
      const modList = this.mods[name];
      if (modList) {
        for (let i = 0; i < modList.length; i++) {
          const mod = modList[i];
          if (mod.type === modType &&
              (flags & mod.flags) === mod.flags &&
              MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
              (!source || (mod.source && mod.source.split(':')[0] === source))) {
            if (mod.tags && mod.tags.length > 0) {
              const value = this.evalMod(mod, cfg, globalLimits);
              if (value !== undefined) result += value;
            } else {
              result += mod.value;
            }
          }
        }
      }
    }
    if (this.parent) {
      result += this.parent._sumInternal(modType, cfg, flags, keywordFlags, source, names);
    }
    return result;
  }

  _moreInternal(cfg, flags, keywordFlags, source, names) {
    let result = 1;
    const globalLimits = {};
    for (const name of names) {
      const modList = this.mods[name];
      let modResult = 1;
      if (modList) {
        for (let i = 0; i < modList.length; i++) {
          const mod = modList[i];
          if (mod.type === 'MORE' &&
              (flags & mod.flags) === mod.flags &&
              MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
              (!source || (mod.source && mod.source.split(':')[0] === source))) {
            let value;
            if (mod.tags && mod.tags.length > 0) {
              value = this.evalMod(mod, cfg, globalLimits);
              if (value === undefined) value = 0;
            } else {
              value = mod.value || 0;
            }
            modResult *= (1 + value / 100);
          }
        }
      }
      result *= round(modResult, 2);
    }
    if (this.parent) {
      result *= this.parent._moreInternal(cfg, flags, keywordFlags, source, names);
    }
    return result;
  }

  _flagInternal(cfg, flags, keywordFlags, source, names) {
    for (const name of names) {
      const modList = this.mods[name];
      if (modList) {
        for (let i = 0; i < modList.length; i++) {
          const mod = modList[i];
          if (mod.type === 'FLAG' &&
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
    }
    if (this.parent) {
      return this.parent._flagInternal(cfg, flags, keywordFlags, source, names);
    }
    return false;
  }

  _overrideInternal(cfg, flags, keywordFlags, source, names) {
    for (const name of names) {
      const modList = this.mods[name];
      if (modList) {
        for (let i = 0; i < modList.length; i++) {
          const mod = modList[i];
          if (mod.type === 'OVERRIDE' &&
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
    }
    if (this.parent) {
      return this.parent._overrideInternal(cfg, flags, keywordFlags, source, names);
    }
    return undefined;
  }

  _listInternal(result, cfg, flags, keywordFlags, source, names) {
    for (const name of names) {
      const modList = this.mods[name];
      if (modList) {
        for (let i = 0; i < modList.length; i++) {
          const mod = modList[i];
          if (mod.type === 'LIST' &&
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
    }
    if (this.parent) {
      this.parent._listInternal(result, cfg, flags, keywordFlags, source, names);
    }
  }

  _tabulateInternal(result, modType, cfg, flags, keywordFlags, source, names) {
    const globalLimits = {};
    for (const name of names) {
      const modList = this.mods[name];
      if (modList) {
        for (let i = 0; i < modList.length; i++) {
          const mod = modList[i];
          if ((mod.type === modType || !modType) &&
              (flags & mod.flags) === mod.flags &&
              MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
              (!source || (mod.source && mod.source.split(':')[0] === source))) {
            let value;
            if (mod.tags && mod.tags.length > 0) {
              value = this.evalMod(mod, cfg, globalLimits);
            } else {
              value = mod.value;
            }
            if (value !== undefined && (value !== 0 || mod.type === 'OVERRIDE')) {
              result.push({ value, mod });
            }
          }
        }
      }
    }
    if (this.parent) {
      this.parent._tabulateInternal(result, modType, cfg, flags, keywordFlags, source, names);
    }
  }

  _hasModInternal(modType, flags, keywordFlags, source, names) {
    for (const name of names) {
      const modList = this.mods[name];
      if (modList) {
        for (let i = 0; i < modList.length; i++) {
          const mod = modList[i];
          if (mod.type === modType &&
              (flags & mod.flags) === mod.flags &&
              MatchKeywordFlags(keywordFlags, mod.keywordFlags) &&
              (!source || (mod.source && mod.source.split(':')[0] === source))) {
            return true;
          }
        }
      }
    }
    if (this.parent) {
      return this.parent._hasModInternal(modType, flags, keywordFlags, source, names);
    }
    return false;
  }

  // --- Convenience methods ---

  scaleAddMod(mod, scale) {
    if (scale === 1) {
      this.addMod(mod);
    } else {
      const scaledMod = copyTable(mod);
      let subMod = scaledMod;
      if (typeof scaledMod.value === 'object' && scaledMod.value) {
        if (scaledMod.value.mod) {
          subMod = scaledMod.value.mod;
        } else if (scaledMod.value.keyOfScaledMod) {
          scaledMod.value[scaledMod.value.keyOfScaledMod] = round(scaledMod.value[scaledMod.value.keyOfScaledMod] * scale, 2);
        }
      }
      if (typeof subMod.value === 'number') {
        subMod.value = Math.trunc(round(subMod.value * scale, 2));
      }
      this.addMod(scaledMod);
    }
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
