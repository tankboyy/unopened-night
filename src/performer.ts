import * as THREE from 'three';
import type { LoadedAvatar } from './avatars.js';
import type { PerformerState } from './choreography.js';
import { applyMotion } from './humanoid-motion.js';
import { buildCaricatureHead } from './performer-head.js';
import type { HeadModel } from './performer-head-model.js';
import { skinBodyOnto } from './performer-body-model.js';
import type { BodyModel } from './performer-body-model.js';
import { PERFORMER_HEIGHT_M, RUNWAY_HEIGHT_M, STAGE_DEPTH_M, STAGE_HEIGHT_M, STAGE_Z_M } from './show.constants.js';

export interface Performer {
  root: THREE.Group;
  update(state: PerformerState, t: number, dt: number): void;
  /** 0 이면 완전히 사라진다(객석 조명 반전) */
  setPresence(k: number): void;
}

/*
 * 몸은 100 Avatars 'Bruno'(CC0)의 청바지·부츠 체형을 쓰고, 머리는 원본을 숨긴 뒤
 * performer-head.ts 의 캐리커처 머리로 갈아 끼운다. 소품은 빨간 일렉 기타 · 마이크.
 * 실제 인물 사진·텍스처는 쓰지 않는다 — 공개 저장소·갤러리 규칙(외부 자료 권리) 때문에 의도적으로 제외.
 */

/** 더블컷 일렉 기타. 밴드의 기타·베이스도 색만 바꿔 쓴다 */
export function buildGuitar(bodyColor = '#b3261e', neckLength = 0.5): THREE.Group {
  const g = new THREE.Group();
  const bodyShape = new THREE.Shape();
  // 더블컷 일렉 기타 몸통 실루엣
  bodyShape.absellipse(0, -0.08, 0.17, 0.15, 0, Math.PI * 2, false, 0);
  const upper = new THREE.Path();
  upper.absellipse(0, 0.1, 0.13, 0.11, 0, Math.PI * 2, false, 0);
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(bodyShape, { depth: 0.045, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.1 }),
  );
  const upperBody = new THREE.Mesh(
    new THREE.ExtrudeGeometry(new THREE.Shape(upper.getPoints(24)), { depth: 0.045, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }),
    body.material,
  );
  const pick = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshStandardMaterial({ color: '#f1ece2' }));
  pick.position.set(0.04, -0.06, 0.057);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, neckLength, 0.025), new THREE.MeshStandardMaterial({ color: '#5a3a22' }));
  neck.position.set(0, 0.17 + neckLength / 2, 0.03);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.14, 0.02), new THREE.MeshStandardMaterial({ color: '#1a1a20' }));
  head.position.set(0, 0.24 + neckLength, 0.03);
  g.add(body, upperBody, pick, neck, head);
  return g;
}

function buildMic(): THREE.Group {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#2a2a30', metalness: 0.6, roughness: 0.4 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.16, 12), metal);
  const grille = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), new THREE.MeshStandardMaterial({ color: '#b8b8c0', metalness: 0.8, roughness: 0.3 }));
  grille.position.y = 0.09;
  g.add(handle, grille);
  return g;
}

/** 휴식 자세에서 월드 기준으로 놓은 뒤 뼈에 붙인다 — 뼈 로컬 축이 모델마다 달라서 로컬 좌표를 직접 쓰면 틀어진다 */
function attachAtRest(bone: THREE.Object3D, obj: THREE.Object3D, worldPos: THREE.Vector3, worldQuat = new THREE.Quaternion()): void {
  obj.position.copy(worldPos);
  obj.quaternion.copy(worldQuat);
  obj.updateMatrixWorld(true);
  bone.attach(obj);
}

/** 머리 뼈(목 끝)에서 눈까지의 높이 */
const EYE_ABOVE_HEAD_BONE_M = 0.085;
/** 코드 캐리커처 머리는 원점이 머리 중심 */
const CARICATURE_CENTER_UP_M = 0.1;

/**
 * @param headModel AI 생성 머리. 불러오기에 실패하면 null 을 넘기고, 그때는 코드로 그린 캐리커처 머리로 대신한다.
 * @param bodyModel AI 생성 몸. null 이면 바탕 아바타(Bruno) 몸을 그대로 쓴다.
 */
