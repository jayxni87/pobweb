import { describe, it, expect } from 'vitest';
import {
  createActiveSkill,
  buildSkillModFlags,
  buildSkillKeywordFlags,
  getWeaponFlags,
  canSupportActiveSkill,
  mergeSkillInstanceMods,
} from '../calc-active-skill.js';
import { ModDB } from '../mod-db.js';
import { ModFlag, KeywordFlag, SkillType } from '../utils.js';

function makeGrantedEffect(opts = {}) {
  return {
    name: opts.name || 'Fireball',
    support: opts.support || false,
    skillTypes: opts.skillTypes || { [SkillType.Spell]: true, [SkillType.Damage]: true, [SkillType.Fire]: true, [SkillType.Projectile]: true },
    baseFlags: opts.baseFlags || { spell: true, projectile: true, area: true },
    addSkillTypes: opts.addSkillTypes || {},
    addFlags: opts.addFlags || {},
    weaponTypes: opts.weaponTypes || null,
    baseMods: opts.baseMods || [],
    levels: opts.levels || { 1: { baseMultiplier: 1, damageEffectiveness: 1, critChance: 6 } },
    statMap: opts.statMap || {},
    modSource: opts.modSource || 'Fireball',
    isTrigger: opts.isTrigger || false,
  };
}

function makeActiveEffect(grantedEffect, opts = {}) {
  return {
    grantedEffect,
    level: opts.level || 1,
    quality: opts.quality || 0,
    srcInstance: opts.srcInstance || null,
    gemData: opts.gemData || null,
  };
}

function makeSupportEffect(opts = {}) {
  const ge = makeGrantedEffect({
    name: opts.name || 'Spell Echo',
    support: true,
    skillTypes: opts.skillTypes || {},
    addSkillTypes: opts.addSkillTypes || {},
    addFlags: opts.addFlags || {},
    baseMods: opts.baseMods || [],
    levels: opts.levels || { 1: {} },
    statMap: opts.statMap || {},
    modSource: opts.modSource || 'Spell Echo',
    isTrigger: opts.isTrigger || false,
    // Support-specific
    excludeSkillTypes: opts.excludeSkillTypes || {},
    requireSkillTypes: opts.requireSkillTypes || null,
    weaponTypes: opts.weaponTypes || null,
  });
  ge.excludeSkillTypes = opts.excludeSkillTypes || {};
  ge.requireSkillTypes = opts.requireSkillTypes || null;
  return makeActiveEffect(ge);
}

describe('createActiveSkill', () => {
  it('creates active skill with skill types and flags', () => {
    const ge = makeGrantedEffect();
    const effect = makeActiveEffect(ge);
    const skill = createActiveSkill(effect, [], {});
    expect(skill.activeEffect).toBe(effect);
    expect(skill.skillTypes[SkillType.Spell]).toBe(true);
    expect(skill.skillTypes[SkillType.Fire]).toBe(true);
    expect(skill.skillFlags.spell).toBe(true);
    expect(skill.skillFlags.projectile).toBe(true);
  });

  it('sets hit flag for damage skills', () => {
    const ge = makeGrantedEffect({
      skillTypes: { [SkillType.Damage]: true },
      baseFlags: {},
    });
    const effect = makeActiveEffect(ge);
    const skill = createActiveSkill(effect, [], {});
    expect(skill.skillFlags.hit).toBe(true);
  });

  it('adds compatible supports to effect list', () => {
    const ge = makeGrantedEffect();
    const effect = makeActiveEffect(ge);
    const support = makeSupportEffect({
      name: 'Added Fire',
      // No require/exclude = compatible with anything
    });
    const skill = createActiveSkill(effect, [support], {});
    expect(skill.effectList).toContain(support);
    expect(skill.effectList.length).toBe(2); // active + support
  });

  it('rejects supports with incompatible excludeSkillTypes', () => {
    const ge = makeGrantedEffect({
      skillTypes: { [SkillType.Spell]: true },
    });
    const effect = makeActiveEffect(ge);
    const support = makeSupportEffect({
      name: 'Melee Support',
      excludeSkillTypes: { [SkillType.Spell]: true },
    });
    const skill = createActiveSkill(effect, [support], {});
    expect(skill.effectList).not.toContain(support);
    expect(skill.effectList.length).toBe(1);
  });

  it('rejects supports with missing requireSkillTypes', () => {
    const ge = makeGrantedEffect({
      skillTypes: { [SkillType.Spell]: true },
      baseFlags: { spell: true },
    });
    const effect = makeActiveEffect(ge);
    const support = makeSupportEffect({
      name: 'Melee Splash',
      requireSkillTypes: { [SkillType.Melee]: true },
    });
    const skill = createActiveSkill(effect, [support], {});
    expect(skill.effectList).not.toContain(support);
  });

  it('adds skill types from compatible supports', () => {
    const ge = makeGrantedEffect({
      skillTypes: { [SkillType.Spell]: true },
      baseFlags: { spell: true },
    });
    const effect = makeActiveEffect(ge);
    const support = makeSupportEffect({
      addSkillTypes: { [SkillType.Duration]: true },
    });
    const skill = createActiveSkill(effect, [support], {});
    expect(skill.skillTypes[SkillType.Duration]).toBe(true);
  });

  it('adds flags from support addFlags', () => {
    const ge = makeGrantedEffect({
      skillTypes: { [SkillType.Spell]: true },
      baseFlags: { spell: true },
    });
    const effect = makeActiveEffect(ge);
    const support = makeSupportEffect({
      addFlags: { mine: true },
    });
    const skill = createActiveSkill(effect, [support], {});
    expect(skill.skillFlags.mine).toBe(true);
  });
});

