// PoBWeb - App Shell
// Main entry point: layout, tab switching, worker communication, stat sidebar.

import { TabPanel } from './ui/tab-panel.js';
import { StatSidebar } from './ui/stat-sidebar.js';

const TAB_NAMES = ['Tree', 'Skills', 'Items', 'Calcs', 'Config', 'Import', 'Notes'];

class PoBApp {
  constructor() {
    this.worker = null;
    this.tabPanel = null;
    this.sidebar = null;
    this.tabContent = null;
    this.tabInstances = {};
    this.calcOutput = {};
  }

  init() {
    this._initWorker();
    this._initLayout();
    this._initTabs();
    this._initSidebar();
  }

  _initWorker() {
    this.worker = new Worker('js/engine/worker.js', { type: 'module' });
    this.worker.onmessage = (e) => {
      const { type, payload } = e.data;
      switch (type) {
        case 'result':
          this.calcOutput = payload.output || {};
          if (this.sidebar) this.sidebar.update(this.calcOutput);
          break;
        case 'error':
          console.error('Worker error:', payload);
          break;
      }
    };
  }

  _initLayout() {
    const app = document.getElementById('app');
    if (!app) return;

    app.className = 'pob-app';
    app.innerHTML = `
      <div class="pob-menubar">
        <span class="build-name">New Build</span>
        <select class="class-select">
          <option>Scion</option><option>Marauder</option><option>Ranger</option>
          <option>Witch</option><option>Duelist</option><option>Templar</option><option>Shadow</option>
        </select>
        <label>Level: <input type="number" class="level-input" value="1" min="1" max="100"></label>
      </div>
      <div class="pob-tabbar" id="tabbar"></div>
      <div class="pob-content" id="tab-content"></div>
      <div class="pob-sidebar" id="sidebar"></div>
      <div class="pob-statusbar">
        <span class="points">Points: 0/123</span>
        <span class="asc-points">Ascendancy: 0/8</span>
      </div>
    `;

    this.tabContent = document.getElementById('tab-content');
  }

  _initTabs() {
    const tabbar = document.getElementById('tabbar');
    if (!tabbar) return;

    this.tabPanel = new TabPanel(tabbar, TAB_NAMES);
    this.tabPanel.onChange = (tab) => this._switchTab(tab);

    // Create tab elements
    for (const name of TAB_NAMES) {
      const tabEl = document.createElement('div');
      tabEl.className = 'pob-tab' + (name === this.tabPanel.activeTab ? ' active' : '');
      tabEl.textContent = name;
      tabEl.addEventListener('click', () => this.tabPanel.switchTo(name));
      tabbar.appendChild(tabEl);
    }
  }

  _switchTab(tabName) {
    // Update tab bar active state
    const tabbar = document.getElementById('tabbar');
    if (tabbar) {
      for (const child of tabbar.children) {
        child.classList.toggle('active', child.textContent === tabName);
      }
    }

    // Lazy-init and show tab content
    if (this.tabContent) {
      this.tabContent.innerHTML = `<div class="tab-placeholder">${tabName} tab content</div>`;
    }
  }

  _initSidebar() {
    const sidebarEl = document.getElementById('sidebar');
    if (!sidebarEl) return;
    this.sidebar = new StatSidebar(sidebarEl);
    this.sidebar.update({});
  }

  sendToWorker(type, payload) {
    if (this.worker) {
      this.worker.postMessage({ type, payload });
    }
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
