# Calc Accuracy Design

## Goal

Make PoBWeb's stat calculations match the original Lua Path of Building (and pobb.in) exactly, including both defensive stats and DPS.

## Reference Build

pobb.in/U0G4dc9FIs0w — expected outputs:
- Life: 4,507 | Mana: 77 | eHP: 68,789
- Resistances: Fire 81 / Cold 80 / Lightning 81 / Chaos 66
- Armour: 15,511 | Evasion: 5,227
- DPS: 8,660,635

## Root Causes

### 1. Missing Base Setup Mods

Our `_runCalc()` in app.js initializes the ModDB but omits many mods that Lua's CalcSetup.lua adds:

| Mod | Lua PoB | PoBWeb | Impact |
|-----|---------|--------|--------|
| Resistance penalty (Act 5/10) | -60 to all 4 resistances | Missing | Resistances 60 too high |
| Base evasion | 15 BASE Evasion | Missing | Evasion off |
| Accuracy per level | 2 * Level BASE Accuracy | Missing | Hit chance off |
| Base crit multiplier | 50 BASE CritMultiplier | Missing | Crit multi off |
| Level multiplier | `modDB.multipliers["Level"] = level` | Missing | All Multiplier-tagged tree mods silently zero |
| Mana regen | `ManaRegenBase * Mana` | Missing | No mana regen |
| ES recharge rate | `2000/60` = 33.3%/sec | Missing | No ES recharge |
| Charge-based mods | Power/Frenzy/Endurance bonuses | Missing | Charge builds broken |
| Dual wield bonuses | 10% MORE attack speed, 20 block | Missing | DW builds broken |
| Bandit mods | Alira/Kraityn/Oak/Kill All | Missing | 2 passive points or bonuses missing |

### 2. Mod Parser Coverage Gaps

Our `parseMod()` is ~800 lines; Lua's ModParser.lua is 6,600+ lines. Key gaps:
- **Conditional mods**: "while holding a shield", "if you've killed recently"
- **Conversion mods**: "X% of Y converted to Z"
- **Grant mods**: "Grants Level X Skill"
- **Multi-line mods**: Some tree nodes have mods that span 2+ lines
- **Keystone handling**: Keystones emit `{ type: "Keystone", name: "..." }` LIST mods; we just parse their stat text
- **Silent failures**: Unparseable lines are dropped with no logging

### 3. Missing Calculation Stages

| Stage | Lua PoB | PoBWeb | Lines to port |
|-------|---------|--------|---------------|
| CalcSetup (full) | Complete env init, jewel processing, item/skill wiring | Partial | ~1,200 remaining |
| CalcPerform (full) | Attributes, conditions, charges, buffs, auras, curses | Partial (attribs + life/mana only) | ~2,500 remaining |
| CalcDefence (full) | Resistances, block, armour, evasion, ES, suppression, recoup, regen, DoT mitigation | Partial (basic resist/block/armour/evasion/ES) | ~2,800 remaining |
| CalcOffence | Hit damage, DPS, crit, speed, ailments, DoT, conversion, penetration, impale | Missing entirely | ~5,900 |

### 4. Item Mod Processing Gaps

- Local vs global mod classification may have edge cases
- Weapon DPS calculation (base damage, attack speed, crit) needs validation
- Jewel mods (abyss jewels, timeless jewels) not fully wired
- Flask mods not applied at all

## Architecture

### Phase 1: Fix Base Setup (quick wins)

Add all missing base mods to `_runCalc()` or a new `initPlayerMods()` function in calc-setup.js. Add `modDB.multipliers.Level = level` so Multiplier-tagged tree mods work. Add resistance penalty. This alone should fix most defensive stat discrepancies.

### Phase 2: Mod Parser Expansion

Add a diagnostic mode: when `parseMod()` returns null, log the failed line. Import the reference build, collect all unparsed lines, and add patterns for the most common ones. Target: <5% of tree node stat lines unparsed.

### Phase 3: Defence Calc Completion

Port remaining CalcDefence.lua features: regen, recoup, DoT mitigation, leech, detailed ES mechanics. Port remaining CalcPerform.lua features: charge handling, buff/debuff application, aura effect.

### Phase 4: Offence Calc Engine

Port CalcOffence.lua — the full hit damage and DPS calculation. This is the largest single piece (~5,900 lines). Key subsystems:
- Base damage assembly (weapon + added + converted)
- Damage conversion chain (phys -> ele -> chaos)
- Hit damage calculation (base * INC * MORE * pen * resist)
- Crit calculation (chance, multiplier, effective crit)
- Speed calculation (attack/cast speed)
- DPS = damage per hit * hits per second * crit effectiveness
- Ailment damage (ignite, bleed, poison DoT)
- Impale calculation

### Phase 5: Calc Breakdown UI

Add a Calcs tab that shows the breakdown for each stat (base, INC, MORE, final) similar to Lua PoB's CalcsTab. This enables visual comparison against pobb.in tooltips for ongoing validation.

## Validation Strategy

1. **Unit tests per calc function**: Each ported function gets tests with known inputs/outputs from Lua PoB
2. **Integration test with reference build**: Import the reference share code, run full calc, assert key stats within tolerance
3. **Unparsed mod logging**: Track % of tree/item mod lines that fail to parse; target <5%
4. **Side-by-side comparison**: Calcs tab breakdown vs pobb.in tooltip breakdown

## What We're NOT Doing

- Minion calc (separate actor, large scope)
- Totem/trap/mine DPS (can reuse offence calc later)
- Config options UI (hardcode reasonable defaults for now)
- Aura reservation UI (show stats, not reservation details)
- Party/map scaling
