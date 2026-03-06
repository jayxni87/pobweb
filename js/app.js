// PoBWeb - App Shell
// Main entry point: layout, tab switching, worker communication, stat sidebar.

import { TabPanel } from './ui/tab-panel.js';
import { StatSidebar } from './ui/stat-sidebar.js';
import { ModDB } from './engine/mod-db.js';
import { parseMod } from './engine/mod-parser.js';
import { initModDB } from './engine/calc-setup.js';
import { doActorAttribs, doActorLifeMana } from './engine/calc-perform.js';
import { calcResistances, calcBlock, calcDefences } from './engine/calc-defence.js';
import { TreeData } from './tree/tree-data.js';
import { TreeRenderer, buildNodeInstances, buildConnectionInstances, NODE_COLORS, CONNECTION_COLORS } from './tree/tree-renderer.js';
import { TreeInteraction } from './tree/tree-interaction.js';
import { TreeSearch } from './tree/tree-search.js';
import { TreeAllocation } from './tree/tree-allocation.js';

const TAB_NAMES = ['Tree', 'Skills', 'Items', 'Calcs', 'Config', 'Import', 'Notes'];
const TREE_DATA_URL = 'js/data/tree/3_25.json';

class PoBApp {
  constructor() {
    this.tabPanel = null;
    this.sidebar = null;
    this.tabContent = null;
    this.activeTab = 'Tree';
    this.calcOutput = {};

    // Build state
    this.buildName = 'New Build';
    this.className = 'Scion';
    this.level = 1;

    // Tree state
    this.treeData = null;
    this.treeRenderer = null;
    this.treeInteraction = null;
    this.treeSearch = null;
    this.treeAllocation = null;
    this._treeLoading = false;
    this._treeLoaded = false;
    this._animFrameId = null;
  }

  init() {
    this._initMenuBar();
    this._initTabs();
    this._initSidebar();
    this._initStatusBar();
    this._switchTab('Tree');
    this._runCalc();
    this._loadTreeData();
  }

  async _loadTreeData() {
    if (this._treeLoading || this._treeLoaded) return;
    this._treeLoading = true;

    try {
      const resp = await fetch(TREE_DATA_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      this.treeData = new TreeData(json);
      this._treeLoaded = true;

      // Create allocation with Scion (class 0) by default
      const classId = this.treeData.classNameToId(this.className);
      this.treeAllocation = new TreeAllocation(this.treeData, classId >= 0 ? classId : 0);
      this.treeSearch = new TreeSearch(this.treeData);

      // If we're on the tree tab, initialize the renderer
      if (this.activeTab === 'Tree') {
        this._initTreeRenderer();
      }

      this._updateStatusBar();
    } catch (e) {
      console.error('Failed to load tree data:', e);
      this._treeLoading = false;
    }
  }

  _initTreeRenderer() {
    const canvas = document.getElementById('tree-canvas');
    if (!canvas || !this.treeData) return;

    // Clean up previous renderer
    this._destroyTreeRenderer();

    // Size canvas
    const rect = this.tabContent.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    try {
      this.treeRenderer = new TreeRenderer(canvas);
      this.treeRenderer.createFallbackAtlas();

      // Set camera to center on tree with appropriate zoom
      const b = this.treeData.bounds;
      const treeW = b.maxX - b.minX;
      const treeH = b.maxY - b.minY;
      const centerX = (b.minX + b.maxX) / 2;
      const centerY = (b.minY + b.maxY) / 2;
      const zoomX = canvas.width / (treeW * 1.1);
      const zoomY = canvas.height / (treeH * 1.1);
      const zoom = Math.min(zoomX, zoomY);
      this.treeRenderer.setCamera(centerX, centerY, zoom);

      // Build instances
      this._rebuildTreeInstances();

      // Set up interaction
      this.treeInteraction = new TreeInteraction(this.treeRenderer, this.treeData);
      this.treeInteraction.attachToCanvas(canvas);

      this.treeInteraction.onNodeClick = (node) => {
        if (!node) return;
        if (node.type === 'classStart' || node.type === 'mastery') return;
        this.treeAllocation.toggleNode(node.id);
        this._rebuildTreeInstances();
        this._updateStatusBar();
      };

      this.treeInteraction.onNodeHover = (node) => {
        this._updateTreeTooltip(node);
      };

      // Wire up zoom controls
      document.getElementById('zoom-in')?.addEventListener('click', () => {
        this.treeInteraction.zoom(canvas.width / 2, canvas.height / 2, 1);
      });
      document.getElementById('zoom-out')?.addEventListener('click', () => {
        this.treeInteraction.zoom(canvas.width / 2, canvas.height / 2, -1);
      });
      document.getElementById('zoom-reset')?.addEventListener('click', () => {
        const b = this.treeData.bounds;
        const zX = canvas.width / ((b.maxX - b.minX) * 1.1);
        const zY = canvas.height / ((b.maxY - b.minY) * 1.1);
        this.treeRenderer.setCamera(
          (b.minX + b.maxX) / 2,
          (b.minY + b.maxY) / 2,
          Math.min(zX, zY),
        );
      });

      // Wire up search
      const searchInput = document.getElementById('tree-search');
      const searchCount = document.getElementById('tree-search-count');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const result = this.treeSearch.search(searchInput.value);
          if (searchCount) {
            searchCount.textContent = searchInput.value ? `${result.matchCount} found` : '';
          }
          this._rebuildTreeInstances();
        });
      }

