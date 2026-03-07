import { describe, it, expect, beforeAll } from 'vitest';
import { BaseTypeRegistry } from '../base-types.js';

describe('BaseTypeRegistry', () => {
  let registry;

  // Construct once for all tests (it's read-only data)
  beforeAll(async () => {
    registry = await BaseTypeRegistry.load();
  });

  describe('get()', () => {
    it('finds weapon bases by name', () => {
      const rusted = registry.get('Rusted Sword');
      expect(rusted).not.toBeNull();
      expect(rusted.type).toBe('One Handed Sword');
      expect(rusted.weapon.PhysicalMin).toBe(4);
    });

    it('finds armour bases by name', () => {
      const plate = registry.get('Plate Vest');
      expect(plate).not.toBeNull();
      expect(plate.type).toBe('Body Armour');
      expect(plate.armour.ArmourBaseMin).toBe(19);
    });

    it('finds jewelry bases by name', () => {
      const ring = registry.get('Iron Ring');
      expect(ring).not.toBeNull();
      expect(ring.type).toBe('Ring');
    });

    it('returns null for unknown bases', () => {
      expect(registry.get('Nonexistent Item')).toBeNull();
      expect(registry.get('')).toBeNull();
    });
  });

  describe('isWeapon()', () => {
    it('returns true for weapon bases', () => {
      expect(registry.isWeapon('Rusted Sword')).toBe(true);
    });

    it('returns false for armour bases', () => {
      expect(registry.isWeapon('Plate Vest')).toBe(false);
    });

    it('returns false for unknown bases', () => {
      expect(registry.isWeapon('Nonexistent')).toBe(false);
    });
  });

  describe('isArmour()', () => {
    it('returns true for armour bases', () => {
      expect(registry.isArmour('Plate Vest')).toBe(true);
    });

    it('returns false for weapon bases', () => {
      expect(registry.isArmour('Rusted Sword')).toBe(false);
    });

    it('returns false for unknown bases', () => {
      expect(registry.isArmour('Nonexistent')).toBe(false);
    });
  });

  describe('isShield()', () => {
    it('returns true for shield bases', () => {
      expect(registry.isShield('Splintered Tower Shield')).toBe(true);
    });

    it('returns false for body armour', () => {
      expect(registry.isShield('Plate Vest')).toBe(false);
    });
  });

  describe('isJewelry()', () => {
    it('returns true for rings', () => {
      expect(registry.isJewelry('Iron Ring')).toBe(true);
    });

    it('returns false for weapons', () => {
      expect(registry.isJewelry('Rusted Sword')).toBe(false);
    });
  });

  describe('allNames()', () => {
    it('returns an array of all base names', () => {
      const names = registry.allNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(100);
      expect(names).toContain('Rusted Sword');
      expect(names).toContain('Plate Vest');
      expect(names).toContain('Iron Ring');
    });
  });
});
