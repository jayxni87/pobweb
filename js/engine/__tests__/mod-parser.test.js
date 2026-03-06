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

describe('ModParser totem/trap/mine patterns', () => {
  it('parses totem placement speed', () => {
    const result = parseMod('10% increased Totem Placement Speed');
    expect(result[0].name).toBe('TotemPlacementSpeed');
  });

  it('parses totem life', () => {
    const result = parseMod('20% increased Totem Life');
    expect(result[0].name).toBe('TotemLife');
  });

  it('parses trap throwing speed', () => {
    const result = parseMod('15% increased Trap Throwing Speed');
    expect(result[0].name).toBe('TrapThrowingSpeed');
  });

  it('parses mine laying speed', () => {
    const result = parseMod('10% increased Mine Laying Speed');
    expect(result[0].name).toBe('MineLayingSpeed');
  });

  it('parses maximum totems', () => {
    const result = parseMod('+1 to Maximum Number of Summoned Totems');
    expect(result[0].name).toBe('ActiveTotemLimit');
  });

  it('parses brand activation frequency', () => {
    const result = parseMod('20% increased Brand Activation Frequency');
    expect(result[0].name).toBe('BrandActivationFrequency');
  });
});

describe('ModParser minion patterns', () => {
  it('parses maximum zombies', () => {
    const result = parseMod('+1 to Maximum Number of Raised Zombies');
    expect(result[0].name).toBe('ActiveZombieLimit');
  });

  it('parses maximum skeletons', () => {
    const result = parseMod('+2 to Maximum Number of Summoned Skeletons');
    expect(result[0].name).toBe('ActiveSkeletonLimit');
  });

  it('parses maximum spectres', () => {
    const result = parseMod('+1 to Maximum Number of Raised Spectres');
    expect(result[0].name).toBe('ActiveSpectreLimit');
  });

  it('parses maximum golems', () => {
    const result = parseMod('+1 to Maximum Number of Summoned Golems');
    expect(result[0].name).toBe('ActiveGolemLimit');
  });

  it('parses minion damage as MinionModifier LIST', () => {
    const result = parseMod('30% increased Minion Damage');
    expect(result[0].name).toBe('MinionModifier');
    expect(result[0].type).toBe('LIST');
    expect(result[0].value.mod.name).toBe('Damage');
    expect(result[0].value.mod.value).toBe(30);
  });
});

describe('ModParser aura/curse patterns', () => {
  it('parses aura effect', () => {
    const result = parseMod('15% increased Aura Effect');
    expect(result[0].name).toBe('AuraEffect');
  });

  it('parses curse effect', () => {
    const result = parseMod('20% increased Effect of your Curses');
    expect(result[0].name).toBe('CurseEffect');
  });

  it('parses buff effect', () => {
    const result = parseMod('10% increased Buff Effect');
    expect(result[0].name).toBe('BuffEffect');
  });
});

describe('ModParser flask patterns', () => {
  it('parses flask effect duration', () => {
    const result = parseMod('20% increased Flask Effect Duration');
    expect(result[0].name).toBe('FlaskDuration');
  });

  it('parses flask charges used', () => {
    const result = parseMod('20% reduced Flask Charges Used');
    expect(result[0].name).toBe('FlaskChargesUsed');
    expect(result[0].value).toBe(-20);
  });

  it('parses flask life recovery rate', () => {
    const result = parseMod('10% increased Flask Life Recovery Rate');
    expect(result[0].name).toBe('FlaskLifeRecoveryRate');
  });

  it('parses flask recovery rate', () => {
    const result = parseMod('15% increased Flask Recovery Rate');
    expect(result[0].name).toBe('FlaskRecoveryRate');
  });

  it('parses flask charges gained', () => {
    const result = parseMod('20% increased Flask Charges Gained');
    expect(result[0].name).toBe('FlaskChargesGained');
  });
});