      // Hide the placeholder info
      const treeInfo = document.querySelector('.tree-info');
      if (treeInfo) treeInfo.style.display = 'none';

      // Start render loop
      this._startRenderLoop();

      // Handle resize
      this._resizeHandler = () => {
        const r = this.tabContent.getBoundingClientRect();
        if (this.treeRenderer) {
          this.treeRenderer.resize(r.width, r.height);
        }
      };
      window.addEventListener('resize', this._resizeHandler);

    } catch (e) {
      console.error('Failed to init tree renderer:', e);
    }
  }

  _rebuildTreeInstances() {
    if (!this.treeRenderer || !this.treeData) return;

    const highlighted = this.treeSearch?.lastResult?.matchIds;
    const spec = this.treeAllocation?.spec;
    const nodeInstances = buildNodeInstances(this.treeData, spec, { highlighted });
    const connInstances = buildConnectionInstances(this.treeData, spec);

    this.treeRenderer.setNodeInstances(nodeInstances);
    this.treeRenderer.setConnectionInstances(connInstances);
  }

  _startRenderLoop() {
    const loop = () => {
      if (this.treeRenderer) {
        this.treeRenderer.render();
        this._animFrameId = requestAnimationFrame(loop);
      }
    };
    this._animFrameId = requestAnimationFrame(loop);
  }

  _destroyTreeRenderer() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this.treeRenderer) {
      this.treeRenderer.destroy();
      this.treeRenderer = null;
    }
    this.treeInteraction = null;
  }

  _updateTreeTooltip(node) {
    let tooltip = document.getElementById('tree-tooltip');
    if (!node) {
      if (tooltip) tooltip.style.display = 'none';
      return;
    }

    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'tree-tooltip';
      tooltip.style.cssText = `
        position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%);
        background: rgba(10,10,20,0.92); border: 1px solid #3a3a5e; border-radius: 4px;
        padding: 8px 12px; font-size: 12px; color: #d4d4d4; pointer-events: none;
        max-width: 350px; z-index: 10; white-space: pre-wrap;
      `;
      const overlay = document.querySelector('.tree-overlay');
      if (overlay) overlay.appendChild(tooltip);
    }

    const typeLabel = node.type !== 'normal' ? ` (${node.type})` : '';
    const statsText = node.stats?.length ? '\n' + node.stats.join('\n') : '';
    tooltip.textContent = node.name + typeLabel + statsText;
    tooltip.style.display = 'block';
  }

  _initMenuBar() {
    const menuBar = document.getElementById('menu-bar');
    if (!menuBar) return;

    menuBar.innerHTML = `
      <div class="menu-left">
        <span class="build-name" id="build-name">${this.buildName}</span>
        <select class="class-select" id="class-select">
          <option>Scion</option><option>Marauder</option><option>Ranger</option>
          <option>Witch</option><option>Duelist</option><option>Templar</option><option>Shadow</option>
        </select>
        <label class="level-label">Level:
          <input type="number" class="level-input" id="level-input" value="${this.level}" min="1" max="100">
        </label>
      </div>
      <div class="menu-right">
        <span class="menu-hint">PoBWeb — Path of Building for the Browser</span>
      </div>
    `;

    document.getElementById('class-select')?.addEventListener('change', (e) => {
      this.className = e.target.value;
      this._onClassChange();
      this._runCalc();
    });

    document.getElementById('level-input')?.addEventListener('change', (e) => {
      this.level = Math.max(1, Math.min(100, parseInt(e.target.value) || 1));
      e.target.value = this.level;
      this._runCalc();
    });
  }

  _onClassChange() {
    if (!this.treeData) return;
    const classId = this.treeData.classNameToId(this.className);
    if (classId < 0) return;
    this.treeAllocation = new TreeAllocation(this.treeData, classId);
    if (this.activeTab === 'Tree') {
      this._rebuildTreeInstances();
    }
    this._updateStatusBar();
  }

  _initTabs() {
    const tabbar = document.getElementById('tab-bar');
    this.tabContent = document.getElementById('tab-content');
    if (!tabbar) return;

    this.tabPanel = new TabPanel(tabbar, TAB_NAMES);
    this.tabPanel.onChange = (tab) => this._switchTab(tab);

    tabbar.innerHTML = '';
    for (const name of TAB_NAMES) {
      const tabEl = document.createElement('div');
      tabEl.className = 'tab' + (name === 'Tree' ? ' active' : '');
      tabEl.textContent = name;
      tabEl.addEventListener('click', () => this.tabPanel.switchTo(name));
      tabbar.appendChild(tabEl);
    }
  }

  _switchTab(tabName) {
    const prevTab = this.activeTab;
    this.activeTab = tabName;

    // Clean up tree renderer when leaving tree tab
    if (prevTab === 'Tree' && tabName !== 'Tree') {
      this._destroyTreeRenderer();
    }

    // Update tab bar
    const tabbar = document.getElementById('tab-bar');
    if (tabbar) {
      for (const child of tabbar.children) {
        child.classList.toggle('active', child.textContent === tabName);
      }
    }

    if (!this.tabContent) return;

    switch (tabName) {
      case 'Tree':
        this._renderTreeTab();
        break;
      case 'Skills':
        this._renderSkillsTab();
        break;
      case 'Items':
        this._renderItemsTab();
        break;
      case 'Calcs':
        this._renderCalcsTab();
        break;
      case 'Config':
        this._renderConfigTab();
        break;
      case 'Import':
        this._renderImportTab();
        break;
      case 'Notes':
        this._renderNotesTab();
        break;
    }
  }

  _renderTreeTab() {
    this.tabContent.innerHTML = `
      <div class="tree-tab">
        <canvas id="tree-canvas"></canvas>
        <div class="tree-overlay">
          <div class="tree-controls">
            <input type="text" class="tree-search" placeholder="Search passive tree..." id="tree-search">
            <span class="tree-search-count" id="tree-search-count"></span>
          </div>
          <div class="tree-info">
            <p>Passive Skill Tree</p>
            <p class="tree-hint">${this._treeLoaded ? 'Initializing renderer...' : 'Loading tree data...'}</p>
          </div>
          <div class="tree-zoom-controls">
            <button class="btn" id="zoom-in">+</button>
            <button class="btn" id="zoom-out">&minus;</button>
            <button class="btn" id="zoom-reset">Reset</button>
          </div>
        </div>
      </div>
    `;

    if (this._treeLoaded) {
      this._initTreeRenderer();
    }
  }

  _renderSkillsTab() {
    this.tabContent.innerHTML = `
      <div class="panel-layout">
        <div class="panel-sidebar">
          <div class="panel-header">
            <span>Socket Groups</span>
            <button class="btn btn-sm" id="add-group">+ New</button>
          </div>
          <div class="panel-list" id="skill-group-list">
            <div class="list-empty">No socket groups. Click + New to add one.</div>
          </div>
        </div>
        <div class="panel-main">
          <div class="panel-placeholder">Select or create a socket group to edit gems</div>
        </div>
      </div>
    `;
  }

  _renderItemsTab() {
    const slots = [
      'Weapon 1', 'Weapon 2', 'Helmet', 'Body Armour', 'Gloves', 'Boots',
      'Amulet', 'Ring 1', 'Ring 2', 'Belt',
    ];
    this.tabContent.innerHTML = `
      <div class="panel-layout">
        <div class="panel-sidebar">
          <div class="panel-header">Equipment Slots</div>
          <div class="panel-list">
            ${slots.map(s => `<div class="list-item">${s} <span class="item-empty">(empty)</span></div>`).join('')}
          </div>
        </div>
        <div class="panel-main">
          <div class="panel-placeholder">Select a slot and paste item text to equip</div>
        </div>
      </div>
    `;
  }

  _renderCalcsTab() {
    const o = this.calcOutput;
    this.tabContent.innerHTML = `
      <div class="calcs-layout">
        <div class="calcs-column">
          <div class="calcs-section">
            <div class="calcs-header">Attributes</div>
            ${this._statRow('Strength', o.Str)}
            ${this._statRow('Dexterity', o.Dex)}
            ${this._statRow('Intelligence', o.Int)}
          </div>
          <div class="calcs-section">
            <div class="calcs-header">Defence</div>
            ${this._statRow('Life', o.Life)}
            ${this._statRow('Mana', o.Mana)}
            ${this._statRow('Energy Shield', o.EnergyShield)}
            ${this._statRow('Armour', o.Armour)}
            ${this._statRow('Evasion', o.Evasion)}
          </div>
        </div>
        <div class="calcs-column">
          <div class="calcs-section">
            <div class="calcs-header">Resistances</div>
            ${this._statRow('Fire Resistance', o.FireResist, '%', 'fire')}
            ${this._statRow('Cold Resistance', o.ColdResist, '%', 'cold')}
            ${this._statRow('Lightning Resistance', o.LightningResist, '%', 'lightning')}
            ${this._statRow('Chaos Resistance', o.ChaosResist, '%', 'chaos')}
          </div>
          <div class="calcs-section">
            <div class="calcs-header">Block</div>
            ${this._statRow('Block Chance', o.BlockChance, '%')}
            ${this._statRow('Spell Block', o.SpellBlockChance, '%')}
            ${this._statRow('Spell Suppression', o.SpellSuppressionChance, '%')}
          </div>
        </div>
      </div>
    `;
  }

  _renderConfigTab() {
    this.tabContent.innerHTML = `
      <div class="config-layout">
        <div class="config-section">
          <div class="config-header">General</div>
          <label class="config-row"><input type="checkbox" id="cfg-moving"> Are you always moving?</label>
          <label class="config-row"><input type="checkbox" id="cfg-fulllife"> Are you always on Full Life?</label>
          <label class="config-row"><input type="checkbox" id="cfg-lowlife"> Are you always on Low Life?</label>
          <label class="config-row"><input type="checkbox" id="cfg-onslaught"> Do you have Onslaught?</label>
        </div>
        <div class="config-section">
          <div class="config-header">Charges</div>
          <label class="config-row"><input type="checkbox" id="cfg-power"> Use Power Charges</label>
          <label class="config-row"><input type="checkbox" id="cfg-frenzy"> Use Frenzy Charges</label>
          <label class="config-row"><input type="checkbox" id="cfg-endurance"> Use Endurance Charges</label>
        </div>
        <div class="config-section">
          <div class="config-header">Enemy</div>
          <label class="config-row">
            Is the enemy a Boss?
            <select id="cfg-boss">
              <option value="None">No</option>
              <option value="Boss">Standard Boss</option>
              <option value="Pinnacle" selected>Guardian / Pinnacle Boss</option>
              <option value="Uber">Uber Pinnacle Boss</option>
            </select>
          </label>
        </div>
      </div>
    `;
  }

  _renderImportTab() {
    this.tabContent.innerHTML = `
      <div class="import-layout">
        <div class="import-section">
          <h3>Import from Share Code</h3>
          <textarea id="share-code-input" class="import-textarea" rows="4"
            placeholder="Paste PoB share code here..."></textarea>
          <button class="btn btn-primary" id="import-code-btn">Import</button>
          <span class="import-status" id="import-status"></span>
        </div>
        <div class="import-section">
          <h3>Import from File</h3>
          <input type="file" id="file-input" accept=".xml,.txt" style="display:none">
          <button class="btn" onclick="document.getElementById('file-input').click()">Choose XML File</button>
        </div>
        <div class="import-section">
          <h3>Export</h3>
          <button class="btn" id="export-xml-btn">Save as XML</button>
          <button class="btn" id="export-code-btn">Copy Share Code</button>
        </div>
      </div>
    `;
  }

  _renderNotesTab() {
    this.tabContent.innerHTML = `
      <div class="notes-layout">
        <textarea class="notes-textarea" placeholder="Build notes..."></textarea>
      </div>
    `;
  }

  _statRow(label, value, suffix = '', colorClass = '') {
    const v = value !== undefined && value !== null ? Math.round(value) : 0;
    const cls = colorClass ? ` class="val-${colorClass}"` : '';
    return `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value"${cls}>${v.toLocaleString()}${suffix}</span></div>`;
  }

  _initSidebar() {
    const sidebarEl = document.getElementById('stat-sidebar');
    if (!sidebarEl) return;
    this.sidebar = new StatSidebar(sidebarEl);
    this.sidebar.update({});
  }

  _initStatusBar() {
    const statusBar = document.getElementById('status-bar');
    if (!statusBar) return;
    statusBar.innerHTML = `
      <span class="status-item" id="status-points">Points: 0 / 123</span>
      <span class="status-item" id="status-ascendancy">Ascendancy: 0 / 8</span>
      <span class="status-spacer"></span>
      <span class="status-item status-right">PoBWeb v0.1</span>
    `;
  }

  _updateStatusBar() {
    const pointsEl = document.getElementById('status-points');
    const ascEl = document.getElementById('status-ascendancy');
    if (pointsEl && this.treeAllocation) {
      // class start node counts as 1 allocated but doesn't use a point
      const used = Math.max(0, this.treeAllocation.allocatedCount() - 1);
      pointsEl.textContent = `Points: ${used} / 123`;
    }
    if (ascEl && this.treeAllocation) {
      ascEl.textContent = `Ascendancy: ${this.treeAllocation.spec.ascendancyCount()} / 8`;
    }
  }

  _runCalc() {
    const modDB = new ModDB();
    if (!modDB.conditions) modDB.conditions = {};
    initModDB(modDB, this.level);

    const output = {};
    const actor = { modDB, output };

    doActorAttribs(actor);
    doActorLifeMana(actor);
    calcResistances(actor);
    calcBlock(actor);
    calcDefences(actor);

    this.calcOutput = output;

    if (this.sidebar) this.sidebar.update(output);
    if (this.activeTab === 'Calcs') this._renderCalcsTab();
  }
}

// Auto-init when DOM is ready
const app = new PoBApp();
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
}

export { PoBApp };
export function sendToWorker(type, payload) {
  app.sendToWorker(type, payload);
}
