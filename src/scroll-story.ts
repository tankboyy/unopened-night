/*
 * 스크롤 = 2026-10-02 하루. 섹션(data-phase)이 화면 가운데를 지나는 정도로 장면 값을 만든다.
 *   ticket(16:00 출발 전) → entry(18:30 입장) → blackout(19:58 암전) → show(20:00 본공연) → lights(22:40 객석 조명)
 * 3D 쪽은 이 값만 읽는다 — 섹션 순서·이름을 바꾸면 STORY_PHASES 와 index.html 을 같이 고친다(lockstep).
 */

export const STORY_PHASES = ['ticket', 'entry', 'blackout', 'show', 'lights'] as const;
export type StoryPhase = (typeof STORY_PHASES)[number];

export interface CameraPose {
  target: [number, number, number];
  radius: number;
  theta: number;
  phi: number;
}

export interface StoryFrame {
  phase: StoryPhase;
  /** 객석 조명 0~1. 입장 때는 반쯤 켜져 있고, 암전에서 0, 반전 장면에서 1 */
  house: number;
  /** 폰 불빛 0~1 */
  phones: number;
  /** 무대 조명·LED·공연자 0~1 */
  stage: number;
  /** 공연 구간이 아니면 스크롤이 정하는 카메라 자세. 공연 구간에서는 null(방문자가 시점을 고른다) */
  camera: CameraPose | null;
  /** HUD 시계 */
  clock: string;
  /** 공연 구간 안에서의 위치 0~1 = 세트리스트 타임라인 비율(timeline.ts) */
  showProgress: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => k * k * (3 - 2 * k);

// 스크롤 카메라 자세: 위에서 내려다본 빈 경기장 → 관객 뒤 눈높이 → 무대 쪽으로 한 걸음
const POSE_AERIAL: CameraPose = { target: [0, 0, -12], radius: 230, theta: 0.75, phi: 0.62 };
const POSE_ENTRY: CameraPose = { target: [0, 4, -44], radius: 78, theta: 0.22, phi: 1.5 };
const POSE_BLACKOUT: CameraPose = { target: [0, 4, -44], radius: 52, theta: 0.1, phi: 1.535 };

function mixPose(a: CameraPose, b: CameraPose, k: number): CameraPose {
  const e = ease(clamp01(k));
  return {
    target: [lerp(a.target[0], b.target[0], e), lerp(a.target[1], b.target[1], e), lerp(a.target[2], b.target[2], e)],
    radius: lerp(a.radius, b.radius, e),
    theta: lerp(a.theta, b.theta, e),
    phi: lerp(a.phi, b.phi, e),
  };
}

export interface ScrollStory {
  read(): StoryFrame;
  /** 공연 타임라인 비율 f 에 해당하는 페이지 스크롤 위치(px) — read().showProgress 의 역함수 */
  scrollYForShow(f: number): number;
  /** 마지막 장면(객석 조명) 섹션이 화면 가운데를 조금 지난 스크롤 위치(px) */
  scrollYForFinale(): number;
}

export function createScrollStory(root: ParentNode = document): ScrollStory {
  const sections = new Map<StoryPhase, HTMLElement>();
  for (const p of STORY_PHASES) {
    const el = root.querySelector<HTMLElement>(`[data-phase="${p}"]`);
    if (!el) throw new Error(`[story] missing section data-phase="${p}"`);
    sections.set(p, el);
  }

  /** 섹션 머리가 화면 가운데에 닿으면 0, 섹션 끝이 가운데를 지나면 1 */
  const progress = (p: StoryPhase): number => {
    const r = sections.get(p)!.getBoundingClientRect();
    return clamp01((innerHeight * 0.5 - r.top) / Math.max(1, r.height));
  };

  // progress() 와 같은 식을 scrollY 에 대해 푼 것: p = (vh/2 - (offsetTop - scrollY)) / height
  const scrollYFor = (p: StoryPhase, f: number): number => {
    const el = sections.get(p)!;
    const top = el.getBoundingClientRect().top + scrollY;
    return f * el.getBoundingClientRect().height + top - innerHeight * 0.5;
  };

  return {
    scrollYForShow: (f) => scrollYFor('show', clamp01(f)),
    scrollYForFinale: () => scrollYFor('lights', 0.45),
    read() {
      const pEntry = progress('entry');
      const pBlack = progress('blackout');
      const pLights = progress('lights');

      let phase: StoryPhase = 'ticket';
      for (const p of STORY_PHASES) if (sections.get(p)!.getBoundingClientRect().top < innerHeight * 0.5) phase = p;

      // 공연 구간은 22곡 길이라 진행도 비율로 켜면 두세 곡 뒤에야 다 켜진다 — 구간에 들어서는 순간 켠다(부드러움은 main 이 맡는다)
      const stageOn = phase === 'show' ? 1 : phase === 'lights' ? 1 - clamp01(pLights * 3) : 0;

      const frame: StoryFrame = {
        phase,
        house: phase === 'lights' ? clamp01(pLights * 2.5) : 0.4 * (1 - clamp01(pBlack * 1.6)),
        phones: phase === 'ticket' || phase === 'entry' ? 0 : phase === 'blackout' ? clamp01(pBlack * 1.3) : 1,
        stage: stageOn,
        camera: null,
        clock: '16:00',
        showProgress: progress('show'),
      };

      if (phase === 'ticket') {
        frame.camera = POSE_AERIAL;
      } else if (phase === 'entry') {
        frame.camera = mixPose(POSE_AERIAL, POSE_ENTRY, pEntry * 1.4);
        frame.clock = '18:30';
      } else if (phase === 'blackout') {
        frame.camera = mixPose(POSE_ENTRY, POSE_BLACKOUT, pBlack);
        frame.clock = '19:58';
      } else if (phase === 'show') {
        frame.clock = '20:00';
      } else {
        frame.clock = '22:40';
      }
      return frame;
    },
  };
}
