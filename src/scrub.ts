/*
 * 공연 구간 스크롤 → 공연 시간 변환. 스크롤 속도를 재서 배율을 바꾼다.
 *  - 천천히 한 칸씩: 곡 안에서 몇 초씩 감는다
 *  - 계속 굴리면 점점 빨라지고, 세게 튕기면 곡을 건너뛴다
 * 고정 비율(1px ≈ 0.3초)이면 휠 한 칸에 30초가 지나가 "훅훅 지나간다"는 문제가 있었다.
 */

/** 가장 느릴 때 1px 당 공연 초 — 휠 한 칸(약 100px)에 3초 */
export const SCRUB_MIN_SEC_PER_PX = 0.03;
/** 가장 빠를 때 1px 당 공연 초 — 휠 한 칸에 약 30초. 0.9 로 두니 빠르게 10칸에 곡 5개(17분)가 넘어가 다시 '훅훅' 지나갔다 */
export const SCRUB_MAX_SEC_PER_PX = 0.3;
/** 이 속도(px/s) 아래는 가장 느린 배율 */
export const SCRUB_SLOW_PX_PER_SEC = 450;
/** 이 속도(px/s) 위는 가장 빠른 배율 */
export const SCRUB_FAST_PX_PER_SEC = 9_000;
/** 속도를 재는 창(밀리초) */
export const SCRUB_WINDOW_MS = 250;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 스크롤 속도(px/s) → 1px 당 공연 초. 느린 쪽을 넓게 두려고 1.5 제곱으로 휜다 */
export function scrubSecondsPerPx(speedPxPerSec: number): number {
  const k = Math.pow(smoothstep(SCRUB_SLOW_PX_PER_SEC, SCRUB_FAST_PX_PER_SEC, Math.abs(speedPxPerSec)), 1.5);
  return SCRUB_MIN_SEC_PER_PX + (SCRUB_MAX_SEC_PER_PX - SCRUB_MIN_SEC_PER_PX) * k;
}

export interface ScrubMeter {
  /**
   * 스크롤 한 번(px, 아래가 +)을 넣으면 공연 시간 변화량(초)을 돌려준다.
   * @param nowMs 지금 시각(밀리초) — 테스트에서 시계를 주입하려고 받는다
   */
  step(deltaPx: number, nowMs: number): number;
  /** 최근 창 안에서 실제 1초에 공연이 몇 초 흘렀는지(부호 포함) — 배지에 ×N 으로 보여 준다 */
  rate(nowMs: number): number;
}

export function createScrubMeter(): ScrubMeter {
  const samples: Array<{ t: number; px: number; sec: number }> = [];
  const prune = (now: number): void => {
    while (samples.length && now - samples[0].t > SCRUB_WINDOW_MS) samples.shift();
  };
  return {
    step(deltaPx, nowMs) {
      prune(nowMs);
      const speed = (samples.reduce((a, s) => a + Math.abs(s.px), 0) + Math.abs(deltaPx)) / (SCRUB_WINDOW_MS / 1000);
      const sec = deltaPx * scrubSecondsPerPx(speed);
      samples.push({ t: nowMs, px: deltaPx, sec });
      return sec;
    },
    rate(nowMs) {
      prune(nowMs);
      return samples.reduce((a, s) => a + s.sec, 0) / (SCRUB_WINDOW_MS / 1000);
    },
  };
}
