// PoBWeb - Items Tab (port of Classes/ItemsTab.lua)
// Item slot list, item editor, socket/link display.

import { Item, parseItemText } from '../models/item.js';

export const ITEM_SLOTS = [
  'Weapon 1', 'Weapon 2',
  'Helmet', 'Body Armour', 'Gloves', 'Boots',
  'Amulet', 'Ring 1', 'Ring 2', 'Belt',
  'Flask 1', 'Flask 2', 'Flask 3', 'Flask 4', 'Flask 5',
  'Jewel 1', 'Jewel 2', 'Jewel 3',
];

export class ItemsTab {
  constructor(container) {
    this.container = container;
    this.items = {}; // slot -> Item
    this.selectedSlot = null;
    this.onChange = null;

    this._init();
  }

  _init() {
    this.container.innerHTML = `
      <div class="items-tab">
        <div class="items-slot-list" id="item-slot-list"></div>
        <div class="items-editor" id="items-editor">
          <div class="items-placeholder">Select an equipment slot</div>
        </div>
      </div>
    `;
    this._renderSlotList();
  }

  _renderSlotList() {
    const list = this.container.querySelector('#item-slot-list');
    if (!list) return;

    list.innerHTML = '';
    for (const slot of ITEM_SLOTS) {
      const el = document.createElement('div');
      el.className = 'item-slot' + (slot === this.selectedSlot ? ' selected' : '');
      const item = this.items[slot];
      el.innerHTML = `
        <span class="slot-name">${slot}</span>
        <span class="slot-item-name">${item ? item.name : '(empty)'}</span>
      `;
      el.addEventListener('click', () => this.selectSlot(slot));
      list.appendChild(el);
    }
  }

  selectSlot(slot) {
    this.selectedSlot = slot;
    this._renderSlotList();
    this._renderEditor();
  }

  _renderEditor() {
    const editor = this.container.querySelector('#items-editor');
    if (!editor || !this.selectedSlot) return;

    const item = this.items[this.selectedSlot];
    editor.innerHTML = `
      <div class="item-editor-header">
        <span class="slot-title">${this.selectedSlot}</span>
        <button class="pob-btn" id="clear-item-btn">Clear</button>
      </div>
      <div class="item-text-area">
        <textarea id="item-text" class="pob-edit item-textarea" rows="15"
          placeholder="Paste item text here...">${item ? item.rawText : ''}</textarea>
      </div>
      <button class="pob-btn pob-btn-primary" id="apply-item-btn">Apply</button>
      ${item ? this._renderItemPreview(item) : ''}
    `;

    const applyBtn = editor.querySelector('#apply-item-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const textarea = editor.querySelector('#item-text');
        if (textarea && textarea.value.trim()) {
          this.setItem(this.selectedSlot, textarea.value.trim());
        }
      });
    }

    const clearBtn = editor.querySelector('#clear-item-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearItem(this.selectedSlot);
      });
    }
  }

  _renderItemPreview(item) {
    let html = '<div class="item-preview">';
    html += `<div class="item-name rarity-${item.rarity}">${item.name}</div>`;
    if (item.baseName) html += `<div class="item-base">${item.baseName}</div>`;
    if (item.implicitMods && item.implicitMods.length > 0) {
      html += '<div class="item-mods implicit">';
      for (const mod of item.implicitMods) html += `<div class="mod-line">${mod}</div>`;
      html += '</div>';
    }
    if (item.explicitMods && item.explicitMods.length > 0) {
      html += '<div class="item-mods explicit">';
      for (const mod of item.explicitMods) html += `<div class="mod-line">${mod}</div>`;
      html += '</div>';
    }
    if (item.sockets) {
      html += `<div class="item-sockets">Sockets: ${item.socketStr || ''}</div>`;
    }
    html += '</div>';
    return html;
  }

  setItem(slot, rawText) {
    const item = new Item(rawText);
    this.items[slot] = item;
    this._renderSlotList();
    this._renderEditor();
    this._fireChange();
  }

  clearItem(slot) {
    delete this.items[slot];
    this._renderSlotList();
    this._renderEditor();
    this._fireChange();
  }

  _fireChange() {
    if (this.onChange) this.onChange(this.items);
  }

  getItems() {
    return this.items;
  }

  loadItems(itemList) {
    this.items = {};
    for (const item of itemList) {
      if (item.slot && item.raw) {
        this.items[item.slot] = new Item(item.raw);
      }
    }
    this._renderSlotList();
  }
}
