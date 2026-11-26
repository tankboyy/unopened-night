import type { VRMHumanBoneName, VRMHumanoid } from '@pixiv/three-vrm';
import type { PerformerMotion } from './choreography.js';

export const CROWD_MOTIONS = ['phone', 'jump', 'cheer', 'bob'] as const;
export type CrowdMotion = (typeof CROWD_MOTIONS)[number];
/** 밴드 연주 동작. 기타·베이스는 공연자와 같은 'strum' 을 쓴다 */
export const BAND_MOTIONS = ['drum', 'keys', 'fiddle', 'strum'] as const;
export type BandMotion = (typeof BAND_MOTIONS)[number];
export type Motion = PerformerMotion | CrowdMotion | BandMotion;

/*
 * 정규화된 VRM 휴머노이드 기준 회전 방향 (모델이 +z 를 보고 T 포즈로 선 상태):
 *  - 왼팔은 +x, 오른팔은 -x 로 뻗어 있다.
 *  - 팔 내리기: 왼팔 z-, 오른팔 z+ / 팔 들기: 왼팔 z+, 오른팔 z-
 *  - 팔꿈치를 앞으로 굽히기: 왼쪽 lowerArm y-, 오른쪽 lowerArm y+
 *  - 다리 앞으로: upperLeg x- (x+ 는 뒤로 차기)
 * trap #1: 이 부호를 하나라도 바꾸면 모든 동작이 거울상으로 뒤집힌다. 고칠 땐 화면으로 확인할 것.
 * trap #2: VRM 0.x 는 rotateVRM0 으로 부모가 180도 돌아가 있어서 정규화 뼈의 x·z 회전 부호가 반대로 먹는다.
 *          위 규칙은 VRM 1.0(정면 +z) 기준이고, setBone 이 ctx.vrm0 일 때 x·z 를 뒤집는다(three-vrm 의 mixamo 예제와 같은 처리).
 */

type Euler3 = readonly [number, number, number];

// 모듈 전역 대신 applyMotion 호출마다 설정한다 — 한 프레임 안에서 VRM0/1 모델이 섞여 호출될 수 있다
let mirrorXZ = 1;

function setBone(h: VRMHumanoid, name: VRMHumanBoneName, [x, y, z]: Euler3): void {
  const node = h.getNormalizedBoneNode(name);
  if (node) node.rotation.set(x * mirrorXZ, y, z * mirrorXZ);
}

function resetBones(h: VRMHumanoid): void {
  for (const name of POSED_BONES) setBone(h, name, [0, 0, 0]);
}

const POSED_BONES: readonly VRMHumanBoneName[] = [
  'spine', 'chest', 'neck', 'head',
  'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg',
];

/** 팔을 몸 옆으로 내린 기본 각도 */
const ARM_DOWN = 1.25;

export interface MotionContext {
  /** 초 단위 시계 */
  t: number;
  /** 사람마다 다른 위상 — 관객이 한 몸처럼 움직이지 않게 한다 */
  phase: number;
  /** 엉덩이 뼈의 휴식 높이(정규화 좌표). 점프·무릎 굽힘에 쓴다 */
  hipsRestY: number;
  /** VRM 0.x 모델이면 true — trap #2 */
  vrm0: boolean;
}

/**
 * 한 프레임의 자세를 정규화 뼈대에 쓴다. 호출 뒤 vrm.update()(또는 humanoid.update())가 실제 뼈로 옮긴다.
 * 비트는 대략 104 BPM 기준(1.73Hz) — 곡별 BPM 을 넣게 되면 여기 인자로 받는다.
 */