describe('canSupportActiveSkill', () => {
  it('returns true when no restrictions', () => {
    const support = makeGrantedEffect({ support: true });
    const skill = { skillTypes: { [SkillType.Spell]: true } };
    expect(canSupportActiveSkill(support, skill)).toBe(true);
  });

  it('returns false when excluded type present', () => {
    const support = makeGrantedEffect({ support: true });
    support.excludeSkillTypes = { [SkillType.Spell]: true };
    const skill = { skillTypes: { [SkillType.Spell]: true } };
    expect(canSupportActiveSkill(support, skill)).toBe(false);
  });

  it('returns false when required type missing', () => {
    const support = makeGrantedEffect({ support: true });
    support.requireSkillTypes = { [SkillType.Attack]: true };
    const skill = { skillTypes: { [SkillType.Spell]: true } };
    expect(canSupportActiveSkill(support, skill)).toBe(false);
  });

  it('returns true when required type present', () => {
    const support = makeGrantedEffect({ support: true });
    support.requireSkillTypes = { [SkillType.Attack]: true };
    const skill = { skillTypes: { [SkillType.Attack]: true, [SkillType.Melee]: true } };
    expect(canSupportActiveSkill(support, skill)).toBe(true);
  });
});

describe('buildSkillModFlags', () => {
  it('sets Hit + Cast + Spell for spell hit', () => {
    const flags = buildSkillModFlags({ hit: true, spell: true });
    expect(flags & ModFlag.Hit).not.toBe(0);
    expect(flags & ModFlag.Cast).not.toBe(0);
    expect(flags & ModFlag.Spell).not.toBe(0);
    expect(flags & ModFlag.Attack).toBe(0);
  });

  it('sets Hit + Attack for attack hit', () => {
    const flags = buildSkillModFlags({ hit: true, attack: true });
    expect(flags & ModFlag.Hit).not.toBe(0);
    expect(flags & ModFlag.Attack).not.toBe(0);
    expect(flags & ModFlag.Cast).toBe(0);
  });

  it('sets Melee and Area flags', () => {
    const flags = buildSkillModFlags({ hit: true, attack: true, melee: true, area: true });
    expect(flags & ModFlag.Melee).not.toBe(0);
    expect(flags & ModFlag.Area).not.toBe(0);
  });

  it('sets Projectile for projectile skill', () => {
    const flags = buildSkillModFlags({ hit: true, projectile: true });
    expect(flags & ModFlag.Projectile).not.toBe(0);
  });
});

