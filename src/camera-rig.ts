import * as THREE from 'three';
import { RUNWAY_TIP_Z_M, STAGE_Z_M } from './show.constants.js';
import type { CameraPose } from './scroll-story.js';

export const CAMERA_VIEWS = ['stand', 'close', 'seat', 'all', 'empty', 'face', 'smash'] as const;
export type CameraView = (typeof CAMERA_VIEWS)[number];

/*
 * 날아다니는 1인칭 카메라. 공연 구간에서는 방문자가 직접 움직인다:
 *   W/S 앞뒤 · A/D 좌우 · Q/E(또는 Space/C) 아래위 · Shift 빠르게 · 마우스 끌기로 둘러보기
 * 시점 프리셋·스크롤 연출은 "목표를 이렇게 바라보는 자리"(궤도 표현)로 적고, 그 자리로 부드럽게 날아간다.
 */

interface Orbit {
  target: [number, number, number];
  radius: number;
  /** 수평 각도. 0 이면 +z(객석 뒤)에서 무대를 본다 */
  theta: number;
  /** 천정각. 작을수록 위에서 내려다본다 */
  phi: number;
}

const PRESETS: Record<CameraView, Orbit> = {
  // 런웨이 오른쪽 스탠딩 중간쯤, 앞사람 머리 너머로 무대를 보는 눈높이.
  // 런웨이가 미드필드(z≈-8)까지 뻗으므로 원형 무대 뒤 관객 속(z≈15)에 선다
  stand: { target: [0, 4.5, STAGE_Z_M + 8], radius: 60, theta: 0.14, phi: 1.535 },
  // 'close' 의 target 은 track() 이 매 프레임 공연자 위치로 덮어쓴다
  close: { target: [0, 2.8, RUNWAY_TIP_Z_M - 2], radius: 5.5, theta: 0.35, phi: 1.42 },
  seat: { target: [0, 3, STAGE_Z_M + 8], radius: 105, theta: 0.7, phi: 1.2 },
  all: { target: [0, 0, -6], radius: 200, theta: 0.5, phi: 0.85 },
  // 얼굴 확인용 초근접(개발 전용 ?face=1). target 은 track() 이 덮어쓴다
  face: { target: [0, 3.5, STAGE_Z_M + 4], radius: 1.1, theta: 0.0, phi: 1.52 },
  // 기타 부수기: 원형 무대를 객석 앞줄 높이에서 — 내리칠 바닥이 화면 아래쪽에 들어오게
  smash: { target: [0, 3.2, RUNWAY_TIP_Z_M], radius: 9.5, theta: 0.0, phi: 1.36 },
  // 반전 장면: 런웨이 끝 빈 마이크 스탠드를 관객 눈높이에서
  empty: { target: [0, 2.4, RUNWAY_TIP_Z_M - 0.8], radius: 11, theta: 0.18, phi: 1.47 },
};

/** 걷는 속도(m/s). Shift 를 누르면 FAST_MULT 배 */
const MOVE_SPEED = 14;
const FAST_MULT = 3.5;
const LOOK_SPEED = 0.0035;
const MAX_PITCH = 1.45;
/** 프리셋·스크롤 자세로 미끄러지는 정도(프레임당) */
const EASE = 0.07;
/** 경기장 밖으로 날아가지 않게 */
const BOUNDS = new THREE.Box3(new THREE.Vector3(-170, 0.6, -75), new THREE.Vector3(170, 140, 160));

const MOVE_KEYS: Record<string, [number, number, number]> = {
  KeyW: [0, 0, 1], KeyS: [0, 0, -1], KeyA: [-1, 0, 0], KeyD: [1, 0, 0],
  KeyE: [0, 1, 0], Space: [0, 1, 0], KeyQ: [0, -1, 0], KeyC: [0, -1, 0],
};

interface Fly {
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
}

function orbitToFly(o: { target: [number, number, number] | THREE.Vector3; radius: number; theta: number; phi: number }): Fly {
  const t = Array.isArray(o.target) ? new THREE.Vector3(...o.target) : o.target.clone();
  const s = Math.sin(o.phi);
  const pos = new THREE.Vector3(t.x + o.radius * s * Math.sin(o.theta), t.y + o.radius * Math.cos(o.phi), t.z + o.radius * s * Math.cos(o.theta));
  const d = t.clone().sub(pos).normalize();
  return { pos, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) };
}

const lookDir = (yaw: number, pitch: number): THREE.Vector3 =>
  new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

