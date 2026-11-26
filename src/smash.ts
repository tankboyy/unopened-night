import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildGuitar } from './performer.js';
import { RUNWAY_HEIGHT_M, RUNWAY_TIP_RADIUS_M, RUNWAY_TIP_Z_M } from './show.constants.js';

/*
 * 기타 부수기 — 공연 마지막의 상징적인 장면을 방문자가 직접 한다(물리엔진 cannon-es).
 *  - 마우스·손가락으로 기타를 잡아 휘두른다: 포인터가 원형 무대 위 세로 평면을 가리키고,
 *    기타는 용수철처럼 그 점을 따라간다(그래서 빠르게 휘두르면 실제로 속도가 붙는다)
 *  - 무대 바닥에 SMASH_SPEED 이상으로 부딪히면 몸통·넥·헤드 조각으로 나뉘어 튄다
 *  - 조각은 FRAGMENT_LIFE_SEC 뒤 사라지고, 다시 할 수 있다
 */

/** 이 속도(m/s) 이상으로 바닥에 닿아야 부서진다 */
const SMASH_SPEED = 7;
const FRAGMENT_LIFE_SEC = 7;
/** 포인터를 따라가는 용수철 세기 */
const SPRING_K = 90;
const SPRING_DAMP = 9;
/** 기타를 들 수 있는 높이 범위(무대 바닥 기준, 미터) */
const HOLD_MIN_Y = 0.6;
const HOLD_MAX_Y = 4.2;

export interface SmashEvent {
  at: THREE.Vector3;
  speed: number;
}

export interface Smash {
  group: THREE.Group;
  /** 기타를 꺼내 든다(카메라는 main 이 원형 무대 근접 시점으로 옮긴다) */
  start(): void;
  stop(): void;
  active(): boolean;
  update(dt: number, camera: THREE.Camera): void;
}

interface Piece {
  mesh: THREE.Object3D;
  body: CANNON.Body;
  age: number;
}

/**
 * @param el 포인터를 받을 요소(보통 WebGL 캔버스)
 * @param onSmash 부서지는 순간 — 불꽃·화면 흔들림을 붙인다
 */
