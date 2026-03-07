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

describe('cluster jewel XML persistence', () => {
  it('serializes jewel sockets to XML', () => {
    const build = new Build({
      className: 'Scion',
      level: 90,
      treeNodes: [100, 200],
      jewelSockets: [
        { nodeId: 26725, itemText: 'Large Cluster Jewel\nAdds 8 Passive Skills' },
      ],
    });
    const xml = buildToXml(build);
    expect(xml).toContain('<Sockets>');
    expect(xml).toContain('nodeId="26725"');
    expect(xml).toContain('Large Cluster Jewel');
  });

  it('parses jewel sockets from XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Scion" level="90" ascendClassName="" buildName="Test"/>
  <Tree>
    <Spec treeVersion="3_25" classId="0" ascendClassId="0" nodes="100,200">
      <Sockets>
        <Socket nodeId="26725" itemText="Large Cluster Jewel&#10;Adds 8 Passive Skills"/>
      </Sockets>
    </Spec>
  </Tree>
  <Skills></Skills>
  <Items></Items>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const build = xmlToBuild(xml);
    expect(build.specs[0].jewelSockets).toBeDefined();
    expect(build.specs[0].jewelSockets.length).toBe(1);
    expect(build.specs[0].jewelSockets[0].nodeId).toBe(26725);
    expect(build.specs[0].jewelSockets[0].itemText).toContain('Large Cluster Jewel');
  });

  it('round-trips jewel socket data', () => {
    const build = new Build({
      className: 'Scion',
      level: 90,
      treeNodes: [100],
      jewelSockets: [
        { nodeId: 26725, itemText: 'Large Cluster Jewel\nAdds 8 Passive Skills' },
      ],
    });
    const xml = buildToXml(build);
    const parsed = xmlToBuild(xml);
    expect(parsed.jewelSockets.length).toBe(1);
    expect(parsed.jewelSockets[0].nodeId).toBe(26725);
    expect(parsed.jewelSockets[0].itemText).toContain('Large Cluster Jewel');
  });

  it('parses PoB format with itemId referencing Items section', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Scion" level="90" ascendClassName="" buildName="Test"/>
  <Tree>
    <Spec treeVersion="3_25" classId="0" ascendClassId="0" nodes="100,200">
      <Sockets>
        <Socket itemId="13" nodeId="55190"/>
      </Sockets>
    </Spec>
  </Tree>
  <Skills></Skills>
  <Items>
    <Item id="13">
Rarity: RARE
New Item
Large Cluster Jewel
Crafted: true
Prefix: {range:0.5}AfflictionNotableUnwaveringlyEvil
Cluster Jewel Skill: affliction_chaos_damage
Cluster Jewel Node Count: 8
Implicits: 3
{crafted}Adds 8 Passive Skills
{crafted}2 Added Passive Skills are Jewel Sockets
{crafted}Added Small Passive Skills grant: 12% increased Chaos Damage
1 Added Passive Skill is Unwaveringly Evil
    </Item>
  </Items>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const build = xmlToBuild(xml);
    expect(build.specs[0].jewelSockets.length).toBe(1);
    expect(build.specs[0].jewelSockets[0].nodeId).toBe(55190);
    expect(build.specs[0].jewelSockets[0].itemText).toContain('Large Cluster Jewel');
  });
});