export interface CameraRig {
  setView(view: CameraView): void;
  /** 스크롤 연출이 직접 정한 자세로 미끄러진다. 프리셋 추적은 멈춘다 */
  setPose(pose: CameraPose): void;
  /** 근접 시점일 때만 이 위치를 따라간다 */
  track(focus: THREE.Vector3): void;
  /** 공연 구간에서만 켠다 — 다른 구간에서 WASD·끌기가 스크롤 연출과 싸우지 않게 */
  setControlsEnabled(on: boolean): void;
  /** 순간적으로 화면을 흔든다(0~1) */
  shake(k: number): void;
  update(dt: number): void;
}

export function createCameraRig(camera: THREE.PerspectiveCamera, el: HTMLElement): CameraRig {
  const cur: Fly = orbitToFly(PRESETS.stand);
  const goal: Fly = { pos: cur.pos.clone(), yaw: cur.yaw, pitch: cur.pitch };
  let view: CameraView | null = 'stand';
  let enabled = false;
  let shakeAmt = 0;
  const held = new Set<string>();

  // ─── 키보드 ───
  addEventListener('keydown', (e) => {
    if (!enabled || !(e.code in MOVE_KEYS || e.code.startsWith('Shift'))) return;
    // 입력창에 쓰는 중이면 가로채지 않는다
    if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return;
    if (e.code === 'Space') e.preventDefault(); // 페이지가 한 화면씩 넘어가지 않게
    held.add(e.code);
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());

  // ─── 마우스 끌기·두 손가락 ───
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  el.addEventListener('pointerdown', (e) => {
    if (!enabled) return;
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  el.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev || !enabled) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      view = null;
      goal.yaw -= (e.clientX - prev.x) * LOOK_SPEED;
      goal.pitch = THREE.MathUtils.clamp(goal.pitch - (e.clientY - prev.y) * LOOK_SPEED, -MAX_PITCH, MAX_PITCH);
    } else if (pointers.size === 2) {
      // 두 손가락을 벌리면 앞으로, 오므리면 뒤로
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart) {
        view = null;
        goal.pos.addScaledVector(lookDir(goal.yaw, goal.pitch), (d - pinchStart) * 0.08);
      }
      pinchStart = d;
    }
  });
  const release = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  const aimAt = (f: Fly): void => {
    goal.pos.copy(f.pos);
    // 한 바퀴 돌아가지 않게 가까운 방향으로 각도를 맞춘다
    goal.yaw = cur.yaw + Math.atan2(Math.sin(f.yaw - cur.yaw), Math.cos(f.yaw - cur.yaw));
    goal.pitch = f.pitch;
  };

  return {
    setView(next) {
      view = next;
      aimAt(orbitToFly(PRESETS[next]));
    },
    setPose(p) {
      view = null;
      aimAt(orbitToFly(p));
    },
    track(focus) {
      if (view !== 'close' && view !== 'face') return;
      const preset = PRESETS[view];
      const target = view === 'face' ? focus.clone().setY(focus.y + 0.2) : focus;
      aimAt(orbitToFly({ ...preset, target }));
    },
    shake(k) {
      shakeAmt = Math.max(shakeAmt, k);
    },
    setControlsEnabled(on) {
      enabled = on;
      if (!on) {
        held.clear();
        pointers.clear();
      }
    },
    update(dt) {
      // ─── WASD: 바라보는 수평 방향 기준으로 움직인다 ───
      const move = new THREE.Vector3();
      for (const code of held) {
        const m = MOVE_KEYS[code];
        if (m) move.add(new THREE.Vector3(...m));
      }
      if (move.lengthSq() > 0) {
        view = null;
        const fast = held.has('ShiftLeft') || held.has('ShiftRight') ? FAST_MULT : 1;
        const fwd = new THREE.Vector3(Math.sin(goal.yaw), 0, Math.cos(goal.yaw));
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const step = MOVE_SPEED * fast * dt;
        goal.pos.addScaledVector(fwd, move.z * step).addScaledVector(right, move.x * step);
        goal.pos.y += move.y * step;
        // 직접 움직일 때는 미끄러짐 없이 바로 따라가야 조작감이 산다
        cur.pos.copy(goal.pos);
      }
      goal.pos.clamp(BOUNDS.min, BOUNDS.max);

      cur.pos.lerp(goal.pos, EASE);
      cur.yaw += (goal.yaw - cur.yaw) * Math.min(1, EASE * 2.5);
      cur.pitch += (goal.pitch - cur.pitch) * Math.min(1, EASE * 2.5);
      camera.position.copy(cur.pos);
      camera.lookAt(cur.pos.clone().add(lookDir(cur.yaw, cur.pitch)));
      if (shakeAmt > 0.001) {
        camera.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), 0).multiplyScalar(shakeAmt * 0.35));
        shakeAmt *= Math.exp(-dt * 6);
      }
    },
  };
}
