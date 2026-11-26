import { RUNWAY_TIP_Z_M, STAGE_Z_M } from './show.constants.js';

export const STAGE_SPOTS = ['center', 'left', 'right', 'mid', 'tip'] as const;
export type StageSpot = (typeof STAGE_SPOTS)[number];

/** 서 있을 때 하는 동작. 걷는 중에는 항상 'walk' */
export const PERFORMER_ACTIONS = ['sing', 'strum', 'hype', 'sway'] as const;
export type PerformerAction = (typeof PERFORMER_ACTIONS)[number];

export interface SpotPosition {
  x: number;
  z: number;
}

// 무대 위 지점. 실제 무대 도면·직캠을 받으면 여기만 고친다.
export const SPOT_POSITIONS: Record<StageSpot, SpotPosition> = {
  center: { x: 0, z: STAGE_Z_M + 2 },
  left: { x: -15, z: STAGE_Z_M + 3 },
  right: { x: 15, z: STAGE_Z_M + 3 },
  mid: { x: 0, z: (RUNWAY_TIP_Z_M + STAGE_Z_M) / 2 },
  tip: { x: 0, z: RUNWAY_TIP_Z_M + 1.2 },
};

export interface SongCue {
  spot: StageSpot;
  action: PerformerAction;
}

/** 무대 색과 에너지. energy 가 높을수록 빔이 빠르고, 0.75 를 넘으면 레이저가 켜진다 */
export interface SongLook {
  a: string;
  b: string;
  energy: number;
}

export interface Song {
  title: string;
  /** 함께 부른 아티스트(음원 크레디트 기준) */
  feat?: string;
  /**
   * YouTube 영상 ID — 공식 채널(Post Malone·PostMaloneVEVO·Topic·함께 부른 아티스트 공식 채널)의 음원/가사 영상.
   * 뮤직비디오는 인트로가 길어 동선이 어긋나서 음원 영상을 우선했다. 모두 외부 임베드 허용(oEmbed)을 확인했다.
   */
  youtubeId: string;
  /** 음원 길이(밀리초, Spotify 기준) — 플레이어가 길이를 알려 주기 전까지 쓰는 값 */
  durationMs: number;
  look: SongLook;
  /**
   * 하이라이트(초). YouTube 영상의 "가장 많이 다시 본 구간" 그래프에서 처음 10% 를 빼고 높이 솟은 지점을
   * 최대 3개(25초 이상 간격) 고른 것 — 대개 후렴이다. 불꽃이 이때 터진다.
   */
  highlights: readonly number[];
  /** 곡을 같은 길이로 나눈 구간마다 서 있을 지점과 동작. 구간 끝에서 다음 지점으로 걷는다 */
  cues: readonly SongCue[];
}

const c = (spot: StageSpot, action: PerformerAction): SongCue => ({ spot, action });

/*
 * 세트리스트: 2026 스타디움 투어 첫 공연(2026-06-09 샬럿, Bank of America Stadium) 22곡 — Whiskey Riff 보도 기준,
 * setlist.fm 투어 평균(44회)과 핵심 순서가 같다. 서울 공연(10-02)은 같은 투어의 아시아 일정이었다.
 * 길이는 Spotify 임베드 페이지에서 읽었다. 재생은 YouTube 공식 영상으로 한다 —
 * intentionally: Spotify 임베드는 로그인 안 한 방문자에게 이 곡들의 재생 버튼을 비활성화해서(미리듣기 차단) 쓰지 않는다.
 * 동선(cues)은 아직 임의값 — 직캠을 보고 곡별로 교체한다.
 *
 * 이 배열 하나가 UI 목록·스크린 제목·무대 색·동선·재생을 모두 먹인다(단일 출처).
 */