describe('PoB Item/Slot/ItemSet parsing', () => {
  it('parses PoB format with ItemSet containing Slot elements', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Marauder" level="95" ascendClassName="Juggernaut" buildName="Test"/>
  <Tree>
    <Spec treeVersion="3_25" classId="1" ascendClassId="1" nodes="100">
    </Spec>
  </Tree>
  <Skills></Skills>
  <Items activeItemSet="1">
    <Item id="1">
Rarity: RARE
Doom Shelter
Royal Burgonet
Armour: 500
+80 to maximum Life
+40% to Fire Resistance
    </Item>
    <Item id="2">
Rarity: UNIQUE
Kaom&apos;s Heart
Glorious Plate
+500 to maximum Life
    </Item>
    <ItemSet id="1">
      <Slot name="Helmet" itemId="1"/>
      <Slot name="Body Armour" itemId="2"/>
    </ItemSet>
  </Items>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const build = xmlToBuild(xml);

    // itemsById should map id -> raw text
    expect(build.itemsById).toBeDefined();
    expect(build.itemsById['1']).toContain('Doom Shelter');
    expect(build.itemsById['2']).toContain("Kaom's Heart");

    // itemSlots should map slot name -> item id
    expect(build.itemSlots).toBeDefined();
    expect(build.itemSlots['Helmet']).toBe('1');
    expect(build.itemSlots['Body Armour']).toBe('2');

    // items array should have resolved slot assignments
    expect(build.items).toHaveLength(2);
    const helmet = build.items.find(i => i.slot === 'Helmet');
    expect(helmet).toBeDefined();
    expect(helmet.raw).toContain('Doom Shelter');
    const body = build.items.find(i => i.slot === 'Body Armour');
    expect(body).toBeDefined();
    expect(body.raw).toContain("Kaom's Heart");
  });

  it('parses legacy format with Slot elements directly inside Items', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Witch" level="80" ascendClassName="" buildName="Legacy"/>
  <Tree>
    <Spec treeVersion="3_25" classId="3" ascendClassId="0" nodes="100">
    </Spec>
  </Tree>
  <Skills></Skills>
  <Items>
    <Item id="1">
Rarity: RARE
Storm Brow
Hubris Circlet
Energy Shield: 200
+50 to maximum Mana
    </Item>
    <Item id="2">
Rarity: RARE
Gale Wrap
Vaal Regalia
Energy Shield: 400
+70 to maximum Life
    </Item>
    <Slot name="Helmet" itemId="1"/>
    <Slot name="Body Armour" itemId="2"/>
  </Items>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const build = xmlToBuild(xml);

    // itemsById should be populated
    expect(build.itemsById['1']).toContain('Storm Brow');
    expect(build.itemsById['2']).toContain('Gale Wrap');

    // itemSlots from top-level Slot elements
    expect(build.itemSlots['Helmet']).toBe('1');
    expect(build.itemSlots['Body Armour']).toBe('2');

    // items array resolved from slots
    expect(build.items).toHaveLength(2);
    const helmet = build.items.find(i => i.slot === 'Helmet');
    expect(helmet).toBeDefined();
    expect(helmet.raw).toContain('Storm Brow');
  });

  it('still supports our format with slot attribute on Item elements', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Ranger" level="85" ascendClassName="" buildName="Our Format"/>
  <Tree></Tree>
  <Skills></Skills>
  <Items>
    <Item slot="Helmet">Rarity: RARE\nTest Helm\nRoyal Burgonet</Item>
    <Item slot="Body Armour">Rarity: RARE\nTest Chest\nGlorious Plate</Item>
  </Items>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const build = xmlToBuild(xml);
    expect(build.items).toHaveLength(2);
    expect(build.items[0].slot).toBe('Helmet');
    expect(build.items[0].raw).toContain('Test Helm');
    expect(build.items[1].slot).toBe('Body Armour');
  });

  it('handles Item with variant attribute', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Shadow" level="90" ascendClassName="" buildName="Variant"/>
  <Tree>
    <Spec treeVersion="3_25" classId="6" ascendClassId="0" nodes="100">
    </Spec>
  </Tree>
  <Skills></Skills>
  <Items activeItemSet="1">
    <Item id="1" variant="2">
Rarity: UNIQUE
Atziri&apos;s Splendour
Sacrificial Garb
    </Item>
    <ItemSet id="1">
      <Slot name="Body Armour" itemId="1"/>
    </ItemSet>
  </Items>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const build = xmlToBuild(xml);
    expect(build.itemsById['1']).toContain("Atziri's Splendour");
    expect(build.itemSlots['Body Armour']).toBe('1');
    expect(build.items).toHaveLength(1);
    expect(build.items[0].slot).toBe('Body Armour');
  });

  it('uses active ItemSet when multiple exist', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Duelist" level="90" ascendClassName="" buildName="MultiSet"/>
  <Tree>
    <Spec treeVersion="3_25" classId="4" ascendClassId="0" nodes="100">
    </Spec>
  </Tree>
  <Skills></Skills>
  <Items activeItemSet="2">
    <Item id="1">
Rarity: RARE
Alpha Helm
Royal Burgonet
    </Item>
    <Item id="2">
Rarity: RARE
Beta Helm
Eternal Burgonet
    </Item>
    <ItemSet id="1">
      <Slot name="Helmet" itemId="1"/>
    </ItemSet>
    <ItemSet id="2">
      <Slot name="Helmet" itemId="2"/>
    </ItemSet>
  </Items>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const build = xmlToBuild(xml);
    // activeItemSet="2" so should use ItemSet id="2"
    expect(build.itemSlots['Helmet']).toBe('2');
    expect(build.items).toHaveLength(1);
    expect(build.items[0].raw).toContain('Beta Helm');
  });

  it('Build constructor initializes itemsById and itemSlots', () => {
    const build = new Build();
    expect(build.itemsById).toEqual({});
    expect(build.itemSlots).toEqual({});
  });
});
