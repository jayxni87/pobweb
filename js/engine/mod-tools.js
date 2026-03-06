// PoBWeb - Mod Tools (port of Modules/ModTools.lua)

import { ModFlag, KeywordFlag } from './utils.js';

/**
 * Create a modifier object.
 * @param {string} modName - Stat name (e.g. 'Life', 'Damage')
 * @param {string} modType - Mod type: 'BASE', 'INC', 'MORE', 'FLAG', 'LIST', 'OVERRIDE'
 * @param {*} modVal - Modifier value
 * @param {string} [source] - Source identifier
 * @param {number} [flags=0] - ModFlag bitmask
 * @param {number} [keywordFlags=0] - KeywordFlag bitmask
 * @param {...object} tags - Conditional tags
 */
export function createMod(modName, modType, modVal, ...rest) {
  let source;
  let flags = 0;
  let keywordFlags = 0;
  let tagStart = 0;

  if (rest.length >= 1 && typeof rest[0] === 'string') {
    source = rest[0];
    tagStart = 1;
  }
  if (rest.length >= tagStart + 1 && typeof rest[tagStart] === 'number') {
    flags = rest[tagStart];
    tagStart++;
  }
  if (rest.length >= tagStart + 1 && typeof rest[tagStart] === 'number') {
    keywordFlags = rest[tagStart];
    tagStart++;
  }

  return {
    name: modName,
    type: modType,
    value: modVal,
    flags,
    keywordFlags,
    source,
    tags: rest.slice(tagStart),
  };
}

export function compareModParams(modA, modB) {
  if (modA.name !== modB.name || modA.type !== modB.type ||
      modA.flags !== modB.flags || modA.keywordFlags !== modB.keywordFlags ||
      modA.tags.length !== modB.tags.length) {
    return false;
  }
  for (let i = 0; i < modA.tags.length; i++) {
    if (modA.tags[i].type !== modB.tags[i].type) return false;
    if (formatTag(modA.tags[i]) !== formatTag(modB.tags[i])) return false;
  }
  return true;
}

export function formatFlags(flags, src) {
  const names = [];
  for (const name in src) {
    if ((flags & src[name]) === src[name] && src[name] !== 0) {
      names.push(name);
    }
  }
  names.sort();
  return names.length > 0 ? names.join(',') : '-';
}

export function formatTag(tag) {
  const paramNames = [];
  let haveType = false;
  for (const name in tag) {
    if (name === 'type') {
      haveType = true;
    } else {
      paramNames.push(name);
    }
  }
  paramNames.sort();
  if (haveType) paramNames.unshift('type');

  return paramNames.map(name => {
    let val = tag[name];
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        if (val.length > 0 && typeof val[0] === 'object') {
          val = formatTags(val);
        } else {
          val = val.join(',');
        }
      } else {
        val = formatTag(val);
      }
      val = `{${val}}`;
    }
    return `${name}=${val}`;
  }).join('/');
}

export function formatTags(tagList) {
  if (!tagList || tagList.length === 0) return '-';
  return tagList.map(tag => formatTag(tag)).join(',');
}

export function formatValue(value) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return String(value);
  }
  const paramNames = [];
  let haveType = false;
  for (const name in value) {
    if (name === 'type') {
      haveType = true;
    } else {
      paramNames.push(name);
    }
  }
  paramNames.sort();
  if (haveType) paramNames.unshift('type');

  const parts = paramNames.map(name => {
    if (name === 'mod') {
      return `${name}=[${formatMod(value[name])}]`;
    }
    return `${name}=${formatValue(value[name])}`;
  });
  return `{${parts.join('/')}}`;
}

export function formatModParams(mod) {
  return `${mod.name}|${mod.type}|${formatFlags(mod.flags, ModFlag)}|${formatFlags(mod.keywordFlags, KeywordFlag)}|${formatTags(mod.tags)}`;
}

export function formatMod(mod) {
  return `${formatValue(mod.value)} = ${formatModParams(mod)}`;
}

export function formatSourceMod(mod) {
  return `${formatValue(mod.value)}|${mod.source}|${formatModParams(mod)}`;
}

export function setSource(mod, source) {
  mod.source = source;
  if (mod.value && typeof mod.value === 'object' && mod.value.mod) {
    mod.value.mod.source = source;
  }
  return mod;
}
