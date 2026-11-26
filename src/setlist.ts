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

export const ARTISTS = ['don-toliver', 'post-malone'] as const;
export type Artist = (typeof ARTISTS)[number];
export const ARTIST_NAMES: Record<Artist, string> = { 'don-toliver': 'Don Toliver', 'post-malone': 'Post Malone' };

export interface Song {
  title: string;
  /** 누구의 무대인가 — 공연자·밴드/DJ·시계가 이 값으로 바뀐다 */
  artist: Artist;
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
export const MAIN_SETLIST: readonly Song[] = [
  { title: 'Texas Tea', artist: 'post-malone', youtubeId: 'GvN1oCgFJhE', durationMs: 139_360, look: { a: '#ff7a1a', b: '#ffd27a', energy: 0.7 }, highlights: [38.5, 79.1],
    cues: [c('center', 'hype'), c('left', 'sing'), c('right', 'sing')] },
  { title: 'Wow.', artist: 'post-malone', youtubeId: 'NA4uIFbVCPM', durationMs: 149_520, look: { a: '#ff3b2f', b: '#ffb347', energy: 0.9 }, highlights: [21.9, 49.1, 106.5],
    cues: [c('center', 'hype'), c('mid', 'sing'), c('tip', 'hype')] },
  { title: 'Better Now', artist: 'post-malone', youtubeId: 'UYwF-jdcVjY', durationMs: 231_266, look: { a: '#2f6bff', b: '#9ad0ff', energy: 0.5 }, highlights: [24.5],
    cues: [c('tip', 'sing'), c('mid', 'sway'), c('center', 'sing'), c('left', 'sway')] },
  { title: 'Wrong Ones', feat: 'Tim McGraw', artist: 'post-malone', youtubeId: 'iZQuu6JJ8fQ', durationMs: 195_822, look: { a: '#c8732e', b: '#ffe2b0', energy: 0.4 }, highlights: [42.1, 100.9],
    cues: [c('center', 'strum'), c('right', 'strum'), c('center', 'sing')] },
  { title: 'Go Flex', artist: 'post-malone', youtubeId: 'vC2owoWdIUs', durationMs: 179_613, look: { a: '#18c29c', b: '#d6fff4', energy: 0.6 }, highlights: [38.9, 73.3, 116.7],
    cues: [c('center', 'sway'), c('left', 'sing'), c('center', 'sway')] },
  { title: "Hollywood's Bleeding", artist: 'post-malone', youtubeId: 'w5GrxfjuTTI', durationMs: 156_266, look: { a: '#b3001b', b: '#ff6b6b', energy: 0.6 }, highlights: [35.5, 73.5, 106.7],
    cues: [c('center', 'sing'), c('mid', 'sing'), c('center', 'hype')] },
  { title: 'I Fall Apart', artist: 'post-malone', youtubeId: 'gk0nB9vvYfU', durationMs: 223_346, look: { a: '#3a2cff', b: '#b7a8ff', energy: 0.5 }, highlights: [23.5, 54.9],
    cues: [c('tip', 'strum'), c('tip', 'sing'), c('mid', 'strum'), c('center', 'sing')] },
  { title: 'Losers', feat: 'Jelly Roll', artist: 'post-malone', youtubeId: 'uKiF-UMnB9A', durationMs: 209_038, look: { a: '#8a5a2b', b: '#f3d9a4', energy: 0.4 }, highlights: [40.9, 76.6],
    cues: [c('center', 'strum'), c('left', 'sing'), c('center', 'strum')] },
  { title: 'Goodbyes', feat: 'Young Thug', artist: 'post-malone', youtubeId: 'S4asq3SicN0', durationMs: 174_853, look: { a: '#ff8ac2', b: '#ffe0f0', energy: 0.5 }, highlights: [34.5, 59.6, 116.0],
    cues: [c('center', 'sway'), c('right', 'sing'), c('center', 'sway')] },
  { title: "What Don't Belong to Me", artist: 'post-malone', youtubeId: 'qvfssW5U_Ig', durationMs: 207_176, look: { a: '#6b4a2e', b: '#e8c99b', energy: 0.3 }, highlights: [48.9, 103.0, 152.9],
    cues: [c('tip', 'strum'), c('tip', 'sing'), c('tip', 'strum')] },
  { title: "I Ain't Comin' Back", feat: 'Morgan Wallen', artist: 'post-malone', youtubeId: '6oJkXrNYBA4', durationMs: 175_271, look: { a: '#d94f2b', b: '#ffcf9e', energy: 0.5 }, highlights: [43.1, 90.6, 127.6],
    cues: [c('center', 'sing'), c('left', 'sing'), c('right', 'sing')] },
  { title: 'Feeling Whitney', artist: 'post-malone', youtubeId: 'HZZuzTpFPxg', durationMs: 257_266, look: { a: '#1d3a6b', b: '#a9c8ff', energy: 0.2 }, highlights: [],
    cues: [c('tip', 'strum'), c('tip', 'strum'), c('tip', 'sing'), c('tip', 'strum')] },
  { title: 'Stay', artist: 'post-malone', youtubeId: '4Ukh9aQBzWc', durationMs: 204_426, look: { a: '#2b5d8a', b: '#d3ecff', energy: 0.2 }, highlights: [25.6, 56.4],
    cues: [c('tip', 'strum'), c('tip', 'sing'), c('tip', 'strum')] },
  { title: 'Circles', artist: 'post-malone', youtubeId: 'pQV0WEdT_OE', durationMs: 215_280, look: { a: '#00b3a4', b: '#c8fff4', energy: 0.5 }, highlights: [27.0, 61.6, 113.4],
    cues: [c('mid', 'sing'), c('center', 'strum'), c('left', 'sing'), c('right', 'sing')] },
  { title: 'White Iverson', artist: 'post-malone', youtubeId: 'XhmGfZ1SeuY', durationMs: 256_532, look: { a: '#e6e6e6', b: '#8fa3ff', energy: 0.5 }, highlights: [93.1, 118.6, 151.7],
    cues: [c('center', 'sway'), c('tip', 'sing'), c('mid', 'sway'), c('center', 'sing')] },
  { title: 'Psycho', feat: 'Ty Dolla $ign', artist: 'post-malone', youtubeId: 'MGYJuETPQEg', durationMs: 221_440, look: { a: '#7a2cff', b: '#ff4fd8', energy: 0.6 }, highlights: [30.0, 69.9, 123.2],
    cues: [c('right', 'sway'), c('center', 'sing'), c('left', 'sway'), c('center', 'sing')] },
  { title: 'Pour Me a Drink', feat: 'Blake Shelton', artist: 'post-malone', youtubeId: 'QL4-aYxCVAI', durationMs: 195_122, look: { a: '#c98a12', b: '#fff0b8', energy: 0.7 }, highlights: [44.1, 99.0, 146.0],
    cues: [c('center', 'hype'), c('right', 'sing'), c('left', 'sing')] },
  { title: 'Dead at the Honky Tonk', artist: 'post-malone', youtubeId: 'kkRKVqlocw8', durationMs: 213_225, look: { a: '#a83c2a', b: '#ffd0a8', energy: 0.6 }, highlights: [56.7, 108.1, 148.7],
    cues: [c('center', 'strum'), c('mid', 'sing'), c('center', 'strum')] },
  { title: 'rockstar', feat: '21 Savage', artist: 'post-malone', youtubeId: '4GFAZBKZVJY', durationMs: 218_320, look: { a: '#ff1e1e', b: '#ffffff', energy: 1.0 }, highlights: [64.3, 112.3],
    cues: [c('center', 'hype'), c('tip', 'hype'), c('mid', 'sing'), c('center', 'hype')] },
  { title: 'I Had Some Help', feat: 'Morgan Wallen', artist: 'post-malone', youtubeId: 'PCBZOSM8h5U', durationMs: 178_205, look: { a: '#ffb000', b: '#fff1c2', energy: 0.7 }, highlights: [47.4, 99.3, 144.1],
    cues: [c('center', 'sing'), c('left', 'hype'), c('right', 'sing')] },
  { title: 'Sunflower', feat: 'Swae Lee', artist: 'post-malone', youtubeId: 'ApXoWvfEYVU', durationMs: 158_040, look: { a: '#ffcc00', b: '#ff7a00', energy: 0.8 }, highlights: [31.6, 65.6],
    cues: [c('center', 'sway'), c('tip', 'hype'), c('center', 'sing')] },
  { title: 'Congratulations', feat: 'Quavo', artist: 'post-malone', youtubeId: 'R8vpQdZErbw', durationMs: 220_293, look: { a: '#ffd45a', b: '#ff5a5a', energy: 1.0 }, highlights: [32.0, 78.5, 111.6],
    cues: [c('center', 'sing'), c('tip', 'hype'), c('tip', 'sing'), c('tip', 'hype')] },
];

/*
 * 스페셜 게스트 돈 톨리버(서울 공연 공지 기준) — 2026 OCTANE 투어 1부 순서(2026-11-22 맨체스터, setlist.fm, 반복곡 제외).
 * 영상은 그의 공식 채널(비주얼라이저·음원 우선), 길이·하이라이트는 영상 기준.
 */
export const GUEST_SETLIST: readonly Song[] = [
  { title: 'E85', artist: 'don-toliver', youtubeId: '7GwLnsVUwHY', durationMs: 153_000, look: { a: '#e0192d', b: '#ffffff', energy: 0.9 }, highlights: [23.9, 65.5, 104.0],
    cues: [c('center', 'hype'), c('mid', 'sing'), c('center', 'sway')] },
  { title: 'OPPOSITE', artist: 'don-toliver', youtubeId: 'duBbCDGVHY8', durationMs: 158_000, look: { a: '#7a1cff', b: '#ff5ad1', energy: 0.6 }, highlights: [43.4],
    cues: [c('center', 'sing'), c('left', 'sway'), c('center', 'sing')] },
  { title: 'Secondhand', feat: 'Rema', artist: 'don-toliver', youtubeId: 'iHLsnHMVXck', durationMs: 227_000, look: { a: '#ff8a00', b: '#ffe1a8', energy: 0.5 }, highlights: [82.9, 148.7],
    cues: [c('center', 'sway'), c('right', 'sing'), c('center', 'hype')] },
  { title: 'Party with the Boys', artist: 'don-toliver', youtubeId: '4MBPquFUdsM', durationMs: 155_000, look: { a: '#e0192d', b: '#ffd400', energy: 0.9 }, highlights: [],
    cues: [c('center', 'hype'), c('mid', 'sing'), c('center', 'sway')] },
  { title: 'ATM', artist: 'don-toliver', youtubeId: 'deeMQwM0u6c', durationMs: 181_000, look: { a: '#00c46a', b: '#d4ffe6', energy: 0.8 }, highlights: [22.6, 64.3, 91.4],
    cues: [c('center', 'sing'), c('left', 'sway'), c('center', 'sing')] },
  { title: 'Call Back', artist: 'don-toliver', youtubeId: 'gQRGQynSWmg', durationMs: 124_000, look: { a: '#2a6bff', b: '#bcd3ff', energy: 0.5 }, highlights: [31.6],
    cues: [c('center', 'sway'), c('right', 'sing'), c('center', 'hype')] },
  { title: 'Cardigan', artist: 'don-toliver', youtubeId: '7WLt74z_TkI', durationMs: 181_000, look: { a: '#a0003a', b: '#ff9ab8', energy: 0.6 }, highlights: [22.6, 60.6, 127.6],
    cues: [c('center', 'hype'), c('mid', 'sing'), c('center', 'sway')] },
  { title: 'No Idea', artist: 'don-toliver', youtubeId: '_r-nPqWGG6c', durationMs: 153_000, look: { a: '#4b1d8a', b: '#c9a8ff', energy: 0.6 }, highlights: [28.5, 60.8],
    cues: [c('center', 'sing'), c('left', 'sway'), c('center', 'sing')] },
  { title: 'You', feat: 'Travis Scott', artist: 'don-toliver', youtubeId: 'XkQ1pltpQnw', durationMs: 214_000, look: { a: '#c79a3a', b: '#fff0c8', energy: 0.5 }, highlights: [150.9],
    cues: [c('center', 'sway'), c('right', 'sing'), c('center', 'hype')] },
  { title: 'Body', artist: 'don-toliver', youtubeId: 'Y92toVGxfqs', durationMs: 156_000, look: { a: '#ff2d55', b: '#ffe0e6', energy: 0.8 }, highlights: [16.4, 72.5],
    cues: [c('center', 'hype'), c('mid', 'sing'), c('center', 'sway')] },
  { title: 'Gemstone', artist: 'don-toliver', youtubeId: 'Ttwvz7QY4cg', durationMs: 122_000, look: { a: '#00b3c7', b: '#d0fbff', energy: 0.6 }, highlights: [14.0],
    cues: [c('center', 'sing'), c('left', 'sway'), c('center', 'sing')] },
  { title: 'Excavator', artist: 'don-toliver', youtubeId: 'kp47qpqpPGs', durationMs: 211_000, look: { a: '#ffb000', b: '#2b2b2b', energy: 0.85 }, highlights: [39.2, 136.7],
    cues: [c('center', 'sway'), c('right', 'sing'), c('center', 'hype')] },
  { title: 'TORE UP', artist: 'don-toliver', youtubeId: 'jQGqtCalg9Y', durationMs: 127_000, look: { a: '#ff1a1a', b: '#ffffff', energy: 1.0 }, highlights: [19.8, 73.6],
    cues: [c('center', 'hype'), c('mid', 'sing'), c('center', 'sway')] },
  { title: 'K9', feat: 'SahBabii', artist: 'don-toliver', youtubeId: 'vA9yex0-ntI', durationMs: 154_000, look: { a: '#e0192d', b: '#111111', energy: 0.95 }, highlights: [30.2, 59.7],
    cues: [c('center', 'sing'), c('left', 'sway'), c('center', 'sing')] },
];

/** 공연 전체: 20:00 게스트 무대 → 21:20 포스트 말론. 타임라인·스크롤·재생은 이 순서를 그대로 쓴다 */
export const SETLIST: readonly Song[] = [...GUEST_SETLIST, ...MAIN_SETLIST];
/** 포스트 말론 첫 곡의 SETLIST 번호 */
export const MAIN_START_INDEX = GUEST_SETLIST.length;
/** 무대 시각: 게스트 20:00, 포스트 말론 21:20 (22:40 객석 조명과 맞춘 값 — 포스트 말론 세트가 약 74분) */
export const SET_START_CLOCK_MIN: Record<Artist, number> = { 'don-toliver': 20 * 60, 'post-malone': 21 * 60 + 20 };
