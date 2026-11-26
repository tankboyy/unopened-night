import * as THREE from 'three';
import {
  BARRIER_GAP_M, RUNWAY_HEIGHT_M, RUNWAY_TIP_RADIUS_M, RUNWAY_TIP_Z_M, RUNWAY_WIDTH_M, STAGE_DEPTH_M, STAGE_HEIGHT_M, STAGE_WIDTH_M, STAGE_Z_M,
} from './show.constants.js';
import { toFxLayer } from './layers.js';

/*
 * 무대 구조물: 철골 트러스(양옆 타워 + 윗보 + 앞쪽 조명 트러스), 스피커 라인 어레이, 무대·런웨이 가장자리 LED 띠,
 * 무대 바닥에 깔리는 낮은 연무. 조명기(무빙 라이트)의 위치도 여기서 정해 stage-fx 가 빔을 쏜다.
 */

const TRUSS_TOWER_X = STAGE_WIDTH_M / 2 + 1.5;
const TRUSS_TOP_Y = 27;
const TRUSS_FRONT_Y = 24;
const TRUSS_FRONT_Z = STAGE_Z_M + 5;
const TRUSS_BACK_Z = STAGE_Z_M - STAGE_DEPTH_M / 2 + 0.2;
/** 박스 트러스 한 변(미터) */
const TRUSS_SIZE_M = 0.55;
const FOG_SHEETS = 14;

export interface StageSet {
  group: THREE.Group;
  /** 무빙 라이트가 매달린 자리(월드 좌표). 앞 트러스 위 */
  fixtureSpots: THREE.Vector3[];
  /** 무대 앞 화염·불꽃 분수 자리(월드 좌표, 바닥 높이) */
  pyroSpots: THREE.Vector3[];
  /** 하이라이트 때 불꽃 폭포가 쏟아지는 앞 트러스 선 */
  sparkCurtain: { y: number; z: number; halfWidth: number };
  update(t: number, color: THREE.Color, level: number): void;
}

/** 두 점 사이에 4개의 기둥(chord)과 지그재그 사선으로 된 박스 트러스를 인스턴스 행렬로 쌓는다 */
function pushTruss(out: THREE.Matrix4[], a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const axis = dir.clone().normalize();
  // 트러스 단면의 두 축
  const ref = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(axis, ref).normalize().multiplyScalar(TRUSS_SIZE_M / 2);
  const v = new THREE.Vector3().crossVectors(axis, u).normalize().multiplyScalar(TRUSS_SIZE_M / 2);
  const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
  const up = new THREE.Vector3(0, 1, 0);
  const bar = (p: THREE.Vector3, q: THREE.Vector3, r: number): void => {
    const d = q.clone().sub(p);
    const m = new THREE.Matrix4().compose(
      p.clone().add(q).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()),
      new THREE.Vector3(r, d.length(), r),
    );
    out.push(m);
  };
  for (const c of corners) bar(a.clone().add(c), b.clone().add(c), 1);
  const steps = Math.max(1, Math.round(len / TRUSS_SIZE_M));
  for (let i = 0; i < steps; i++) {
    const p0 = a.clone().addScaledVector(axis, (i / steps) * len);
    const p1 = a.clone().addScaledVector(axis, ((i + 1) / steps) * len);
    for (let k = 0; k < 4; k++) {
      const c0 = corners[k];
      const c1 = corners[(k + 1) % 4];
      bar(p0.clone().add(i % 2 ? c0 : c1), p1.clone().add(i % 2 ? c1 : c0), 0.6);
    }
  }
}

function fogTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 40; i++) {
    const x = 20 + Math.random() * 88;
    const y = 30 + Math.random() * 68;
    const r = 18 + Math.random() * 30;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,0.18)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

