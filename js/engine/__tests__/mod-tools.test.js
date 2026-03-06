import { describe, it, expect } from 'vitest';
import { createMod, compareModParams, formatMod, formatFlags, formatTag, formatTags, setSource } from '../mod-tools.js';
import { ModFlag, KeywordFlag } from '../utils.js';

describe('createMod', () => {
  it('creates a basic mod', () => {
    const mod = createMod('Life', 'BASE', 50, 'Tree:1234');
    expect(mod.name).toBe('Life');
    expect(mod.type).toBe('BASE');
    expect(mod.value).toBe(50);
    expect(mod.source).toBe('Tree:1234');
    expect(mod.flags).toBe(0);
    expect(mod.keywordFlags).toBe(0);
    expect(mod.tags).toHaveLength(0);
  });

  it('creates a mod with flags', () => {
    const mod = createMod('Damage', 'INC', 20, 'Item:1', ModFlag.Attack, KeywordFlag.Fire);
    expect(mod.flags).toBe(ModFlag.Attack);
    expect(mod.keywordFlags).toBe(KeywordFlag.Fire);
  });

  it('creates a mod with tags', () => {
    const mod = createMod('Damage', 'MORE', 10, 'Skill', 0, 0,
      { type: 'Condition', var: 'Onslaught' });
    expect(mod.tags).toHaveLength(1);
    expect(mod.tags[0].type).toBe('Condition');
    expect(mod.tags[0].var).toBe('Onslaught');
  });

  it('creates a mod with multiple tags', () => {
    const mod = createMod('Damage', 'INC', 15, 'Tree', 0, 0,
      { type: 'Condition', var: 'Onslaught' },
      { type: 'Multiplier', var: 'FrenzyCharge' });
    expect(mod.tags).toHaveLength(2);
  });

  it('creates a mod without source', () => {
    const mod = createMod('Life', 'BASE', 50);
    expect(mod.source).toBeUndefined();
    expect(mod.flags).toBe(0);
  });
});

describe('compareModParams', () => {
  it('returns true for identical params', () => {
    const a = createMod('Life', 'BASE', 50, 'A');
    const b = createMod('Life', 'BASE', 100, 'A');
    expect(compareModParams(a, b)).toBe(true);
  });

  it('returns false for different names', () => {
    const a = createMod('Life', 'BASE', 50, 'A');
    const b = createMod('Mana', 'BASE', 50, 'A');
    expect(compareModParams(a, b)).toBe(false);
  });

  it('returns false for different types', () => {
    const a = createMod('Life', 'BASE', 50, 'A');
    const b = createMod('Life', 'INC', 50, 'A');
    expect(compareModParams(a, b)).toBe(false);
  });

  it('returns false for different flags', () => {
    const a = createMod('Damage', 'INC', 10, 'A', ModFlag.Attack);
    const b = createMod('Damage', 'INC', 10, 'A', ModFlag.Spell);
    expect(compareModParams(a, b)).toBe(false);
  });

  it('returns true when tags match', () => {
    const a = createMod('Damage', 'INC', 10, 'A', 0, 0, { type: 'Condition', var: 'X' });
    const b = createMod('Damage', 'INC', 20, 'B', 0, 0, { type: 'Condition', var: 'X' });
    expect(compareModParams(a, b)).toBe(true);
  });

  it('returns false when tag count differs', () => {
    const a = createMod('Damage', 'INC', 10, 'A', 0, 0, { type: 'Condition', var: 'X' });
    const b = createMod('Damage', 'INC', 10, 'A');
    expect(compareModParams(a, b)).toBe(false);
  });
});

describe('formatFlags', () => {
  it('formats ModFlag', () => {
    const result = formatFlags(ModFlag.Attack | ModFlag.Melee, ModFlag);
    expect(result).toContain('Attack');
    expect(result).toContain('Melee');
  });

  it('returns - for no flags', () => {
    expect(formatFlags(0, ModFlag)).toBe('-');
  });
});

describe('formatTag', () => {
  it('formats a condition tag', () => {
    const result = formatTag({ type: 'Condition', var: 'Onslaught' });
    expect(result).toContain('type=Condition');
    expect(result).toContain('var=Onslaught');
  });
});

describe('setSource', () => {
  it('sets source on mod', () => {
    const mod = createMod('Life', 'BASE', 50, 'Old');
    setSource(mod, 'New');
    expect(mod.source).toBe('New');
  });

  it('sets source on nested value mod', () => {
    const inner = createMod('Damage', 'INC', 10, 'Old');
    const mod = createMod('ExtraSkillMod', 'LIST', { mod: inner }, 'Old');
    setSource(mod, 'New');
    expect(mod.source).toBe('New');
    expect(inner.source).toBe('New');
  });
});
