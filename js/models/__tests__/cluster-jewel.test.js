import { describe, it, expect } from 'vitest';
import { parseClusterJewel } from '../cluster-jewel.js';
import clusterData from '../../data/cluster-jewels.json';

describe('parseClusterJewel', () => {
  it('parses a Large Cluster Jewel with fire damage', () => {
    const text = `Large Cluster Jewel
Adds 8 Passive Skills
2 Added Passive Skills are Jewel Sockets
Added Small Passive Skills grant: 12% increased Fire Damage
1 Added Passive Skill is Cremator
1 Added Passive Skill is Smoking Remains`;

    const result = parseClusterJewel(text, clusterData);
    expect(result.baseName).toBe('Large Cluster Jewel');
    expect(result.clusterJewelNodeCount).toBe(8);
    expect(result.clusterJewelSocketCount).toBe(2);
    expect(result.clusterJewelSkill).toBe('affliction_fire_damage');
    expect(result.clusterJewelNotables).toEqual(['Cremator', 'Smoking Remains']);
    expect(result.clusterJewelValid).toBe(true);
  });

  it('parses a Medium Cluster Jewel', () => {
    const text = `Medium Cluster Jewel
Adds 5 Passive Skills
1 Added Passive Skill is a Jewel Socket
Added Small Passive Skills grant: 2% increased Effect of your Curses
1 Added Passive Skill is Evil Eye`;

    const result = parseClusterJewel(text, clusterData);
    expect(result.baseName).toBe('Medium Cluster Jewel');
    expect(result.clusterJewelNodeCount).toBe(5);
    expect(result.clusterJewelSocketCount).toBe(1);
    expect(result.clusterJewelNotables).toEqual(['Evil Eye']);
    expect(result.clusterJewelValid).toBe(true);
  });

  it('parses a Small Cluster Jewel', () => {
    const text = `Small Cluster Jewel
Adds 2 Passive Skills
Added Small Passive Skills grant: 4% increased maximum Life
1 Added Passive Skill is Fettle`;

    const result = parseClusterJewel(text, clusterData);
    expect(result.baseName).toBe('Small Cluster Jewel');
    expect(result.clusterJewelNodeCount).toBe(2);
    expect(result.clusterJewelSocketCount).toBe(0);
    expect(result.clusterJewelNotables).toEqual(['Fettle']);
    expect(result.clusterJewelValid).toBe(true);
  });

  it('returns invalid for non-cluster jewel text', () => {
    const result = parseClusterJewel('Cobalt Jewel\n+10 to Intelligence', clusterData);
    expect(result.clusterJewelValid).toBe(false);
  });

  it('returns invalid for missing enchant', () => {
    const text = `Large Cluster Jewel
some random mod`;
    const result = parseClusterJewel(text, clusterData);
    expect(result.clusterJewelValid).toBe(false);
  });

  it('handles single jewel socket text', () => {
    const text = `Large Cluster Jewel
Adds 10 Passive Skills
1 Added Passive Skill is a Jewel Socket
Added Small Passive Skills grant: 12% increased Fire Damage`;

    const result = parseClusterJewel(text, clusterData);
    expect(result.clusterJewelSocketCount).toBe(1);
  });

  it('parses PoB extended item text with {crafted} tags and metadata', () => {
    const text = `Rarity: RARE
New Item
Large Cluster Jewel
Crafted: true
Prefix: {range:0.5}AfflictionNotableUnwaveringlyEvil
Prefix: {range:0.5}AfflictionNotableWickedPall_
Suffix: {range:0.5}AfflictionNotableUnholyGrace_
Suffix: None
Cluster Jewel Skill: affliction_chaos_damage
Cluster Jewel Node Count: 8
LevelReq: 40
Implicits: 3
{crafted}Adds 8 Passive Skills
{crafted}2 Added Passive Skills are Jewel Sockets
{crafted}Added Small Passive Skills grant: 12% increased Chaos Damage
1 Added Passive Skill is Unholy Grace
1 Added Passive Skill is Unwaveringly Evil
1 Added Passive Skill is Wicked Pall`;

    const result = parseClusterJewel(text, clusterData);
    expect(result.baseName).toBe('Large Cluster Jewel');
    expect(result.clusterJewelSkill).toBe('affliction_chaos_damage');
    expect(result.clusterJewelNodeCount).toBe(8);
    expect(result.clusterJewelSocketCount).toBe(2);
    expect(result.clusterJewelNotables).toContain('Unholy Grace');
    expect(result.clusterJewelNotables).toContain('Unwaveringly Evil');
    expect(result.clusterJewelNotables).toContain('Wicked Pall');
    expect(result.clusterJewelValid).toBe(true);
  });

  it('parses PoB item text with Cluster Jewel Skill field but no enchant line', () => {
    const text = `Small Cluster Jewel
Cluster Jewel Skill: affliction_armour
Cluster Jewel Node Count: 2
Implicits: 2
{crafted}Adds 2 Passive Skills
{crafted}Added Small Passive Skills grant: 15% increased Armour
1 Added Passive Skill is Enduring Composure`;

    const result = parseClusterJewel(text, clusterData);
    expect(result.baseName).toBe('Small Cluster Jewel');
    expect(result.clusterJewelSkill).toBe('affliction_armour');
    expect(result.clusterJewelNodeCount).toBe(2);
    expect(result.clusterJewelNotables).toEqual(['Enduring Composure']);
    expect(result.clusterJewelValid).toBe(true);
  });
});
