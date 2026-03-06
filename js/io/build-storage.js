// PoBWeb - IndexedDB Build Storage
// Auto-save builds every 30 seconds, build library management.

const DB_NAME = 'pobweb-builds';
const DB_VERSION = 1;
const STORE_NAME = 'builds';

export class BuildStorage {
  constructor() {
    this.db = null;
    this.isDirty = false;
    this.AUTO_SAVE_INTERVAL = 30000;
    this._autoSaveTimer = null;
  }

  // Open IndexedDB connection
  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  createEntry(buildData) {
    const now = Date.now();
    return {
      id: this.generateId(),
      name: buildData.name || 'New Build',
      className: buildData.className || 'Scion',
      level: buildData.level || 1,
      createdAt: now,
      updatedAt: now,
      data: { ...buildData },
    };
  }

  renameEntry(entry, newName) {
    entry.name = newName;
    entry.data.name = newName;
    entry.updatedAt = Date.now();
    return entry;
  }

  duplicateEntry(entry) {
    const dup = this.createEntry({ ...entry.data });
    dup.name = entry.name + ' (Copy)';
    dup.data.name = dup.name;
    return dup;
  }

  buildListFromEntries(entries) {
    return entries.map(e => ({
      id: e.id,
      name: e.name,
      className: e.className,
      level: e.level,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }

  markDirty() {
    this.isDirty = true;
  }

  markClean() {
    this.isDirty = false;
  }

  // Save a build entry to IndexedDB
  async save(entry) {
    const db = await this.open();
    entry.updatedAt = Date.now();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);
      req.onsuccess = () => { this.isDirty = false; resolve(entry); };
      req.onerror = () => reject(req.error);
    });
  }

  // Load a build by ID
  async load(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // Delete a build by ID
  async delete(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // List all saved builds
  async listAll() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // Start auto-save timer
  startAutoSave(getCurrentEntry) {
    this.stopAutoSave();
    this._autoSaveTimer = setInterval(async () => {
      if (this.isDirty) {
        const entry = getCurrentEntry();
        if (entry) {
          await this.save(entry);
        }
      }
    }, this.AUTO_SAVE_INTERVAL);
  }

  stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }
}
