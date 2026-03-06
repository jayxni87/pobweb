// PoBWeb - Skills Tab (port of Classes/SkillsTab.lua)
// Socket group list, gem selector, level/quality inputs, active skill selection.

import { SkillGroup, GemInstance } from '../models/skill.js';
import { ListControl, DropdownControl, EditControl } from '../ui/component.js';

export class SkillsTab {
  constructor(container) {
    this.container = container;
    this.skillGroups = [];
    this.selectedGroupIndex = -1;
    this.onChange = null;

    this._init();
  }

  _init() {
    this.container.innerHTML = `
      <div class="skills-tab">
        <div class="skills-sidebar">
          <div class="skills-header">
            <span>Socket Groups</span>
            <button class="pob-btn" id="add-group-btn">+ Add</button>
          </div>
          <div class="skills-group-list" id="group-list"></div>
        </div>
        <div class="skills-editor" id="skills-editor">
          <div class="skills-placeholder">Select or add a socket group</div>
        </div>
      </div>
    `;

    const addBtn = this.container.querySelector('#add-group-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.addGroup());
    }
  }

  addGroup(opts = {}) {
    const group = new SkillGroup(opts);
    this.skillGroups.push(group);
    this._renderGroupList();
    this.selectGroup(this.skillGroups.length - 1);
    this._fireChange();
  }

  removeGroup(index) {
    if (index < 0 || index >= this.skillGroups.length) return;
    this.skillGroups.splice(index, 1);
    this._renderGroupList();
    if (this.selectedGroupIndex >= this.skillGroups.length) {
      this.selectedGroupIndex = this.skillGroups.length - 1;
    }
    if (this.selectedGroupIndex >= 0) {
      this.selectGroup(this.selectedGroupIndex);
    } else {
      this._clearEditor();
    }
    this._fireChange();
  }

  selectGroup(index) {
    this.selectedGroupIndex = index;
    this._renderGroupList();
    this._renderEditor();
  }

  addGemToGroup(groupIndex, gemOpts) {
    if (groupIndex < 0 || groupIndex >= this.skillGroups.length) return;
    this.skillGroups[groupIndex].addGem(gemOpts);
    if (groupIndex === this.selectedGroupIndex) this._renderEditor();
    this._fireChange();
  }

  removeGemFromGroup(groupIndex, gemIndex) {
    if (groupIndex < 0 || groupIndex >= this.skillGroups.length) return;
    this.skillGroups[groupIndex].removeGem(gemIndex);
    if (groupIndex === this.selectedGroupIndex) this._renderEditor();
    this._fireChange();
  }

  _renderGroupList() {
    const list = this.container.querySelector('#group-list');
    if (!list) return;

    list.innerHTML = '';
    this.skillGroups.forEach((group, i) => {
      const el = document.createElement('div');
      el.className = 'skills-group-item' + (i === this.selectedGroupIndex ? ' selected' : '');
      const label = group.label || group.slot || `Group ${i + 1}`;
      const gemCount = group.gems.length;
      el.innerHTML = `
        <span class="group-label">${label}</span>
        <span class="group-gem-count">${gemCount} gem${gemCount !== 1 ? 's' : ''}</span>
        <button class="group-remove-btn" data-index="${i}">×</button>
      `;
      el.addEventListener('click', (e) => {
        if (!e.target.classList.contains('group-remove-btn')) {
          this.selectGroup(i);
        }
      });
      const removeBtn = el.querySelector('.group-remove-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeGroup(i);
        });
      }
      list.appendChild(el);
    });
  }

  _renderEditor() {
    const editor = this.container.querySelector('#skills-editor');
    if (!editor) return;
    const group = this.skillGroups[this.selectedGroupIndex];
    if (!group) {
      this._clearEditor();
      return;
    }

    let html = `
      <div class="gem-list-header">
        <span>Gems in Group</span>
        <button class="pob-btn" id="add-gem-btn">+ Add Gem</button>
      </div>
      <div class="gem-list">
    `;

    group.gems.forEach((gem, i) => {
      html += `
        <div class="gem-row" data-index="${i}">
          <input type="checkbox" class="gem-enabled" ${gem.enabled ? 'checked' : ''} data-index="${i}">
          <span class="gem-name">${gem.name || 'Empty'}</span>
          <label>Lvl: <input type="number" class="gem-level" value="${gem.level}" min="1" max="21" data-index="${i}"></label>
          <label>Qual: <input type="number" class="gem-quality" value="${gem.quality}" min="0" max="23" data-index="${i}"></label>
          <button class="gem-remove-btn" data-index="${i}">×</button>
        </div>
      `;
    });

    html += '</div>';
    editor.innerHTML = html;

    // Wire up events
    const addGemBtn = editor.querySelector('#add-gem-btn');
    if (addGemBtn) {
      addGemBtn.addEventListener('click', () => {
        const name = prompt('Gem name:');
        if (name) {
          this.addGemToGroup(this.selectedGroupIndex, { name, level: 20, quality: 0 });
        }
      });
    }

    editor.querySelectorAll('.gem-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeGemFromGroup(this.selectedGroupIndex, parseInt(btn.dataset.index));
      });
    });

    editor.querySelectorAll('.gem-level').forEach(input => {
      input.addEventListener('change', () => {
        const gem = group.gems[parseInt(input.dataset.index)];
        if (gem) { gem.level = parseInt(input.value) || 1; this._fireChange(); }
      });
    });

    editor.querySelectorAll('.gem-quality').forEach(input => {
      input.addEventListener('change', () => {
        const gem = group.gems[parseInt(input.dataset.index)];
        if (gem) { gem.quality = parseInt(input.value) || 0; this._fireChange(); }
      });
    });

    editor.querySelectorAll('.gem-enabled').forEach(input => {
      input.addEventListener('change', () => {
        const gem = group.gems[parseInt(input.dataset.index)];
        if (gem) { gem.enabled = input.checked; this._fireChange(); }
      });
    });
  }

  _clearEditor() {
    const editor = this.container.querySelector('#skills-editor');
    if (editor) editor.innerHTML = '<div class="skills-placeholder">Select or add a socket group</div>';
  }

  _fireChange() {
    if (this.onChange) this.onChange(this.skillGroups);
  }

  getSkillGroups() {
    return this.skillGroups;
  }

  loadGroups(groups) {
    this.skillGroups = groups.map(g => {
      const sg = new SkillGroup({ slot: g.slot, label: g.label });
      for (const gem of (g.gems || [])) {
        sg.addGem(gem);
      }
      return sg;
    });
    this._renderGroupList();
    if (this.skillGroups.length > 0) this.selectGroup(0);
  }
}
