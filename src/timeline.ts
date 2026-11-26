import { SETLIST } from './setlist.js';
import type { Song } from './setlist.js';

/*
 * 공연 타임라인: 세트리스트 전체를 실제 곡 길이대로 이어 붙인 0~1 구간.
 * 공연 구간의 스크롤 위치가 이 비율이다 — 긴 곡일수록 스크롤 거리도 길다.
 */

export interface TimelinePoint {
  songIndex: number;
  /** 곡 시작부터 흐른 초 */
  songTime: number;
}

const BOUNDARY_EPS_SEC = 1e-6;

const lengthsSec = (setlist: readonly Song[]): number[] => setlist.map((s) => s.durationMs / 1000);

export function timelineTotalSec(setlist: readonly Song[] = SETLIST): number {
  return lengthsSec(setlist).reduce((a, b) => a + b, 0);
}

/** 비율(0~1) → 몇 번째 곡의 몇 초 */
export function timelineAt(fraction: number, setlist: readonly Song[] = SETLIST): TimelinePoint {
  const lens = lengthsSec(setlist);
  const total = lens.reduce((a, b) => a + b, 0);
  let t = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 0; i < lens.length; i++) {
    // 곡 경계에 정확히 놓인 값은 부동소수 오차로 앞 곡 끝이 되기 쉬워서, 경계는 다음 곡으로 보낸다
    if (t < lens[i] - BOUNDARY_EPS_SEC || i === lens.length - 1) return { songIndex: i, songTime: Math.max(0, Math.min(t, lens[i])) };
    t -= lens[i];
  }
  return { songIndex: 0, songTime: 0 };
}

/**
 * 몇 번째 곡의 몇 초 → 비율(0~1). 재생 영상이 음원보다 몇 초 길 수 있어 곡 길이 안으로 자른다 —
 * 그래야 영상 끝자락에서 비율이 다음 곡으로 넘어가 화면이 미리 다음 곡을 보여 주지 않는다.
 */
export function fractionAt(songIndex: number, songTime: number, setlist: readonly Song[] = SETLIST): number {
  const lens = lengthsSec(setlist);
  const total = lens.reduce((a, b) => a + b, 0);
  const i = Math.max(0, Math.min(lens.length - 1, songIndex));
  const before = lens.slice(0, i).reduce((a, b) => a + b, 0);
  const within = Math.max(0, Math.min(lens[i] - 0.001, songTime));
  return (before + within) / total;
}
