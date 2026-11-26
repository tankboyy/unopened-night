import { describe, expect, it } from 'vitest';
import { fractionAt, timelineAt, timelineTotalSec } from './timeline.js';
import { SETLIST } from './setlist.js';

describe('timeline', () => {
  it('spans the whole setlist in real song lengths', () => {
    const sum = SETLIST.reduce((a, s) => a + s.durationMs / 1000, 0);
    expect(timelineTotalSec()).toBeCloseTo(sum);
  });

  it('starts at the first song and ends at the end of the last song', () => {
    expect(timelineAt(0)).toEqual({ songIndex: 0, songTime: 0 });
    const end = timelineAt(1);
    expect(end.songIndex).toBe(SETLIST.length - 1);
    expect(end.songTime).toBeCloseTo(SETLIST[SETLIST.length - 1].durationMs / 1000);
  });

  it('round-trips song positions through the scroll fraction', () => {
    SETLIST.forEach((song, i) => {
      for (const t of [0, 1.5, song.durationMs / 2000]) {
        const back = timelineAt(fractionAt(i, t));
        expect(back.songIndex).toBe(i);
        expect(back.songTime).toBeCloseTo(t, 3);
      }
    });
  });

  it('keeps a video running past the track length inside its own song', () => {
    const last = SETLIST[0].durationMs / 1000;
    expect(timelineAt(fractionAt(0, last + 8)).songIndex).toBe(0);
  });

  it('clamps out-of-range input', () => {
    expect(timelineAt(-2).songIndex).toBe(0);
    expect(timelineAt(5).songIndex).toBe(SETLIST.length - 1);
    expect(fractionAt(99, 1e9)).toBeLessThanOrEqual(1);
    expect(fractionAt(-1, -5)).toBe(0);
  });
});
