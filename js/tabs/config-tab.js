// PoBWeb - Config Tab (port of Classes/ConfigTab.lua)
// Auto-generates UI from config-options.js definitions.

import { configOptions } from '../models/config-options.js';

export class ConfigTab {
  constructor(container) {
    this.container = container;
    this.values = {};
    this.onChange = null;

    this._init();
  }

  _init() {
    this.container.innerHTML = '<div class="config-tab" id="config-content"></div>';
    this.render();
  }

  render() {
    const content = this.container.querySelector('#config-content');
    if (!content) return;

    // Group options by category (derived from var prefix)
    const groups = this._groupOptions();
    let html = '';

    for (const [groupName, options] of Object.entries(groups)) {
      html += `
        <div class="config-section">
          <div class="config-section-header">${groupName}</div>
          <div class="config-section-body">
      `;

      for (const opt of options) {
        html += this._renderOption(opt);
      }

      html += '</div></div>';
    }

    content.innerHTML = html;
    this._wireEvents(content);
  }

  _groupOptions() {
    const groups = {
      'General': [],
      'Conditions': [],
      'Charges': [],
      'Buffs': [],
      'Enemy': [],
      'Enemy Stats': [],
      'Multipliers': [],
      'Other': [],
    };

    for (const opt of configOptions) {
      const v = opt.var;
      if (v.startsWith('condition') && !v.startsWith('conditionEnemy')) {
        groups['Conditions'].push(opt);
      } else if (v.startsWith('conditionEnemy')) {
        groups['Enemy'].push(opt);
      } else if (v.startsWith('multiplier')) {
        groups['Multipliers'].push(opt);
      } else if (v.startsWith('use') || v.startsWith('buff')) {
        groups['Buffs'].push(opt);
      } else if (v.startsWith('enemy') && !v.startsWith('conditionEnemy')) {
        groups['Enemy Stats'].push(opt);
      } else {
        groups['Other'].push(opt);
      }
    }

    // Remove empty groups
    for (const key of Object.keys(groups)) {
      if (groups[key].length === 0) delete groups[key];
    }

    return groups;
  }

  _renderOption(opt) {
    const val = this.values[opt.var];

    switch (opt.type) {
      case 'check':
        return `
          <div class="config-row">
            <label>
              <input type="checkbox" class="config-check" data-var="${opt.var}" ${val ? 'checked' : ''}>
              ${opt.label}
            </label>
          </div>
        `;

      case 'count':
      case 'countAllowZero':
        return `
          <div class="config-row">
            <label>
              ${opt.label}
              <input type="number" class="config-count pob-edit" data-var="${opt.var}"
                value="${val || ''}" min="${opt.type === 'countAllowZero' ? 0 : 1}" placeholder="0">
            </label>
          </div>
        `;

      case 'list':
        return `
          <div class="config-row">
            <label>
              ${opt.label}
              <select class="config-list" data-var="${opt.var}">
                ${(opt.list || []).map(item =>
                  `<option value="${item.val}" ${val === item.val ? 'selected' : ''}>${item.label}</option>`
                ).join('')}
              </select>
            </label>
          </div>
        `;

      default:
        return '';
    }
  }

  _wireEvents(content) {
    content.querySelectorAll('.config-check').forEach(input => {
      input.addEventListener('change', () => {
        this.values[input.dataset.var] = input.checked;
        this._fireChange();
      });
    });

    content.querySelectorAll('.config-count').forEach(input => {
      input.addEventListener('change', () => {
        const val = parseInt(input.value);
        this.values[input.dataset.var] = isNaN(val) ? 0 : val;
        this._fireChange();
      });
    });

    content.querySelectorAll('.config-list').forEach(select => {
      select.addEventListener('change', () => {
        this.values[select.dataset.var] = select.value;
        this._fireChange();
      });
    });
  }

  _fireChange() {
    if (this.onChange) this.onChange(this.values);
  }

  getValues() {
    return { ...this.values };
  }

  loadValues(config) {
    this.values = { ...config };
    this.render();
  }
}
