import { describe, expect, it } from 'vitest';
import { isBlocked } from './crowd.js';
import { BARRIER_GAP_M, RUNWAY_TIP_RADIUS_M, RUNWAY_TIP_Z_M, RUNWAY_WIDTH_M, STAGE_DEPTH_M, STAGE_Z_M } from './show.constants.js';

describe('isBlocked (where the crowd may not stand)', () => {
  it('keeps people off the round tip stage, including its rim', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const r = RUNWAY_TIP_RADIUS_M + 0.1;
      expect(isBlocked(Math.cos(a) * r, RUNWAY_TIP_Z_M + Math.sin(a) * r)).toBe(true);
    }
  });

  it('keeps people off the runway and behind the barrier gap', () => {
    const midZ = (RUNWAY_TIP_Z_M + STAGE_Z_M + STAGE_DEPTH_M / 2) / 2;
    expect(isBlocked(0, midZ)).toBe(true);
    expect(isBlocked(RUNWAY_WIDTH_M / 2 + BARRIER_GAP_M - 0.1, midZ)).toBe(true);
    expect(isBlocked(RUNWAY_WIDTH_M / 2 + BARRIER_GAP_M + 0.3, midZ)).toBe(false);
  });

  it('keeps people off the main stage front', () => {
    expect(isBlocked(10, STAGE_Z_M + STAGE_DEPTH_M / 2 + 0.5)).toBe(true);
  });

  it('allows the open floor around the tip', () => {
    expect(isBlocked(0, RUNWAY_TIP_Z_M + RUNWAY_TIP_RADIUS_M + BARRIER_GAP_M + 1)).toBe(false);
    expect(isBlocked(20, 10)).toBe(false);
  });
});
