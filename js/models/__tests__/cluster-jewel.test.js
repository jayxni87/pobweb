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
});
