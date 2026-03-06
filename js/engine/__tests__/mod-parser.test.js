import { describe, it, expect } from 'vitest';
import { parseMod } from '../mod-parser.js';

describe('ModParser forms', () => {
  it('parses increased form', () => {
    const result = parseMod('10% increased Maximum Life');
    expect(result).toBeTruthy();
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('INC');
    expect(result[0].value).toBe(10);
    expect(result[0].name).toBe('Life');
  });

  it('parses reduced form (negated INC)', () => {
    const result = parseMod('10% reduced Maximum Life');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('INC');
    expect(result[0].value).toBe(-10);
  });

  it('parses more form', () => {
    const result = parseMod('20% more Attack Speed');
    expect(result).toBeTruthy();
    expect(result[0].type).toBe('MORE');
    expect(result[0].value).toBe(20);
  });

  it('parses less form (negated MORE)', () => {
    const result = parseMod('15% less Attack Speed');
    expect(result[0].type).toBe('MORE');
    expect(result[0].value).toBe(-15);
  });

  it('parses base addition form with +', () => {
    const result = parseMod('+50 to Maximum Life');
    expect(result).toBeTruthy();
    expect(result[0].type).toBe('BASE');
    expect(result[0].value).toBe(50);
    expect(result[0].name).toBe('Life');
  });

  it('parses negative base form', () => {
    const result = parseMod('-20 to Maximum Life');
    expect(result[0].type).toBe('BASE');
    expect(result[0].value).toBe(-20);
  });
});

describe('ModParser defence patterns', () => {
  it('parses life', () => {
    const result = parseMod('+50 to Maximum Life');
    expect(result[0].name).toBe('Life');
    expect(result[0].value).toBe(50);
  });

  it('parses resistance', () => {
    const result = parseMod('+30% to Fire Resistance');
    expect(result[0].name).toBe('FireResist');
    expect(result[0].value).toBe(30);
  });

  it('parses energy shield', () => {
    const result = parseMod('15% increased Maximum Energy Shield');
    expect(result[0].name).toBe('EnergyShield');
    expect(result[0].type).toBe('INC');
    expect(result[0].value).toBe(15);
  });

  it('parses attributes', () => {
    const result = parseMod('+20 to Strength');
    expect(result[0].name).toBe('Str');
    expect(result[0].value).toBe(20);
  });

  it('parses all attributes', () => {
    const result = parseMod('+10 to all Attributes');
    expect(result.length).toBeGreaterThanOrEqual(3);
    const names = result.map(m => m.name);
    expect(names).toContain('Str');
    expect(names).toContain('Dex');
    expect(names).toContain('Int');
  });

  it('parses armour', () => {
    const result = parseMod('20% increased Armour');
    expect(result[0].name).toBe('Armour');
    expect(result[0].type).toBe('INC');
  });

  it('parses evasion', () => {
    const result = parseMod('15% increased Evasion Rating');
    expect(result[0].name).toBe('Evasion');
  });

  it('parses elemental resistances', () => {
    const result = parseMod('+12% to all Elemental Resistances');
    expect(result[0].name).toBe('ElementalResist');
    expect(result[0].value).toBe(12);
  });

  it('parses chaos resistance', () => {
    const result = parseMod('+20% to Chaos Resistance');
    expect(result[0].name).toBe('ChaosResist');
  });

  it('parses block chance', () => {
    const result = parseMod('+5% Chance to Block');
    expect(result[0].name).toBe('BlockChance');
  });

  it('parses mana', () => {
    const result = parseMod('+40 to Maximum Mana');
    expect(result[0].name).toBe('Mana');
    expect(result[0].value).toBe(40);
  });
});

describe('ModParser offence patterns', () => {
  it('parses attack speed', () => {
    const result = parseMod('10% increased Attack Speed');
    expect(result[0].name).toBe('Speed');
    expect(result[0].flags & 1).toBeTruthy(); // ModFlag.Attack
  });

  it('parses cast speed', () => {
    const result = parseMod('10% increased Cast Speed');
    expect(result[0].name).toBe('Speed');
    expect(result[0].flags & 2).toBeTruthy(); // ModFlag.Spell
  });

  it('parses critical strike chance', () => {
    const result = parseMod('25% increased Critical Strike Chance');
    expect(result[0].name).toBe('CritChance');
  });

  it('parses critical strike multiplier', () => {
    const result = parseMod('+15% to Critical Strike Multiplier');
    expect(result[0].name).toBe('CritMultiplier');
  });

  it('parses physical damage', () => {
    const result = parseMod('20% increased Physical Damage');
    expect(result[0].name).toBe('PhysicalDamage');
  });

  it('parses spell damage', () => {
    const result = parseMod('30% increased Spell Damage');
    expect(result[0].name).toBe('Damage');
    expect(result[0].flags & 2).toBeTruthy(); // ModFlag.Spell
  });

  it('parses accuracy', () => {
    const result = parseMod('+200 to Accuracy Rating');
    expect(result[0].name).toBe('Accuracy');
    expect(result[0].value).toBe(200);
  });

  it('parses added damage', () => {
    const result = parseMod('Adds 10 to 20 Fire Damage');
    expect(result).toBeTruthy();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('FireMin');
    expect(result[0].value).toBe(10);
    expect(result[1].name).toBe('FireMax');
    expect(result[1].value).toBe(20);
  });

  it('returns null for unrecognized mod', () => {
    const result = parseMod('this is not a real modifier');
    expect(result).toBeNull();
  });
});
