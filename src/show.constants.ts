// 단위는 전부 미터·초. 무대는 -z 끝에 있고 객석은 +z 쪽에서 무대를 바라본다.

export const STAGE_Z_M = -52;
export const STAGE_HEIGHT_M = 1.8;
export const STAGE_WIDTH_M = 44;
export const STAGE_DEPTH_M = 16;
/**
 * 런웨이 끝 원형 무대의 중심 z. 이번 투어 무대는 런웨이가 그라운드 중앙(미드필드)까지 뻗는다
 * (그라운드 스탠딩 구역 z 약 -42~34 의 가운데).
 */
export const RUNWAY_TIP_Z_M = -8;
/** 원형 무대 반지름 */
export const RUNWAY_TIP_RADIUS_M = 4;
/** 런웨이·원형 무대와 관객 사이 펜스까지 여유 */
export const BARRIER_GAP_M = 1.2;
export const RUNWAY_WIDTH_M = 4;
export const RUNWAY_HEIGHT_M = 1.6;

/** 공연자·관객 키 정규화 기준 — 100 Avatars 원본은 모델마다 축척이 제각각이다 */
export const PERFORMER_HEIGHT_M = 1.85;
export const CROWD_HEIGHT_MIN_M = 1.55;
export const CROWD_HEIGHT_MAX_M = 1.85;

/** 실제 애니메이션을 돌리는 근거리 관객 수. 데스크톱 / 모바일 */
export const NEAR_CROWD_DESKTOP = 220;
export const NEAR_CROWD_MOBILE = 60;
/** 굳힌 자세를 인스턴싱하는 원거리 관객 수 */
export const FAR_CROWD_DESKTOP = 4_000;
export const FAR_CROWD_MOBILE = 1_500;
/** 가장 먼 줄의 가벼운 실루엣 관객(몸통+머리 몇백 면) — VRM 인스턴스를 더 늘리면 면 수가 수천만이 된다 */
export const SIL_CROWD_DESKTOP = 6_000;
export const SIL_CROWD_MOBILE = 2_000;
/** 스탠드 폰 불빛 점 개수 */
export const STAND_LIGHTS = 9_000;

/** 방문자가 스크롤을 멈췄다고 보는 시간 — 이만큼 조용하면 멈춘 자리부터 노래를 다시 튼다 */
export const SCRUB_SETTLE_MS = 350;
/** 무대 위를 걷는 속도(m/s) — 런웨이가 36m 라 고정 시간으로 걸으면 뛰어다니는 것처럼 보였다 */
export const WALK_SPEED_MPS = 3.5;
/** 아무리 가까워도 걷는 데 이만큼은 쓴다 */
export const WALK_MIN_SECONDS = 1.5;
/** 하이라이트 몇 초 전에 앞으로 나와 있을지, 몇 초 동안 머물지 */
export const HIGHLIGHT_LEAD_SEC = 3;
export const HIGHLIGHT_HOLD_SEC = 9;

export const MOBILE_BREAKPOINT_PX = 760;