export function buildStageSet(): StageSet {
  const group = new THREE.Group();

  // ─── 트러스 ───
  const mats: THREE.Matrix4[] = [];
  const L = new THREE.Vector3(-TRUSS_TOWER_X, 0, TRUSS_BACK_Z);
  const R = new THREE.Vector3(TRUSS_TOWER_X, 0, TRUSS_BACK_Z);
  pushTruss(mats, L, L.clone().setY(TRUSS_TOP_Y));
  pushTruss(mats, R, R.clone().setY(TRUSS_TOP_Y));
  pushTruss(mats, L.clone().setY(TRUSS_TOP_Y), R.clone().setY(TRUSS_TOP_Y));
  // 앞 조명 트러스와 그것을 받치는 양옆 보
  const FL = new THREE.Vector3(-TRUSS_TOWER_X, TRUSS_FRONT_Y, TRUSS_FRONT_Z);
  const FR = new THREE.Vector3(TRUSS_TOWER_X, TRUSS_FRONT_Y, TRUSS_FRONT_Z);
  pushTruss(mats, FL, FR);
  pushTruss(mats, FL, L.clone().setY(TRUSS_FRONT_Y));
  pushTruss(mats, FR, R.clone().setY(TRUSS_FRONT_Y));
  const trussGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
  const truss = new THREE.InstancedMesh(trussGeo, new THREE.MeshStandardMaterial({ color: '#8a8f99', metalness: 0.8, roughness: 0.35 }), mats.length);
  mats.forEach((m, i) => truss.setMatrixAt(i, m));
  group.add(truss);

  // ─── 스피커 라인 어레이: 위에서 아래로 갈수록 객석 쪽으로 휘는 J 자 ───
  const boxGeo = new THREE.BoxGeometry(1.4, 0.55, 0.9);
  const spkMat = new THREE.MeshStandardMaterial({ color: '#121318', roughness: 0.7 });
  const grillMat = new THREE.MeshStandardMaterial({ color: '#2a2c33', roughness: 0.9 });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const box = new THREE.Mesh(boxGeo, [spkMat, spkMat, spkMat, spkMat, grillMat, spkMat]);
      const tilt = Math.pow(i / 11, 1.6) * 0.55;
      box.position.set(sx * (TRUSS_TOWER_X + 4), 21 - i * 0.56, STAGE_Z_M + 3 + Math.sin(tilt) * 0.8);
      box.rotation.x = -tilt;
      group.add(box);
    }
  }

  // ─── LED 띠: 무대 앞 가장자리, 런웨이 양옆, 원형 무대 둘레 ───
  const stripMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const stageFront = STAGE_Z_M + STAGE_DEPTH_M / 2;
  const addStrip = (w: number, d: number, x: number, y: number, z: number): void => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), stripMat);
    s.position.set(x, y, z);
    group.add(s);
  };
  addStrip(STAGE_WIDTH_M, 0.08, 0, STAGE_HEIGHT_M - 0.05, stageFront + 0.02);
  addStrip(STAGE_WIDTH_M, 0.08, 0, 0.1, stageFront + 0.02);
  const runwayLen = Math.abs(RUNWAY_TIP_Z_M - stageFront);
  for (const sx of [-1, 1]) addStrip(0.08, runwayLen, sx * (RUNWAY_WIDTH_M / 2 + 0.02), RUNWAY_HEIGHT_M - 0.05, (RUNWAY_TIP_Z_M + stageFront) / 2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RUNWAY_TIP_RADIUS_M + 0.02, 0.05, 6, 64), stripMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, RUNWAY_HEIGHT_M - 0.05, RUNWAY_TIP_Z_M);
  group.add(ring);

  // ─── 무빙 라이트: 앞 트러스에 7대 + 뒤 윗보에 7대 ───
  // 순서: 앞 트러스 7대 → 뒤 윗보 7대. stage-fx 가 index >= 7 을 뒤 줄로 본다(lockstep)
  const fixtureSpots: THREE.Vector3[] = [];
  const xs = Array.from({ length: 7 }, (_, i) => THREE.MathUtils.lerp(-TRUSS_TOWER_X + 2, TRUSS_TOWER_X - 2, i / 6));
  for (const x of xs) fixtureSpots.push(new THREE.Vector3(x, TRUSS_FRONT_Y - 0.9, TRUSS_FRONT_Z));
  // 뒤 줄은 LED 벽(무대 뒤 끝 +0.8m)보다 앞에 걸어야 빔이 벽에 묻히지 않는다
  for (const x of xs) fixtureSpots.push(new THREE.Vector3(x, TRUSS_TOP_Y - 0.9, TRUSS_BACK_Z + 2.2));

  // ─── 화염·불꽃 분수 자리: 무대 앞 가장자리 6곳 + 원형 무대 양옆 2곳 ───
  const pyroSpots: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) pyroSpots.push(new THREE.Vector3(THREE.MathUtils.lerp(-STAGE_WIDTH_M / 2 + 2, STAGE_WIDTH_M / 2 - 2, i / 5), STAGE_HEIGHT_M, stageFront - 0.6));
  pyroSpots.push(
    new THREE.Vector3(-RUNWAY_TIP_RADIUS_M + 0.8, RUNWAY_HEIGHT_M, RUNWAY_TIP_Z_M),
    new THREE.Vector3(RUNWAY_TIP_RADIUS_M - 0.8, RUNWAY_HEIGHT_M, RUNWAY_TIP_Z_M),
  );

  // ─── 관객 펜스: 무대 앞 일자 + 런웨이 양옆 + 원형 무대 둘레. 관객 배치(crowd.isBlocked)와 같은 여유로 친다 ───
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#4a4d55', metalness: 0.7, roughness: 0.5 });
  const fencePanel = new THREE.BoxGeometry(1, 1.1, 0.05);
  const fenceAt: THREE.Matrix4[] = [];
  const panel = (ax: number, az: number, bx: number, bz: number): void => {
    const len = Math.hypot(bx - ax, bz - az);
    fenceAt.push(new THREE.Matrix4().compose(
      new THREE.Vector3((ax + bx) / 2, 0.55, (az + bz) / 2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.atan2(bz - az, bx - ax), 0)),
      new THREE.Vector3(len, 1, 1),
    ));
  };
  const fx = RUNWAY_WIDTH_M / 2 + BARRIER_GAP_M - 0.3;
  const fenceFrontZ = stageFront + BARRIER_GAP_M;
  panel(-STAGE_WIDTH_M / 2, fenceFrontZ, -fx, fenceFrontZ);
  panel(fx, fenceFrontZ, STAGE_WIDTH_M / 2, fenceFrontZ);
  const tipR = RUNWAY_TIP_RADIUS_M + BARRIER_GAP_M - 0.3;
  const joinZ = RUNWAY_TIP_Z_M - Math.sqrt(Math.max(0, tipR * tipR - fx * fx));
  panel(-fx, fenceFrontZ, -fx, joinZ);
  panel(fx, fenceFrontZ, fx, joinZ);
  // 오른쪽 이음점(a0, 무대 쪽이라 음수)에서 객석 쪽(+z, π/2)을 돌아 왼쪽 이음점(π - a0)까지
  const a0 = Math.atan2(joinZ - RUNWAY_TIP_Z_M, fx);
  const a1 = Math.PI - a0;
  const SEG = 28;
  for (let i = 0; i < SEG; i++) {
    const t0 = a0 + ((a1 - a0) * i) / SEG;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / SEG;
    panel(Math.cos(t0) * tipR, RUNWAY_TIP_Z_M + Math.sin(t0) * tipR, Math.cos(t1) * tipR, RUNWAY_TIP_Z_M + Math.sin(t1) * tipR);
  }
  const fences = new THREE.InstancedMesh(fencePanel, fenceMat, fenceAt.length);
  fenceAt.forEach((m, i) => fences.setMatrixAt(i, m));
  group.add(fences);

  // ─── 낮은 연무: 무대 바닥 위에 깔린 반투명 판들이 천천히 흘러간다 ───
  const fogTex = fogTexture();
  const fogSheets: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; seed: number }> = [];
  for (let i = 0; i < FOG_SHEETS; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.0, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.2), mat);
    mesh.position.set(THREE.MathUtils.lerp(-STAGE_WIDTH_M / 2, STAGE_WIDTH_M / 2, i / (FOG_SHEETS - 1)), STAGE_HEIGHT_M + 1.2, STAGE_Z_M + Math.random() * 8 - 2);
    toFxLayer(mesh);
    group.add(mesh);
    fogSheets.push({ mesh, mat, seed: Math.random() * 10 });
  }

  return {
    group,
    fixtureSpots,
    pyroSpots,
    sparkCurtain: { y: TRUSS_FRONT_Y - 0.5, z: TRUSS_FRONT_Z, halfWidth: TRUSS_TOWER_X - 1 },
    update(t, color, level) {
      stripMat.color.copy(color).multiplyScalar(0.25 + 1.4 * level);
      for (const f of fogSheets) {
        f.mesh.position.x += Math.sin(t * 0.1 + f.seed) * 0.004;
        f.mesh.rotation.y = Math.sin(t * 0.05 + f.seed) * 0.4;
        // trap: 판 14장이 가산 합성으로 겹치므로 한 장은 아주 옅어야 한다 — 0.5 대면 무대 앞이 하얗게 포화된다
        f.mat.opacity = 0.07 * level;
        f.mat.color.copy(color).lerp(new THREE.Color('#ffffff'), 0.6);
      }
    },
  };
}
