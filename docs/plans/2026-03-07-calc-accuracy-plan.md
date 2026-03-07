# Calc Accuracy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make PoBWeb's stat calculations match Lua PoB exactly — defensive stats and DPS.

**Architecture:** Fix base setup gaps, expand mod parser, complete defence calc, port offence calc engine. Validate against reference build (pobb.in/U0G4dc9FIs0w).

**Tech Stack:** Vanilla JS, Vitest for testing, no new dependencies.

---

## Task 1: Fix Missing Base Setup Mods

**Files:**
- Modify: `js/engine/calc-setup.js` (the `initModDB` function and character constants)
- Modify: `js/app.js:1471-1535` (the `_runCalc` method)
- Test: `js/engine/__tests__/calc-setup.test.js` (create)

**Context:** Our `_runCalc()` is missing ~15 base mods that Lua's CalcSetup.lua adds. The `modDB.multipliers.Level` is never set, causing all Multiplier-tagged tree mods (like "+X per Level" mods) to silently evaluate to 0. The -60 resistance penalty from Acts 5/10 is missing, making resistances 60 points too high.

**Step 1: Write failing tests**

Create `js/engine/__tests__/calc-setup.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { initModDB, characterConstants } from '../calc-setup.js';
import { ModDB } from '../mod-db.js';

describe('initModDB', () => {
  it('sets resistance caps to 75', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'FireResistMax')).toBe(75);
  });

  it('sets base resistance penalty to -60', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'FireResist')).toBe(-60);
    expect(modDB.sum('BASE', null, 'ColdResist')).toBe(-60);
    expect(modDB.sum('BASE', null, 'LightningResist')).toBe(-60);
    expect(modDB.sum('BASE', null, 'ChaosResist')).toBe(-60);
  });

  it('sets base evasion rating to 15', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'Evasion')).toBe(15);
  });

  it('sets base crit multiplier to 50', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    expect(modDB.sum('BASE', null, 'CritMultiplier')).toBe(50);
  });
});

describe('characterConstants', () => {
  it('has life_per_level = 12', () => {
    expect(characterConstants['life_per_level']).toBe(12);
  });
  it('has base_evasion_rating = 15', () => {
    expect(characterConstants['base_evasion_rating']).toBe(15);
  });
  it('has base_critical_strike_multiplier = 150', () => {
    expect(characterConstants['base_critical_strike_multiplier']).toBe(150);
  });
  it('has accuracy_rating_per_level = 2', () => {
    expect(characterConstants['accuracy_rating_per_level']).toBe(2);
  });
});
```

**Step 2: Run tests, verify they fail**

```bash
npx vitest run js/engine/__tests__/calc-setup.test.js
```

