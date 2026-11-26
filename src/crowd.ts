import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';
import type { LoadedAvatar } from './avatars.js';
import { applyMotion, CROWD_MOTIONS } from './humanoid-motion.js';
import type { Motion } from './humanoid-motion.js';
import { makePhoneLights } from './stadium.js';
import { toFxLayer } from './layers.js';
import {
  BARRIER_GAP_M, CROWD_HEIGHT_MAX_M, CROWD_HEIGHT_MIN_M, RUNWAY_TIP_RADIUS_M, RUNWAY_TIP_Z_M, RUNWAY_WIDTH_M, STAGE_DEPTH_M, STAGE_Z_M,
} from './show.constants.js';

export interface CrowdOptions {
  nearCount: number;
  farCount: number;
  /** 가장 먼 줄 실루엣 관객 수 */
  silhouetteCount: number;
  glow: THREE.Texture;
}

export interface Crowd {
  group: THREE.Group;
  /** 원거리 관객 머리 위 폰 불빛 — 반짝임은 animatePhoneLights 가 맡는다 */
  farLights: THREE.Points;
  update(t: number, dt: number): void;
  /**
   * 0 = 역광 실루엣(공연 중), 1 = 객석 조명 아래 원래 색.
   * 반전 장면에서 검은 실루엣이던 관객이 얼굴과 색을 드러내는 연출에 쓴다.
   */
  setLit(k: number): void;
  /** 근거리 관객 손의 폰 불빛 밝기 0~1 — 입장 때는 꺼 두고 암전부터 켠다 */
  setPhones(k: number): void;
}

/** 공연 중 관객 밝기. 0 이면 완전히 검고, 무대 빛 번짐 앞에서 실루엣으로 읽힌다 */
const SILHOUETTE_LEVEL = 0.07;

interface Tintable {
  mat: THREE.Material & { color: THREE.Color };
  base: THREE.Color;
}

function collectTintables(root: THREE.Object3D, into: Tintable[], seen: Set<THREE.Material>): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const c = (mat as THREE.Material & { color?: THREE.Color }).color;
      // MToon 의 그림자색도 같이 눌러야 어두운 면이 떠 보이지 않는다
      const shade = (mat as THREE.Material & { shadeColorFactor?: THREE.Color }).shadeColorFactor;
      if (c) into.push({ mat: mat as Tintable['mat'], base: c.clone() });
      if (shade) into.push({ mat: { color: shade } as Tintable['mat'], base: shade.clone() });
    }
  });
}

// 2박(약 104 BPM) 길이로 구우면 박자 단위 동작(점프·환호)과 반박 동작(폰 흔들기)이 모두 이음매 없이 돈다
const BEAT_HZ = 1.73;
export const CLIP_SECONDS = 2 / BEAT_HZ;
const CLIP_FRAMES = 24;
/** 서로 겹치지 않게 사람 사이를 벌리는 간격 */
// 스탠딩석은 빽빽해야 한다(실제 1㎡ 당 2~3명). 0.78m 일 땐 듬성듬성해 보였다
const SPACING_M = 0.62;

interface Spot {
  x: number;
  z: number;
  /** 무대 앞으로부터의 거리 — 가까운 순으로 근거리 관객을 뽑는다 */
  rank: number;
}

/**
 * 사람이 서면 안 되는 곳인지 — 무대 앞 펜스 안쪽, 런웨이, 원형 무대(+펜스 여유).
 * trap: 예전엔 원형 무대(반지름 4m)를 런웨이 폭(±3m) 사각형으로만 빼서 원 가장자리에 사람이 박혀 보였다.
 */
export function isBlocked(x: number, z: number): boolean {
  const stageFront = STAGE_Z_M + STAGE_DEPTH_M / 2;
  if (z < stageFront + BARRIER_GAP_M + 0.6) return true;
  const runwayHalf = RUNWAY_WIDTH_M / 2 + BARRIER_GAP_M;
  if (Math.abs(x) < runwayHalf && z < RUNWAY_TIP_Z_M) return true;
  return Math.hypot(x, z - RUNWAY_TIP_Z_M) < RUNWAY_TIP_RADIUS_M + BARRIER_GAP_M;
}

/** 그라운드 스탠딩 구역에 사람을 세울 자리. 무대·런웨이 쪽이 더 앞 순위다 */
function standingSpots(total: number): Spot[] {
  const out: Spot[] = [];
  const zFront = STAGE_Z_M + STAGE_DEPTH_M / 2 + 1.5;
  const zBack = 34;
  for (let z = zFront; z < zBack; z += SPACING_M) {
    for (let x = -34; x <= 34; x += SPACING_M) {
      const jx = x + (Math.random() - 0.5) * 0.35;
      const jz = z + (Math.random() - 0.5) * 0.35;
      // 사람 몸 반지름(약 0.25m)만큼 더 비워 둔다
      if (isBlocked(jx, jz) || isBlocked(jx + Math.sign(jx || 1) * -0.25, jz)) continue;
      const toRunway = Math.hypot(Math.max(0, Math.abs(jx) - RUNWAY_WIDTH_M), Math.max(0, jz - RUNWAY_TIP_Z_M));
      out.push({ x: jx, z: jz, rank: Math.min(jz - zFront, toRunway) + Math.random() * 3 });
    }
  }
  out.sort((a, b) => a.rank - b.rank);
  return out.slice(0, total);
}