describe('buildSkillKeywordFlags', () => {
  it('sets Hit keyword for hit skills', () => {
    const kf = buildSkillKeywordFlags({ hit: true }, {});
    expect(kf & KeywordFlag.Hit).not.toBe(0);
  });

  it('sets Aura keyword from skill types', () => {
    const kf = buildSkillKeywordFlags({}, { [SkillType.Aura]: true });
    expect(kf & KeywordFlag.Aura).not.toBe(0);
  });

  it('sets element keywords from skill types', () => {
    const kf = buildSkillKeywordFlags({}, { [SkillType.Fire]: true, [SkillType.Cold]: true });
    expect(kf & KeywordFlag.Fire).not.toBe(0);
    expect(kf & KeywordFlag.Cold).not.toBe(0);
    expect(kf & KeywordFlag.Lightning).toBe(0);
  });

  it('sets Totem keyword for totem skills', () => {
    const kf = buildSkillKeywordFlags({ totem: true }, {});
    expect(kf & KeywordFlag.Totem).not.toBe(0);
    expect(kf & KeywordFlag.Trap).toBe(0);
  });

  it('sets Trap keyword for trap skills', () => {
    const kf = buildSkillKeywordFlags({ trap: true }, {});
    expect(kf & KeywordFlag.Trap).not.toBe(0);
  });

  it('sets Mine keyword for mine skills', () => {
    const kf = buildSkillKeywordFlags({ mine: true }, {});
    expect(kf & KeywordFlag.Mine).not.toBe(0);
  });

  it('sets Attack keyword from skill types', () => {
    const kf = buildSkillKeywordFlags({}, { [SkillType.Attack]: true });
    expect(kf & KeywordFlag.Attack).not.toBe(0);
  });

  it('sets Spell keyword from skill types', () => {
    const kf = buildSkillKeywordFlags({}, { [SkillType.Spell]: true });
    expect(kf & KeywordFlag.Spell).not.toBe(0);
  });

  it('sets Brand keyword for brand skills', () => {
    const kf = buildSkillKeywordFlags({ brand: true }, {});
    expect(kf & KeywordFlag.Brand).not.toBe(0);
  });

  it('sets Warcry keyword from skill types', () => {
    const kf = buildSkillKeywordFlags({}, { [SkillType.Warcry]: true });
    expect(kf & KeywordFlag.Warcry).not.toBe(0);
  });
});

describe('getWeaponFlags', () => {
  it('returns correct flags for sword', () => {
    const info = { flag: 'Sword', oneHand: true, melee: true };
    const flags = getWeaponFlags(info, 'One Handed Sword');
    expect(flags & ModFlag.Sword).not.toBe(0);
    expect(flags & ModFlag.Weapon).not.toBe(0);
    expect(flags & ModFlag.Weapon1H).not.toBe(0);
    expect(flags & ModFlag.WeaponMelee).not.toBe(0);
  });

  it('returns correct flags for bow', () => {
    const info = { flag: 'Bow', oneHand: false, melee: false };
    const flags = getWeaponFlags(info, 'Bow');
    expect(flags & ModFlag.Bow).not.toBe(0);
    expect(flags & ModFlag.Weapon).not.toBe(0);
    expect(flags & ModFlag.Weapon2H).not.toBe(0);
    expect(flags & ModFlag.WeaponRanged).not.toBe(0);
  });

  it('returns 0 for None type', () => {
    const info = { flag: 'Unarmed', oneHand: true, melee: true };
    const flags = getWeaponFlags(info, 'None');
    // None type doesn't set Weapon flag
    expect(flags & ModFlag.Weapon).toBe(0);
  });
});

describe('mergeSkillInstanceMods', () => {
  it('merges stat-mapped mods from skill stats', () => {
    const modList = new ModDB();
    const stats = { fire_damage_pct: 50 };
    const statMap = {
      fire_damage_pct: [
        { name: 'FireDamage', type: 'INC', value: null },
      ],
    };
    mergeSkillInstanceMods(modList, stats, statMap);
    expect(modList.sum('INC', null, 'FireDamage')).toBe(50);
  });

  it('applies mult and div to stat values', () => {
    const modList = new ModDB();
    const stats = { crit_chance: 600 };
    const statMap = {
      crit_chance: [
        { name: 'CritChance', type: 'BASE', value: null, mult: 1, div: 100 },
      ],
    };
    mergeSkillInstanceMods(modList, stats, statMap);
    expect(modList.sum('BASE', null, 'CritChance')).toBe(6);
  });

  it('skips stats not in statMap', () => {
    const modList = new ModDB();
    const stats = { unknown_stat: 100 };
    const statMap = {};
    mergeSkillInstanceMods(modList, stats, statMap);
    // Should not error, just skip
    expect(modList.sum('BASE', null, 'unknown_stat')).toBe(0);
  });

  it('handles grouped mods in statMap', () => {
    const modList = new ModDB();
    const stats = { attack_speed_pct: 10 };
    const statMap = {
      attack_speed_pct: [
        // Group of mods with shared value scaling
        [
          { name: 'Speed', type: 'INC' },
          { name: 'HitRate', type: 'INC' },
        ],
      ],
    };
    // Grouped mods share the same value
    mergeSkillInstanceMods(modList, stats, statMap);
    expect(modList.sum('INC', null, 'Speed')).toBe(10);
    expect(modList.sum('INC', null, 'HitRate')).toBe(10);
  });
});
