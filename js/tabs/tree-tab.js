// PoBWeb - Tree Tab
// Integrates WebGL tree renderer into the tab system.

import { TreeRenderer, buildNodeInstances, buildConnectionInstances, buildPathPreviewInstances } from '../tree/tree-renderer.js';
import { TreeInteraction } from '../tree/tree-interaction.js';
import { TreeAllocation } from '../tree/tree-allocation.js';
import { TreeSearch } from '../tree/tree-search.js';
import { Tooltip } from '../ui/component.js';

export class TreeTab {
  constructor(container, treeData, classId) {
    this.container = container;
    this.treeData = treeData;
    this.allocation = new TreeAllocation(treeData, classId);
    this.search = new TreeSearch(treeData);
    this.renderer = null;
    this.interaction = null;
    this.onAllocChange = null;

    this._init();
  }

  _init() {
    this.container.innerHTML = `
      <div class="tree-tab">
        <canvas class="tree-canvas" id="tree-canvas"></canvas>
        <div class="tree-controls">
          <input type="text" class="tree-search" placeholder="Search tree..." id="tree-search-input">
          <span class="tree-search-count" id="tree-search-count"></span>
        </div>
        <div class="tree-zoom-controls">
          <button class="pob-btn" id="tree-zoom-in">+</button>
          <button class="pob-btn" id="tree-zoom-out">−</button>
          <button class="pob-btn" id="tree-zoom-reset">Reset</button>
        </div>
      </div>
    `;

    const canvas = this.container.querySelector('#tree-canvas');
    if (!canvas) return;

    // Size canvas to container
    const rect = this.container.getBoundingClientRect();
    canvas.width = rect.width || 800;
    canvas.height = rect.height || 600;

    try {
      this.renderer = new TreeRenderer(canvas);
      this.renderer.createFallbackAtlas();
      this.interaction = new TreeInteraction(this.renderer, this.treeData);
      this.interaction.attachToCanvas(canvas);

      this.interaction.onNodeClick = (node) => this._onNodeClick(node);
      this.interaction.onNodeHover = (node) => this._onNodeHover(node);

      this.allocation.onChange = () => {
        this._updateDisplay();
        if (this.onAllocChange) this.onAllocChange();
      };

      this._setupSearch();
      this._setupZoom();
      this._updateDisplay();
    } catch (e) {
      // WebGL not available
      this.container.innerHTML = '<div class="tree-fallback">WebGL2 required for passive tree</div>';
    }
  }

  _onNodeClick(node) {
    if (!node) return;
    this.allocation.toggleNode(node.id);
  }

  _onNodeHover(node) {
    // Show tooltip with node info
    // (Full tooltip rendering deferred to when DOM tooltip element exists)
  }

  _setupSearch() {
    const input = this.container.querySelector('#tree-search-input');
    const countEl = this.container.querySelector('#tree-search-count');
    if (!input) return;

    input.addEventListener('input', () => {
      const result = this.search.search(input.value);
      if (countEl) {
        countEl.textContent = input.value ? `${result.matchCount} matches` : '';
      }
      this._updateDisplay();
    });
  }

  _setupZoom() {
    const zoomIn = this.container.querySelector('#tree-zoom-in');
    const zoomOut = this.container.querySelector('#tree-zoom-out');
    const zoomReset = this.container.querySelector('#tree-zoom-reset');

    if (zoomIn) zoomIn.addEventListener('click', () => {
      this.interaction.zoom(this.renderer.camera.width / 2, this.renderer.camera.height / 2, 1);
      this.renderer.render();
    });
    if (zoomOut) zoomOut.addEventListener('click', () => {
      this.interaction.zoom(this.renderer.camera.width / 2, this.renderer.camera.height / 2, -1);
      this.renderer.render();
    });
    if (zoomReset) zoomReset.addEventListener('click', () => {
      this.renderer.setCamera(0, 0, 1);
      this.renderer.render();
    });
  }

  _updateDisplay() {
    if (!this.renderer) return;

    const highlighted = this.search.lastResult.matchIds;
    const nodeInstances = buildNodeInstances(this.treeData, this.allocation.spec, {
      highlighted: highlighted.size > 0 ? highlighted : undefined,
    });
    const connInstances = buildConnectionInstances(this.treeData, this.allocation.spec);

    this.renderer.setNodeInstances(nodeInstances);
    this.renderer.setConnectionInstances(connInstances);
    this.renderer.render();
  }

  resize(width, height) {
    if (this.renderer) {
      this.renderer.resize(width, height);
      this.renderer.render();
    }
  }

  destroy() {
    if (this.renderer) this.renderer.destroy();
  }
}
