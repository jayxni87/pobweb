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
import { TreeRenderer, buildNodeLayers, buildBackgroundLayers, buildConnectionInstances } from './tree/tree-renderer.js';
import { TreeInteraction } from './tree/tree-interaction.js';
import { TreeSearch } from './tree/tree-search.js';
import { TreeAllocation } from './tree/tree-allocation.js';
import { SpriteData } from './tree/sprite-data.js';
import { importFromShareCode, importFromXml, exportAsXml, copyShareCode } from './io/file-manager.js';
import { Build } from './io/build-xml.js';
import { parseClusterJewel } from './models/cluster-jewel.js';
import { buildSubgraph } from './tree/subgraph-builder.js';

const TAB_NAMES = ['Tree', 'Skills', 'Items', 'Calcs', 'Config', 'Import', 'Notes'];
const TREE_DATA_URL = 'js/data/tree/3_25.json';
const SPRITES_DATA_URL = 'js/data/tree/sprites.json';

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
    this.buildSpecs = [];
    this.activeSpecIndex = 0;

    // Tree state
    this.treeData = null;
    this.spriteData = null;
    this.treeRenderer = null;
    this.treeInteraction = null;
    this.treeSearch = null;
    this.treeAllocation = null;
    this._treeLoading = false;
    this._treeLoaded = false;
    this._animFrameId = null;
    this._clusterData = null;
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
      const [treeResp, spritesResp] = await Promise.all([
        fetch(TREE_DATA_URL),
        fetch(SPRITES_DATA_URL),
      ]);
      if (!treeResp.ok) throw new Error(`Tree HTTP ${treeResp.status}`);
      if (!spritesResp.ok) throw new Error(`Sprites HTTP ${spritesResp.status}`);

      const [treeJson, spritesJson] = await Promise.all([
        treeResp.json(),
        spritesResp.json(),
      ]);

      this.treeData = new TreeData(treeJson);
      this.spriteData = new SpriteData(spritesJson);
      this._treeLoaded = true;

      // Load cluster jewels data
      const clusterResp = await fetch('js/data/cluster-jewels.json');
      if (clusterResp.ok) {
        this._clusterData = await clusterResp.json();
      }

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
      this.treeRenderer.createFallbackTexture();

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

      // Load sprite textures
      this._loadTreeTextures();

      // Build instances
      this._rebuildTreeInstances();

      // Set up interaction
      this.treeInteraction = new TreeInteraction(this.treeRenderer, this.treeData);
      this.treeInteraction.attachToCanvas(canvas);

      this.treeInteraction.onNodeClick = (node) => {
        if (!node) return;
        if (node.type === 'classStart') return;
        // Handle jewel socket clicks for cluster jewels
        if (node.type === 'jewel' && node.expansionJewel) {
          this._onJewelSocketClick(node);
          return;
        }
        if (node.type === 'mastery') {
          this._onMasteryClick(node);
          return;
        }
        this.treeAllocation.toggleNode(node.id);
        this._rebuildTreeInstances();
        this._updateStatusBar();
        this._runCalc();
      };

      this.treeInteraction.onNodeHover = (node, sx, sy) => {
        this._updateTreeTooltip(node, sx, sy);
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

  async _loadTreeTextures() {
    if (!this.treeRenderer || !this.spriteData) return;
    const textures = this.spriteData.getRequiredTextures();
    const loads = [];
    for (const url of Object.values(textures)) {
      if (url) loads.push(this.treeRenderer.loadTexture(url).catch(() => null));
    }

    // Load class background art
    const bgArts = [
      'assets/tree/class-art/BackgroundStr.png',
      'assets/tree/class-art/BackgroundDex.png',
      'assets/tree/class-art/BackgroundInt.png',
      'assets/tree/class-art/BackgroundStrDex.png',
      'assets/tree/class-art/BackgroundStrInt.png',
      'assets/tree/class-art/BackgroundDexInt.png',
    ];
    for (const url of bgArts) {
      loads.push(this.treeRenderer.loadTexture(url).catch(() => null));
    }

    await Promise.all(loads);
    this._rebuildTreeInstances();
  }

  _rebuildTreeInstances() {
    if (!this.treeRenderer || !this.treeData) return;

    const highlighted = this.treeSearch?.lastResult?.matchIds;
    const spec = this.treeAllocation?.spec;
    const connInstances = buildConnectionInstances(this.treeData, spec);
    this.treeRenderer.setConnectionInstances(connInstances);

    if (this.spriteData) {
      const classId = this.treeData.classNameToId(this.className);

      // Background layers (class illustration + class start portraits)
      const bgLayers = buildBackgroundLayers(this.treeData, this.spriteData, classId);
      this.treeRenderer.setBackgroundLayers(bgLayers);

      const layers = buildNodeLayers(this.treeData, this.spriteData, spec, { highlighted });
      this.treeRenderer.setNodeLayers(layers);
    }
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

  _updateTreeTooltip(node, screenX, screenY) {
    let tooltip = document.getElementById('tree-tooltip');
    if (!node) {
      if (tooltip) tooltip.style.display = 'none';
      return;
    }

    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'tree-tooltip';
      tooltip.style.cssText = `
        position: absolute;
        background: rgba(10,10,20,0.92); border: 1px solid #3a3a5e; border-radius: 4px;
        padding: 8px 12px; font-size: 12px; color: #d4d4d4; pointer-events: none;
        max-width: 350px; z-index: 10; white-space: pre-wrap;
      `;
      const overlay = document.querySelector('.tree-overlay');
      if (overlay) overlay.appendChild(tooltip);
    }

    const typeLabel = node.type !== 'normal' ? ` (${node.type})` : '';
    let statsText = '';
    if (node.type === 'mastery' && this.treeAllocation) {
      const effectId = this.treeAllocation.spec.getMasteryEffect(node.id);
      if (effectId != null) {
        const effect = node.masteryEffects.find(e => e.effect === effectId);
        if (effect) statsText = '\n' + effect.stats.join('\n');
      } else if (node.masteryEffects.length > 0) {
        statsText = '\n(click to choose an effect)';
      }
    } else if (node.stats?.length) {
      statsText = '\n' + node.stats.join('\n');
    }
    tooltip.textContent = node.name + typeLabel + statsText;
    tooltip.style.display = 'block';

    // Position near cursor with offset, keeping within bounds
    const offset = 15;
    const parent = tooltip.parentElement;
    const pw = parent ? parent.clientWidth : window.innerWidth;
    const ph = parent ? parent.clientHeight : window.innerHeight;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;

    let left = screenX + offset;
    let top = screenY + offset;

    // Flip to left/above if it would overflow
    if (left + tw > pw) left = screenX - tw - offset;
    if (top + th > ph) top = screenY - th - offset;

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  _onMasteryClick(node) {
    if (!this.treeAllocation) return;
    const spec = this.treeAllocation.spec;
    // Must be adjacent to allocated nodes (or already allocated) to interact
    const isAllocated = spec.isAllocated(node.id);
    const isAdjacent = spec._isAdjacentToAllocated(node.id);
    if (!isAllocated && !isAdjacent) return;
    if (!node.masteryEffects || node.masteryEffects.length === 0) return;

    this._showMasteryPopup(node);
  }

  _showMasteryPopup(node) {
    const spec = this.treeAllocation.spec;
    const currentEffect = spec.getMasteryEffect(node.id);
    const usedEffects = spec.getUsedEffectsForMasteryName(node.name);

    // Build modal
    const overlay = document.createElement('div');
    overlay.className = 'pob-modal-overlay';

    let selectedEffect = currentEffect;

    const effectListHtml = node.masteryEffects.map(eff => {
      const isUsed = usedEffects.has(eff.effect) && eff.effect !== currentEffect;
      const isSelected = eff.effect === currentEffect;
      const cls = ['mastery-effect-item'];
      if (isSelected) cls.push('selected');
      if (isUsed) cls.push('used');
      return `<div class="${cls.join(' ')}" data-effect="${eff.effect}"${isUsed ? ' title="Already used on another node"' : ''}>${eff.stats.join('; ')}</div>`;
    }).join('');

    overlay.innerHTML = `
      <div class="pob-modal">
        <div class="pob-modal-title">${node.name}</div>
        <div class="mastery-effect-list">${effectListHtml}</div>
        <div class="pob-modal-actions">
          ${spec.isAllocated(node.id) ? '<button class="pob-btn mastery-remove-btn">Remove</button>' : ''}
          <button class="pob-btn mastery-cancel-btn">Cancel</button>
          <button class="pob-btn pob-btn-primary mastery-confirm-btn">Confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const updateSelection = () => {
      for (const item of overlay.querySelectorAll('.mastery-effect-item')) {
        const eid = parseInt(item.dataset.effect, 10);
        item.classList.toggle('selected', eid === selectedEffect);
      }
    };

    // Click effect items
    for (const item of overlay.querySelectorAll('.mastery-effect-item:not(.used)')) {
      item.addEventListener('click', () => {
        selectedEffect = parseInt(item.dataset.effect, 10);
        updateSelection();
      });
    }

    const close = () => overlay.remove();

    // Cancel
    overlay.querySelector('.mastery-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Remove
    overlay.querySelector('.mastery-remove-btn')?.addEventListener('click', () => {
      spec.clearMasteryEffect(node.id);
      this.treeAllocation.deallocateNode(node.id);
      this._rebuildTreeInstances();
      this._updateStatusBar();
      this._runCalc();
      close();
    });

    // Confirm
    overlay.querySelector('.mastery-confirm-btn').addEventListener('click', () => {
      if (selectedEffect == null) { close(); return; }
      if (!spec.isAllocated(node.id)) {
        this.treeAllocation.allocateNode(node.id);
      }
      spec.setMasteryEffect(node.id, selectedEffect);
      this._rebuildTreeInstances();
      this._updateStatusBar();
      this._runCalc();
      close();
    });
  }

  _onJewelSocketClick(node) {
    if (!this.treeAllocation || !this._clusterData) return;
    const spec = this.treeAllocation.spec;
    const hasJewel = spec.jewels.has(node.id);
    this._showJewelPopup(node, hasJewel);
  }

  _showJewelPopup(node, hasJewel) {
    const spec = this.treeAllocation.spec;
    const overlay = document.createElement('div');
    overlay.className = 'pob-modal-overlay';

    if (hasJewel) {
      const jewel = spec.jewels.get(node.id);
      overlay.innerHTML = `
        <div class="pob-modal">
          <div class="pob-modal-title">Jewel Socket</div>
          <div class="jewel-info">Equipped: ${jewel?.baseName || 'Cluster Jewel'}</div>
          <div class="pob-modal-actions">
            <button class="pob-btn jewel-unequip-btn">Unequip</button>
            <button class="pob-btn mastery-cancel-btn">Cancel</button>
          </div>
        </div>
      `;
    } else {
      overlay.innerHTML = `
        <div class="pob-modal">
          <div class="pob-modal-title">Equip Cluster Jewel</div>
          <textarea class="jewel-paste-area" rows="8" placeholder="Paste cluster jewel item text here..."></textarea>
          <div class="jewel-parse-status"></div>
          <div class="pob-modal-actions">
            <button class="pob-btn mastery-cancel-btn">Cancel</button>
            <button class="pob-btn pob-btn-primary jewel-equip-btn" disabled>Equip</button>
          </div>
        </div>
      `;
    }

    document.body.appendChild(overlay);
    const close = () => overlay.remove();

    // Cancel
    overlay.querySelector('.mastery-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    if (hasJewel) {
      overlay.querySelector('.jewel-unequip-btn').addEventListener('click', () => {
        spec._removeSubgraph(node.id);
        spec.jewels.delete(node.id);
        this._rebuildTreeInstances();
        this._updateStatusBar();
        this._runCalc();
        close();
      });
    } else {
      const textarea = overlay.querySelector('.jewel-paste-area');
      const equipBtn = overlay.querySelector('.jewel-equip-btn');
      const status = overlay.querySelector('.jewel-parse-status');
      let parsedJewel = null;

      textarea.addEventListener('input', () => {
        parsedJewel = parseClusterJewel(textarea.value, this._clusterData);
        if (parsedJewel.clusterJewelValid) {
          status.textContent = `${parsedJewel.baseName}: ${parsedJewel.clusterJewelNodeCount} nodes, ` +
            `${parsedJewel.clusterJewelSocketCount} sockets, ` +
            `${parsedJewel.clusterJewelNotables.length} notables`;
          status.style.color = '#8f8';
          equipBtn.disabled = false;
        } else {
          status.textContent = parsedJewel.baseName ? 'Invalid cluster jewel data' : '';
          status.style.color = '#f88';
          equipBtn.disabled = true;
        }
      });

      equipBtn.addEventListener('click', () => {
        if (!parsedJewel?.clusterJewelValid) return;
        const constants = {
          orbitRadii: [0, 82, 162, 335, 493, 662, 846],
          skillsPerOrbit: [1, 6, 16, 16, 40, 72, 72],
        };
        const subgraph = buildSubgraph(parsedJewel, node, this.treeData, this._clusterData, constants);
        if (!subgraph) {
          status.textContent = 'Failed to build subgraph';
          status.style.color = '#f88';
          return;
        }
        spec.jewels.set(node.id, { ...parsedJewel, _itemText: textarea.value });
        spec._applySubgraph(node.id, subgraph);
        this._rebuildTreeInstances();
        this._updateStatusBar();
        this._runCalc();
        close();
      });

      setTimeout(() => textarea.focus(), 50);
    }
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
        <span id="spec-dropdown-container"></span>
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
          <button class="btn" id="file-input-btn">Choose XML File</button>
        </div>
        <div class="import-section">
          <h3>Export</h3>
          <button class="btn" id="export-xml-btn">Save as XML</button>
          <button class="btn" id="export-code-btn">Copy Share Code</button>
          <span class="import-status" id="export-status"></span>
        </div>
      </div>
    `;

    // Import share code
    document.getElementById('import-code-btn')?.addEventListener('click', () => {
      const input = document.getElementById('share-code-input');
      const status = document.getElementById('import-status');
      if (!input?.value.trim()) return;
      try {
        const build = importFromShareCode(input.value);
        this._applyBuild(build);
        if (status) status.textContent = `Imported: ${build.className} Lv${build.level} (${build.treeNodes.length} nodes)`;
      } catch (e) {
        if (status) status.textContent = `Error: ${e.message}`;
      }
    });

    // Import XML file
    document.getElementById('file-input-btn')?.addEventListener('click', () => {
      document.getElementById('file-input')?.click();
    });
    document.getElementById('file-input')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const build = importFromXml(text);
        this._applyBuild(build);
      } catch (err) {
        console.error('File import error:', err);
      }
    });

    // Export XML file
    document.getElementById('export-xml-btn')?.addEventListener('click', () => {
      const build = this._buildCurrentBuild();
      exportAsXml(build);
      const status = document.getElementById('export-status');
      if (status) status.textContent = 'Saved!';
    });

    // Export share code to clipboard
    document.getElementById('export-code-btn')?.addEventListener('click', async () => {
      const build = this._buildCurrentBuild();
      const status = document.getElementById('export-status');
      try {
        await copyShareCode(build);
        if (status) status.textContent = 'Copied to clipboard!';
      } catch (e) {
        if (status) status.textContent = `Error: ${e.message}`;
      }
    });
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
    initModDB(modDB);

    // Add base class attributes
    if (this.treeData) {
      const classIdx = this.treeData.classNameToId(this.className);
      const cls = this.treeData._classes[classIdx];
      if (cls) {
        modDB.newMod('Str', 'BASE', cls._baseStr, 'Base');
        modDB.newMod('Dex', 'BASE', cls._baseDex, 'Base');
        modDB.newMod('Int', 'BASE', cls._baseInt, 'Base');
      }
    }

    // Base Life: 38 + 12*level (from PoE formula)
    modDB.newMod('Life', 'BASE', 38 + 12 * this.level, 'Base');
    // Base Mana: 34 + 6*level
    modDB.newMod('Mana', 'BASE', 34 + 6 * this.level, 'Base');

    // Add mods from allocated tree nodes
    if (this.treeAllocation) {
      const stats = this.treeAllocation.collectStats();
      for (const statLine of stats) {
        const mods = parseMod(statLine);
        if (mods && mods.length) modDB.addList(mods);
      }
    }

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

  _applyBuild(build) {
    // Store specs for tree dropdown
    this.buildSpecs = build.specs || [];
    this.activeSpecIndex = build.activeSpec || 0;

    // Apply class
    if (build.className) {
      this.className = build.className;
      const classSelect = document.getElementById('class-select');
      if (classSelect) classSelect.value = build.className;
    }

    // Apply level
    if (build.level) {
      this.level = build.level;
      const levelInput = document.getElementById('level-input');
      if (levelInput) levelInput.value = build.level;
    }

    // Apply tree nodes from the active spec
    this._applySpecNodes(build.treeNodes || [], build.masteryEffects || []);
    this._updateSpecDropdown();
  }

  _applySpecNodes(nodeIds, masteryEffects = []) {
    if (!this.treeData) return;
    const classId = this.treeData.classNameToId(this.className);
    this.treeAllocation = new TreeAllocation(this.treeData, classId >= 0 ? classId : 0);

    for (const nodeId of nodeIds) {
      if (this.treeData.nodes[nodeId]) {
        this.treeAllocation.spec.allocated.add(nodeId);
      }
    }

    // Apply mastery selections
    for (const { nodeId, effectId } of masteryEffects) {
      this.treeAllocation.spec.setMasteryEffect(nodeId, effectId);
    }

    if (this.activeTab === 'Tree') {
      this._rebuildTreeInstances();
    }
    this._updateStatusBar();
    this._runCalc();
  }

  _switchSpec(index) {
    if (!this.buildSpecs || index < 0 || index >= this.buildSpecs.length) return;
    this.activeSpecIndex = index;
    const spec = this.buildSpecs[index];

    // Update class from spec's classId
    const classNames = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'];
    const newClass = classNames[spec.classId] || this.className;
    if (newClass !== this.className) {
      this.className = newClass;
      const classSelect = document.getElementById('class-select');
      if (classSelect) classSelect.value = this.className;
    }

    this._applySpecNodes(spec.nodes, spec.masteryEffects || []);
  }

  _updateSpecDropdown() {
    const container = document.getElementById('spec-dropdown-container');
    if (!container) return;
    if (!this.buildSpecs || this.buildSpecs.length <= 1) {
      container.innerHTML = '';
      return;
    }
    const options = this.buildSpecs.map((s, i) =>
      `<option value="${i}"${i === this.activeSpecIndex ? ' selected' : ''}>${s.title}</option>`
    ).join('');
    container.innerHTML = `<select class="spec-select" id="spec-select">${options}</select>`;
    document.getElementById('spec-select')?.addEventListener('change', (e) => {
      this._switchSpec(parseInt(e.target.value, 10));
    });
  }

  _buildCurrentBuild() {
    const nodeIds = [];
    const masteryEffects = [];
    if (this.treeAllocation) {
      for (const id of this.treeAllocation.spec.allocated) {
        // Skip the class start node from the export
        const node = this.treeData?.nodes[id];
        if (node && node.type !== 'classStart') {
          nodeIds.push(id);
        }
      }
      for (const [nodeId, effectId] of this.treeAllocation.spec.masterySelections) {
        masteryEffects.push({ nodeId, effectId });
      }
    }

    return new Build({
      name: this.buildName,
      className: this.className,
      level: this.level,
      treeNodes: nodeIds,
      masteryEffects,
    });
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
