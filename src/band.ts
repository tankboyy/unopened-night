import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { LoadedAvatar } from './avatars.js';
import { bakeClips, CLIP_SECONDS } from './crowd.js';
import type { BandMotion } from './humanoid-motion.js';
import { buildGuitar } from './performer.js';
import { STAGE_HEIGHT_M, STAGE_Z_M } from './show.constants.js';

/*
 * 밴드(The Fools For You) — 컨트리 편성: 드럼 · 베이스 · 일렉 기타 · 키보드 · 페달 스틸 · 피들.
 * 실제 멤버를 닮게 만들지 않는다. 관객용 100 Avatars(CC0) 중 일부를 빌려 이름 없는 연주자로 세운다.
 * 공연자가 무대 앞쪽(왼·가운데·오른쪽)과 런웨이를 오가므로, 밴드는 그 뒤 줄(무대 안쪽)에 선다.
 */

type Role = 'drums' | 'bass' | 'guitar' | 'keys' | 'steel' | 'fiddle';

interface Seat {
  role: Role;
  x: number;
  z: number;
  /** 무대 위 단 높이(미터) */
  riser: number;
  motion: BandMotion;
}

const DRUM_RISER_M = 1.1;
const SEATS: readonly Seat[] = [
  { role: 'drums', x: 0, z: STAGE_Z_M - 4.5, riser: DRUM_RISER_M, motion: 'drum' },
  { role: 'bass', x: -7, z: STAGE_Z_M - 2.5, riser: 0, motion: 'strum' },
  { role: 'guitar', x: 7, z: STAGE_Z_M - 2.5, riser: 0, motion: 'strum' },
  { role: 'keys', x: -13, z: STAGE_Z_M - 4, riser: 0.4, motion: 'keys' },
  { role: 'steel', x: 13, z: STAGE_Z_M - 4, riser: 0.4, motion: 'keys' },
  { role: 'fiddle', x: -18.5, z: STAGE_Z_M - 1.5, riser: 0, motion: 'fiddle' },
];
const MEMBER_HEIGHT_M = 1.8;

export interface Band {
  group: THREE.Group;
  update(dt: number): void;
  /** 0 이면 숨긴다(공연 전·반전 장면) */
  setPresence(k: number): void;
}

const metal = new THREE.MeshStandardMaterial({ color: '#9a9ea8', metalness: 0.9, roughness: 0.3 });
const black = new THREE.MeshStandardMaterial({ color: '#141519', roughness: 0.6 });
const wood = new THREE.MeshStandardMaterial({ color: '#7a4a24', roughness: 0.5 });

function drumKit(): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: '#7d1d1d', roughness: 0.4, metalness: 0.2 });
  const kick = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.45, 24), shell);
  kick.rotation.x = Math.PI / 2;
  kick.position.set(0, 0.36, 0.75);
  const snare = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 20), metal);
  snare.position.set(-0.35, 0.62, 0.45);
  const tom1 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 20), shell);
  tom1.position.set(-0.12, 0.85, 0.7);
  const tom2 = tom1.clone();
  tom2.position.x = 0.2;
  const floorTom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 20), shell);
  floorTom.position.set(0.5, 0.45, 0.35);
  const cym = new THREE.CylinderGeometry(0.28, 0.28, 0.01, 24);
  const gold = new THREE.MeshStandardMaterial({ color: '#c9a440', metalness: 1, roughness: 0.25 });
  for (const [x, y, z] of [[-0.65, 1.25, 0.6], [0.7, 1.35, 0.6], [-0.45, 0.95, 0.15]] as const) {
    const c = new THREE.Mesh(cym, gold);
    c.position.set(x, y, z);
    c.rotation.z = x < 0 ? 0.25 : -0.25;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, y, 6), metal);
    stand.position.set(x, y / 2, z);
    g.add(c, stand);
  }
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 16), black);
  stool.position.set(0, 0.25, -0.05);
  g.add(kick, snare, tom1, tom2, floorTom, stool);
  return g;
}

