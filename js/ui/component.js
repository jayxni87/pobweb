// PoBWeb - UI Component System
// Vanilla JS component base classes matching PoB's control hierarchy.

// Base component
export class Component {
  constructor(el) {
    this.el = el;
    this.visible = true;
  }

  show() {
    this.visible = true;
    if (this.el) this.el.style.display = '';
  }

  hide() {
    this.visible = false;
    if (this.el) this.el.style.display = 'none';
  }

  render() {}

  destroy() {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }
}

// Tooltip with PoB color code support
export class Tooltip extends Component {
  constructor(el) {
    super(el);
  }

  setContent(html) {
    if (this.el) this.el.innerHTML = html;
  }

  moveTo(x, y) {
    if (this.el) {
      this.el.style.left = x + 'px';
      this.el.style.top = y + 'px';
    }
  }

  // Convert PoB color codes (^xRRGGBB) to HTML spans
  static formatColorCodes(text) {
    return text.replace(/\^x([0-9A-Fa-f]{6})/g, (_, hex) => {
      return `<span style="color:#${hex}">`;
    }).replace(/\^7/g, '</span><span style="color:#ccc">');
  }
}

// Dropdown with search and keyboard navigation
export class DropdownControl extends Component {
  constructor(el, options = []) {
    super(el);
    this.options = options;
    this.selectedIndex = 0;
    this.onChange = null;
    if (options.length > 0) {
      this.selectedValue = options[0].value;
      this.selectedLabel = options[0].label;
    } else {
      this.selectedValue = null;
      this.selectedLabel = '';
    }
  }

  select(value) {
    const idx = this.options.findIndex(o => o.value === value);
    if (idx < 0) return;
    this.selectedIndex = idx;
    this.selectedValue = this.options[idx].value;
    this.selectedLabel = this.options[idx].label;
    if (this.onChange) this.onChange(this.selectedValue);
  }

  selectIndex(idx) {
    if (idx < 0 || idx >= this.options.length) return;
    this.selectedIndex = idx;
    this.selectedValue = this.options[idx].value;
    this.selectedLabel = this.options[idx].label;
    if (this.onChange) this.onChange(this.selectedValue);
  }

  filter(query) {
    if (!query) return this.options;
    const lower = query.toLowerCase();
    return this.options.filter(o => o.label.toLowerCase().includes(lower));
  }
}

// List with virtual scrolling support
export class ListControl extends Component {
  constructor(el, items = [], opts = {}) {
    super(el);
    this.items = [...items];
    this.selectedIndex = -1;
    this.selectedItem = null;
    this.onChange = null;
    this.itemHeight = opts.itemHeight || 20;
    this.viewHeight = opts.viewHeight || 200;
  }

  selectIndex(idx) {
    if (idx < 0 || idx >= this.items.length) return;
    this.selectedIndex = idx;
    this.selectedItem = this.items[idx];
    if (this.onChange) this.onChange(idx, this.selectedItem);
  }

  addItem(item) {
    this.items.push(item);
  }

  removeItem(idx) {
    if (idx < 0 || idx >= this.items.length) return;
    this.items.splice(idx, 1);
    if (this.selectedIndex >= this.items.length) {
      this.selectedIndex = this.items.length - 1;
      this.selectedItem = this.items[this.selectedIndex] ?? null;
    }
  }

  getVisibleRange(scrollTop) {
    const start = Math.floor(scrollTop / this.itemHeight);
    const count = Math.ceil(this.viewHeight / this.itemHeight);
    return {
      start: Math.max(0, start),
      end: Math.min(this.items.length, start + count),
    };
  }
}

// Edit control with validation
export class EditControl extends Component {
  constructor(el, opts = {}) {
    super(el);
    this.value = opts.value !== undefined ? opts.value : '';
    this._validate = opts.validate || null;
    this.onChange = null;
  }

  setValue(val) {
    this.value = val;
    if (this.onChange) this.onChange(val);
  }

  isValid() {
    if (!this._validate) return true;
    return this._validate(this.value);
  }
}

// Modal dialog
export class Modal extends Component {
  constructor(el) {
    super(el);
    this.visible = false;
    this.onClose = null;
    this.hide();
  }

  open() {
    this.show();
  }

  close() {
    this.hide();
    if (this.onClose) this.onClose();
  }
}