export function applyMotion(h: VRMHumanoid, motion: Motion, ctx: MotionContext): void {
  mirrorXZ = ctx.vrm0 ? -1 : 1;
  resetBones(h);
  const { t, phase } = ctx;
  const beat = t * Math.PI * 2 * 1.73 + phase;
  const hips = h.getNormalizedBoneNode('hips');
  let hipsOffset = 0;

  switch (motion) {
    case 'walk': {
      const s = Math.sin(t * 7.5 + phase);
      setBone(h, 'leftUpperLeg', [-s * 0.55, 0, 0]);
      setBone(h, 'rightUpperLeg', [s * 0.55, 0, 0]);
      setBone(h, 'leftLowerLeg', [Math.max(0, s) * 0.7, 0, 0]);
      setBone(h, 'rightLowerLeg', [Math.max(0, -s) * 0.7, 0, 0]);
      setBone(h, 'leftUpperArm', [s * 0.45, 0, -ARM_DOWN]);
      setBone(h, 'rightUpperArm', [-s * 0.45, 0, ARM_DOWN]);
      setBone(h, 'leftLowerArm', [0, -0.25, 0]);
      setBone(h, 'rightLowerArm', [0, 0.25, 0]);
      hipsOffset = Math.abs(Math.cos(t * 7.5 + phase)) * 0.03;
      break;
    }
    case 'sing': {
      // 오른손 마이크를 입 앞에, 왼팔은 박자에 맞춰 흔든다
      const b = Math.sin(beat);
      // 위팔은 앞으로 내리고, 아래팔을 세워 손(마이크)을 입 앞으로 가져온다
      setBone(h, 'rightUpperArm', [0, 1.45, 1.0]);
      setBone(h, 'rightLowerArm', [0, 1.15, -0.95]);
      setBone(h, 'leftUpperArm', [b * 0.15, -0.3, -0.8 + Math.max(0, b) * 0.35]);
      setBone(h, 'leftLowerArm', [0, -0.9, 0]);
      setBone(h, 'spine', [0.05, 0, b * 0.04]);
      setBone(h, 'head', [0.08 + Math.max(0, b) * 0.08, 0, 0]);
      kneeBounce(h, beat, 0.12);
      hipsOffset = -Math.max(0, Math.sin(beat)) * 0.025;
      break;
    }
    case 'strum': {
      // 왼손은 기타 넥, 오른손은 줄을 긁는다
      const strum = Math.sin(beat * 2);
      setBone(h, 'leftUpperArm', [0, -0.55, -0.35]);
      setBone(h, 'leftLowerArm', [0, -0.7, 0]);
      setBone(h, 'rightUpperArm', [0, 0.45, 1.05]);
      setBone(h, 'rightLowerArm', [0, 1.2 + strum * 0.25, 0]);
      setBone(h, 'spine', [0.1, 0, 0]);
      setBone(h, 'head', [0.15, 0, Math.sin(beat) * 0.05]);
      kneeBounce(h, beat, 0.08);
      break;
    }
    case 'hype': {
      // 오른팔을 박자마다 하늘로 찌른다
      const pump = Math.max(0, Math.sin(beat));
      setBone(h, 'rightUpperArm', [0, 0.2, -0.9 - pump * 0.5]);
      setBone(h, 'rightLowerArm', [0, 0.6 - pump * 0.5, 0]);
      setBone(h, 'leftUpperArm', [0, 0, -ARM_DOWN + 0.2]);
      setBone(h, 'leftLowerArm', [0, -0.4, 0]);
      setBone(h, 'head', [-0.1 + pump * 0.2, 0, 0]);
      kneeBounce(h, beat, 0.25);
      hipsOffset = -pump * 0.05;
      break;
    }
    case 'sway': {
      const s = Math.sin(beat / 2);
      setBone(h, 'spine', [0, 0, s * 0.08]);
      setBone(h, 'chest', [0, s * 0.1, 0]);
      setBone(h, 'head', [0.05, 0, -s * 0.08]);
      setBone(h, 'leftUpperArm', [0, -0.2, -ARM_DOWN + 0.1]);
      setBone(h, 'rightUpperArm', [0, 1.45, 1.0]);
      setBone(h, 'rightLowerArm', [0, 1.15, -0.95]);
      break;
    }
    case 'phone': {
      // 오른손에 든 폰을 머리 위 앞쪽으로
      const s = Math.sin(beat / 2);
      setBone(h, 'rightUpperArm', [0, 0.8, -1.0]);
      setBone(h, 'rightLowerArm', [0, 0.35, 0]);
      setBone(h, 'leftUpperArm', [0, 0, -ARM_DOWN]);
      setBone(h, 'spine', [0, 0, s * 0.05]);
      setBone(h, 'head', [-0.15, 0, 0]);
      break;
    }
    case 'jump': {
      const up = Math.max(0, Math.sin(beat));
      setBone(h, 'leftUpperArm', [0, 0, -0.3 + up * 1.4]);
      setBone(h, 'rightUpperArm', [0, 0, 0.3 - up * 1.4]);
      kneeBounce(h, beat + Math.PI, 0.4 * (1 - up));
      hipsOffset = up * 0.28 - (1 - up) * 0.06;
      break;
    }
    case 'cheer': {
      const w = Math.sin(beat);
      setBone(h, 'leftUpperArm', [0, 0, 1.0 + w * 0.25]);
      setBone(h, 'rightUpperArm', [0, 0, -1.0 + w * 0.25]);
      setBone(h, 'leftLowerArm', [0, 0, 0.3]);
      setBone(h, 'rightLowerArm', [0, 0, -0.3]);
      setBone(h, 'head', [-0.2, 0, 0]);
      kneeBounce(h, beat, 0.15);
      break;
    }
    case 'drum': {
      // 의자에 앉은 자세 + 두 스틱을 번갈아 내리친다
      const hit = Math.sin(beat * 2);
      setBone(h, 'leftUpperLeg', [-1.35, 0, 0]);
      setBone(h, 'rightUpperLeg', [-1.35, 0, 0]);
      setBone(h, 'leftLowerLeg', [1.35, 0, 0]);
      setBone(h, 'rightLowerLeg', [1.35, 0, 0]);
      setBone(h, 'leftUpperArm', [0, -0.6, -0.85]);
      setBone(h, 'rightUpperArm', [0, 0.6, 0.85]);
      setBone(h, 'leftLowerArm', [0, -0.9 - Math.max(0, hit) * 0.5, 0]);
      setBone(h, 'rightLowerArm', [0, 0.9 + Math.max(0, -hit) * 0.5, 0]);
      setBone(h, 'head', [0.1 + Math.abs(hit) * 0.08, 0, 0]);
      hipsOffset = -0.42;
      break;
    }
    case 'keys': {
      const b = Math.sin(beat);
      setBone(h, 'leftUpperArm', [0, -1.0, -0.95]);
      setBone(h, 'rightUpperArm', [0, 1.0, 0.95]);
      setBone(h, 'leftLowerArm', [0, -0.35 - Math.max(0, b) * 0.15, 0]);
      setBone(h, 'rightLowerArm', [0, 0.35 + Math.max(0, -b) * 0.15, 0]);
      setBone(h, 'spine', [0.12, 0, 0]);
      setBone(h, 'head', [0.15 + Math.max(0, b) * 0.1, 0, 0]);
      kneeBounce(h, beat, 0.06);
      break;
    }
    case 'fiddle': {
      // 왼손은 피들 목을 잡고 턱에 받치고, 오른손이 활을 긋는다
      const bow = Math.sin(beat);
      setBone(h, 'leftUpperArm', [0, -0.9, -0.05]);
      setBone(h, 'leftLowerArm', [0, -1.25, 0]);
      setBone(h, 'rightUpperArm', [0, 0.7, 0.55 + bow * 0.3]);
      setBone(h, 'rightLowerArm', [0, 1.15 + bow * 0.45, 0]);
      setBone(h, 'head', [0.1, 0, 0.3]);
      kneeBounce(h, beat, 0.06);
      break;
    }
    case 'bob': {
      const b = Math.max(0, Math.sin(beat));
      setBone(h, 'leftUpperArm', [0, -0.3, -ARM_DOWN + 0.1]);
      setBone(h, 'rightUpperArm', [0, 0.3, ARM_DOWN - 0.1]);
      setBone(h, 'leftLowerArm', [0, -0.8, 0]);
      setBone(h, 'rightLowerArm', [0, 0.8, 0]);
      setBone(h, 'head', [b * 0.25, 0, 0]);
      kneeBounce(h, beat, 0.12);
      break;
    }
  }

  if (hips) hips.position.y = ctx.hipsRestY + hipsOffset;
}

function kneeBounce(h: VRMHumanoid, beat: number, depth: number): void {
  const k = Math.max(0, Math.sin(beat)) * depth;
  setBone(h, 'leftUpperLeg', [-k, 0, 0]);
  setBone(h, 'rightUpperLeg', [-k, 0, 0]);
  setBone(h, 'leftLowerLeg', [k * 2, 0, 0]);
  setBone(h, 'rightLowerLeg', [k * 2, 0, 0]);
}
