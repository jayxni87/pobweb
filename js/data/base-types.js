/**
 * BaseTypeRegistry — unified lookup for all item base types.
 *
 * Merges every per-slot JSON file in js/data/bases/ into a single Map
 * keyed by base name (e.g. "Rusted Sword", "Plate Vest", "Iron Ring").
 */

import amulet from './bases/amulet.json' with { type: 'json' };
import axe from './bases/axe.json' with { type: 'json' };
import belt from './bases/belt.json' with { type: 'json' };
import body from './bases/body.json' with { type: 'json' };
import boots from './bases/boots.json' with { type: 'json' };
import bow from './bases/bow.json' with { type: 'json' };
import claw from './bases/claw.json' with { type: 'json' };
import dagger from './bases/dagger.json' with { type: 'json' };
import fishing from './bases/fishing.json' with { type: 'json' };
import flask from './bases/flask.json' with { type: 'json' };
import gloves from './bases/gloves.json' with { type: 'json' };
import graft from './bases/graft.json' with { type: 'json' };
import helmet from './bases/helmet.json' with { type: 'json' };
import jewel from './bases/jewel.json' with { type: 'json' };
import mace from './bases/mace.json' with { type: 'json' };
import quiver from './bases/quiver.json' with { type: 'json' };
import ring from './bases/ring.json' with { type: 'json' };
import shield from './bases/shield.json' with { type: 'json' };
import staff from './bases/staff.json' with { type: 'json' };
import sword from './bases/sword.json' with { type: 'json' };
import tincture from './bases/tincture.json' with { type: 'json' };
import wand from './bases/wand.json' with { type: 'json' };

const ALL_BASE_FILES = [
  amulet, axe, belt, body, boots, bow, claw, dagger, fishing, flask,
  gloves, graft, helmet, jewel, mace, quiver, ring, shield, staff,
  sword, tincture, wand,
];

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

  constructor() {
    this.#map = new Map();
    for (const file of ALL_BASE_FILES) {
      for (const [name, data] of Object.entries(file)) {
        this.#map.set(name, data);
      }
    }
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