function keyboard(len: number, height: number, withStand: boolean): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.35), black);
  body.position.set(0, height, 0.45);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.02, 0.15), new THREE.MeshStandardMaterial({ color: '#eeeeee' }));
  keys.position.set(0, height + 0.06, 0.52);
  g.add(body, keys);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, height, 6), metal);
    leg.position.set(sx * len * 0.4, height / 2, 0.45);
    if (withStand) leg.rotation.z = sx * 0.25;
    g.add(leg);
  }
  return g;
}

function fiddle(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), wood);
  body.scale.set(1, 1.7, 0.4);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.25, 0.02), black);
  neck.position.y = 0.25;
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.7, 4), wood);
  bow.position.set(0.15, 0.05, 0.08);
  bow.rotation.z = 1.2;
  g.add(body, neck, bow);
  g.rotation.set(0.3, 0, 1.3);
  return g;
}

/** 역할별 악기를 연주자 발밑 기준(로컬) 자리에 놓는다 */
function instrumentFor(role: Role): THREE.Object3D {
  switch (role) {
    case 'drums': return drumKit();
    case 'keys': return keyboard(1.25, 0.95, true);
    case 'steel': return keyboard(0.9, 0.75, false);
    case 'bass': {
      const gtr = buildGuitar('#1f3b73', 0.75);
      gtr.position.set(0.05, 1.0, 0.22);
      gtr.rotation.z = -1.05;
      return gtr;
    }
    case 'guitar': {
      const gtr = buildGuitar('#d9c27a', 0.5);
      gtr.position.set(0.05, 1.0, 0.22);
      gtr.rotation.z = -0.95;
      return gtr;
    }
    case 'fiddle': {
      const f = fiddle();
      f.position.set(0.28, 1.4, 0.18);
      return f;
    }
  }
}

/**
 * @param avatars 연주자 몸으로 쓸 아바타 — 관객과 재질을 나누지 않게 복제본 재질을 따로 복사한다
 *   (관객은 공연 중 실루엣으로 어두워지지만 밴드는 무대 조명을 받아야 한다)
 */
export function createBand(avatars: readonly LoadedAvatar[]): Band {
  const group = new THREE.Group();
  const mixers: THREE.AnimationMixer[] = [];
  const motions = [...new Set(SEATS.map((s) => s.motion))];
  const clips = avatars.map((a) => bakeClips(a, motions));

  SEATS.forEach((seat, i) => {
    const k = (i * 3 + 1) % avatars.length;
    const avatar = avatars[k];
    const holder = new THREE.Group();
    holder.position.set(seat.x, STAGE_HEIGHT_M + seat.riser, seat.z);
    // 객석(+z)을 보되 무대 가운데로 조금 몸을 튼다
    holder.rotation.y = -Math.atan2(seat.x, 30) * 0.4;
    const person = cloneSkinned(avatar.vrm.scene);
    person.scale.multiplyScalar(MEMBER_HEIGHT_M / avatar.sourceHeight);
    person.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.material) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
    });
    holder.add(person, instrumentFor(seat.role));
    group.add(holder);

    const mixer = new THREE.AnimationMixer(person);
    const action = mixer.clipAction(clips[k].get(seat.motion)!);
    action.time = Math.random() * CLIP_SECONDS;
    action.play();
    mixers.push(mixer);

    if (seat.riser > 0) {
      const riser = new THREE.Mesh(new THREE.BoxGeometry(seat.role === 'drums' ? 4.5 : 2.4, seat.riser, seat.role === 'drums' ? 3.5 : 2), black);
      riser.position.set(seat.x, STAGE_HEIGHT_M + seat.riser / 2, seat.z + 0.3);
      group.add(riser);
    }
  });

  return {
    group,
    update(dt) {
      for (const m of mixers) m.update(dt);
    },
    setPresence(k) {
      group.visible = k > 0.02;
    },
  };
}
