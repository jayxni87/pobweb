import { describe, it, expect, beforeAll } from 'vitest';
import { GemRegistry } from '../gem-registry.js';

const TEST_GEMS = {
  'Metadata/Items/Gems/SkillGemFireball': {
    name: 'Fireball', gameId: 'Metadata/Items/Gems/SkillGemFireball',
    variantId: 'Fireball', grantedEffectId: 'Fireball',
    tags: { intelligence: true, grants_active_skill: true, spell: true, fire: true },
    tagString: 'Spell, Fire', reqStr: 0, reqDex: 0, reqInt: 100, naturalMaxLevel: 20,
  },
  'Metadata/Items/Gems/SkillGemVaalFireball': {
    name: 'Vaal Fireball', gameId: 'Metadata/Items/Gems/SkillGemVaalFireball',
    variantId: 'VaalFireball', grantedEffectId: 'VaalFireball',
    secondaryGrantedEffectId: 'Fireball', vaalGem: true,
    tags: { intelligence: true, grants_active_skill: true, vaal: true },
    tagString: 'Vaal', reqStr: 0, reqDex: 0, reqInt: 100, naturalMaxLevel: 20,
  },
  'Metadata/Items/Gems/SupportGemSpellEcho': {
    name: 'Spell Echo Support', gameId: 'Metadata/Items/Gems/SupportGemSpellEcho',
    variantId: 'SpellEcho', grantedEffectId: 'SupportSpellEcho',
    tags: { intelligence: true, support: true },
    tagString: 'Support', reqStr: 0, reqDex: 0, reqInt: 100, naturalMaxLevel: 20,
  },
};

describe('GemRegistry', () => {
  let registry;
  beforeAll(() => { registry = new GemRegistry(TEST_GEMS); });

  it('looks up by gameId', () => {
    const gem = registry.findByGameId('Metadata/Items/Gems/SkillGemFireball');
    expect(gem.name).toBe('Fireball');
  });

  it('looks up by name (case-insensitive)', () => {
    const gem = registry.findByName('fireball');
    expect(gem.grantedEffectId).toBe('Fireball');
  });

  it('looks up by grantedEffectId', () => {
    const gem = registry.findBySkillId('Fireball');
    expect(gem.name).toBe('Fireball');
  });

  it('resolves variant by gameId + variantId', () => {
    const gem = registry.findByVariant('Metadata/Items/Gems/SkillGemFireball', 'Fireball');
    expect(gem.name).toBe('Fireball');
  });

  it('returns null for unknown gem', () => {
    expect(registry.findByName('NonExistentGem')).toBeNull();
    expect(registry.findByGameId('fake/id')).toBeNull();
    expect(registry.findBySkillId('FakeSkill')).toBeNull();
  });

  it('provides sorted name list', () => {
    const names = registry.getNameList();
    expect(names).toContain('Fireball');
    expect(names).toContain('Spell Echo Support');
    expect(names).toEqual([...names].sort());
  });

  it('searches names by substring', () => {
    const matches = registry.search('fire');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].name).toBe('Fireball');
  });

  it('search is case-insensitive', () => {
    const matches = registry.search('FIREBALL');
    // Matches both "Fireball" and "Vaal Fireball"
    expect(matches.length).toBe(2);
    expect(matches.map(g => g.name)).toContain('Fireball');
    expect(matches.map(g => g.name)).toContain('Vaal Fireball');
  });

  it('identifies support gems via tags', () => {
    const gem = registry.findByName('Spell Echo Support');
    expect(gem.tags.support).toBe(true);
  });

  it('findByVariant returns null for unknown variant', () => {
    expect(registry.findByVariant('Metadata/Items/Gems/SkillGemFireball', 'UnknownVariant')).toBeNull();
  });
});
