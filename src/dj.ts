import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { LoadedAvatar } from './avatars.js';
import { bakeClips, CLIP_SECONDS } from './crowd.js';
import { STAGE_HEIGHT_M, STAGE_Z_M } from './show.constants.js';

/*
 * 돈 톨리버 무대의 DJ 부스. 그는 밴드 대신 DJ(투어 DJ 는 Dr. McDaniels)와 공연한다 — 실제 인물을 닮게 만들지 않는다.
 * 포스트 말론 밴드의 드럼 단 바로 앞, 무대 중앙 뒤쪽에 선다. 게스트 무대 동안만 보인다.
 */

const BOOTH_Z = STAGE_Z_M - 1.6;
const RISER_M = 0.5;
const DJ_HEIGHT_M = 1.8;

export interface DjBooth {
  group: THREE.Group;
  update(dt: number, t: number): void;
  setPresence(k: number): void;
}

export function createDjBooth(avatar: LoadedAvatar): DjBooth {
  const group = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: '#121318', roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9a9ea8', metalness: 0.9, roughness: 0.3 });

  const riser = new THREE.Mesh(new THREE.BoxGeometry(5, RISER_M, 3), black);
  riser.position.set(0, STAGE_HEIGHT_M + RISER_M / 2, BOOTH_Z);
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.8), black);
  table.position.set(0, STAGE_HEIGHT_M + RISER_M + 0.5, BOOTH_Z + 0.7);
  // 객석 쪽 면의 빛나는 띠 — 곡 색을 받는다
  const glowMat = new THREE.MeshBasicMaterial({ color: '#e0192d' });
  const glow = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.08, 0.02), glowMat);
  glow.position.set(0, STAGE_HEIGHT_M + RISER_M + 0.75, BOOTH_Z + 1.11);
  group.add(riser, table, glow);

  const platters: THREE.Mesh[] = [];
  for (const x of [-0.7, 0.7]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.5), metal);
    deck.position.set(x, STAGE_HEIGHT_M + RISER_M + 1.03, BOOTH_Z + 0.65);
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.3 }));
    platter.position.set(x, STAGE_HEIGHT_M + RISER_M + 1.07, BOOTH_Z + 0.65);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 16), new THREE.MeshBasicMaterial({ color: '#ffd400' }));
    platter.add(label);
    label.position.set(0.1, 0.001, 0);
    group.add(deck, platter);
    platters.push(platter);
  }
  const laptop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.02), new THREE.MeshBasicMaterial({ color: '#a8c7ff' }));
  laptop.position.set(0, STAGE_HEIGHT_M + RISER_M + 1.2, BOOTH_Z + 0.5);
  laptop.rotation.x = -0.3;
  group.add(laptop);

  // DJ: 부스 뒤에 서서 건반 치듯 턴테이블을 만진다('keys' 동작 재사용) + 헤드폰
  const clips = bakeClips(avatar, ['keys'] as const);
  const person = cloneSkinned(avatar.vrm.scene);
  person.scale.multiplyScalar(DJ_HEIGHT_M / avatar.sourceHeight);
  person.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // 관객 실루엣 처리(재질 공유)와 분리 — DJ 는 무대 조명을 받는다
    if (mesh.material) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
  });
  const holder = new THREE.Group();
  holder.position.set(0, STAGE_HEIGHT_M + RISER_M, BOOTH_Z);
  holder.add(person);
  const phones = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20, Math.PI), black);
  phones.position.set(0, DJ_HEIGHT_M * 0.97, 0);
  holder.add(phones);
  group.add(holder);
  const mixer = new THREE.AnimationMixer(person);
  const action = mixer.clipAction(clips.get('keys')!);
  action.time = Math.random() * CLIP_SECONDS;
  action.play();

  return {
    group,
    update(dt, t) {
      mixer.update(dt);
      for (const p of platters) p.rotation.y -= dt * 3.5; // 33⅓ rpm 쯤
      glowMat.color.setHSL(0.99, 0.85, 0.35 + 0.15 * Math.max(0, Math.sin(t * 10.87)));
    },
    setPresence(k) {
      group.visible = k > 0.02;
    },
  };
}
