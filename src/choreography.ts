import { SETLIST, SPOT_POSITIONS } from './setlist.js';
import type { PerformerAction, Song } from './setlist.js';
import { WALK_SECONDS } from './show.constants.js';

export type PerformerMotion = PerformerAction | 'walk';

export interface PerformerState {
  songIndex: number;
  x: number;
  z: number;
  /** y축 회전(라디안). 0 이면 객석(+z)을 본다 */
  facing: number;
  motion: PerformerMotion;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * 곡 안의 위치 → 공연자 위치·동작. 곡 길이가 실제 음원이든 30초 미리듣기든 같은 동선을 비율로 늘려 쓴다.
 * @param songTime 곡 시작부터 흐른 초
 * @param songLength 이 곡을 재생하는 길이(초)
 */
export function performerStateInSong(songIndex: number, songTime: number, songLength: number, setlist: readonly Song[] = SETLIST): PerformerState {
  const idx = Math.max(0, Math.min(setlist.length - 1, songIndex));
  const length = Math.max(1, songLength);
  const t = Math.max(0, Math.min(length, songTime));
  const cues = setlist[idx].cues;
  const segment = length / cues.length;
  const cueIndex = Math.min(cues.length - 1, Math.floor(t / segment));
  const into = t - cueIndex * segment;

  const here = cues[cueIndex];
  // 곡의 마지막 구간은 다음 곡 첫 지점으로 걸어가야 곡이 바뀔 때 순간이동하지 않는다
  const nextCue = cueIndex + 1 < cues.length ? cues[cueIndex + 1] : setlist[(idx + 1) % setlist.length].cues[0];
  const from = SPOT_POSITIONS[here.spot];
  const to = SPOT_POSITIONS[nextCue.spot];

  // 걷는 시간은 구간의 절반을 넘지 않게 — 30초 미리듣기처럼 짧은 곡에서도 서 있는 시간이 남는다
  const walk = Math.min(WALK_SECONDS, segment * 0.5);
  const walkStart = segment - walk;
  const w = into <= walkStart ? 0 : (into - walkStart) / walk;
  const moving = here.spot !== nextCue.spot && w > 0 && w < 1;
  const e = smoothstep(Math.max(0, Math.min(1, w)));

  return {
    songIndex: idx,
    x: from.x + (to.x - from.x) * e,
    z: from.z + (to.z - from.z) * e,
    facing: moving ? Math.atan2(to.x - from.x, to.z - from.z) : 0,
    motion: moving ? 'walk' : here.action,
  };
}
