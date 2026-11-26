import { SETLIST, SPOT_POSITIONS } from './setlist.js';
import type { PerformerAction, Song, SongCue } from './setlist.js';
import { HIGHLIGHT_HOLD_SEC, HIGHLIGHT_LEAD_SEC, WALK_MIN_SECONDS, WALK_SPEED_MPS } from './show.constants.js';

export type PerformerMotion = PerformerAction | 'walk';

export interface PerformerState {
  songIndex: number;
  x: number;
  z: number;
  /** y축 회전(라디안). 0 이면 객석(+z)을 본다 */
  facing: number;
  motion: PerformerMotion;
}

/** 곡 안의 한 구간: [start, end) 동안 spot 에서 action — 끝나기 전에 다음 구간 자리로 걸어간다 */
export interface Segment extends SongCue {
  start: number;
  end: number;
}

/** 이보다 짧은 구간은 앞 구간에 붙인다 — 걷기도 전에 다음 자리로 끌려가 뛰어다니게 된다 */
const MIN_SEGMENT_SEC = 5;

/**
 * 곡 하나의 동선 시간표.
 *  1) 곡 길이를 cues 개수로 나눈 기본 구간
 *  2) 하이라이트(setlist.highlights, 대개 후렴) [h - LEAD, h + HOLD] 는 런웨이로 나와 관객을 띄우는 구간으로 덮어쓴다
 *     — 신나는 곡(에너지 0.6 이상)은 런웨이 끝에서 'hype', 잔잔한 곡은 런웨이 중간에서 'sing'
 */
export function songPlan(song: Song, length: number): Segment[] {
  const len = Math.max(1, length);
  const base: Segment[] = song.cues.map((c, i) => ({ ...c, start: (len * i) / song.cues.length, end: (len * (i + 1)) / song.cues.length }));
  const hot = song.look.energy >= 0.6;
  const windows: Segment[] = song.highlights
    .map((h) => ({ spot: hot ? 'tip' : 'mid', action: hot ? 'hype' : 'sing', start: Math.max(0, h - HIGHLIGHT_LEAD_SEC), end: Math.min(len, h + HIGHLIGHT_HOLD_SEC) }) as Segment)
    .filter((w) => w.end - w.start >= MIN_SEGMENT_SEC);

  // 기본 구간에서 하이라이트 창을 오려 내고 끼워 넣는다
  let segs: Segment[] = base;
  for (const w of windows) {
    const next: Segment[] = [];
    for (const s of segs) {
      if (s.end <= w.start || s.start >= w.end) next.push(s);
      else {
        if (s.start < w.start) next.push({ ...s, end: w.start });
        if (s.end > w.end) next.push({ ...s, start: w.end });
      }
    }
    next.push(w);
    next.sort((a, b) => a.start - b.start);
    segs = next;
  }
  // 짧은 조각은 앞 구간에 붙이고, 같은 자리·동작이 이어지면 합친다
  const merged: Segment[] = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (prev && (s.end - s.start < MIN_SEGMENT_SEC || (prev.spot === s.spot && prev.action === s.action))) prev.end = s.end;
    else merged.push({ ...s });
  }
  if (merged.length > 1 && merged[0].end - merged[0].start < MIN_SEGMENT_SEC) {
    merged[1].start = 0;
    merged.shift();
  }
  return merged;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * 곡 안의 위치 → 공연자 위치·동작.
 * @param songTime 곡 시작부터 흐른 초
 * @param songLength 이 곡의 길이(초)
 */
export function performerStateInSong(songIndex: number, songTime: number, songLength: number, setlist: readonly Song[] = SETLIST): PerformerState {
  const idx = Math.max(0, Math.min(setlist.length - 1, songIndex));
  const length = Math.max(1, songLength);
  const t = Math.max(0, Math.min(length, songTime));
  const plan = songPlan(setlist[idx], length);
  let k = plan.findIndex((s) => t < s.end);
  if (k < 0) k = plan.length - 1;
  const here = plan[k];
  // 곡의 마지막 구간은 다음 곡 첫 자리로 걸어가야 곡이 바뀔 때 순간이동하지 않는다
  const nextSpot = k + 1 < plan.length ? plan[k + 1].spot : setlist[(idx + 1) % setlist.length].cues[0].spot;
  const from = SPOT_POSITIONS[here.spot];
  const to = SPOT_POSITIONS[nextSpot];

  // 거리만큼 걷는다(초속 WALK_SPEED_MPS). 구간이 짧으면 구간의 70% 안에 끝내야 해서 조금 서두른다
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  const segLen = here.end - here.start;
  const walk = Math.min(Math.max(WALK_MIN_SECONDS, dist / WALK_SPEED_MPS), segLen * 0.7);
  const into = t - here.start;
  const walkStart = segLen - walk;
  const w = into <= walkStart ? 0 : (into - walkStart) / walk;
  const moving = here.spot !== nextSpot && w > 0 && w < 1;
  const e = smoothstep(Math.max(0, Math.min(1, w)));

  return {
    songIndex: idx,
    x: from.x + (to.x - from.x) * e,
    z: from.z + (to.z - from.z) * e,
    facing: moving ? Math.atan2(to.x - from.x, to.z - from.z) : 0,
    motion: moving ? 'walk' : here.action,
  };
}
