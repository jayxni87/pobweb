import { describe, it, expect } from 'vitest';
import {
  SkillGroup,
  GemInstance,
  isSupport,
  getGemLevelData,
  scaleGemQuality,
} from '../skill.js';

describe('GemInstance', () => {
  it('creates with defaults', () => {
    const gem = new GemInstance({ name: 'Fireball' });
    expect(gem.name).toBe('Fireball');
    expect(gem.level).toBe(1);
    expect(gem.quality).toBe(0);
    expect(gem.enabled).toBe(true);
  });

  it('accepts level and quality', () => {
    const gem = new GemInstance({ name: 'Fireball', level: 20, quality: 23 });
    expect(gem.level).toBe(20);
    expect(gem.quality).toBe(23);
  });

  it('can be disabled', () => {
    const gem = new GemInstance({ name: 'Fireball', enabled: false });
    expect(gem.enabled).toBe(false);
  });

  it('stores gemData reference', () => {
    const data = { id: 'fireball', tags: { spell: true } };
    const gem = new GemInstance({ name: 'Fireball', gemData: data });
    expect(gem.gemData).toBe(data);
  });
});

describe('isSupport', () => {
  it('returns true for support gems', () => {
    expect(isSupport({ tags: { support: true } })).toBe(true);
  });

  it('returns false for active gems', () => {
    expect(isSupport({ tags: { active_skill: true } })).toBe(false);
    expect(isSupport({ tags: {} })).toBe(false);
  });

  it('handles missing tags', () => {
    expect(isSupport({})).toBe(false);
    expect(isSupport(null)).toBe(false);
  });
});

describe('SkillGroup', () => {
  it('creates with empty gem list', () => {
    const group = new SkillGroup();
    expect(group.gems).toEqual([]);
    expect(group.enabled).toBe(true);
    expect(group.slot).toBeNull();
  });

  it('adds gems', () => {
    const group = new SkillGroup();
    group.addGem({ name: 'Fireball', level: 20 });
    group.addGem({ name: 'Spell Echo', level: 20 });
    expect(group.gems).toHaveLength(2);
    expect(group.gems[0].name).toBe('Fireball');
  });

  it('removes gems', () => {
    const group = new SkillGroup();
    group.addGem({ name: 'Fireball' });
    group.addGem({ name: 'Spell Echo' });
    group.removeGem(0);
    expect(group.gems).toHaveLength(1);
    expect(group.gems[0].name).toBe('Spell Echo');
  });

  it('getActiveGems returns only active (non-support) gems', () => {
    const group = new SkillGroup();
    group.addGem({ name: 'Fireball', gemData: { tags: { active_skill: true } } });
    group.addGem({ name: 'Spell Echo', gemData: { tags: { support: true } } });
    const actives = group.getActiveGems();
    expect(actives).toHaveLength(1);
    expect(actives[0].name).toBe('Fireball');
  });

  it('getSupportGems returns only support gems', () => {
    const group = new SkillGroup();
    group.addGem({ name: 'Fireball', gemData: { tags: { active_skill: true } } });
    group.addGem({ name: 'Spell Echo', gemData: { tags: { support: true } } });
    const supports = group.getSupportGems();
    expect(supports).toHaveLength(1);
    expect(supports[0].name).toBe('Spell Echo');
  });

  it('getEnabledGems excludes disabled', () => {
    const group = new SkillGroup();
    group.addGem({ name: 'Fireball', enabled: true });
    group.addGem({ name: 'Spell Echo', enabled: false });
    expect(group.getEnabledGems()).toHaveLength(1);
  });

  it('can be assigned to a slot', () => {
    const group = new SkillGroup({ slot: 'Body Armour' });
    expect(group.slot).toBe('Body Armour');
  });

  it('can be disabled', () => {
    const group = new SkillGroup({ enabled: false });
    expect(group.enabled).toBe(false);
  });
});

describe('getGemLevelData', () => {
  it('returns level data from gem levels', () => {
    const levels = {
      1: { baseDamage: 10, manaCost: 5 },
      20: { baseDamage: 100, manaCost: 25 },
    };
    expect(getGemLevelData(levels, 1)).toEqual({ baseDamage: 10, manaCost: 5 });
    expect(getGemLevelData(levels, 20)).toEqual({ baseDamage: 100, manaCost: 25 });
  });

  it('clamps to max available level', () => {
    const levels = {
      1: { baseDamage: 10 },
      20: { baseDamage: 100 },
    };
    expect(getGemLevelData(levels, 25)).toEqual({ baseDamage: 100 });
  });

  it('clamps to min available level', () => {
    const levels = {
      1: { baseDamage: 10 },
      20: { baseDamage: 100 },
    };
    expect(getGemLevelData(levels, 0)).toEqual({ baseDamage: 10 });
  });
});

describe('scaleGemQuality', () => {
  it('returns base value at 0 quality', () => {
    expect(scaleGemQuality(10, 0, 1)).toBe(10);
  });

  it('scales linearly with quality', () => {
    // base 10, quality 20, scale 0.5 per quality
    expect(scaleGemQuality(10, 20, 0.5)).toBeCloseTo(20);
  });

  it('handles negative quality', () => {
    expect(scaleGemQuality(10, -5, 1)).toBeCloseTo(5);
  });
});
