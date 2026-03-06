import { describe, it, expect } from 'vitest';
import { parseLuaTable } from '../convert-lua-data.js';

describe('parseLuaTable', () => {
  it('parses simple key-value table', () => {
    const input = '{ name = "Fireball", level = 20, active = true }';
    expect(parseLuaTable(input)).toEqual({ name: 'Fireball', level: 20, active: true });
  });

  it('parses nested tables', () => {
    const input = '{ tags = { fire = true, spell = true }, reqInt = 100 }';
    expect(parseLuaTable(input)).toEqual({ tags: { fire: true, spell: true }, reqInt: 100 });
  });

  it('parses array-style tables', () => {
    const input = '{ "Physical", "Lightning", "Cold", "Fire", "Chaos" }';
    expect(parseLuaTable(input)).toEqual(['Physical', 'Lightning', 'Cold', 'Fire', 'Chaos']);
  });

  it('parses numeric keys', () => {
    const input = '{ [1] = "first", [2] = "second" }';
    expect(parseLuaTable(input)).toEqual(['first', 'second']);
  });

  it('parses string keys with brackets', () => {
    const input = '{ ["Metadata/Items/Gems/Fireball"] = { name = "Fireball" } }';
    expect(parseLuaTable(input)).toEqual({ 'Metadata/Items/Gems/Fireball': { name: 'Fireball' } });
  });

  it('handles multiline strings', () => {
    const input = '{ desc = [[\nline1\nline2\n]] }';
    expect(parseLuaTable(input)).toEqual({ desc: 'line1\nline2\n' });
  });

  it('handles hex numbers', () => {
    const input = '{ flags = 0x0E }';
    expect(parseLuaTable(input)).toEqual({ flags: 14 });
  });

  it('handles negative numbers', () => {
    const input = '{ val = -30 }';
    expect(parseLuaTable(input)).toEqual({ val: -30 });
  });
});
