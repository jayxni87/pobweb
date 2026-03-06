import { describe, it, expect } from 'vitest';
import { round, copyTable, wipeTable, stripEscapes, ModFlag, KeywordFlag, MatchKeywordFlags, dmgTypeList, ailmentTypeList, SkillType } from '../utils.js';

describe('round', () => {
  it('rounds to specified decimals', () => {
    expect(round(1.2345, 2)).toBe(1.23);
    expect(round(1.235, 2)).toBe(1.24);
    expect(round(100, 0)).toBe(100);
  });

  it('rounds to nearest integer when no dec', () => {
    expect(round(1.5)).toBe(2);
    expect(round(1.4)).toBe(1);
  });
});

describe('copyTable', () => {
  it('deep copies an object', () => {
    const orig = { a: 1, b: { c: 2 } };
    const copy = copyTable(orig);
    copy.b.c = 99;
    expect(orig.b.c).toBe(2);
  });

  it('deep copies arrays', () => {
    const orig = [1, [2, 3]];
    const copy = copyTable(orig);
    copy[1][0] = 99;
    expect(orig[1][0]).toBe(2);
  });
});

describe('wipeTable', () => {
  it('clears all keys from an object', () => {
    const obj = { a: 1, b: 2 };
    const result = wipeTable(obj);
    expect(result).toBe(obj);
    expect(Object.keys(obj)).toHaveLength(0);
  });

  it('returns new object if none provided', () => {
    const result = wipeTable(null);
    expect(result).toEqual({});
  });
});

describe('stripEscapes', () => {
  it('removes ^digit color codes', () => {
    expect(stripEscapes('^7Hello ^1World')).toBe('Hello World');
  });
  it('removes ^xRRGGBB color codes', () => {
    expect(stripEscapes('^xE05030fire ^x5080E0cold')).toBe('fire cold');
  });
  it('handles text with no escapes', () => {
    expect(stripEscapes('plain text')).toBe('plain text');
  });
});

describe('ModFlag', () => {
  it('has expected bit values', () => {
    expect(ModFlag.Attack).toBe(0x00000001);
    expect(ModFlag.Spell).toBe(0x00000002);
    expect(ModFlag.Hit).toBe(0x00000004);
    expect(ModFlag.Dot).toBe(0x00000008);
    expect(ModFlag.Melee).toBe(0x00000100);
    expect(ModFlag.Axe).toBe(0x00010000);
    expect(typeof ModFlag.Attack).toBe('number');
  });
});

describe('KeywordFlag', () => {
  it('has expected bit values', () => {
    expect(KeywordFlag.Fire).toBe(0x00000020);
    expect(KeywordFlag.Cold).toBe(0x00000040);
    expect(KeywordFlag.Lightning).toBe(0x00000080);
    expect(KeywordFlag.Chaos).toBe(0x00000100);
    expect(KeywordFlag.MatchAll).toBe(0x40000000);
  });
});

describe('MatchKeywordFlags', () => {
  it('matches when mod has no flags', () => {
    expect(MatchKeywordFlags(KeywordFlag.Fire, 0)).toBe(true);
  });

  it('matches when any flag matches (default behavior)', () => {
    expect(MatchKeywordFlags(KeywordFlag.Fire | KeywordFlag.Cold, KeywordFlag.Fire)).toBe(true);
  });

  it('does not match when no flags overlap', () => {
    expect(MatchKeywordFlags(KeywordFlag.Fire, KeywordFlag.Cold)).toBe(false);
  });

  it('MatchAll requires all flags to match', () => {
    const modFlags = KeywordFlag.Fire | KeywordFlag.Cold | KeywordFlag.MatchAll;
    expect(MatchKeywordFlags(KeywordFlag.Fire | KeywordFlag.Cold, modFlags)).toBe(true);
    expect(MatchKeywordFlags(KeywordFlag.Fire, modFlags)).toBe(false);
  });
});

describe('dmgTypeList', () => {
  it('has 5 damage types in order', () => {
    expect(dmgTypeList).toEqual(['Physical', 'Lightning', 'Cold', 'Fire', 'Chaos']);
  });
});

describe('ailmentTypeList', () => {
  it('has expected ailment types', () => {
    expect(ailmentTypeList).toContain('Bleed');
    expect(ailmentTypeList).toContain('Ignite');
    expect(ailmentTypeList).toContain('Poison');
  });
});

describe('SkillType', () => {
  it('has expected values', () => {
    expect(SkillType.Attack).toBe(1);
    expect(SkillType.Spell).toBe(2);
    expect(SkillType.Melee).toBe(24);
  });
});
