/**
 * BaseTypeRegistry — unified lookup for all item base types.
 *
 * Merges every per-slot JSON file in js/data/bases/ into a single Map
 * keyed by base name (e.g. "Rusted Sword", "Plate Vest", "Iron Ring").
 */

const BASE_NAMES = [
  'amulet', 'axe', 'belt', 'body', 'boots', 'bow', 'claw', 'dagger',
  'fishing', 'flask', 'gloves', 'graft', 'helmet', 'jewel', 'mace',
  'quiver', 'ring', 'shield', 'staff', 'sword', 'tincture', 'wand',
];

async function loadBaseFiles() {
  // Node.js / Vitest: read from filesystem (fetch doesn't support file:// URLs)
  if (typeof globalThis.process !== 'undefined' && globalThis.process.versions?.node) {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    return BASE_NAMES.map(name => {
      const url = new URL(`./bases/${name}.json`, import.meta.url);
      return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
    });
  }
  // Browser: use fetch (works regardless of server MIME type)
  return Promise.all(
    BASE_NAMES.map(name =>
      fetch(new URL(`./bases/${name}.json`, import.meta.url))
        .then(r => r.json())
    )
  );
}

const WEAPON_TYPES = new Set([
  'One Handed Sword',
  'Two Handed Sword',
  'Thrusting One Handed Sword',
  'One Handed Axe',
  'Two Handed Axe',
  'One Handed Mace',
  'Two Handed Mace',
  'Sceptre',
  'Bow',
  'Claw',
  'Dagger',
  'Rune Dagger',
  'Wand',
  'Staff',
  'Warstaff',
  'Fishing Rod',
]);

const ARMOUR_TYPES = new Set([
  'Body Armour',
  'Helmet',
  'Gloves',
  'Boots',
  'Shield',
]);

const JEWELRY_TYPES = new Set([
  'Ring',
  'Amulet',
  'Belt',
]);

export class BaseTypeRegistry {
  /** @type {Map<string, object>} */
  #map;

  /**
   * @param {object[]} baseFiles - array of parsed JSON objects (one per base category)
   */
  constructor(baseFiles) {
    this.#map = new Map();
    for (const file of baseFiles) {
      for (const [name, data] of Object.entries(file)) {
        this.#map.set(name, data);
      }
    }
  }

  /**
   * Fetch all base-type JSON files and construct the registry.
   * @returns {Promise<BaseTypeRegistry>}
   */
  static async load() {
    const files = await loadBaseFiles();
    return new BaseTypeRegistry(files);
  }

  /**
   * Look up a base type by its name.
   * @param {string} baseName
   * @returns {object|null} base data object, or null if not found
   */
  get(baseName) {
    return this.#map.get(baseName) ?? null;
  }

  /**
   * @param {string} baseName
   * @returns {boolean}
   */
  isWeapon(baseName) {
    const base = this.get(baseName);
    return base !== null && WEAPON_TYPES.has(base.type);
  }

  /**
   * @param {string} baseName
   * @returns {boolean}
   */
  isArmour(baseName) {
    const base = this.get(baseName);
    return base !== null && ARMOUR_TYPES.has(base.type);
  }

  /**
   * @param {string} baseName
   * @returns {boolean}
   */
  isShield(baseName) {
    const base = this.get(baseName);
    return base !== null && base.type === 'Shield';
  }

  /**
   * @param {string} baseName
   * @returns {boolean}
   */
  isJewelry(baseName) {
    const base = this.get(baseName);
    return base !== null && JEWELRY_TYPES.has(base.type);
  }

  /**
   * @returns {string[]} all base type names
   */
  allNames() {
    return Array.from(this.#map.keys());
  }
}
