import { describe, it, expect, beforeEach } from 'vitest';
import { Component, Tooltip, DropdownControl, ListControl, EditControl, Modal } from '../component.js';

// Minimal DOM shim for Vitest (no jsdom needed, testing logic only)
function mockElement(tag = 'div') {
  const children = [];
  const classList = new Set();
  const style = {};
  const listeners = {};
  return {
    tagName: tag.toUpperCase(),
    children,
    classList: {
      add: (c) => classList.add(c),
      remove: (c) => classList.delete(c),
      contains: (c) => classList.has(c),
      toggle: (c) => classList.has(c) ? classList.delete(c) : classList.add(c),
    },
    style,
    innerHTML: '',
    textContent: '',
    appendChild(child) { children.push(child); return child; },
    removeChild(child) { const i = children.indexOf(child); if (i >= 0) children.splice(i, 1); },
    remove() {},
    addEventListener(evt, fn) { listeners[evt] = listeners[evt] || []; listeners[evt].push(fn); },
    removeEventListener(evt, fn) { if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn); },
    _trigger(evt, data) { (listeners[evt] || []).forEach(fn => fn(data)); },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    _listeners: listeners,
    _classList: classList,
  };
}

describe('Component', () => {
  it('creates with default element', () => {
    const el = mockElement();
    const comp = new Component(el);
    expect(comp.el).toBe(el);
    expect(comp.visible).toBe(true);
  });

  it('shows and hides', () => {
    const el = mockElement();
    const comp = new Component(el);
    comp.hide();
    expect(comp.visible).toBe(false);
    expect(el.style.display).toBe('none');
    comp.show();
    expect(comp.visible).toBe(true);
    expect(el.style.display).toBe('');
  });

  it('destroys', () => {
    const el = mockElement();
    const comp = new Component(el);
    comp.destroy();
    expect(comp.el).toBeNull();
  });
});

describe('Tooltip', () => {
  it('creates tooltip component', () => {
    const el = mockElement();
    const tip = new Tooltip(el);
    expect(tip).toBeDefined();
  });

  it('sets content', () => {
    const el = mockElement();
    const tip = new Tooltip(el);
    tip.setContent('Hello World');
    expect(el.innerHTML).toBe('Hello World');
  });

  it('converts PoB color codes to HTML', () => {
    const result = Tooltip.formatColorCodes('^xE05030Life ^7and ^x7070FFMana');
    expect(result).toContain('color:#E05030');
    expect(result).toContain('Life');
    expect(result).toContain('Mana');
  });

  it('positions at coordinates', () => {
    const el = mockElement();
    const tip = new Tooltip(el);
    tip.moveTo(100, 200);
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('200px');
  });
});

describe('DropdownControl', () => {
  it('creates with options', () => {
    const el = mockElement();
    const dd = new DropdownControl(el, [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ]);
    expect(dd.options.length).toBe(2);
    expect(dd.selectedValue).toBe('a');
  });

  it('selects by value', () => {
    const el = mockElement();
    const dd = new DropdownControl(el, [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ]);
    dd.select('b');
    expect(dd.selectedValue).toBe('b');
    expect(dd.selectedLabel).toBe('Beta');
  });

  it('fires onChange', () => {
    const el = mockElement();
    const dd = new DropdownControl(el, [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ]);
    let changed = null;
    dd.onChange = (val) => { changed = val; };
    dd.select('b');
    expect(changed).toBe('b');
  });

  it('filters options by search', () => {
    const el = mockElement();
    const dd = new DropdownControl(el, [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
      { value: 'g', label: 'Gamma' },
    ]);
    const filtered = dd.filter('am');
    expect(filtered.length).toBe(1);
    expect(filtered[0].value).toBe('g');
  });
});

describe('ListControl', () => {
  it('creates with items', () => {
    const el = mockElement();
    const list = new ListControl(el, ['Item 1', 'Item 2', 'Item 3']);
    expect(list.items.length).toBe(3);
  });

  it('selects an item by index', () => {
    const el = mockElement();
    const list = new ListControl(el, ['A', 'B', 'C']);
    list.selectIndex(1);
    expect(list.selectedIndex).toBe(1);
    expect(list.selectedItem).toBe('B');
  });

  it('adds an item', () => {
    const el = mockElement();
    const list = new ListControl(el, ['A']);
    list.addItem('B');
    expect(list.items.length).toBe(2);
  });

  it('removes an item', () => {
    const el = mockElement();
    const list = new ListControl(el, ['A', 'B', 'C']);
    list.removeItem(1);
    expect(list.items).toEqual(['A', 'C']);
  });

  it('returns visible range for virtual scrolling', () => {
    const el = mockElement();
    const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);
    const list = new ListControl(el, items, { itemHeight: 20, viewHeight: 200 });
    const range = list.getVisibleRange(0);
    expect(range.start).toBe(0);
    expect(range.end).toBe(10);
  });

  it('returns correct range when scrolled', () => {
    const el = mockElement();
    const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);
    const list = new ListControl(el, items, { itemHeight: 20, viewHeight: 200 });
    const range = list.getVisibleRange(400); // scrolled 400px = 20 items
    expect(range.start).toBe(20);
    expect(range.end).toBe(30);
  });
});

describe('EditControl', () => {
  it('creates with initial value', () => {
    const el = mockElement('input');
    const edit = new EditControl(el, { value: 'hello' });
    expect(edit.value).toBe('hello');
  });

  it('validates with custom function', () => {
    const el = mockElement('input');
    const edit = new EditControl(el, {
      value: '42',
      validate: (v) => !isNaN(Number(v)),
    });
    expect(edit.isValid()).toBe(true);
    edit.setValue('abc');
    expect(edit.isValid()).toBe(false);
  });

  it('fires onChange', () => {
    const el = mockElement('input');
    const edit = new EditControl(el, { value: '' });
    let changed = null;
    edit.onChange = (val) => { changed = val; };
    edit.setValue('new');
    expect(changed).toBe('new');
  });
});

describe('Modal', () => {
  it('creates hidden by default', () => {
    const el = mockElement();
    const modal = new Modal(el);
    expect(modal.visible).toBe(false);
  });

  it('opens and closes', () => {
    const el = mockElement();
    const modal = new Modal(el);
    modal.open();
    expect(modal.visible).toBe(true);
    modal.close();
    expect(modal.visible).toBe(false);
  });

  it('fires onClose callback', () => {
    const el = mockElement();
    const modal = new Modal(el);
    let closed = false;
    modal.onClose = () => { closed = true; };
    modal.open();
    modal.close();
    expect(closed).toBe(true);
  });
});