/**
 * 정규화 뼈대에 절차적 동작을 돌려 실제 뼈의 회전을 샘플링해 클립으로 굽는다.
 * 이렇게 해야 SkeletonUtils 복제본이 VRM 런타임 없이 AnimationMixer 만으로 움직인다(복제본에는 humanoid 가 없다).
 */
export function bakeClips<M extends Motion>(avatar: LoadedAvatar, motions: readonly M[]): Map<M, THREE.AnimationClip> {
  const h = avatar.vrm.humanoid;
  const bones = (Object.keys(h.humanBones) as VRMHumanBoneName[])
    .map((name) => h.getRawBoneNode(name))
    .filter((b): b is THREE.Object3D => b !== null);
  const hips = h.getRawBoneNode('hips');
  const clips = new Map<M, THREE.AnimationClip>();

  for (const motion of motions) {
    const times: number[] = [];
    const quats = bones.map(() => [] as number[]);
    const hipsPos: number[] = [];
    for (let f = 0; f <= CLIP_FRAMES; f++) {
      const t = (f / CLIP_FRAMES) * CLIP_SECONDS;
      times.push(t);
      applyMotion(h, motion, { t, phase: 0, hipsRestY: avatar.hipsRestY, vrm0: avatar.vrm0 });
      h.update();
      bones.forEach((b, i) => quats[i].push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w));
      if (hips) hipsPos.push(hips.position.x, hips.position.y, hips.position.z);
    }
    const tracks: THREE.KeyframeTrack[] = bones.map((b, i) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, quats[i]));
    if (hips) tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, hipsPos));
    clips.set(motion, new THREE.AnimationClip(`${motion}`, CLIP_SECONDS, tracks));
  }
  h.resetNormalizedPose();
  h.update();
  return clips;
}

/** 한 자세로 굳힌 정적 지오메트리 — 원거리 관객 인스턴싱용 */
function bakeStaticPose(avatar: LoadedAvatar): { geometry: THREE.BufferGeometry; material: THREE.Material } | null {
  const h = avatar.vrm.humanoid;
  applyMotion(h, 'phone', { t: 0.3, phase: 0, hipsRestY: avatar.hipsRestY, vrm0: avatar.vrm0 });
  h.update();
  avatar.vrm.scene.updateMatrixWorld(true);

  let found: THREE.SkinnedMesh | null = null;
  avatar.vrm.scene.traverse((o) => {
    if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh;
  });
  const mesh = found as THREE.SkinnedMesh | null;
  if (!mesh) return null;

  const src = mesh.geometry;
  const n = src.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const uv = src.getAttribute('uv');
  if (uv) geometry.setAttribute('uv', uv);
  if (src.index) geometry.setIndex(src.index);
  geometry.computeVertexNormals();

  const srcMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material & { map?: THREE.Texture | null };
  const material = new THREE.MeshLambertMaterial({ map: srcMat.map ?? null });

  h.resetNormalizedPose();
  h.update();
  return { geometry, material };
}

