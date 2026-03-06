import { describe, it, expect } from 'vitest';
import { TreeSearch } from '../tree-search.js';
import { TreeData } from '../tree-data.js';

function makeTreeJson() {
  return {
    classes: [{ name: 'Scion', ascendancies: [], startNodeId: 1 }],
    nodes: {
      1: { id: 1, name: 'Start', type: 'classStart', group: 1, orbit: 0, orbitIndex: 0, stats: [], adjacent: [2] },
      2: { id: 2, name: 'Strength Node', type: 'normal', group: 1, orbit: 1, orbitIndex: 0, stats: ['+10 to Strength'], adjacent: [1, 3] },
      3: { id: 3, name: 'Life and Mana', type: 'notable', group: 2, orbit: 0, orbitIndex: 0, stats: ['+20 to Maximum Life', '+10 to Maximum Mana'], adjacent: [2, 4] },
      4: { id: 4, name: 'Crit Multi', type: 'normal', group: 2, orbit: 1, orbitIndex: 0, stats: ['+15% to Critical Strike Multiplier'], adjacent: [3] },
      5: { id: 5, name: 'Iron Reflexes', type: 'keystone', group: 3, orbit: 0, orbitIndex: 0, stats: ['Converts all Evasion Rating to Armour'], adjacent: [] },
      6: { id: 6, name: 'Fire Damage', type: 'normal', group: 3, orbit: 1, orbitIndex: 0, stats: ['10% increased Fire Damage'], adjacent: [5] },
    },
    groups: {
      1: { x: 0, y: 0, orbits: [0, 1] },
      2: { x: 200, y: 0, orbits: [0, 1] },
      3: { x: -200, y: 0, orbits: [0, 1] },
    },
    constants: { orbitRadii: [0, 82], skillsPerOrbit: [1, 6] },
  };
}

describe('TreeSearch', () => {
  it('creates with tree data', () => {
    const td = new TreeData(makeTreeJson());
    const search = new TreeSearch(td);
    expect(search).toBeDefined();
  });

  it('finds nodes by name', () => {
    const td = new TreeData(makeTreeJson());
    const search = new TreeSearch(td);
    const results = search.search('Strength');
    expect(results.matchIds.has(2)).toBe(true);
  });

  it('finds nodes by stat text', () => {
    const td = new TreeData(makeTreeJson());
    const search = new TreeSearch(td);
    const results = search.search('Maximum Life');
    expect(results.matchIds.has(3)).toBe(true);
  });

  it('search is case-insensitive', () => {
    const td = new TreeData(makeTreeJson());
    const search = new TreeSearch(td);
    const results = search.search('iron reflexes');
    expect(results.matchIds.has(5)).toBe(true);
  });

  it('returns empty set for no matches', () => {
    const td = new TreeData(makeTreeJson());
    const search = new TreeSearch(td);
    const results = search.search('zzzznonexistent');
    expect(results.matchIds.size).toBe(0);
    expect(results.matchCount).toBe(0);
  });

  it('returns match count', () => {
    const td = new TreeData(makeTreeJson());
    const search = new TreeSearch(td);
    const results = search.search('Damage');
    // 'Fire Damage' name + '10% increased Fire Damage' stat
    expect(results.matchCount).toBeGreaterThanOrEqual(1);
  });

  it('matches multiple nodes', () => {
    const td = new TreeData(makeTreeJson());
    const search = new TreeSearch(td);
    const results = search.search('to');
    // '+10 to Strength', '+20 to Maximum Life', '+10 to Maximum Mana', '+15% to Crit Multi'
    expect(results.matchCount).toBeGreaterThanOrEqual(3);
  });

  it('clears search', () => {
    const td = new TreeData(makeTreeJson());
    const search = new TreeSearch(td);
    search.search('Life');
    const results = search.clear();
    expect(results.matchIds.size).toBe(0);
    expect(results.matchCount).toBe(0);
  });

  it('handles empty query', () => {
    const td = new TreeData(makeTreeJson());
    const search = new TreeSearch(td);
    const results = search.search('');
    expect(results.matchIds.size).toBe(0);
  });

  it('handles regex special characters in query', () => {
    const td = new TreeData(makeTreeJson());
    const search = new TreeSearch(td);
    const results = search.search('+10');
    expect(results.matchCount).toBeGreaterThanOrEqual(1);
  });
});