export function createPerformer(avatar: LoadedAvatar, headModel: HeadModel | null, bodyModel: BodyModel | null): Performer {
  const { vrm } = avatar;
  const root = new THREE.Group();
  const scale = PERFORMER_HEIGHT_M / avatar.sourceHeight;
  vrm.scene.scale.setScalar(scale);
  root.add(vrm.scene);
  root.updateMatrixWorld(true);
  vrm.update(0);
  root.updateMatrixWorld(true);

  const h = vrm.humanoid;
  const headBone = h.getRawBoneNode('head')!;
  const chestBone = h.getRawBoneNode('upperChest') ?? h.getRawBoneNode('chest') ?? h.getRawBoneNode('spine')!;
  const handBone = h.getRawBoneNode('rightHand')!;
  const chestPos = chestBone.getWorldPosition(new THREE.Vector3());
  const handPos = handBone.getWorldPosition(new THREE.Vector3());

  // 몸 이식은 휴식(T) 자세에서, 머리 뼈를 접기 전에 해야 한다 — 가중치를 가까운 정점에서 복사하기 때문
  if (bodyModel) {
    try {
      skinBodyOnto(vrm.scene, bodyModel);
    } catch (err) {
      console.warn('[performer] AI body skinning failed, keeping base body', err);
    }
  }

  // 원본 머리는 뼈 배율을 0 가까이 줄여 접어 버린다(머리카락 흔들림 뼈도 자식이라 같이 접힌다).
  // 그래서 새 머리를 머리 뼈 자식으로 두면 같이 사라진다 — 대신 매 프레임 머리 뼈 위치·회전을 따라가게 한다.
  const headRestQ = headBone.getWorldQuaternion(new THREE.Quaternion());
  const headRestInv = headRestQ.clone().invert();
  headBone.scale.setScalar(0.001);
  const newHead = headModel ? headModel.object : buildCaricatureHead();
  const headUp = headModel ? EYE_ABOVE_HEAD_BONE_M - headModel.eyeHeightM : CARICATURE_CENTER_UP_M;
  root.add(newHead);
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const rootInv = new THREE.Quaternion();
  const followHead = (): void => {
    root.updateMatrixWorld(true);
    headBone.getWorldPosition(tmpP);
    root.worldToLocal(tmpP);
    root.getWorldQuaternion(rootInv).invert();
    // 휴식 자세 대비 회전량만 옮긴다 — 뼈 자체의 축 방향은 모델마다 달라서 그대로 쓰면 머리가 눕는다
    headBone.getWorldQuaternion(tmpQ).premultiply(rootInv).multiply(headRestInv);
    newHead.quaternion.copy(tmpQ);
    newHead.position.copy(tmpP).add(new THREE.Vector3(0, headUp, 0).applyQuaternion(tmpQ));
  };
  followHead();

  // 객석 앞 팔로우 스폿: LED 역광만 받으면 얼굴이 검게 묻힌다. 공연자를 따라 움직이도록 root 에 단다
  const keyLight = new THREE.SpotLight('#fff1dc', 5, 9, 0.5, 0.6, 1.2);
  keyLight.position.set(0.6, 3.2, 3.2);
  keyLight.target.position.set(0, 1.6, 0);
  root.add(keyLight, keyLight.target);
  const guitar = buildGuitar();
  attachAtRest(chestBone, guitar, chestPos.clone().add(new THREE.Vector3(-0.02, -0.28, 0.16)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.95)));
  const mic = buildMic();
  attachAtRest(handBone, mic, handPos.clone().add(new THREE.Vector3(-0.02, 0.02, 0.04)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)));

  const materials: THREE.Material[] = [];
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      mat.transparent = true;
      materials.push(mat);
    }
  });

  let facing = 0;
  return {
    root,
    update(state, t, dt) {
      applyMotion(h, state.motion, { t, phase: 0, hipsRestY: avatar.hipsRestY, vrm0: avatar.vrm0 });
      vrm.update(dt);
      followHead();
      guitar.visible = state.motion === 'strum';
      mic.visible = state.motion === 'sing' || state.motion === 'sway';
      // 무대 본체와 런웨이 높이가 달라서 서 있는 z 로 발 높이를 고른다
      const onRunway = state.z > STAGE_Z_M + STAGE_DEPTH_M / 2;
      root.position.set(state.x, onRunway ? RUNWAY_HEIGHT_M : STAGE_HEIGHT_M, state.z);
      let d = state.facing - facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      facing += d * Math.min(1, dt * 6);
      root.rotation.y = facing;
    },
    setPresence(k) {
      keyLight.intensity = 5 * k;
      for (const m of materials) m.opacity = k;
      root.visible = k > 0.01;
    },
  };
}
