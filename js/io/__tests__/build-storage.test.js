import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BuildStorage } from '../build-storage.js';

// Simple in-memory IndexedDB mock
function mockIndexedDB() {
  const stores = {};

  const mockStore = (name) => {
    if (!stores[name]) stores[name] = {};
    return {
      put(value, key) {
        stores[name][key || value.id] = structuredClone(value);
        return { onsuccess: null, set result(v) {} };
      },
      get(key) {
        const req = { onsuccess: null, result: stores[name][key] || null };
        setTimeout(() => req.onsuccess?.({ target: req }), 0);
        return req;
      },
      delete(key) {
        delete stores[name][key];
        return { onsuccess: null };
      },
      getAll() {
        const req = { onsuccess: null, result: Object.values(stores[name]) };
        setTimeout(() => req.onsuccess?.({ target: req }), 0);
        return req;
      },
      getAllKeys() {
        const req = { onsuccess: null, result: Object.keys(stores[name]) };
        setTimeout(() => req.onsuccess?.({ target: req }), 0);
        return req;
      },
    };
  };

  return {
    _stores: stores,
    open() {
      const req = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: {
          objectStoreNames: { contains: (n) => !!stores[n] },
          createObjectStore: (name, opts) => { stores[name] = {}; return mockStore(name); },
          transaction: (name) => ({
            objectStore: (n) => mockStore(n),
          }),
        },
      };
      setTimeout(() => {
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.({ target: req });
      }, 0);
      return req;
    },
  };
}

describe('BuildStorage', () => {
  it('creates a storage instance', () => {
    const storage = new BuildStorage();
    expect(storage).toBeDefined();
    expect(storage.AUTO_SAVE_INTERVAL).toBe(30000);
  });

  it('generates unique build IDs', () => {
    const storage = new BuildStorage();
    const id1 = storage.generateId();
    const id2 = storage.generateId();
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
  });

  it('creates build entry with metadata', () => {
    const storage = new BuildStorage();
    const entry = storage.createEntry({
      name: 'Test Build',
      className: 'Witch',
      level: 90,
    });
    expect(entry.id).toBeDefined();
    expect(entry.name).toBe('Test Build');
    expect(entry.className).toBe('Witch');
    expect(entry.level).toBe(90);
    expect(entry.createdAt).toBeDefined();
    expect(entry.updatedAt).toBeDefined();
  });

  it('serializes build to storable format', () => {
    const storage = new BuildStorage();
    const buildData = {
      name: 'My Build',
      className: 'Ranger',
      level: 95,
      treeNodes: [1, 2, 3],
      config: { enemyIsBoss: 'Pinnacle' },
    };
    const entry = storage.createEntry(buildData);
    expect(entry.data).toEqual(buildData);
  });

  it('auto-save interval is 30 seconds', () => {
    const storage = new BuildStorage();
    expect(storage.AUTO_SAVE_INTERVAL).toBe(30000);
  });

  it('tracks dirty state', () => {
    const storage = new BuildStorage();
    expect(storage.isDirty).toBe(false);
    storage.markDirty();
    expect(storage.isDirty).toBe(true);
    storage.markClean();
    expect(storage.isDirty).toBe(false);
  });

  it('lists builds from entries', () => {
    const storage = new BuildStorage();
    const entries = [
      storage.createEntry({ name: 'Build A', className: 'Witch', level: 90 }),
      storage.createEntry({ name: 'Build B', className: 'Ranger', level: 80 }),
    ];
    const list = storage.buildListFromEntries(entries);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Build A');
    expect(list[1].name).toBe('Build B');
  });

  it('renames a build entry', () => {
    const storage = new BuildStorage();
    const entry = storage.createEntry({ name: 'Old Name', className: 'Scion', level: 1 });
    const renamed = storage.renameEntry(entry, 'New Name');
    expect(renamed.name).toBe('New Name');
    expect(renamed.data.name).toBe('New Name');
  });

  it('duplicates a build entry', () => {
    const storage = new BuildStorage();
    const entry = storage.createEntry({ name: 'Original', className: 'Duelist', level: 75 });
    const dup = storage.duplicateEntry(entry);
    expect(dup.id).not.toBe(entry.id);
    expect(dup.name).toBe('Original (Copy)');
    expect(dup.data.name).toBe('Original (Copy)');
  });
});
