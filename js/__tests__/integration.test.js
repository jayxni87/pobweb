import { describe, it, expect } from 'vitest';
import { Build, buildToXml, xmlToBuild } from '../io/build-xml.js';
import { encodeShareCode, decodeShareCode } from '../io/share-code.js';
import { importFromShareCode, exportToShareCode } from '../io/file-manager.js';
import { ModDB } from '../engine/mod-db.js';
import { parseMod } from '../engine/mod-parser.js';
import { initModDB } from '../engine/calc-setup.js';
import { doActorAttribs, doActorLifeMana } from '../engine/calc-perform.js';
import { calcResistances, calcBlock, calcDefences } from '../engine/calc-defence.js';
import {
  calcCritChance, calcSpeed, calcTotalDPS, calcAverageDamage,
  calcCombinedDPS,
} from '../engine/calc-offence.js';
import { PassiveSpec } from '../models/passive-spec.js';
import { TreeData } from '../tree/tree-data.js';
import { TreeAllocation } from '../tree/tree-allocation.js';
import { TreeSearch } from '../tree/tree-search.js';
import { applyConfigOption } from '../models/config-options.js';

// End-to-end integration test that verifies the full pipeline

describe('End-to-end pipeline', () => {
  it('builds and calculates a complete character', () => {
    // 1. Create a build
    const build = new Build({
      name: 'Integration Test Marauder',
      className: 'Marauder',
      level: 80,
      ascendancy: 'Berserker',
      treeNodes: [10, 11],
      config: {
        conditionMoving: true,
        multiplierEnduranceCharges: 3,
      },
      notes: 'Integration test build',
    });

    // 2. Serialize to XML and back
    const xml = buildToXml(build);
    expect(xml).toContain('Marauder');
    const restored = xmlToBuild(xml);
    expect(restored.name).toBe('Integration Test Marauder');
    expect(restored.level).toBe(80);

    // 3. Share code round-trip
    const code = exportToShareCode(build);
    const fromCode = importFromShareCode(code);
    expect(fromCode.name).toBe('Integration Test Marauder');

    // 4. Run calculation pipeline
    const modDB = new ModDB();
    const enemyModDB = new ModDB();
    initModDB(modDB, restored.level);

    // Parse some mods (simulating tree/gear mods)
    // parseMod returns an array of mods
    for (const line of [
      '+50 to Strength',
      '+100 to maximum Life',
      '+30% to Fire Resistance',
      'Adds 10 to 20 Physical Damage to Attacks',
    ]) {
      const mods = parseMod(line);
      if (mods) modDB.addList(mods);
    }

    // Apply config options
    const mockModList = {
      addMod(mod) { modDB.addMod(mod); },
    };
    const mockEnemyModList = {
      addMod(mod) { enemyModDB.addMod(mod); },
    };
    applyConfigOption('conditionMoving', true, mockModList, mockEnemyModList);
    applyConfigOption('multiplierEnduranceCharges', 3, mockModList, mockEnemyModList);

    // Ensure modDB has conditions object
    if (!modDB.conditions) modDB.conditions = {};

    // Calculate attributes
    const output = {};
    const actor = { modDB, output };
    doActorAttribs(actor);
    expect(output.Str).toBeGreaterThan(0);

    // Calculate life/mana
    doActorLifeMana(actor);
    expect(output.Life).toBeGreaterThan(0);
    // Mana may be 0 without base mana mods
    expect(output.Mana).toBeGreaterThanOrEqual(0);

    // Calculate resistances
    calcResistances(actor);
    expect(output.FireResist).toBeGreaterThan(0);

    // Calculate defences
    calcDefences(actor);

    // Calculate offence values (standalone functions)
    const avgDmg = calcAverageDamage(100, 150, 0.5); // 50% crit
    expect(avgDmg).toBeGreaterThan(0);

    const dps = calcTotalDPS(avgDmg, 2.0, 0.9, 1.0);
    expect(dps).toBeGreaterThan(0);

    // Verify the full pipeline produced reasonable values
    expect(output.Str).toBeGreaterThanOrEqual(50);
    expect(output.Life).toBeGreaterThan(0);
    expect(output.FireResist).toBeGreaterThanOrEqual(30);
  });

  it('tree allocation and search integration', () => {
    const treeJson = {
      classes: [{ name: 'Scion', ascendancies: [], startNodeId: 1 }],
      nodes: {
        1: { id: 1, name: 'Start', type: 'classStart', group: 1, orbit: 0, orbitIndex: 0, stats: [], adjacent: [2] },
        2: { id: 2, name: 'Life Node', type: 'normal', group: 1, orbit: 1, orbitIndex: 0, stats: ['+10 to Maximum Life'], adjacent: [1, 3] },
        3: { id: 3, name: 'Damage Notable', type: 'notable', group: 2, orbit: 0, orbitIndex: 0, stats: ['20% increased Physical Damage'], adjacent: [2] },
      },
      groups: {
        1: { x: 0, y: 0, orbits: [0, 1] },
        2: { x: 200, y: 0, orbits: [0] },
      },
      constants: { orbitRadii: [0, 82], skillsPerOrbit: [1, 6] },
    };

    const td = new TreeData(treeJson);
    const alloc = new TreeAllocation(td, 0);

    // Allocate path to notable
    alloc.allocateNode(3);
    expect(alloc.spec.isAllocated(2)).toBe(true);
    expect(alloc.spec.isAllocated(3)).toBe(true);

    // Collect stats
    const stats = alloc.collectStats();
    expect(stats).toContain('+10 to Maximum Life');
    expect(stats).toContain('20% increased Physical Damage');

    // Search
    const search = new TreeSearch(td);
    const result = search.search('Life');
    expect(result.matchCount).toBe(1);
    expect(result.matchIds.has(2)).toBe(true);

    // Deallocate
    alloc.allocation?.spec?.deallocate(3);
    // Through TreeAllocation interface
    const count = alloc.allocatedCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('full XML round-trip preserves all data', () => {
    const original = new Build({
      name: 'Full Build',
      className: 'Witch',
      level: 95,
      ascendancy: 'Necromancer',
      treeNodes: [100, 200, 300, 400],
      skills: [
        {
          slot: 'Body Armour',
          gems: [
            { name: 'Raise Zombie', level: 21, quality: 20 },
            { name: 'Minion Damage Support', level: 20, quality: 20 },
          ],
        },
      ],
      items: [
        { slot: 'Helmet', raw: 'Rarity: Rare\nTest Crown\nHubris Circlet\n+80 to Maximum Energy Shield' },
      ],
      config: {
        enemyIsBoss: 'Pinnacle',
        conditionFullLife: 'true',
      },
      notes: 'This is a comprehensive test build\nwith multiple lines of notes.',
    });

    // XML round-trip
    const xml = buildToXml(original);
    const restored = xmlToBuild(xml);

    expect(restored.name).toBe('Full Build');
    expect(restored.className).toBe('Witch');
    expect(restored.level).toBe(95);
    expect(restored.ascendancy).toBe('Necromancer');
    expect(restored.treeNodes).toEqual([100, 200, 300, 400]);
    expect(restored.skills).toHaveLength(1);
    expect(restored.skills[0].gems).toHaveLength(2);
    expect(restored.skills[0].gems[0].name).toBe('Raise Zombie');
    expect(restored.items).toHaveLength(1);
    expect(restored.config.enemyIsBoss).toBe('Pinnacle');
    expect(restored.notes).toContain('comprehensive test build');

    // Share code round-trip
    const code = encodeShareCode(xml);
    const decoded = decodeShareCode(code);
    const fromShare = xmlToBuild(decoded);
    expect(fromShare.name).toBe('Full Build');
    expect(fromShare.treeNodes).toEqual([100, 200, 300, 400]);
  });
});
