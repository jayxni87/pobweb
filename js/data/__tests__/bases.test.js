import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const basesDir = join(__dirname, '..', 'bases');

function loadBase(name) {
  return JSON.parse(readFileSync(join(basesDir, `${name}.json`), 'utf-8'));
}

describe('Base item data (converted from Lua)', () => {
  describe('sword.json', () => {
    let swords;

    it('loads without error', () => {
      swords = loadBase('sword');
      expect(swords).toBeDefined();
      expect(typeof swords).toBe('object');
    });

    it('has Rusted Sword with correct weapon stats', () => {
      swords = loadBase('sword');
      const rusted = swords['Rusted Sword'];
      expect(rusted).toBeDefined();
      expect(rusted.weapon).toBeDefined();
      expect(rusted.weapon.PhysicalMin).toBe(4);
      expect(rusted.weapon.PhysicalMax).toBe(9);
      expect(rusted.weapon.CritChanceBase).toBe(5);
      expect(rusted.weapon.AttackRateBase).toBe(1.55);
      expect(rusted.weapon.Range).toBe(11);
    });

    it('has Rusted Sword with tags and implicit', () => {
      swords = loadBase('sword');
      const rusted = swords['Rusted Sword'];
      expect(rusted.tags.sword).toBe(true);
      expect(rusted.tags.weapon).toBe(true);
      expect(rusted.implicit).toBe('40% increased Global Accuracy Rating');
    });

    it('has Copper Sword with requirements', () => {
      swords = loadBase('sword');
      const copper = swords['Copper Sword'];
      expect(copper).toBeDefined();
      expect(copper.req.level).toBe(5);
      expect(copper.req.str).toBe(14);
      expect(copper.req.dex).toBe(14);
    });
  });

  describe('body.json', () => {
    it('has Plate Vest with armour stats and type info', () => {
      const bodies = loadBase('body');
      const plate = bodies['Plate Vest'];
      expect(plate).toBeDefined();
      expect(plate.type).toBe('Body Armour');
      expect(plate.subType).toBe('Armour');
      expect(plate.armour).toBeDefined();
      expect(plate.armour.ArmourBaseMin).toBe(19);
      expect(plate.armour.ArmourBaseMax).toBe(27);
    });
  });

  describe('shield.json', () => {
    it('has Splintered Tower Shield with BlockChance and ArmourBaseMin', () => {
      const shields = loadBase('shield');
      const splintered = shields['Splintered Tower Shield'];
      expect(splintered).toBeDefined();
      expect(splintered.armour.BlockChance).toBe(24);
      expect(splintered.armour.ArmourBaseMin).toBe(9);
    });
  });
});