describe('ModParser leech/on-kill patterns', () => {
  it('parses life gained on kill', () => {
    const result = parseMod('+10 to Life gained on Kill');
    expect(result[0].name).toBe('LifeOnKill');
  });

  it('parses mana gained on kill', () => {
    const result = parseMod('+5 to Mana gained on Kill');
    expect(result[0].name).toBe('ManaOnKill');
  });

  it('parses life leech rate', () => {
    const result = parseMod('20% increased Total Recovery per second from Life Leech');
    expect(result[0].name).toBe('LifeLeechRate');
  });
});

describe('ModParser ailment patterns', () => {
  it('parses poison chance', () => {
    const result = parseMod('+10% chance to Poison on Hit');
    expect(result[0].name).toBe('PoisonChance');
  });

  it('parses bleed chance', () => {
    const result = parseMod('25% chance to cause Bleeding on Hit');
    expect(result[0].name).toBe('BleedChance');
  });

  it('parses ignite chance', () => {
    const result = parseMod('+10% chance to Ignite');
    expect(result[0].name).toBe('EnemyIgniteChance');
  });

  it('parses shock chance', () => {
    const result = parseMod('+15% chance to Shock');
    expect(result[0].name).toBe('EnemyShockChance');
  });

  it('parses poison duration', () => {
    const result = parseMod('20% increased Poison Duration');
    expect(result[0].name).toBe('EnemyPoisonDuration');
  });
});

describe('ModParser charge duration patterns', () => {
  it('parses power charge duration', () => {
    const result = parseMod('20% increased Power Charge Duration');
    expect(result[0].name).toBe('PowerChargesDuration');
  });

  it('parses frenzy charge duration', () => {
    const result = parseMod('20% increased Frenzy Charge Duration');
    expect(result[0].name).toBe('FrenzyChargesDuration');
  });

  it('parses charge duration', () => {
    const result = parseMod('15% increased Charge Duration');
    expect(result[0].name).toBe('ChargeDuration');
  });
});

describe('ModParser skill modifier patterns', () => {
  it('parses cooldown recovery', () => {
    const result = parseMod('20% increased Cooldown Recovery Rate');
    expect(result[0].name).toBe('CooldownRecovery');
  });

  it('parses duration', () => {
    const result = parseMod('30% increased Skill Effect Duration');
    expect(result[0].name).toBe('Duration');
  });

  it('parses projectile count', () => {
    const result = parseMod('+2 Projectiles');
    expect(result[0].name).toBe('ProjectileCount');
  });

  it('parses double damage chance', () => {
    const result = parseMod('+5% chance to Deal Double Damage');
    expect(result[0].name).toBe('DoubleDamageChance');
  });
});

describe('ModParser buff condition patterns', () => {
  it('parses onslaught', () => {
    const result = parseMod('You have Onslaught');
    expect(result[0].name).toBe('Condition:Onslaught');
    expect(result[0].type).toBe('FLAG');
  });

  it('parses phasing', () => {
    const result = parseMod('You have Phasing');
    expect(result[0].name).toBe('Condition:Phasing');
    expect(result[0].type).toBe('FLAG');
  });
});

describe('ModParser modFlag postfix patterns', () => {
  it('applies trap keyword flag', () => {
    const result = parseMod('20% increased Damage with Traps');
    expect(result[0].name).toBe('Damage');
    expect(result[0].keywordFlags & 0x00001000).toBeTruthy(); // KeywordFlag.Trap
  });

  it('applies mine keyword flag', () => {
    const result = parseMod('20% increased Damage with Mines');
    expect(result[0].name).toBe('Damage');
    expect(result[0].keywordFlags & 0x00002000).toBeTruthy(); // KeywordFlag.Mine
  });

  it('applies totem keyword flag', () => {
    const result = parseMod('20% increased Damage totem');
    expect(result[0].name).toBe('Damage');
    expect(result[0].keywordFlags & 0x00004000).toBeTruthy(); // KeywordFlag.Totem
  });

  it('applies brand keyword flag', () => {
    const result = parseMod('20% increased Damage brand');
    expect(result[0].name).toBe('Damage');
    expect(result[0].keywordFlags & 0x00100000).toBeTruthy(); // KeywordFlag.Brand
  });
});