Expected: Tests for resistance penalty, base evasion, base crit multiplier fail (these mods don't exist yet).

**Step 3: Add missing constants and base mods**

In `js/engine/calc-setup.js`, expand `characterConstants` with all values from Lua's `Data/Misc.lua`:

```js
const characterConstants = {
  // existing...
  'base_evasion_rating': 15,
  'accuracy_rating_per_level': 2,
  'base_critical_strike_multiplier': 150,
  'critical_ailment_dot_multiplier_+': 50,
  'energy_shield_recharge_rate_per_minute_%': 2000,
  'mana_regeneration_rate_per_minute_%': 105,
  'dual_wield_inherent_attack_speed_+%_final': 10,
  'inherent_block_while_dual_wielding_%': 20,
  'base_attack_speed_+%_per_frenzy_charge': 4,
  'base_cast_speed_+%_per_frenzy_charge': 4,
  'object_inherent_damage_+%_final_per_frenzy_charge': 4,
  'physical_damage_reduction_%_per_endurance_charge': 4,
  'elemental_damage_reduction_%_per_endurance_charge': 4,
  'critical_strike_chance_+%_per_power_charge': 50,
  'maximum_rage': 30,
  'base_max_fortification': 20,
  'base_number_of_traps_allowed': 15,
  'base_number_of_remote_mines_allowed': 15,
  'damage_+%_per_10_rampage_stacks': 2,
  'movement_velocity_+%_per_10_rampage_stacks': 1,
  'max_rampage_stacks': 1000,
  'chance_to_deal_triple_damage_%_per_brutal_charge': 3,
  'ailment_damage_+%_final_per_affliction_charge': 8,
  'non_damaging_ailment_effect_+%_final_per_affliction_charge': 8,
  'elemental_damage_taken_goes_to_energy_shield_over_4_seconds_%_per_absorption_charge': 12,
  'soul_eater_maximum_stacks': 45,
};
```

In `initModDB()`, add the missing base mods:

```js
// Resistance penalty (Acts 5 & 10)
modDB.newMod('FireResist', 'BASE', -60, 'Base');
modDB.newMod('ColdResist', 'BASE', -60, 'Base');
modDB.newMod('LightningResist', 'BASE', -60, 'Base');
modDB.newMod('ChaosResist', 'BASE', -60, 'Base');

// Base evasion
modDB.newMod('Evasion', 'BASE', c['base_evasion_rating'], 'Base');

// Base crit multiplier (150 - 100 = 50)
modDB.newMod('CritMultiplier', 'BASE', c['base_critical_strike_multiplier'] - 100, 'Base');

// Crit ailment DoT multiplier (on crit)
modDB.newMod('DotMultiplier', 'BASE', c['critical_ailment_dot_multiplier_+'], 'Base',
  0, 0, { type: 'Condition', var: 'CriticalStrike' });

// Crit chance cap
// (already exists)

// Charge-based mods
modDB.newMod('CritChance', 'INC', c['critical_strike_chance_+%_per_power_charge'], 'Base',
  0, 0, { type: 'Multiplier', var: 'PowerCharge' });
modDB.newMod('Speed', 'INC', c['base_attack_speed_+%_per_frenzy_charge'], 'Base',
  ModFlag.Attack, 0, { type: 'Multiplier', var: 'FrenzyCharge' });
modDB.newMod('Speed', 'INC', c['base_cast_speed_+%_per_frenzy_charge'], 'Base',
  ModFlag.Cast, 0, { type: 'Multiplier', var: 'FrenzyCharge' });
modDB.newMod('Damage', 'MORE', c['object_inherent_damage_+%_final_per_frenzy_charge'], 'Base',
  0, 0, { type: 'Multiplier', var: 'FrenzyCharge' });
modDB.newMod('PhysicalDamageReduction', 'BASE', c['physical_damage_reduction_%_per_endurance_charge'], 'Base',
  0, 0, { type: 'Multiplier', var: 'EnduranceCharge' });
modDB.newMod('ElementalDamageReduction', 'BASE', c['elemental_damage_reduction_%_per_endurance_charge'], 'Base',
  0, 0, { type: 'Multiplier', var: 'EnduranceCharge' });

// Dual wielding bonuses
modDB.newMod('Speed', 'MORE', c['dual_wield_inherent_attack_speed_+%_final'], 'Base',
  ModFlag.Attack, 0, { type: 'Condition', var: 'DualWielding' });
modDB.newMod('BlockChance', 'BASE', c['inherent_block_while_dual_wielding_%'], 'Base',
  0, 0, { type: 'Condition', var: 'DualWielding' });

// Totem resistances
modDB.newMod('TotemFireResist', 'BASE', 40, 'Base');
modDB.newMod('TotemColdResist', 'BASE', 40, 'Base');
modDB.newMod('TotemLightningResist', 'BASE', 40, 'Base');
modDB.newMod('TotemChaosResist', 'BASE', 20, 'Base');

// Other base limits
modDB.newMod('MaximumRage', 'BASE', c['maximum_rage'], 'Base');
modDB.newMod('MaximumFortification', 'BASE', c['base_max_fortification'], 'Base');
modDB.newMod('ActiveTrapLimit', 'BASE', c['base_number_of_traps_allowed'], 'Base');
modDB.newMod('ActiveMineLimit', 'BASE', c['base_number_of_remote_mines_allowed'], 'Base');
modDB.newMod('ProjectileCount', 'BASE', 1, 'Base');
modDB.newMod('ActiveBrandLimit', 'BASE', 3, 'Base');
modDB.newMod('EnemyCurseLimit', 'BASE', 1, 'Base');
```

In `_runCalc()` in app.js, add the Level multiplier and accuracy:

```js
// Set level multiplier (required for Multiplier-tagged tree mods)
modDB.multipliers.Level = Math.max(1, Math.min(100, this.level));

// Base accuracy per level
const accPerLevel = 2; // characterConstants.accuracy_rating_per_level
modDB.newMod('Accuracy', 'BASE', accPerLevel * this.level, 'Base');
```

**Step 4: Run tests, verify they pass**

```bash
npx vitest run js/engine/__tests__/calc-setup.test.js
```

**Step 5: Commit**

```bash
git add js/engine/calc-setup.js js/engine/__tests__/calc-setup.test.js js/app.js
git commit -m "fix: add missing base setup mods (resistance penalty, evasion, crit, charges)"
```

---

## Task 2: Add Mod Parser Diagnostic Logging

**Files:**
- Modify: `js/engine/mod-parser.js:651-657` (parseMod function)
- Modify: `js/app.js:1492-1498` (where parseMod is called in _runCalc)
- Test: manual — import reference build, check console for unparsed lines

**Context:** When `parseMod()` returns null for a stat line, the mod is silently dropped. We need visibility into what's being missed so we can prioritize parser improvements.

**Step 1: Add diagnostic counter to parseMod**

In `js/engine/mod-parser.js`, add a static diagnostics object:

```js
export const modParserDiag = {
  total: 0,
  parsed: 0,
  failed: 0,
  failedLines: [],
  reset() {
    this.total = 0;
    this.parsed = 0;
    this.failed = 0;
    this.failedLines = [];
  }
};
```

Update `parseMod()`:

```js
export function parseMod(line, diag) {
  if (cache[line]) {
    if (diag) { diag.total++; diag.parsed++; }
    return cache[line];
  }
  const result = parseModInternal(line);
  cache[line] = result;
  if (diag) {
    diag.total++;
    if (result) { diag.parsed++; }
    else {
      diag.failed++;
      if (!diag.failedLines.includes(line)) diag.failedLines.push(line);
    }
  }
  return result;
}
```

**Step 2: Wire diagnostics into _runCalc**

In `_runCalc()`, pass diag object and log results:

```js
const diag = { total: 0, parsed: 0, failed: 0, failedLines: [] };
if (this.treeAllocation) {
  const stats = this.treeAllocation.collectStats();
  for (const statLine of stats) {
    const mods = parseMod(statLine, diag);
    if (mods && mods.length) modDB.addList(mods);
  }
}
if (diag.failed > 0) {
  console.warn(`[ModParser] ${diag.parsed}/${diag.total} parsed, ${diag.failed} failed:`);
  for (const line of diag.failedLines.slice(0, 20)) {
    console.warn(`  - "${line}"`);
  }
}
```

**Step 3: Commit**

```bash
git add js/engine/mod-parser.js js/app.js
git commit -m "feat: add mod parser diagnostic logging for unparsed stat lines"
```

---

## Task 3: Expand Mod Parser — Common Missing Patterns

**Files:**
- Modify: `js/engine/mod-parser.js` (formList, modNameList, and parseModInternal)
- Test: `js/engine/__tests__/mod-parser.test.js` (create)

**Context:** After Task 2, import the reference build and collect all failed parse lines. Common missing patterns from tree nodes include: conversion mods, "per X" mods, "while X" conditionals, grant skill mods, and keystone-specific text. This task adds the highest-impact missing patterns.

**Step 1: Write failing tests for known missing patterns**

Create `js/engine/__tests__/mod-parser.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseMod } from '../mod-parser.js';

describe('parseMod — expanded patterns', () => {
  // Conversion
  it('parses "40% of Physical Damage Converted to Fire Damage"', () => {
    const mods = parseMod('40% of Physical Damage Converted to Fire Damage');
    expect(mods).not.toBeNull();
    expect(mods[0].name).toBe('PhysicalDamageConvertToFire');
    expect(mods[0].value).toBe(40);
  });

  // "per" stat mods
  it('parses "+1 to Maximum Life per 2 Strength"', () => {
    // This is a PerStat-tagged mod — for now we test it parses at all
    const mods = parseMod('+1 to Maximum Life per 2 Strength');
    expect(mods).not.toBeNull();
  });

  // Conditional "while" mods
  it('parses "10% increased Attack Speed while Dual Wielding"', () => {
    const mods = parseMod('10% increased Attack Speed while Dual Wielding');
    expect(mods).not.toBeNull();
    expect(mods[0].name).toBe('Speed');
    expect(mods[0].type).toBe('INC');
    expect(mods[0].value).toBe(10);
  });

  // Grants skill
  it('parses "Grants Level 20 Determination Skill"', () => {
    const mods = parseMod('Grants Level 20 Determination Skill');
    expect(mods).not.toBeNull();
  });

  // Resistance + combined stat
  it('parses "+12% to Fire and Cold Resistances"', () => {
    const mods = parseMod('+12% to Fire and Cold Resistances');
    expect(mods).not.toBeNull();
    expect(mods.length).toBe(2);
    expect(mods[0].name).toBe('FireResist');
    expect(mods[1].name).toBe('ColdResist');
  });

  // Negative form
  it('parses "-30% to Fire Resistance"', () => {
    const mods = parseMod('-30% to Fire Resistance');
    expect(mods).not.toBeNull();
    expect(mods[0].value).toBe(-30);
  });
});
```

**Step 2: Run tests, verify failures**

```bash
npx vitest run js/engine/__tests__/mod-parser.test.js
```

**Step 3: Add missing patterns**

Add to `formList`:
```js
[/^(\d+)% of (\w+) damage converted to (\w+) damage/i, 'CONVERT'],
[/^grants level (\d+) (.+)/i, 'GRANT'],
```

Add to `modNameList`:
```js
// Conversion targets (used by CONVERT form)
// ... handled in parseModInternal

// Additional missing entries
'spell suppression chance': 'SpellSuppressionChance',
'chance to suppress spell damage': 'SpellSuppressionChance',
'critical strike chance for attacks': { name: 'CritChance', flags: ModFlag.Attack },
```

Add conversion handling in `parseModInternal`:
```js
if (formType === 'CONVERT') {
  const pct = Number(formCaps[0]);
  const from = dmgTypes[(formCaps[1] || '').toLowerCase()];
  const to = dmgTypes[(formCaps[2] || '').toLowerCase()];
  if (from && to) {
    return [{ name: from + 'DamageConvertTo' + to, type: 'BASE', value: pct, flags: 0, keywordFlags: 0, tags: [] }];
  }
  return null;
}
```

Add grant skill handling:
```js
if (formType === 'GRANT') {
  const level = Number(formCaps[0]);
  const skillName = (formCaps[1] || '').replace(/ skill$/i, '').trim();
  return [{ name: 'ExtraSkill', type: 'LIST', value: { name: skillName, level }, flags: 0, keywordFlags: 0, tags: [] }];
}
```

Continue adding patterns based on the diagnostic output from Task 2. Priority patterns: any line that appears 5+ times across tree nodes in the reference build.

**Step 4: Run tests, verify pass**

```bash
npx vitest run js/engine/__tests__/mod-parser.test.js
```

**Step 5: Commit**

```bash
git add js/engine/mod-parser.js js/engine/__tests__/mod-parser.test.js
git commit -m "feat: expand mod parser with conversion, grant, and common missing patterns"
```

---

## Task 4: Complete Defence Calculations

**Files:**
- Modify: `js/engine/calc-defence.js` (add regen, recoup, leech, detailed ES mechanics)
- Modify: `js/engine/calc-perform.js` (add charge handling, mana regen)
- Test: `js/engine/__tests__/calc-defence.test.js` (expand)

**Context:** Our calc-defence.js handles basic resistances, block, armour/evasion/ES. Missing: life/mana/ES regen, leech rates, recoup, DoT taken mitigation, physical damage reduction from endurance charges, and elemental damage reduction. Port these from Lua's CalcDefence.lua.

**Step 1: Write failing tests**

```js
describe('calcDefences — regen', () => {
  it('calculates life regen from flat and percent sources', () => {
    const modDB = new ModDB();
    initModDB(modDB);
    modDB.newMod('Life', 'BASE', 1000, 'Test');
    modDB.newMod('LifeRegen', 'BASE', 50, 'Test');  // 50 flat
    modDB.newMod('LifeRegenPercent', 'BASE', 2, 'Test'); // 2% of 1000 = 20
    const output = {};
    const actor = { modDB, output };
    doActorLifeMana(actor);
    calcDefences(actor);
    expect(output.LifeRegen).toBeCloseTo(70, 0); // 50 + 20
  });
});
```

**Step 2: Port regen calculations from CalcDefence.lua**

Key formulas:
- Life regen = flat regen + (% regen * maxLife) + (% of mana regen as life regen)
- Mana regen = baseManaRegen * (1 + INC) * MORE
- ES regen = flat + (% * maxES)
- ES recharge = maxES * (rechargeRate/60) when not hit recently

**Step 3: Port physical damage reduction from endurance charges**

```js
// In calcDefences or a new calcDamageReduction function:
const endurancePhysReduction = modDB.sum('BASE', null, 'PhysicalDamageReduction');
output.PhysicalDamageReduction = Math.min(
  output.PhysicalDamageReduction + endurancePhysReduction,
  modDB.sum('BASE', null, 'PhysicalDamageReductionMax') || 90
);
```

**Step 4: Run tests, verify pass. Commit.**

```bash
git commit -m "feat: complete defence calculations (regen, phys reduction, leech rates)"
```

---

## Task 5: Port CalcOffence — Base Damage Assembly

**Files:**
- Create: `js/engine/calc-offence.js`
- Test: `js/engine/__tests__/calc-offence.test.js` (create)

**Context:** This is the first part of the offence calc engine. It assembles base damage from weapon data, added damage mods, and damage conversion. Reference: CalcOffence.lua lines ~300-800.

**Step 1: Write tests for base damage assembly**

```js
describe('assembleBaseDamage', () => {
  it('combines weapon base with added flat damage', () => {
    const weaponData = { PhysicalMin: 50, PhysicalMax: 100 };
    const modDB = new ModDB();
    modDB.newMod('PhysicalMin', 'BASE', 10, 'Test');
    modDB.newMod('PhysicalMax', 'BASE', 20, 'Test');
    const result = assembleBaseDamage(weaponData, modDB, cfg);
    expect(result.Physical.min).toBe(60);
    expect(result.Physical.max).toBe(120);
  });
});
```

**Step 2: Implement base damage assembly**

Port from CalcOffence.lua:
- Gather weapon base damage (min/max per element)
- Add flat damage from mods (added fire, cold, lightning, chaos, physical)
- Apply damage effectiveness for spells
- Return `{ Physical: {min, max}, Fire: {min, max}, ... }`

**Step 3: Implement damage conversion chain**

Port the conversion system: Physical -> Lightning -> Cold -> Fire -> Chaos
- `X% of Physical Damage Converted to Fire` moves damage
- Conversion is additive, capped at 100% per source element
- "Gained as" adds damage without removing from source

**Step 4: Run tests, commit.**

```bash
git commit -m "feat: add offence calc — base damage assembly and conversion chain"
```

---

## Task 6: Port CalcOffence — Hit Damage and Crit

**Files:**
- Modify: `js/engine/calc-offence.js`
- Expand: `js/engine/__tests__/calc-offence.test.js`

**Context:** Calculate damage per hit after applying INC/MORE modifiers and penetration, then apply crit multiplier to get effective damage.

**Step 1: Write tests**

```js
describe('calcHitDamage', () => {
  it('applies INC and MORE to base damage', () => {
    // 100 base, 50% inc, 20% more = 100 * 1.5 * 1.2 = 180
    const result = calcHitDamage({ Physical: { min: 100, max: 100 } }, modDB, cfg);
    expect(result.Physical.min).toBeCloseTo(180);
  });

  it('applies penetration to enemy resistance', () => {
    // 75% fire res, 10 pen -> effective 65% res -> 35% damage
    // ...
  });
});
```

**Step 2: Implement hit damage calculation**

Port from CalcOffence.lua:
- For each damage type: `finalDmg = baseDmg * (1 + INC/100) * MORE`
- Apply enemy resistance: `afterResist = finalDmg * (1 - effectiveResist/100)`
- Apply penetration: `effectiveResist = enemyResist - penetration`
- Calculate average hit: `(min + max) / 2`

**Step 3: Implement crit calculation**

- Crit chance = base * (1 + INC/100), capped at CritChanceCap
- Crit multiplier = 1 + (baseCritMulti + bonusCritMulti) / 100
- Effective crit multi = 1 + critChance/100 * (critMulti - 1)
- Damage = averageHit * effectiveCritMulti

**Step 4: Run tests, commit.**

```bash
git commit -m "feat: add offence calc — hit damage, crit, penetration"
```

---

## Task 7: Port CalcOffence — Speed and DPS

**Files:**
- Modify: `js/engine/calc-offence.js`
- Expand: `js/engine/__tests__/calc-offence.test.js`

**Context:** Calculate attack/cast speed and combine with damage per hit to produce DPS.

**Step 1: Write tests**

```js
describe('calcDPS', () => {
  it('calculates DPS from hit damage and speed', () => {
    // 1000 avg hit, 2 attacks/sec, 150% crit multi, 50% crit chance
    // effective crit = 1 + 0.5 * 0.5 = 1.25
    // DPS = 1000 * 1.25 * 2 = 2500
  });
});
```

**Step 2: Implement speed calculation**

Port from CalcOffence.lua:
- Attack speed = weapon base speed * (1 + INC/100) * MORE
- Cast speed = base cast time / ((1 + INC/100) * MORE)
- Hits per second = 1 / effective_cast_time

**Step 3: Calculate total DPS**

- TotalDPS = sum of all damage types' DPS
- For each type: `typeDPS = avgHit * effectiveCritMulti * hitsPerSecond`
- Store per-type DPS for breakdown display

**Step 4: Run tests, commit.**

```bash
git commit -m "feat: add offence calc — speed calculation and total DPS"
```

---

## Task 8: Port CalcOffence — Ailment DoT and Impale

**Files:**
- Modify: `js/engine/calc-offence.js`
- Expand: `js/engine/__tests__/calc-offence.test.js`

**Context:** Calculate damage-over-time effects (ignite, bleed, poison) and impale DPS. These are significant contributors to total DPS for many builds.

**Step 1: Port ignite calculation**

- Ignite DPS = base fire damage * 0.9 * igniteDuration factor * (1 + INC/100) * MORE
- Apply DoT multipliers
- Duration = 4s base * (1 + duration INC/100)

**Step 2: Port bleed calculation**

- Bleed DPS = base physical damage * 0.7 * (1 + INC/100) * MORE
- Moving enemy: 200% more bleeding damage (unless "NoExtraBleedDamageToMovingEnemy")

**Step 3: Port poison calculation**

- Poison DPS per stack = (phys + chaos base) * 0.3 * (1 + INC/100) * MORE
- Total poison DPS = DPS per stack * poison stacks (from duration * hit rate * chance)

**Step 4: Port impale calculation**

- Impale chance, impale effect multiplier
- Impale DPS = physical damage * impaleChance * impaleStacks * (0.1 * impaleEffect)

**Step 5: Run tests, commit.**

```bash
git commit -m "feat: add offence calc — ailment DoT (ignite/bleed/poison) and impale"
```

---

## Task 9: Wire Offence Calc into App Pipeline

**Files:**
- Modify: `js/app.js:1471-1535` (`_runCalc`)
- Modify: `js/ui/stat-sidebar.js` (add DPS display)
- Modify: `css/main.css` (DPS display styles)

**Context:** Connect the new calc-offence module to the main calc pipeline. The main skill's active skill data feeds into the offence calc. Display DPS in the stat sidebar.

**Step 1: Wire offence calc into _runCalc**

After defence calcs, if there's a main skill with weapon data:

```js
import { calcOffence } from './engine/calc-offence.js';

// In _runCalc, after calcDefences:
if (mainSkill) {
  const offenceOutput = calcOffence(actor, mainSkill, this._weaponData1);
  Object.assign(output, offenceOutput);
}
```

**Step 2: Add DPS display to stat sidebar**

Add a new "Offence" section to StatSidebar.update():
```js
const totalDPS = output.TotalDPS || 0;
const avgHit = output.AverageDamage || 0;
const speed = output.Speed || 0;
const critChance = output.CritChance || 0;
const critMulti = output.CritMultiplier || 0;

offenceHtml = `
<div class="stat-section">
  <div class="stat-header">Offence</div>
  <div class="stat-row"><span class="stat-label">Total DPS:</span><span class="stat-value dps">${f(totalDPS)}</span></div>
  <div class="stat-row"><span class="stat-label">Average Hit:</span><span class="stat-value">${f(avgHit)}</span></div>
  <div class="stat-row"><span class="stat-label">Speed:</span><span class="stat-value">${(speed).toFixed(2)}/s</span></div>
  <div class="stat-row"><span class="stat-label">Crit Chance:</span><span class="stat-value">${p(critChance)}</span></div>
  <div class="stat-row"><span class="stat-label">Crit Multi:</span><span class="stat-value">${critMulti}%</span></div>
</div>`;
```

**Step 3: Add DPS CSS styling**

```css
.stat-value.dps { color: var(--accent); font-weight: bold; }
```

**Step 4: Test manually — import reference build, verify sidebar shows DPS**

**Step 5: Commit**

```bash
git commit -m "feat: wire offence calc into app pipeline, display DPS in sidebar"
```

---

## Task 10: Calc Breakdown UI

**Files:**
- Modify: `js/app.js` (the `_renderCalcsTab` method)
- Modify: `css/main.css` (breakdown table styles)

**Context:** Add a Calcs tab that shows the detailed breakdown for each stat: base value, INC sum, MORE product, final value. This enables side-by-side comparison against pobb.in tooltips for ongoing validation.

**Step 1: Implement breakdown data collection**

During `_runCalc()`, collect breakdown data for key stats:

```js
const breakdown = {};
breakdown.Life = {
  base: modDB.sum('BASE', null, 'Life'),
  inc: modDB.sum('INC', null, 'Life'),
  more: modDB.more(null, 'Life'),
  final: output.Life,
};
// ... similar for Mana, Armour, Evasion, ES, each resistance, DPS components
```

**Step 2: Render breakdown in Calcs tab**

Show a table for each stat category (Attributes, Defence, Offence) with columns: Stat, Base, Increased, More, Final.

**Step 3: Commit**

```bash
git commit -m "feat: add calc breakdown UI in Calcs tab for validation"
```

---

## Task 11: Integration Test with Reference Build

**Files:**
- Create: `js/engine/__tests__/calc-integration.test.js`

**Context:** End-to-end test that imports the reference build's tree nodes and items, runs the full calc pipeline, and asserts key stats match pobb.in within tolerance.

**Step 1: Create integration test**

```js
describe('reference build integration', () => {
  it('matches pobb.in defensive stats within 5%', () => {
    // Set up build from reference share code data
    // Run full calc
    // Assert:
    expect(output.Life).toBeCloseTo(4507, -2);    // within 100
    expect(output.FireResist).toBe(81);
    expect(output.ColdResist).toBe(80);
    expect(output.LightningResist).toBe(81);
    expect(output.ChaosResist).toBe(66);
    expect(output.Armour).toBeCloseTo(15511, -2);
    expect(output.Evasion).toBeCloseTo(5227, -2);
  });
});
```

**Step 2: Run and iterate**

The test will likely fail on first run. Use the failures to identify remaining gaps — likely mod parser misses or edge cases in the calc formulas.

**Step 3: Commit**

```bash
git commit -m "test: add integration test against reference build stats"
```
