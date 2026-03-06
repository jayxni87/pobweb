import { describe, it, expect } from 'vitest';
import { TabPanel } from '../tab-panel.js';

function mockElement(tag = 'div') {
  const children = [];
  const classList = new Set();
  const style = {};
  return {
    tagName: tag.toUpperCase(),
    children,
    classList: {
      add: (c) => classList.add(c),
      remove: (c) => classList.delete(c),
      contains: (c) => classList.has(c),
    },
    style,
    innerHTML: '',
    textContent: '',
    appendChild(child) { children.push(child); return child; },
    removeChild(child) { const i = children.indexOf(child); if (i >= 0) children.splice(i, 1); },
    addEventListener() {},
    _classList: classList,
  };
}

describe('TabPanel', () => {
  it('creates with tabs', () => {
    const el = mockElement();
    const panel = new TabPanel(el, ['Tree', 'Skills', 'Items']);
    expect(panel.tabs.length).toBe(3);
    expect(panel.activeTab).toBe('Tree');
  });

  it('switches active tab', () => {
    const el = mockElement();
    const panel = new TabPanel(el, ['Tree', 'Skills', 'Items']);
    panel.switchTo('Skills');
    expect(panel.activeTab).toBe('Skills');
  });

  it('fires onChange callback', () => {
    const el = mockElement();
    const panel = new TabPanel(el, ['Tree', 'Skills']);
    let changed = null;
    panel.onChange = (tab) => { changed = tab; };
    panel.switchTo('Skills');
    expect(changed).toBe('Skills');
  });

  it('ignores switch to unknown tab', () => {
    const el = mockElement();
    const panel = new TabPanel(el, ['Tree', 'Skills']);
    panel.switchTo('NonExistent');
    expect(panel.activeTab).toBe('Tree');
  });

  it('returns tab names', () => {
    const el = mockElement();
    const panel = new TabPanel(el, ['A', 'B', 'C']);
    expect(panel.getTabNames()).toEqual(['A', 'B', 'C']);
  });
});
