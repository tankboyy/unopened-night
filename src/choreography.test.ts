import { describe, expect, it } from 'vitest';
import { performerStateInSong } from './choreography.js';
import { SETLIST, SPOT_POSITIONS } from './setlist.js';

describe('performerStateInSong', () => {
  it('starts each song standing on its first cue spot', () => {
    SETLIST.forEach((song, i) => {
      const s = performerStateInSong(i, 0, song.durationMs / 1000);
      const spot = SPOT_POSITIONS[song.cues[0].spot];
      expect(s.x).toBeCloseTo(spot.x);
      expect(s.z).toBeCloseTo(spot.z);
      expect(s.motion).toBe(song.cues[0].action);
    });
  });

  it('never teleports within a song, for full tracks and 30s previews alike', () => {
    const STEP = 0.05;
    for (const length of [30, 140, 260]) {
      SETLIST.forEach((_, i) => {
        let prev = performerStateInSong(i, 0, length);
        for (let t = STEP; t <= length; t += STEP) {
          const cur = performerStateInSong(i, t, length);
          // 가장 먼 두 지점(약 30m)을 가장 짧은 걷기 시간 안에 가도 한 스텝에 1.5m 미만
          expect(Math.hypot(cur.x - prev.x, cur.z - prev.z)).toBeLessThan(1.5);
          prev = cur;
        }
      });
    }
  });

  it('ends each song where the next song begins (no jump at song change)', () => {
    SETLIST.forEach((song, i) => {
      const end = performerStateInSong(i, song.durationMs / 1000, song.durationMs / 1000);
      const next = SETLIST[(i + 1) % SETLIST.length];
      const start = SPOT_POSITIONS[next.cues[0].spot];
      expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.01);
    });
  });

  it('faces the crowd whenever standing still', () => {
    for (let t = 0; t < 200; t += 0.5) {
      const s = performerStateInSong(2, t, 231);
      if (s.motion !== 'walk') expect(s.facing).toBe(0);
    }
  });

  it('clamps out-of-range inputs instead of throwing', () => {
    expect(() => performerStateInSong(-3, -10, 0)).not.toThrow();
    expect(performerStateInSong(999, 1e9, 100).songIndex).toBe(SETLIST.length - 1);
  });
});
