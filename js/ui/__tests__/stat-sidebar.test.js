import { describe, it, expect } from 'vitest';
import { StatSidebar } from '../stat-sidebar.js';

function mockElement() {
  return {
    innerHTML: '',
    style: {},
    appendChild() {},
    children: [],
  };
}

describe('StatSidebar', () => {
  it('creates with element', () => {
    const el = mockElement();
    const sidebar = new StatSidebar(el);
    expect(sidebar).toBeDefined();
  });

  it('updates with calc output', () => {
    const el = mockElement();
    const sidebar = new StatSidebar(el);
    sidebar.update({
      Str: 100,
      Dex: 50,
      Int: 200,
      Life: 5000,
      Mana: 800,
      EnergyShield: 0,
      Armour: 1500,
      Evasion: 2000,
      FireResist: 75,
      ColdResist: 75,
      LightningResist: 75,
      ChaosResist: -60,
      BlockChance: 30,
      SpellBlockChance: 10,
      SpellSuppressionChance: 50,
    });
    expect(el.innerHTML).toContain('5,000');
    expect(el.innerHTML).toContain('1,500');
  });

  it('formats numbers with separators', () => {
    expect(StatSidebar.formatNumber(1234567)).toBe('1,234,567');
    expect(StatSidebar.formatNumber(0)).toBe('0');
    expect(StatSidebar.formatNumber(999)).toBe('999');
  });

  it('formats percentages', () => {
    expect(StatSidebar.formatPercent(45.5)).toBe('45.5%');
    expect(StatSidebar.formatPercent(100)).toBe('100%');
  });

  it('handles missing stats gracefully', () => {
    const el = mockElement();
    const sidebar = new StatSidebar(el);
    sidebar.update({});
    expect(el.innerHTML).toBeDefined();
  });
});
