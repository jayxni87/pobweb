// PoBWeb - Calcs Tab (port of Classes/CalcsTab.lua)
// Collapsible stat sections with breakdown display.

import { StatSidebar } from '../ui/stat-sidebar.js';

const STAT_SECTIONS = [
  {
    name: 'Offence',
    stats: [
      { key: 'TotalDPS', label: 'Total DPS', format: 'number' },
      { key: 'AverageDamage', label: 'Average Damage', format: 'number' },
      { key: 'Speed', label: 'Attack/Cast Rate', format: 'decimal' },
      { key: 'HitChance', label: 'Hit Chance', format: 'percent' },
      { key: 'CritChance', label: 'Crit Chance', format: 'percent' },
      { key: 'CritMultiplier', label: 'Crit Multiplier', format: 'percent' },
      { key: 'PhysicalDPS', label: 'Physical DPS', format: 'number' },
      { key: 'ElementalDPS', label: 'Elemental DPS', format: 'number' },
      { key: 'ChaosDPS', label: 'Chaos DPS', format: 'number' },
      { key: 'BleedDPS', label: 'Bleed DPS', format: 'number' },
      { key: 'PoisonDPS', label: 'Poison DPS', format: 'number' },
      { key: 'IgniteDPS', label: 'Ignite DPS', format: 'number' },
      { key: 'ImpaleDPS', label: 'Impale DPS', format: 'number' },
      { key: 'CombinedDPS', label: 'Combined DPS', format: 'number' },
    ],
  },
  {
    name: 'Defence',
    stats: [
      { key: 'Life', label: 'Life', format: 'number' },
      { key: 'Mana', label: 'Mana', format: 'number' },
      { key: 'EnergyShield', label: 'Energy Shield', format: 'number' },
      { key: 'Armour', label: 'Armour', format: 'number' },
      { key: 'Evasion', label: 'Evasion', format: 'number' },
      { key: 'BlockChance', label: 'Block Chance', format: 'percent' },
      { key: 'SpellBlockChance', label: 'Spell Block', format: 'percent' },
      { key: 'SpellSuppressionChance', label: 'Spell Suppression', format: 'percent' },
      { key: 'FireResist', label: 'Fire Resistance', format: 'number' },
      { key: 'ColdResist', label: 'Cold Resistance', format: 'number' },
      { key: 'LightningResist', label: 'Lightning Resistance', format: 'number' },
      { key: 'ChaosResist', label: 'Chaos Resistance', format: 'number' },
    ],
  },
  {
    name: 'Attributes',
    stats: [
      { key: 'Str', label: 'Strength', format: 'number' },
      { key: 'Dex', label: 'Dexterity', format: 'number' },
      { key: 'Int', label: 'Intelligence', format: 'number' },
    ],
  },
];

export class CalcsTab {
  constructor(container) {
    this.container = container;
    this.output = {};
    this.collapsedSections = new Set();

    this._init();
  }

  _init() {
    this.container.innerHTML = '<div class="calcs-tab" id="calcs-content"></div>';
    this.render();
  }

  update(output) {
    this.output = output || {};
    this.render();
  }

  render() {
    const content = this.container.querySelector('#calcs-content');
    if (!content) return;

    let html = '';
    for (const section of STAT_SECTIONS) {
      const collapsed = this.collapsedSections.has(section.name);
      html += `
        <div class="calcs-section">
          <div class="calcs-section-header" data-section="${section.name}">
            <span class="collapse-icon">${collapsed ? '▶' : '▼'}</span>
            <span>${section.name}</span>
          </div>
      `;

      if (!collapsed) {
        html += '<div class="calcs-section-body">';
        for (const stat of section.stats) {
          const value = this.output[stat.key];
          if (value === undefined || value === null) continue;
          const formatted = this._formatValue(value, stat.format);
          html += `
            <div class="calcs-stat-row" data-key="${stat.key}">
              <span class="calcs-stat-label">${stat.label}</span>
              <span class="calcs-stat-value">${formatted}</span>
            </div>
          `;
        }
        html += '</div>';
      }

      html += '</div>';
    }

    content.innerHTML = html;

    // Wire up section collapse toggles
    content.querySelectorAll('.calcs-section-header').forEach(header => {
      header.addEventListener('click', () => {
        const name = header.dataset.section;
        if (this.collapsedSections.has(name)) {
          this.collapsedSections.delete(name);
        } else {
          this.collapsedSections.add(name);
        }
        this.render();
      });
    });
  }

  _formatValue(value, format) {
    switch (format) {
      case 'number': return StatSidebar.formatNumber(value);
      case 'decimal': return (Math.round(value * 100) / 100).toFixed(2);
      case 'percent': return StatSidebar.formatPercent(value);
      default: return String(value);
    }
  }
}