/** 원거리 관객이 박자에 맞춰 위아래로 뛰게 하는 셰이더 패치 */
function addBounce(material: THREE.Material, uTime: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float bounce = max(0.0, sin(uTime * ${(BEAT_HZ * Math.PI * 2).toFixed(4)} + float(gl_InstanceID) * 1.37));
        transformed.y += bounce * 0.14;`,
      );
  };
}

export function createCrowd(avatars: LoadedAvatar[], opts: CrowdOptions): Crowd {
  const group = new THREE.Group();
  const spots = standingSpots(opts.nearCount + opts.farCount + opts.silhouetteCount);
  const near = spots.slice(0, opts.nearCount);
  const far = spots.slice(opts.nearCount, opts.nearCount + opts.farCount);
  const sil = spots.slice(opts.nearCount + opts.farCount);

  const clipsByAvatar = avatars.map((a) => bakeClips(a, CROWD_MOTIONS));
  const mixers: THREE.AnimationMixer[] = [];
  const glowMat = new THREE.SpriteMaterial({ map: opts.glow, color: '#e6eeff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

  near.forEach((spot, i) => {
    const k = i % avatars.length;
    const avatar = avatars[k];
    const person = cloneSkinned(avatar.vrm.scene);
    const height = THREE.MathUtils.lerp(CROWD_HEIGHT_MIN_M, CROWD_HEIGHT_MAX_M, Math.random());
    person.scale.multiplyScalar(height / avatar.sourceHeight);
    const holder = new THREE.Group();
    holder.add(person);
    holder.position.set(spot.x, 0, spot.z);
    // 객석은 무대(-z)를 본다. 런웨이 쪽으로 고개를 조금씩 돌린다
    holder.rotation.y = Math.PI + Math.atan2(spot.x, 30) * 0.5 + (Math.random() - 0.5) * 0.3;
    group.add(holder);

    const motion = CROWD_MOTIONS[(Math.random() * CROWD_MOTIONS.length) | 0];
    const mixer = new THREE.AnimationMixer(person);
    const action = mixer.clipAction(clipsByAvatar[k].get(motion)!);
    action.time = Math.random() * CLIP_SECONDS;
    action.timeScale = 0.92 + Math.random() * 0.16;
    action.play();
    mixers.push(mixer);

    if (motion === 'phone') {
      // 복제본에서 같은 이름의 손 뼈를 찾아 불빛을 붙인다
      const handName = avatar.vrm.humanoid.getRawBoneNode('rightHand')?.name;
      const hand = handName ? person.getObjectByName(handName) : undefined;
      if (hand) {
        const s = new THREE.Sprite(glowMat);
        // 손 뼈 로컬 배율이 모델 축척에 묶여 있어서 월드 크기로 환산해 둔다
        s.scale.setScalar(0.2 / (height / avatar.sourceHeight));
        toFxLayer(s);
        hand.add(s);
      }
    }
  });

  const uTime = { value: 0 };
  const perType = Math.ceil(far.length / avatars.length);
  const lightPos: number[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  avatars.forEach((avatar, k) => {
    const baked = bakeStaticPose(avatar);
    if (!baked) return;
    addBounce(baked.material, uTime);
    const mine = far.filter((_, i) => i % avatars.length === k).slice(0, perType);
    const inst = new THREE.InstancedMesh(baked.geometry, baked.material, mine.length);
    mine.forEach((spot, i) => {
      const height = THREE.MathUtils.lerp(CROWD_HEIGHT_MIN_M, CROWD_HEIGHT_MAX_M, Math.random());
      sc.setScalar(height / avatar.sourceHeight);
      q.setFromEuler(new THREE.Euler(0, Math.PI + (Math.random() - 0.5) * 0.4, 0));
      m.compose(new THREE.Vector3(spot.x, 0, spot.z), q, sc);
      inst.setMatrixAt(i, m);
      lightPos.push(spot.x + (Math.random() - 0.5) * 0.3, height * 1.15, spot.z - 0.25);
    });
    inst.frustumCulled = false;
    group.add(inst);
  });
  // ─── 가장 먼 줄: 몸통 캡슐 + 머리 구의 가벼운 실루엣. 멀고 어두워서 모델 차이가 안 보인다 ───
  if (sil.length) {
    const body = new THREE.CapsuleGeometry(0.21, 0.95, 3, 8);
    body.translate(0, 0.21 + 0.475 + 0.05, 0);
    const head = new THREE.SphereGeometry(0.12, 8, 6);
    head.translate(0, 1.6, 0);
    const geo = mergeGeometries([body, head])!;
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    addBounce(mat, uTime);
    const silMesh = new THREE.InstancedMesh(geo, mat, sil.length);
    const c = new THREE.Color();
    sil.forEach((spot, i) => {
      const hgt = THREE.MathUtils.lerp(CROWD_HEIGHT_MIN_M, CROWD_HEIGHT_MAX_M, Math.random()) / 1.72;
      m.compose(new THREE.Vector3(spot.x, 0, spot.z), q.setFromEuler(new THREE.Euler(0, Math.random() * 6.28, 0)), sc.set(1, hgt, 1));
      silMesh.setMatrixAt(i, m);
      c.setHSL(Math.random(), 0.35, 0.25 + Math.random() * 0.25);
      silMesh.setColorAt(i, c);
      if (i % 2 === 0) lightPos.push(spot.x + (Math.random() - 0.5) * 0.3, hgt * 1.72 * 1.15, spot.z - 0.25);
    });
    silMesh.frustumCulled = false;
    group.add(silMesh);
  }

  const farLights = makePhoneLights(lightPos, 0.17, opts.glow);
  toFxLayer(farLights);
  group.add(farLights);

  // 복제본은 원본과 재질을 공유하므로 원본 아바타 재질만 바꾸면 그 종류의 근거리 관객이 전부 바뀐다
  const tintables: Tintable[] = [];
  const seen = new Set<THREE.Material>();
  for (const a of avatars) collectTintables(a.vrm.scene, tintables, seen);
  collectTintables(group, tintables, seen);
  // 폰 불빛(스프라이트·점)은 실루엣 대상이 아니다 — 어두워지면 객석 불빛이 같이 꺼진다
  const tints = tintables.filter((x) => !(x.mat instanceof THREE.SpriteMaterial) && !(x.mat instanceof THREE.PointsMaterial));

  return {
    group,
    farLights,
    update(t, dt) {
      uTime.value = t;
      for (const mx of mixers) mx.update(dt);
    },
    setPhones(k) {
      glowMat.opacity = k;
      glowMat.visible = k > 0.01;
    },
    setLit(k) {
      const level = SILHOUETTE_LEVEL + (1 - SILHOUETTE_LEVEL) * k;
      for (const x of tints) x.mat.color.copy(x.base).multiplyScalar(level);
    },
  };
}