export const SETLIST: readonly Song[] = [
  { title: 'Texas Tea', youtubeId: 'GvN1oCgFJhE', durationMs: 139_360, look: { a: '#ff7a1a', b: '#ffd27a', energy: 0.7 }, highlights: [38.5, 79.1],
    cues: [c('center', 'hype'), c('left', 'sing'), c('right', 'sing')] },
  { title: 'Wow.', youtubeId: 'NA4uIFbVCPM', durationMs: 149_520, look: { a: '#ff3b2f', b: '#ffb347', energy: 0.9 }, highlights: [21.9, 49.1, 106.5],
    cues: [c('center', 'hype'), c('mid', 'sing'), c('tip', 'hype')] },
  { title: 'Better Now', youtubeId: 'UYwF-jdcVjY', durationMs: 231_266, look: { a: '#2f6bff', b: '#9ad0ff', energy: 0.5 }, highlights: [24.5],
    cues: [c('tip', 'sing'), c('mid', 'sway'), c('center', 'sing'), c('left', 'sway')] },
  { title: 'Wrong Ones', feat: 'Tim McGraw', youtubeId: 'iZQuu6JJ8fQ', durationMs: 195_822, look: { a: '#c8732e', b: '#ffe2b0', energy: 0.4 }, highlights: [42.1, 100.9],
    cues: [c('center', 'strum'), c('right', 'strum'), c('center', 'sing')] },
  { title: 'Go Flex', youtubeId: 'vC2owoWdIUs', durationMs: 179_613, look: { a: '#18c29c', b: '#d6fff4', energy: 0.6 }, highlights: [38.9, 73.3, 116.7],
    cues: [c('center', 'sway'), c('left', 'sing'), c('center', 'sway')] },
  { title: "Hollywood's Bleeding", youtubeId: 'w5GrxfjuTTI', durationMs: 156_266, look: { a: '#b3001b', b: '#ff6b6b', energy: 0.6 }, highlights: [35.5, 73.5, 106.7],
    cues: [c('center', 'sing'), c('mid', 'sing'), c('center', 'hype')] },
  { title: 'I Fall Apart', youtubeId: 'gk0nB9vvYfU', durationMs: 223_346, look: { a: '#3a2cff', b: '#b7a8ff', energy: 0.5 }, highlights: [23.5, 54.9],
    cues: [c('tip', 'strum'), c('tip', 'sing'), c('mid', 'strum'), c('center', 'sing')] },
  { title: 'Losers', feat: 'Jelly Roll', youtubeId: 'uKiF-UMnB9A', durationMs: 209_038, look: { a: '#8a5a2b', b: '#f3d9a4', energy: 0.4 }, highlights: [40.9, 76.6],
    cues: [c('center', 'strum'), c('left', 'sing'), c('center', 'strum')] },
  { title: 'Goodbyes', feat: 'Young Thug', youtubeId: 'S4asq3SicN0', durationMs: 174_853, look: { a: '#ff8ac2', b: '#ffe0f0', energy: 0.5 }, highlights: [34.5, 59.6, 116.0],
    cues: [c('center', 'sway'), c('right', 'sing'), c('center', 'sway')] },
  { title: "What Don't Belong to Me", youtubeId: 'qvfssW5U_Ig', durationMs: 207_176, look: { a: '#6b4a2e', b: '#e8c99b', energy: 0.3 }, highlights: [48.9, 103.0, 152.9],
    cues: [c('tip', 'strum'), c('tip', 'sing'), c('tip', 'strum')] },
  { title: "I Ain't Comin' Back", feat: 'Morgan Wallen', youtubeId: '6oJkXrNYBA4', durationMs: 175_271, look: { a: '#d94f2b', b: '#ffcf9e', energy: 0.5 }, highlights: [43.1, 90.6, 127.6],
    cues: [c('center', 'sing'), c('left', 'sing'), c('right', 'sing')] },
  { title: 'Feeling Whitney', youtubeId: 'HZZuzTpFPxg', durationMs: 257_266, look: { a: '#1d3a6b', b: '#a9c8ff', energy: 0.2 }, highlights: [],
    cues: [c('tip', 'strum'), c('tip', 'strum'), c('tip', 'sing'), c('tip', 'strum')] },
  { title: 'Stay', youtubeId: '4Ukh9aQBzWc', durationMs: 204_426, look: { a: '#2b5d8a', b: '#d3ecff', energy: 0.2 }, highlights: [25.6, 56.4],
    cues: [c('tip', 'strum'), c('tip', 'sing'), c('tip', 'strum')] },
  { title: 'Circles', youtubeId: 'pQV0WEdT_OE', durationMs: 215_280, look: { a: '#00b3a4', b: '#c8fff4', energy: 0.5 }, highlights: [27.0, 61.6, 113.4],
    cues: [c('mid', 'sing'), c('center', 'strum'), c('left', 'sing'), c('right', 'sing')] },
  { title: 'White Iverson', youtubeId: 'XhmGfZ1SeuY', durationMs: 256_532, look: { a: '#e6e6e6', b: '#8fa3ff', energy: 0.5 }, highlights: [93.1, 118.6, 151.7],
    cues: [c('center', 'sway'), c('tip', 'sing'), c('mid', 'sway'), c('center', 'sing')] },
  { title: 'Psycho', feat: 'Ty Dolla $ign', youtubeId: 'MGYJuETPQEg', durationMs: 221_440, look: { a: '#7a2cff', b: '#ff4fd8', energy: 0.6 }, highlights: [30.0, 69.9, 123.2],
    cues: [c('right', 'sway'), c('center', 'sing'), c('left', 'sway'), c('center', 'sing')] },
  { title: 'Pour Me a Drink', feat: 'Blake Shelton', youtubeId: 'QL4-aYxCVAI', durationMs: 195_122, look: { a: '#c98a12', b: '#fff0b8', energy: 0.7 }, highlights: [44.1, 99.0, 146.0],
    cues: [c('center', 'hype'), c('right', 'sing'), c('left', 'sing')] },
  { title: 'Dead at the Honky Tonk', youtubeId: 'kkRKVqlocw8', durationMs: 213_225, look: { a: '#a83c2a', b: '#ffd0a8', energy: 0.6 }, highlights: [56.7, 108.1, 148.7],
    cues: [c('center', 'strum'), c('mid', 'sing'), c('center', 'strum')] },
  { title: 'rockstar', feat: '21 Savage', youtubeId: '4GFAZBKZVJY', durationMs: 218_320, look: { a: '#ff1e1e', b: '#ffffff', energy: 1.0 }, highlights: [64.3, 112.3],
    cues: [c('center', 'hype'), c('tip', 'hype'), c('mid', 'sing'), c('center', 'hype')] },
  { title: 'I Had Some Help', feat: 'Morgan Wallen', youtubeId: 'PCBZOSM8h5U', durationMs: 178_205, look: { a: '#ffb000', b: '#fff1c2', energy: 0.7 }, highlights: [47.4, 99.3, 144.1],
    cues: [c('center', 'sing'), c('left', 'hype'), c('right', 'sing')] },
  { title: 'Sunflower', feat: 'Swae Lee', youtubeId: 'ApXoWvfEYVU', durationMs: 158_040, look: { a: '#ffcc00', b: '#ff7a00', energy: 0.8 }, highlights: [31.6, 65.6],
    cues: [c('center', 'sway'), c('tip', 'hype'), c('center', 'sing')] },
  { title: 'Congratulations', feat: 'Quavo', youtubeId: 'R8vpQdZErbw', durationMs: 220_293, look: { a: '#ffd45a', b: '#ff5a5a', energy: 1.0 }, highlights: [32.0, 78.5, 111.6],
    cues: [c('center', 'sing'), c('tip', 'hype'), c('tip', 'sing'), c('tip', 'hype')] },
];