export function createSmash(el: HTMLElement, onSmash: (e: SmashEvent) => void): Smash {
  const group = new THREE.Group();
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  const stageMat = new CANNON.Material('stage');
  const woodMat = new CANNON.Material('wood');
  world.addContactMaterial(new CANNON.ContactMaterial(stageMat, woodMat, { friction: 0.35, restitution: 0.35 }));

  // 원형 무대 윗면(원기둥) + 그라운드 바닥
  const tip = new CANNON.Body({ mass: 0, material: stageMat, position: new CANNON.Vec3(0, RUNWAY_HEIGHT_M / 2, RUNWAY_TIP_Z_M) });
  tip.addShape(new CANNON.Cylinder(RUNWAY_TIP_RADIUS_M, RUNWAY_TIP_RADIUS_M, RUNWAY_HEIGHT_M, 24));
  const floor = new CANNON.Body({ mass: 0, material: stageMat });
  floor.addShape(new CANNON.Plane());
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(tip);
  world.addBody(floor);

  // ─── 들고 휘두르는 기타 ───
  // 무대 거리에서도 잘 보이게 실제보다 크게. 아래 물리 모양 치수는 buildGuitar 의 치수 × 이 배율 — 함께 고칠 것(lockstep)
  const GUITAR_SCALE = 1.6;
  const guitarMesh = buildGuitar('#b3261e', 0.5);
  guitarMesh.scale.setScalar(GUITAR_SCALE);
  const guitarBody = new CANNON.Body({ mass: 3, material: woodMat, linearDamping: 0.05, angularDamping: 0.4 });
  // 몸통: 타원 반지름 0.17·0.15+위쪽 원 → 대략 0.17×0.25 상자, 중심 y≈0
  guitarBody.addShape(new CANNON.Box(new CANNON.Vec3(0.17 * GUITAR_SCALE, 0.25 * GUITAR_SCALE, 0.04 * GUITAR_SCALE)), new CANNON.Vec3(0, 0, 0));
  // 넥: 중심 y 0.42, 길이 0.5
  guitarBody.addShape(new CANNON.Box(new CANNON.Vec3(0.03 * GUITAR_SCALE, 0.25 * GUITAR_SCALE, 0.02 * GUITAR_SCALE)), new CANNON.Vec3(0, 0.42 * GUITAR_SCALE, 0));
  // 헤드(y 0.74)를 잡는다 — 넥을 쥐고 몸통을 내리치는 자세
  const grip = new CANNON.Vec3(0, 0.74 * GUITAR_SCALE, 0);

  const pieces: Piece[] = [];
  let on = false;
  let held = false;
  let broken = false;
  const target = new THREE.Vector3(0, RUNWAY_HEIGHT_M + 2.5, RUNWAY_TIP_Z_M);
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  let lastCamera: THREE.Camera | null = null;

  const placeGuitar = (): void => {
    guitarBody.position.set(0.6, RUNWAY_HEIGHT_M + 2.2, RUNWAY_TIP_Z_M + 0.5);
    guitarBody.quaternion.set(0, 0, 0, 1); // 모델 기본 자세가 헤드 위
    guitarBody.velocity.setZero();
    guitarBody.angularVelocity.setZero();
    target.set(0.6, RUNWAY_HEIGHT_M + 3.2, RUNWAY_TIP_Z_M + 0.5);
  };

  /** 포인터 → 원형 무대 중심을 지나 카메라를 마주 보는 세로 평면 위 점 */
  const aimAt = (clientX: number, clientY: number): void => {
    if (!lastCamera) return;
    const r = el.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, lastCamera);
    const n = new THREE.Vector3().subVectors(lastCamera.position, new THREE.Vector3(0, 0, RUNWAY_TIP_Z_M)).setY(0).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(0, 0, RUNWAY_TIP_Z_M));
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return;
    hit.y = THREE.MathUtils.clamp(hit.y, RUNWAY_HEIGHT_M + HOLD_MIN_Y, RUNWAY_HEIGHT_M + HOLD_MAX_Y);
    // 원형 무대 밖으로 끌고 나가지 않게
    const dx = hit.x;
    const dz = hit.z - RUNWAY_TIP_Z_M;
    const d = Math.hypot(dx, dz);
    if (d > RUNWAY_TIP_RADIUS_M - 0.5) hit.set((dx / d) * (RUNWAY_TIP_RADIUS_M - 0.5), hit.y, RUNWAY_TIP_Z_M + (dz / d) * (RUNWAY_TIP_RADIUS_M - 0.5));
    target.copy(hit);
  };

  el.addEventListener('pointerdown', (e) => {
    if (!on || broken) return;
    held = true;
    el.setPointerCapture(e.pointerId);
    aimAt(e.clientX, e.clientY);
  });
  el.addEventListener('pointermove', (e) => {
    if (on && held) aimAt(e.clientX, e.clientY);
  });
  const release = (): void => { held = false; };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  guitarBody.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
    if (broken || (e.body !== tip && e.body !== floor)) return;
    const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (speed < SMASH_SPEED) return;
    broken = true;
    // 충돌 콜백 안에서 몸체를 지우면 물리 단계가 꼬인다 — 다음 프레임에 나눈다
    queueMicrotask(() => shatter(speed));
  });

  const shatter = (speed: number): void => {
    const at = new THREE.Vector3(guitarBody.position.x, guitarBody.position.y, guitarBody.position.z);
    const q = new THREE.Quaternion(guitarBody.quaternion.x, guitarBody.quaternion.y, guitarBody.quaternion.z, guitarBody.quaternion.w);
    world.removeBody(guitarBody);
    guitarMesh.visible = false;
    // 원형 무대는 조명이 약해 조각이 검게 묻힌다 — 자체 발광을 조금 섞는다
    const red = new THREE.MeshStandardMaterial({ color: '#d0322a', emissive: '#5a0d08', roughness: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', emissive: '#2a180a', roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2a30', emissive: '#101014', roughness: 0.5 });
    const specs: Array<{ size: [number, number, number]; offset: [number, number, number]; mat: THREE.Material }> = [];
    // 몸통 파편 9개
    for (let i = 0; i < 9; i++) {
      specs.push({ size: [0.12 + Math.random() * 0.18, 0.1 + Math.random() * 0.16, 0.1], offset: [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.7, 0], mat: red });
    }
    // 넥 두 동강 + 헤드
    specs.push({ size: [0.08, 0.55, 0.06], offset: [0, 0.75, 0], mat: wood });
    specs.push({ size: [0.08, 0.45, 0.06], offset: [0, 1.3, 0], mat: wood });
    specs.push({ size: [0.12, 0.22, 0.04], offset: [0, 1.7, 0], mat: dark });
    for (const s of specs) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(...s.size), s.mat);
      const off = new THREE.Vector3(...s.offset).applyQuaternion(q);
      const body = new CANNON.Body({ mass: 0.2, material: woodMat, linearDamping: 0.1, angularDamping: 0.1 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2)));
      body.position.set(at.x + off.x, Math.max(RUNWAY_HEIGHT_M + 0.15, at.y + off.y), at.z + off.z);
      body.quaternion.set(q.x, q.y, q.z, q.w);
      // 부딪힌 세기만큼 사방으로 튄다
      const k = Math.min(1.6, speed / SMASH_SPEED);
      body.velocity.set((Math.random() - 0.5) * 7 * k, (2 + Math.random() * 5) * k, (Math.random() - 0.5) * 7 * k);
      body.angularVelocity.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
      world.addBody(body);
      group.add(box);
      pieces.push({ mesh: box, body, age: 0 });
    }
    onSmash({ at, speed });
  };

  const clearPieces = (): void => {
    for (const p of pieces) {
      world.removeBody(p.body);
      group.remove(p.mesh);
    }
    pieces.length = 0;
  };

  group.add(guitarMesh);
  guitarMesh.visible = false;

  return {
    group,
    start() {
      clearPieces();
      broken = false;
      on = true;
      placeGuitar();
      if (!world.bodies.includes(guitarBody)) world.addBody(guitarBody);
      guitarMesh.visible = true;
    },
    stop() {
      on = false;
      held = false;
      clearPieces();
      if (world.bodies.includes(guitarBody)) world.removeBody(guitarBody);
      guitarMesh.visible = false;
    },
    active: () => on,
    update(dt, camera) {
      lastCamera = camera;
      if (!on) return;
      if (!broken) {
        // 잡은 점(헤드)을 목표점으로 끄는 용수철 — 놓으면 그냥 떨어진다
        if (held) {
          const g = guitarBody.pointToWorldFrame(grip);
          const f = new CANNON.Vec3(target.x - g.x, target.y - g.y, target.z - g.z).scale(SPRING_K);
          const v = guitarBody.getVelocityAtWorldPoint(g, new CANNON.Vec3());
          f.vsub(v.scale(SPRING_DAMP), f);
          guitarBody.applyForce(f, g);
        }
      }
      world.step(1 / 60, Math.min(dt, 0.05), 4);
      if (!broken) {
        guitarMesh.position.set(guitarBody.position.x, guitarBody.position.y, guitarBody.position.z);
        guitarMesh.quaternion.set(guitarBody.quaternion.x, guitarBody.quaternion.y, guitarBody.quaternion.z, guitarBody.quaternion.w);
      }
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.age += dt;
        p.mesh.position.set(p.body.position.x, p.body.position.y, p.body.position.z);
        p.mesh.quaternion.set(p.body.quaternion.x, p.body.quaternion.y, p.body.quaternion.z, p.body.quaternion.w);
        if (p.age > FRAGMENT_LIFE_SEC) {
          world.removeBody(p.body);
          group.remove(p.mesh);
          pieces.splice(i, 1);
        }
      }
    },
  };
}
