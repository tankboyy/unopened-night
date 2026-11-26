import { describe, expect, it } from 'vitest';
import { createScrubMeter, SCRUB_MAX_SEC_PER_PX, SCRUB_MIN_SEC_PER_PX, scrubSecondsPerPx } from './scrub.js';

describe('scrubSecondsPerPx', () => {
  it('is slow for gentle scrolling and fast for flicks, never outside its bounds', () => {
    expect(scrubSecondsPerPx(0)).toBeCloseTo(SCRUB_MIN_SEC_PER_PX);
    expect(scrubSecondsPerPx(300)).toBeCloseTo(SCRUB_MIN_SEC_PER_PX);
    expect(scrubSecondsPerPx(1e6)).toBeCloseTo(SCRUB_MAX_SEC_PER_PX);
    let prev = 0;
    for (let v = 0; v <= 10_000; v += 250) {
      const g = scrubSecondsPerPx(v);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });

  it('treats scrolling up the same speed as scrolling down', () => {
    expect(scrubSecondsPerPx(-3000)).toBeCloseTo(scrubSecondsPerPx(3000));
  });
});

describe('createScrubMeter', () => {
  it('moves a few seconds per isolated wheel notch', () => {
    const m = createScrubMeter();
    // 한 칸씩 1초 간격으로 — 창(250ms) 안에 다른 칸이 없다
    const secs = [0, 1000, 2000].map((t) => m.step(100, t));
    for (const s of secs) expect(s).toBeLessThan(5);
  });

  it('accelerates when notches arrive back to back', () => {
    const m = createScrubMeter();
    let last = 0;
    for (let i = 0; i < 12; i++) last = m.step(100, i * 16);
    // 한 칸씩일 때(약 3초)보다 확실히 빨라야 한다
    expect(last).toBeGreaterThan(10);
  });

  it('reports a signed rate for the badge', () => {
    const m = createScrubMeter();
    for (let i = 0; i < 6; i++) m.step(-100, i * 30);
    expect(m.rate(180)).toBeLessThan(0);
  });
});
