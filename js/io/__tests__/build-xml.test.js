import { describe, it, expect } from 'vitest';
import { buildToXml, xmlToBuild, Build } from '../build-xml.js';

describe('Build', () => {
  it('creates with defaults', () => {
    const build = new Build();
    expect(build.name).toBe('New Build');
    expect(build.className).toBe('Scion');
    expect(build.level).toBe(1);
    expect(build.ascendancy).toBe('');
    expect(build.treeNodes).toEqual([]);
    expect(build.skills).toEqual([]);
    expect(build.items).toEqual([]);
    expect(build.config).toEqual({});
    expect(build.notes).toBe('');
  });

  it('accepts options', () => {
    const build = new Build({
      name: 'My Build',
      className: 'Marauder',
      level: 90,
      ascendancy: 'Berserker',
    });
    expect(build.name).toBe('My Build');
    expect(build.className).toBe('Marauder');
    expect(build.level).toBe(90);
    expect(build.ascendancy).toBe('Berserker');
  });
});

describe('buildToXml', () => {
  it('serializes a basic build', () => {
    const build = new Build({ name: 'Test', className: 'Witch', level: 80 });
    const xml = buildToXml(build);
    expect(xml).toContain('<PathOfBuilding>');
    expect(xml).toContain('</PathOfBuilding>');
    expect(xml).toContain('className="Witch"');
    expect(xml).toContain('level="80"');
  });

  it('serializes tree nodes', () => {
    const build = new Build({ treeNodes: [100, 200, 300] });
    const xml = buildToXml(build);
    expect(xml).toContain('<Spec');
    expect(xml).toContain('100,200,300');
  });

  it('serializes skills', () => {
    const build = new Build({
      skills: [
        { slot: 'Body Armour', gems: [{ name: 'Fireball', level: 20, quality: 20 }] },
      ],
    });
    const xml = buildToXml(build);
    expect(xml).toContain('<Skills>');
    expect(xml).toContain('Fireball');
  });

  it('serializes items', () => {
    const build = new Build({
      items: [
        { slot: 'Helmet', raw: 'Rarity: Rare\nTest Helm\nRoyal Burgonet' },
      ],
    });
    const xml = buildToXml(build);
    expect(xml).toContain('<Items>');
    expect(xml).toContain('Test Helm');
  });

  it('serializes config', () => {
    const build = new Build({
      config: { enemyIsBoss: 'Shaper', enemyLevel: 84 },
    });
    const xml = buildToXml(build);
    expect(xml).toContain('<Config>');
    expect(xml).toContain('enemyIsBoss');
  });

  it('serializes notes', () => {
    const build = new Build({ notes: 'This is my build notes' });
    const xml = buildToXml(build);
    expect(xml).toContain('<Notes>');
    expect(xml).toContain('This is my build notes');
  });
});

describe('xmlToBuild', () => {
  it('round-trips a basic build', () => {
    const original = new Build({
      name: 'Round Trip',
      className: 'Ranger',
      level: 95,
      ascendancy: 'Deadeye',
      notes: 'Test notes',
    });
    const xml = buildToXml(original);
    const restored = xmlToBuild(xml);
    expect(restored.name).toBe('Round Trip');
    expect(restored.className).toBe('Ranger');
    expect(restored.level).toBe(95);
    expect(restored.ascendancy).toBe('Deadeye');
    expect(restored.notes).toBe('Test notes');
  });

  it('round-trips tree nodes', () => {
    const original = new Build({ treeNodes: [10, 20, 30] });
    const xml = buildToXml(original);
    const restored = xmlToBuild(xml);
    expect(restored.treeNodes).toEqual([10, 20, 30]);
  });

  it('round-trips skills', () => {
    const original = new Build({
      skills: [
        { slot: 'Weapon 1', gems: [{ name: 'Glacial Hammer', level: 15, quality: 10 }] },
      ],
    });
    const xml = buildToXml(original);
    const restored = xmlToBuild(xml);
    expect(restored.skills).toHaveLength(1);
    expect(restored.skills[0].gems[0].name).toBe('Glacial Hammer');
    expect(restored.skills[0].gems[0].level).toBe(15);
  });

  it('round-trips config', () => {
    const original = new Build({
      config: { enemyLevel: 84, usePowerCharges: true },
    });
    const xml = buildToXml(original);
    const restored = xmlToBuild(xml);
    expect(restored.config.enemyLevel).toBe('84'); // XML values are strings
    expect(restored.config.usePowerCharges).toBe('true');
  });

  it('handles empty build XML', () => {
    const xml = '<PathOfBuilding><Build/></PathOfBuilding>';
    const build = xmlToBuild(xml);
    expect(build).toBeDefined();
    expect(build.name).toBe('');
  });

  it('round-trips mastery effects', () => {
    const original = new Build({
      treeNodes: [100, 200, 300],
      masteryEffects: [
        { nodeId: 200, effectId: 29161 },
        { nodeId: 300, effectId: 54321 },
      ],
    });
    const xml = buildToXml(original);
    expect(xml).toContain('masteryEffects="{200,29161},{300,54321}"');
    const restored = xmlToBuild(xml);
    expect(restored.masteryEffects).toEqual([
      { nodeId: 200, effectId: 29161 },
      { nodeId: 300, effectId: 54321 },
    ]);
  });

  it('handles build with no mastery effects', () => {
    const original = new Build({ treeNodes: [100] });
    const xml = buildToXml(original);
    expect(xml).not.toContain('masteryEffects');
    const restored = xmlToBuild(xml);
    expect(restored.masteryEffects).toEqual([]);
  });
});
