// PoBWeb - App Shell
// Main entry point: layout, tab switching, worker communication, stat sidebar.

import { TabPanel } from './ui/tab-panel.js';
import { StatSidebar } from './ui/stat-sidebar.js';
import { ModDB } from './engine/mod-db.js';
import { parseMod } from './engine/mod-parser.js';
import { initModDB, mergeItemMods, mergeSkillMods } from './engine/calc-setup.js';
import { buildActiveSkillList } from './engine/skill-calc.js';
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
import { Item } from './models/item.js';
import { BaseTypeRegistry } from './data/base-types.js';
import { GemRegistry } from './data/gem-registry.js';

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

    // Item state
    this.baseTypeRegistry = null;
    this.resolvedItems = {};  // slot name → Item instance

    // Skills state
    this.gemRegistry = null;
    this.skillsData = null;
    this.skillStatMap = null;
    this._selectedSkillGroup = null; // index into this.build.skills
  }

  async init() {
    this.baseTypeRegistry = await BaseTypeRegistry.load();
    this._initTreeLayer();
    this._initMenuBar();
    this._initTabs();
    this._initSidebar();
    this._initStatusBar();
    this._switchTab('Tree');
    this._runCalc();
    this._loadTreeData();
    this._loadGemRegistry();
    this._loadSkillsData();
  }

  async _loadGemRegistry() {
    try {
      const resp = await fetch('js/data/gems.json');
      if (!resp.ok) throw new Error(`Gems HTTP ${resp.status}`);
      this.gemRegistry = new GemRegistry(await resp.json());
    } catch (e) {
      console.error('Failed to load gem registry:', e);
    }
  }

  async _loadSkillsData() {
    try {
      const [skillsResp, statMapResp] = await Promise.all([
        fetch('js/data/skills.json'),
        fetch('js/data/skill-stat-map.json'),
      ]);
      if (skillsResp.ok) this.skillsData = await skillsResp.json();
      if (statMapResp.ok) this.skillStatMap = await statMapResp.json();
    } catch (e) {
      console.error('Failed to load skills data:', e);
    }
  }

  _initTreeLayer() {
    const layer = document.getElementById('tree-layer');
    if (!layer) return;
    layer.innerHTML = `
      <canvas id="tree-canvas" style="display:block;width:100%;height:100%;"></canvas>
      <div class="tree-overlay">
        <div class="tree-controls">
          <input type="text" class="tree-search" placeholder="Search passive tree..." id="tree-search">
          <span class="tree-search-count" id="tree-search-count"></span>
        </div>
        <div class="tree-info">
          <div class="tree-loading-spinner"></div>
          <p class="tree-hint">Loading tree data...</p>
        </div>
        <div class="tree-zoom-controls">
          <button class="btn" id="zoom-in">+</button>
          <button class="btn" id="zoom-out">&minus;</button>
          <button class="btn" id="zoom-reset">Reset</button>
        </div>
      </div>
    `;
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

      // Always initialize the renderer (tree is always visible)
      this._initTreeRenderer();

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

    // Size canvas to tree layer
    const treeLayer = document.getElementById('tree-layer');
    const rect = treeLayer ? treeLayer.getBoundingClientRect() : canvas.parentElement.getBoundingClientRect();
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

      // Start render loop (initially renders just the clear color)
      this._startRenderLoop();

      // Load sprite textures, then build instances and reveal the tree
      this._loadTreeTextures().then(() => {
        this._rebuildTreeInstances();
        const treeInfo = document.querySelector('.tree-info');
        if (treeInfo) treeInfo.style.display = 'none';
      });

      // Handle resize
      this._resizeHandler = () => {
        const tl = document.getElementById('tree-layer');
        if (tl && this.treeRenderer) {
          const r = tl.getBoundingClientRect();
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
    this._rebuildTreeInstances();
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
    this.activeTab = tabName;

    // Update tab bar
    const tabbar = document.getElementById('tab-bar');
    if (tabbar) {
      for (const child of tabbar.children) {
        child.classList.toggle('active', child.textContent === tabName);
      }
    }

    // Hide gear tooltip on any tab switch
    const gearTt = document.getElementById('gear-tooltip');
    if (gearTt) gearTt.style.display = 'none';

    if (!this.tabContent) return;

    // Tree is always visible — toggle overlay visibility
    if (tabName === 'Tree') {
      this.tabContent.classList.add('tree-active');
      this.tabContent.innerHTML = '';
      return;
    }

    this.tabContent.classList.remove('tree-active');

    switch (tabName) {
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
    // Tree is always visible in #tree-layer — nothing to render here
  }

  _getGemColor(gem) {
    const data = gem.gemData;
    if (!data) return 'gem-color-default';
    const str = data.reqStr || 0;
    const dex = data.reqDex || 0;
    const int = data.reqInt || 0;
    if (str >= dex && str >= int && str > 0) return 'gem-color-str';
    if (dex >= str && dex >= int && dex > 0) return 'gem-color-dex';
    if (int > 0) return 'gem-color-int';
    return 'gem-color-default';
  }

  _isSupport(gem) {
    return !!(gem.gemData?.tags?.support);
  }

  _renderSkillsTab() {
    if (!this.build) {
      this.build = new Build();
    }
    const skillSets = this.build.skillSets || [];
    const activeSetId = this.build.activeSkillSet || 1;

    // Skill set dropdown (only if multiple sets exist)
    let setDropdownHtml = '';
    if (skillSets.length > 1) {
      const options = skillSets.map(s =>
        `<option value="${s.id}"${s.id === activeSetId ? ' selected' : ''}>${escapeHtml(s.title || `Set ${s.id}`)}</option>`
      ).join('');
      setDropdownHtml = `<select class="skills-set-select" id="skills-set-select" aria-label="Select skill set">${options}</select>`;
    }

    // Get the active set's groups
    const activeSet = skillSets.find(s => s.id === activeSetId) || skillSets[0];
    const groups = activeSet?.groups || this.build.skills || [];
    const mainGroup = this.build.mainSocketGroup || 0;

    // Render socket group cards
    let cardsHtml = '';
    if (groups.length === 0) {
      cardsHtml = '<div class="skills-empty">No socket groups in this skill set.</div>';
    } else {
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        const gems = group.gems || [];
        const isMain = gi === mainGroup;
        const slotLabel = group.slot || group.label || '';
        const disabledClass = group.enabled === false ? ' sg-card-disabled' : '';

        // Separate first active gem from supports
        let activeGemIdx = -1;
        const gemEntries = [];
        for (let i = 0; i < gems.length; i++) {
          const gem = gems[i];
          const isSupport = this._isSupport(gem);
          if (!isSupport && activeGemIdx === -1) activeGemIdx = i;
          gemEntries.push({ gem, isSupport, index: i });
        }

        // Build gem lines with connector classes
        let gemsHtml = '';
        // Count supports to assign connector classes
        const supports = gemEntries.filter(e => e.isSupport);
        for (const entry of gemEntries) {
          const { gem, isSupport, index } = entry;
          const colorClass = this._getGemColor(gem);
          const enabledClass = gem.enabled === false ? ' gem-disabled' : '';
          let connectorClass = '';
          if (isSupport && supports.length > 0) {
            const supIdx = supports.indexOf(entry);
            if (supIdx === 0 && supports.length === 1) connectorClass = ' gem-last';
            else if (supIdx === 0) connectorClass = ' gem-first';
            else if (supIdx === supports.length - 1) connectorClass = ' gem-last';
            else connectorClass = ' gem-middle';
          }

          const levelQual = gem.level !== 20 || gem.quality > 0
            ? `<span class="gem-lq">${gem.level !== 20 ? gem.level : ''}${gem.quality > 0 ? `/${gem.quality}` : ''}</span>`
            : '';

          gemsHtml += `<div class="gem-entry ${colorClass}${connectorClass}${enabledClass}" data-group="${gi}" data-gem="${index}">${escapeHtml(gem.name || '?')}${levelQual}</div>`;
        }

        cardsHtml += `
          <div class="sg-card${disabledClass}${isMain ? ' sg-card-main' : ''}" data-sg-idx="${gi}">
            ${slotLabel ? `<div class="sg-slot-label">${escapeHtml(slotLabel)}</div>` : ''}
            <div class="sg-gems">${gemsHtml || '<div class="sg-empty-gems">Empty</div>'}</div>
          </div>`;
      }
    }

    this.tabContent.innerHTML = `
      <div class="skills-tab">
        <div class="skills-header">
          <h2 class="skills-title">Gems</h2>
          ${setDropdownHtml}
          <button class="btn btn-sm" id="add-group">+ New Group</button>
          <button class="btn btn-sm" id="skills-edit-toggle">${this._skillsEditMode ? 'Done' : 'Edit'}</button>
        </div>
        <div class="skills-cards" id="skills-cards">${cardsHtml}</div>
        ${this._skillsEditMode && this._selectedSkillGroup != null ? this._renderSkillGroupEditor(this._selectedSkillGroup, groups[this._selectedSkillGroup]) : ''}
      </div>
    `;

    this._wireSkillsTabEvents();
  }

  _renderSkillGroupEditor(idx, group) {
    if (!group) return '';
    const SLOTS = ['None', 'Weapon 1', 'Weapon 2', 'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Amulet', 'Ring 1', 'Ring 2', 'Belt'];
    const slotOptions = SLOTS.map(s => {
      const val = s === 'None' ? '' : s;
      const selected = (group.slot || '') === val ? ' selected' : '';
      return `<option value="${escapeHtml(val)}"${selected}>${s}</option>`;
    }).join('');

    const gems = group.gems || [];
    let gemRowsHtml = '';
    for (let gi = 0; gi < gems.length; gi++) {
      const gem = gems[gi];
      const colorClass = this._getGemColor(gem);
      gemRowsHtml += `<tr class="gem-row ${colorClass}" data-gem-idx="${gi}">` +
        `<td><input type="checkbox" class="gem-enable-cb" data-gem-enable="${gi}"${gem.enabled !== false ? ' checked' : ''}></td>` +
        `<td><div class="gem-name-wrapper"><input type="text" class="input-sm gem-name-input" data-gem-name="${gi}" value="${escapeHtml(gem.name || '')}" placeholder="Type gem name..." autocomplete="off"></div></td>` +
        `<td><input type="number" class="input-sm gem-level" data-gem-level="${gi}" value="${gem.level || 1}" min="1" max="40"></td>` +
        `<td><input type="number" class="input-sm gem-quality" data-gem-quality="${gi}" value="${gem.quality || 0}" min="0" max="100"></td>` +
        `<td><button class="btn btn-xs btn-danger gem-remove" data-gem-remove="${gi}" title="Remove gem">\u2715</button></td>` +
        `</tr>`;
    }

    return `
      <div class="skill-editor-panel" id="skill-editor-panel">
        <div class="skill-editor-header">
          <label>Slot: <select class="input-sm" id="skill-slot">${slotOptions}</select></label>
          <label>Label: <input type="text" class="input-sm" id="skill-label" value="${escapeHtml(group.label || '')}" placeholder="Group label..." style="width:120px"></label>
          <label><input type="checkbox" id="skill-enabled"${group.enabled !== false ? ' checked' : ''}> Enabled</label>
          <label><input type="checkbox" id="skill-fulldps"${group.includeInFullDPS ? ' checked' : ''}> Full DPS</label>
          <button class="btn btn-sm btn-danger" id="delete-group">Delete Group</button>
        </div>
        <table class="gem-table">
          <thead><tr><th></th><th>Gem</th><th>Level</th><th>Qual</th><th></th></tr></thead>
          <tbody id="gem-table-body">${gemRowsHtml}</tbody>
        </table>
        <button class="btn btn-sm" id="add-gem">+ Add Gem</button>
      </div>
    `;
  }

  _wireSkillsTabEvents() {
    const activeSet = this.build.skillSets?.find(s => s.id === (this.build.activeSkillSet || 1)) || this.build.skillSets?.[0];
    const skills = activeSet?.groups || this.build.skills;

    // Skill set dropdown
    document.getElementById('skills-set-select')?.addEventListener('change', (e) => {
      const newSetId = parseInt(e.target.value, 10);
      this.build.activeSkillSet = newSetId;
      const newSet = this.build.skillSets.find(s => s.id === newSetId);
      if (newSet) this.build.skills = newSet.groups;
      this._selectedSkillGroup = null;
      this._resolveGems();
      this._renderSkillsTab();
      this._runCalc();
    });

    // Edit toggle
    document.getElementById('skills-edit-toggle')?.addEventListener('click', () => {
      this._skillsEditMode = !this._skillsEditMode;
      if (!this._skillsEditMode) this._selectedSkillGroup = null;
      this._renderSkillsTab();
    });

    // Card clicks — select for editing (in edit mode) or set as main
    const cardsEl = document.getElementById('skills-cards');
    if (cardsEl) {
      cardsEl.addEventListener('click', (e) => {
        const card = e.target.closest('[data-sg-idx]');
        if (!card) return;
        const idx = parseInt(card.dataset.sgIdx, 10);
        if (this._skillsEditMode) {
          this._selectedSkillGroup = idx;
          this._renderSkillsTab();
        } else {
          this.build.mainSocketGroup = idx;
          this._renderSkillsTab();
          this._runCalc();
        }
      });
    }

    // Add group button
    document.getElementById('add-group')?.addEventListener('click', () => {
      const newGroup = {
        enabled: true, slot: '', label: '', mainActiveSkill: 1,
        includeInFullDPS: false, gems: [],
      };
      skills.push(newGroup);
      this._selectedSkillGroup = skills.length - 1;
      this._skillsEditMode = true;
      this._renderSkillsTab();
    });

    // Editor events (only in edit mode)
    if (!this._skillsEditMode) return;
    const selIdx = this._selectedSkillGroup;
    if (selIdx === null || selIdx < 0 || selIdx >= skills.length) return;
    const group = skills[selIdx];

    // Delete group
    document.getElementById('delete-group')?.addEventListener('click', () => {
      skills.splice(selIdx, 1);
      this._selectedSkillGroup = null;
      if (this.build.mainSocketGroup >= skills.length) {
        this.build.mainSocketGroup = Math.max(0, skills.length - 1);
      }
      this._renderSkillsTab();
      this._runCalc();
    });

    // Slot dropdown
    document.getElementById('skill-slot')?.addEventListener('change', (e) => {
      group.slot = e.target.value;
      this._renderSkillsTab();
    });

    // Label input
    document.getElementById('skill-label')?.addEventListener('input', (e) => {
      group.label = e.target.value;
    });

    // Enabled checkbox
    document.getElementById('skill-enabled')?.addEventListener('change', (e) => {
      group.enabled = e.target.checked;
      this._renderSkillsTab();
      this._runCalc();
    });

    // Full DPS checkbox
    document.getElementById('skill-fulldps')?.addEventListener('change', (e) => {
      group.includeInFullDPS = e.target.checked;
    });

    // Gem table events
    const gemBody = document.getElementById('gem-table-body');
    if (gemBody) {
      gemBody.addEventListener('change', (e) => {
        const enableCb = e.target.closest('[data-gem-enable]');
        if (enableCb) {
          const gi = parseInt(enableCb.dataset.gemEnable, 10);
          group.gems[gi].enabled = enableCb.checked;
          this._runCalc();
        }
        const levelInput = e.target.closest('[data-gem-level]');
        if (levelInput) {
          const gi = parseInt(levelInput.dataset.gemLevel, 10);
          group.gems[gi].level = Math.max(1, parseInt(levelInput.value) || 1);
          this._runCalc();
        }
        const qualInput = e.target.closest('[data-gem-quality]');
        if (qualInput) {
          const gi = parseInt(qualInput.dataset.gemQuality, 10);
          group.gems[gi].quality = Math.max(0, parseInt(qualInput.value) || 0);
          this._runCalc();
        }
      });

      gemBody.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-gem-remove]');
        if (removeBtn) {
          const gi = parseInt(removeBtn.dataset.gemRemove, 10);
          group.gems.splice(gi, 1);
          this._renderSkillsTab();
          this._runCalc();
        }
      });

      gemBody.addEventListener('input', (e) => {
        const nameInput = e.target.closest('[data-gem-name]');
        if (nameInput) {
          const gi = parseInt(nameInput.dataset.gemName, 10);
          group.gems[gi].name = nameInput.value;
          this._showGemDropdown(nameInput, gi, group);
        }
      });

      gemBody.addEventListener('keydown', (e) => {
        const nameInput = e.target.closest('[data-gem-name]');
        if (nameInput && e.key === 'Escape') {
          this._hideGemDropdown(nameInput);
        }
      });

      gemBody.addEventListener('focusout', (e) => {
        const nameInput = e.target.closest('[data-gem-name]');
        if (nameInput) {
          setTimeout(() => this._hideGemDropdown(nameInput), 200);
        }
      });
    }

    // Add gem button
    document.getElementById('add-gem')?.addEventListener('click', () => {
      group.gems.push({
        name: '', gemId: '', variantId: '', skillId: '',
        level: 20, quality: 0, qualityId: 'Default',
        enabled: true, count: 1, gemData: null,
      });
      this._renderSkillsTab();
      setTimeout(() => {
        const inputs = document.querySelectorAll('.gem-name-input');
        if (inputs.length) inputs[inputs.length - 1].focus();
      }, 50);
    });
  }

  _showGemDropdown(inputEl, gemIndex, group) {
    const query = inputEl.value.trim();
    this._hideGemDropdown(inputEl);
    if (query.length < 2 || !this.gemRegistry) return;

    const results = this.gemRegistry.search(query).slice(0, 10);
    if (results.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'gem-dropdown';
    for (const gem of results) {
      const item = document.createElement('div');
      item.className = 'gem-dropdown-item';
      item.textContent = gem.name;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const g = group.gems[gemIndex];
        g.name = gem.name;
        g.gemData = gem;
        g.gemId = gem.gameId || '';
        g.skillId = gem.grantedEffectId || '';
        this._renderSkillsTab();
        this._runCalc();
      });
      dropdown.appendChild(item);
    }

    const wrapper = inputEl.closest('.gem-name-wrapper');
    if (wrapper) wrapper.appendChild(dropdown);
  }

  _hideGemDropdown(inputEl) {
    const wrapper = inputEl?.closest('.gem-name-wrapper');
    const existing = wrapper?.querySelector('.gem-dropdown');
    if (existing) existing.remove();
  }

  _renderItemsTab() {
    const SLOT_LABELS = {
      'Weapon 1': 'W1', 'Weapon 2': 'W2',
      'Helmet': 'Helm', 'Body Armour': 'Body', 'Gloves': 'Gloves', 'Boots': 'Boots',
      'Amulet': 'Amul', 'Ring 1': 'R1', 'Ring 2': 'R2', 'Belt': 'Belt',
    };
    const GRID_SLOTS = [
      // [slot, gridArea]
      ['Weapon 1', 'weap1'], ['Weapon 2', 'weap2'],
      ['Helmet', 'helm'], ['Body Armour', 'body'],
      ['Gloves', 'gloves'], ['Boots', 'boots'],
      ['Amulet', 'amulet'], ['Ring 1', 'ring1'], ['Ring 2', 'ring2'], ['Belt', 'belt'],
    ];
    const sel = this._selectedItemSlot || null;

    const slotCells = GRID_SLOTS.map(([slot, area]) => {
      const item = this.resolvedItems[slot];
      const selected = slot === sel ? ' gear-slot-selected' : '';
      const rarity = item ? ` rarity-slot-${(item.rarity || 'normal').toLowerCase()}` : '';
      const equipped = item ? ' gear-slot-equipped' : '';
      const label = SLOT_LABELS[slot];
      const itemName = item ? escapeHtml(item.name) : '';
      return `<div class="gear-slot${selected}${rarity}${equipped}" data-slot="${escapeHtml(slot)}" style="grid-area:${area}">
        <div class="gear-slot-label">${label}</div>
        ${itemName ? `<div class="gear-slot-name">${itemName}</div>` : ''}
      </div>`;
    }).join('');

    this.tabContent.innerHTML = `
      <div class="items-layout">
        <div class="gear-grid">${slotCells}</div>
        <div class="gear-detail" id="gear-detail">
          ${sel ? this._renderItemDetail(sel) : '<div class="panel-placeholder">Click a slot to view details</div>'}
        </div>
      </div>
    `;

    // Bind slot clicks and hover tooltips
    const grid = this.tabContent.querySelector('.gear-grid');
    const ttEl = this._getOrCreateTooltipEl();
    if (grid) {
      grid.addEventListener('click', (e) => {
        const el = e.target.closest('[data-slot]');
        if (el) {
          this._selectedItemSlot = el.dataset.slot;
          this._renderItemsTab();
        }
      });
      grid.addEventListener('mouseover', (e) => {
        const el = e.target.closest('[data-slot]');
        if (el && this.resolvedItems[el.dataset.slot]) {
          ttEl.innerHTML = this._renderItemDetail(el.dataset.slot);
          ttEl.style.display = 'block';
          this._positionGearTooltip(el, ttEl);
        }
      });
      grid.addEventListener('mouseout', (e) => {
        const el = e.target.closest('[data-slot]');
        if (el) ttEl.style.display = 'none';
      });
    }
  }

  _getOrCreateTooltipEl() {
    let el = document.getElementById('gear-tooltip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gear-tooltip';
      el.className = 'gear-tooltip';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    return el;
  }

  _positionGearTooltip(slotEl, ttEl) {
    const rect = slotEl.getBoundingClientRect();
    const ttRect = ttEl.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top;
    // If overflows right, show to the left
    if (left + ttRect.width > window.innerWidth) {
      left = rect.left - ttRect.width - 8;
    }
    // If overflows bottom, shift up
    if (top + ttRect.height > window.innerHeight) {
      top = window.innerHeight - ttRect.height - 8;
    }
    if (top < 0) top = 4;
    ttEl.style.left = left + 'px';
    ttEl.style.top = top + 'px';
  }

  _renderItemDetail(slot) {
    const item = this.resolvedItems[slot];
    if (!item) {
      return `<div class="item-detail"><h3>${escapeHtml(slot)}</h3><p class="item-empty">No item equipped</p></div>`;
    }

    const r = (item.rarity || 'normal').toLowerCase();
    let html = `<div class="item-tooltip rarity-border-${r}">`;

    // Header: name + base
    html += `<div class="tt-header rarity-bg-${r}">`;
    html += `<div class="tt-name">${escapeHtml(item.name)}</div>`;
    if (item.baseName) html += `<div class="tt-base">${escapeHtml(item.baseName)}</div>`;
    html += '</div>';

    // Properties section: quality, weapon stats, armour stats
    const props = [];
    if (item.quality) props.push(`<span class="tt-prop-name">Quality:</span> <span class="tt-prop-aug">+${item.quality}%</span>`);

    if (item.weaponData) {
      const wd = item.weaponData;
      const dmgParts = [];
      if (wd.PhysicalMin) dmgParts.push(`<span class="tt-prop-aug">${wd.PhysicalMin}-${wd.PhysicalMax}</span>`);
      const eleParts = [];
      if (wd.FireMin) eleParts.push(`<span class="tt-dmg-fire">${wd.FireMin}-${wd.FireMax}</span>`);
      if (wd.ColdMin) eleParts.push(`<span class="tt-dmg-cold">${wd.ColdMin}-${wd.ColdMax}</span>`);
      if (wd.LightningMin) eleParts.push(`<span class="tt-dmg-lightning">${wd.LightningMin}-${wd.LightningMax}</span>`);
      if (wd.ChaosMin) eleParts.push(`<span class="tt-dmg-chaos">${wd.ChaosMin}-${wd.ChaosMax}</span>`);
      if (dmgParts.length || eleParts.length) {
        props.push(`<span class="tt-prop-name">Physical Damage:</span> ${dmgParts.join(', ')}`);
        if (eleParts.length) props.push(`<span class="tt-prop-name">Elemental Damage:</span> ${eleParts.join(', ')}`);
      }
      props.push(`<span class="tt-prop-name">Critical Strike Chance:</span> ${wd.CritChance}%`);
      props.push(`<span class="tt-prop-name">Attacks per Second:</span> ${wd.AttackRate}`);
    }

    if (item.armourData) {
      const ad = item.armourData;
      if (ad.Armour) props.push(`<span class="tt-prop-name">Armour:</span> <span class="tt-prop-aug">${ad.Armour}</span>`);
      if (ad.Evasion) props.push(`<span class="tt-prop-name">Evasion Rating:</span> <span class="tt-prop-aug">${ad.Evasion}</span>`);
      if (ad.EnergyShield) props.push(`<span class="tt-prop-name">Energy Shield:</span> <span class="tt-prop-aug">${ad.EnergyShield}</span>`);
      if (ad.BlockChance) props.push(`<span class="tt-prop-name">Chance to Block:</span> ${ad.BlockChance}%`);
    }

    if (props.length) {
      html += '<div class="tt-section">';
      html += props.map(p => `<div class="tt-prop">${p}</div>`).join('');
      html += '</div>';
    }

    // Requirements
    const req = item.requirements;
    if (req && (req.level || req.str || req.dex || req.int)) {
      html += '<div class="tt-section"><div class="tt-prop"><span class="tt-prop-name">Requires</span> ';
      const parts = [];
      if (req.level) parts.push(`<span class="tt-prop-name">Level</span> <span class="tt-req-val">${req.level}</span>`);
      if (req.str) parts.push(`<span class="tt-req-val">${req.str}</span> <span class="tt-prop-name">Str</span>`);
      if (req.dex) parts.push(`<span class="tt-req-val">${req.dex}</span> <span class="tt-prop-name">Dex</span>`);
      if (req.int) parts.push(`<span class="tt-req-val">${req.int}</span> <span class="tt-prop-name">Int</span>`);
      html += parts.join(', ') + '</div></div>';
    }

    // Enchant mods
    if (item.enchantModLines && item.enchantModLines.length > 0) {
      html += '<div class="tt-section">';
      for (const mod of item.enchantModLines) html += `<div class="tt-mod tt-mod-enchant">${escapeHtml(mod)}</div>`;
      html += '</div>';
    }

    // Implicit mods
    if (item.implicitModLines && item.implicitModLines.length > 0) {
      html += '<div class="tt-section">';
      for (const mod of item.implicitModLines) html += `<div class="tt-mod tt-mod-implicit">${escapeHtml(mod)}</div>`;
      html += '</div>';
    }

    // Explicit mods
    if (item.explicitModLines && item.explicitModLines.length > 0) {
      html += '<div class="tt-section">';
      for (const mod of item.explicitModLines) {
        const isCrafted = mod.startsWith('{crafted}');
        const text = mod.replace(/^\{crafted\}/, '').replace(/^\{range:[^}]*\}/, '');
        const cls = isCrafted ? 'tt-mod tt-mod-crafted' : 'tt-mod tt-mod-explicit';
        html += `<div class="${cls}">${escapeHtml(text)}</div>`;
      }
      html += '</div>';
    }

    // Crucible mods
    if (item.crucibleModLines && item.crucibleModLines.length > 0) {
      html += '<div class="tt-section">';
      for (const mod of item.crucibleModLines) html += `<div class="tt-mod tt-mod-crucible">${escapeHtml(mod)}</div>`;
      html += '</div>';
    }

    // Status flags
    const flags = [];
    if (item.corrupted) flags.push('<span class="tt-corrupted">Corrupted</span>');
    if (item.mirrored) flags.push('<span class="tt-mirrored">Mirrored</span>');
    if (item.fractured) flags.push('<span class="tt-fractured">Fractured Item</span>');
    if (item.synthesised) flags.push('<span class="tt-synthesised">Synthesised Item</span>');
    if (flags.length) {
      html += `<div class="tt-section">${flags.join('')}</div>`;
    }

    // Weapon DPS summary (PoB addition, not in-game)
    if (item.weaponData) {
      const wd = item.weaponData;
      html += '<div class="tt-section tt-dps-summary">';
      if (wd.PhysicalDPS) html += `<div>Physical DPS: <span class="tt-dps-val">${Math.round(wd.PhysicalDPS)}</span></div>`;
      const eleDPS = (wd.FireDPS || 0) + (wd.ColdDPS || 0) + (wd.LightningDPS || 0);
      if (eleDPS) html += `<div>Elemental DPS: <span class="tt-dps-val">${Math.round(eleDPS)}</span></div>`;
      if (wd.ChaosDPS) html += `<div>Chaos DPS: <span class="tt-dps-val">${Math.round(wd.ChaosDPS)}</span></div>`;
      html += `<div>Total DPS: <span class="tt-dps-val tt-dps-total">${Math.round(wd.TotalDPS)}</span></div>`;
      html += '</div>';
    }

    html += '</div>';
    return html;
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

    // Add mods from equipped items
    if (Object.keys(this.resolvedItems).length > 0) {
      const itemEnv = { player: { modDB } };
      mergeItemMods(itemEnv, this.resolvedItems);
      // Store weapon data for future offence calc use
      this._weaponData1 = itemEnv.player.weaponData1 || null;
      this._weaponData2 = itemEnv.player.weaponData2 || null;
    }

    // Build active skill list and merge main skill mods
    let mainSkill = null;
    if (this.build?.skills && this.skillsData) {
      const activeSkillList = buildActiveSkillList(this.build.skills, this.skillsData);
      const mainIdx = this.build.mainSocketGroup || 0;
      mainSkill = activeSkillList.find(s => s.groupIndex === mainIdx) || activeSkillList[0] || null;

      if (mainSkill && this.skillStatMap) {
        mergeSkillMods(modDB, mainSkill, this.skillStatMap);
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

    if (this.sidebar) this.sidebar.update(output, mainSkill);
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

    // Apply items
    this.resolvedItems = {};
    if (build.items && build.items.length > 0 && this.baseTypeRegistry) {
      for (const { slot, raw } of build.items) {
        if (slot && raw) {
          const item = new Item(raw);
          item.resolveBase(this.baseTypeRegistry);
          item.buildModList();
          this.resolvedItems[slot] = item;
        }
      }
    }

    // Apply skills
    this.build = build;
    this._selectedSkillGroup = null;
    this._resolveGems();

    // Apply tree nodes from the active spec
    const activeSpec = build.specs?.[build.activeSpec];
    const jewelSockets = activeSpec?.jewelSockets || build.jewelSockets || [];
    this._applySpecNodes(build.treeNodes || [], build.masteryEffects || [], jewelSockets);
    this._updateSpecDropdown();

    // Re-render skills tab if active
    if (this.activeTab === 'Skills') this._renderSkillsTab();
  }

  _resolveGems() {
    if (!this.gemRegistry || !this.build) return;
    for (const group of this.build.skills) {
      for (const gem of (group.gems || [])) {
        const gemData = (gem.gemId ? this.gemRegistry.findByGameId(gem.gemId) : null)
          || (gem.skillId ? this.gemRegistry.findBySkillId(gem.skillId) : null)
          || (gem.name ? this.gemRegistry.findByName(gem.name) : null);
        gem.gemData = gemData;
      }
    }
  }

  _applySpecNodes(nodeIds, masteryEffects = [], jewelSockets = []) {
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

    // Apply jewel sockets
    if (jewelSockets.length > 0 && this._clusterData) {
      for (const { nodeId, itemText } of jewelSockets) {
        const parsedJewel = parseClusterJewel(itemText, this._clusterData);
        if (parsedJewel.clusterJewelValid) {
          const socketNode = this.treeData.nodes[nodeId];
          if (socketNode?.expansionJewel) {
            const constants = {
              orbitRadii: [0, 82, 162, 335, 493, 662, 846],
              skillsPerOrbit: [1, 6, 16, 16, 40, 72, 72],
            };
            const subgraph = buildSubgraph(parsedJewel, socketNode, this.treeData, this._clusterData, constants);
            if (subgraph) {
              this.treeAllocation.spec.jewels.set(nodeId, { ...parsedJewel, _itemText: itemText });
              this.treeAllocation.spec._applySubgraph(nodeId, subgraph);
            }
          }
        }
      }

      // Second pass: allocate synthetic subgraph nodes that now exist
      // (Lua PoB does this via allocSubgraphNodes after all subgraphs are built)
      for (const nodeId of nodeIds) {
        if (this.treeData.nodes[nodeId] && !this.treeAllocation.spec.allocated.has(nodeId)) {
          this.treeAllocation.spec.allocated.add(nodeId);
        }
      }
    }

    this._rebuildTreeInstances();
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

    this._applySpecNodes(spec.nodes, spec.masteryEffects || [], spec.jewelSockets || []);
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

    const jewelSockets = [];
    if (this.treeAllocation?.spec.jewels) {
      for (const [nodeId, jewel] of this.treeAllocation.spec.jewels) {
        jewelSockets.push({ nodeId, itemText: jewel._itemText || '' });
      }
    }

    return new Build({
      name: this.buildName,
      className: this.className,
      level: this.level,
      treeNodes: nodeIds,
      masteryEffects,
      jewelSockets,
      skills: this.build?.skills || [],
      skillSets: this.build?.skillSets || [],
      activeSkillSet: this.build?.activeSkillSet || 1,
      mainSocketGroup: this.build?.mainSocketGroup || 0,
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
