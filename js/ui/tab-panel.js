// PoBWeb - Tab Panel
// Tab bar with lazy-initialized content areas.

export class TabPanel {
  constructor(el, tabNames = []) {
    this.el = el;
    this.tabs = tabNames.map(name => ({ name }));
    this.activeTab = tabNames[0] || null;
    this.onChange = null;
    this._tabSet = new Set(tabNames);
  }

  switchTo(tabName) {
    if (!this._tabSet.has(tabName)) return;
    this.activeTab = tabName;
    if (this.onChange) this.onChange(tabName);
  }

  getTabNames() {
    return this.tabs.map(t => t.name);
  }
}
