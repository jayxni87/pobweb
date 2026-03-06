import { describe, it, expect } from 'vitest';
import {
  calcSkillCooldown,
  calcTriggerTime,
  calcTriggerRate,
  calcSkillDuration,
  SERVER_TICK_RATE,
} from '../calc-triggers.js';
import { ModDB } from '../mod-db.js';

describe('SERVER_TICK_RATE', () => {
  it('is ~33.33 ticks per second', () => {
    expect(SERVER_TICK_RATE).toBeCloseTo(33.33, 1);
  });
});

describe('calcSkillCooldown', () => {
  it('calculates simple cooldown', () => {
    const modList = new ModDB();
    const cd = calcSkillCooldown(modList, null, { cooldown: 1.0 });
    // Should be rounded to nearest server tick
    expect(cd.cooldown).toBeGreaterThan(0);
    expect(cd.cooldown).toBeLessThanOrEqual(1.1);
  });

  it('applies cooldown recovery rate', () => {
    const modList = new ModDB();
    modList.newMod('CooldownRecovery', 'INC', 100, 'Belt');
    const cd = calcSkillCooldown(modList, null, { cooldown: 4.0 });
    // 4 / (1 + 100/100) = 4/2 = 2, rounded to server tick
    expect(cd.cooldown).toBeCloseTo(2.0, 1);
  });

  it('does not round when storedUses > 1', () => {
    const modList = new ModDB();
    const cd = calcSkillCooldown(modList, null, { cooldown: 0.15, storedUses: 3 });
    expect(cd.rounded).toBe(false);
    expect(cd.cooldown).toBeCloseTo(0.15);
  });

  it('rounds to server tick normally', () => {
    const modList = new ModDB();
    const cd = calcSkillCooldown(modList, null, { cooldown: 0.15 });
    expect(cd.rounded).toBe(true);
    // Rounded up to nearest server tick (1/33.33 = 0.03s)
    const tickSize = 1 / SERVER_TICK_RATE;
    expect(cd.cooldown % tickSize).toBeCloseTo(0, 4);
  });

  it('respects cooldown override', () => {
    const modList = new ModDB();
    modList.newMod('CooldownRecovery', 'OVERRIDE', 0.5, 'Unique');
    const cd = calcSkillCooldown(modList, null, { cooldown: 4.0 });
    // Override takes the value directly (but still rounds)
    expect(cd.cooldown).toBeCloseTo(0.51, 1); // rounded to tick
  });

  it('handles 0 cooldown', () => {
    const modList = new ModDB();
    const cd = calcSkillCooldown(modList, null, {});
    expect(cd.cooldown).toBe(0);
  });

  it('applies added cooldown from BASE', () => {
    const modList = new ModDB();
    modList.newMod('CooldownRecovery', 'BASE', 2, 'Skill');
    const cd = calcSkillCooldown(modList, null, { cooldown: 3.0 });
    // (3 + 2) / 1 = 5, rounded to tick
    expect(cd.cooldown).toBeCloseTo(5.0, 1);
  });
});

describe('calcTriggerTime', () => {
  it('calculates trigger time from triggerTime', () => {
    const modList = new ModDB();
    const result = calcTriggerTime(modList, null, { triggerTime: 0.25, triggered: true });
    expect(result.time).toBeCloseTo(0.25);
    expect(result.speed).toBeCloseTo(4.0);
  });

  it('applies cooldown recovery to trigger time', () => {
    const modList = new ModDB();
    modList.newMod('CooldownRecovery', 'INC', 100, 'Belt');
    const result = calcTriggerTime(modList, null, { triggerTime: 1.0, triggered: true });
    // 1.0 / (1 + 100/100) = 0.5
    expect(result.time).toBeCloseTo(0.5);
    expect(result.speed).toBeCloseTo(2.0);
  });

  it('calculates from triggerRate', () => {
    const modList = new ModDB();
    const result = calcTriggerTime(modList, null, { triggerRate: 5, triggered: true });
    expect(result.time).toBeCloseTo(0.2);
    expect(result.speed).toBe(5);
  });

  it('returns null for non-triggered skills', () => {
    const modList = new ModDB();
    const result = calcTriggerTime(modList, null, {});
    expect(result).toBeNull();
  });

  it('handles activeSkillsLinked', () => {
    const modList = new ModDB();
    modList.newMod('ActiveSkillsLinkedToTrigger', 'BASE', 3, 'Support');
    const result = calcTriggerTime(modList, null, { triggerTime: 0.25, triggered: true });
    // 0.25 / 1 * 3 = 0.75
    expect(result.time).toBeCloseTo(0.75);
  });
});

describe('calcTriggerRate', () => {
  it('calculates trigger rate limited by cooldown', () => {
    const rate = calcTriggerRate(10, 0.25); // 10 aps, 0.25s cooldown
    // min(10, 1/0.25) = min(10, 4) = 4
    expect(rate).toBeCloseTo(4.0);
  });

  it('returns attack rate when no cooldown limit', () => {
    const rate = calcTriggerRate(2, 0);
    expect(rate).toBe(2);
  });

  it('returns cooldown rate when lower than attack rate', () => {
    const rate = calcTriggerRate(2, 1.0); // 2 aps, 1s cooldown
    // min(2, 1) = 1
    expect(rate).toBeCloseTo(1.0);
  });
});

describe('calcSkillDuration', () => {
  it('calculates base duration with no mods', () => {
    const modList = new ModDB();
    const dur = calcSkillDuration(modList, null, { duration: 4.0 });
    expect(dur).toBeCloseTo(4.0);
  });

  it('applies INC duration modifier', () => {
    const modList = new ModDB();
    modList.newMod('Duration', 'INC', 50, 'Tree');
    const dur = calcSkillDuration(modList, null, { duration: 4.0 });
    // 4 * (1 + 50/100) * 1 = 6
    expect(dur).toBeCloseTo(6.0);
  });

  it('applies MORE duration modifier', () => {
    const modList = new ModDB();
    modList.newMod('Duration', 'MORE', 50, 'Support');
    const dur = calcSkillDuration(modList, null, { duration: 4.0 });
    // 4 * 1 * 1.5 = 6
    expect(dur).toBeCloseTo(6.0);
  });

  it('applies added base duration', () => {
    const modList = new ModDB();
    modList.newMod('Duration', 'BASE', 2.0, 'Skill');
    const dur = calcSkillDuration(modList, null, { duration: 4.0 });
    // (4 + 2) * 1 = 6
    expect(dur).toBeCloseTo(6.0);
  });

  it('floors duration mod at 0', () => {
    const modList = new ModDB();
    modList.newMod('Duration', 'INC', -200, 'Curse');
    const dur = calcSkillDuration(modList, null, { duration: 4.0 });
    expect(dur).toBe(0);
  });

  it('returns 0 for no duration skill', () => {
    const modList = new ModDB();
    const dur = calcSkillDuration(modList, null, {});
    expect(dur).toBe(0);
  });
});
