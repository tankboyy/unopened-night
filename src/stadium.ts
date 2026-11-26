import * as THREE from 'three';
import {
  RUNWAY_HEIGHT_M, RUNWAY_TIP_RADIUS_M, RUNWAY_TIP_Z_M, RUNWAY_WIDTH_M, STAGE_DEPTH_M, STAGE_HEIGHT_M, STAGE_WIDTH_M, STAGE_Z_M, STAND_LIGHTS,
} from './show.constants.js';

export interface SeatPosition {
  x: number;
  y: number;
  z: number;
  upper: boolean;
}

export interface Stadium {
  group: THREE.Group;
  seats: SeatPosition[];
  spot: THREE.SpotLight;
  wash: THREE.PointLight;
  micStand: THREE.Group;
  standLights: THREE.Points;
}

/** 폰 불빛 한 점의 텍스처. 관객 쪽에서도 같이 쓴다 */
export function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.2, 'rgba(255,255,255,.8)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// 고양종합운동장 실측이 아니라 비슷한 비율의 임시 타원 객석. 좌석도를 받으면 이 함수만 바꾼다.
function buildSeats(): SeatPosition[] {
  const out: SeatPosition[] = [];
  const RINGS = 34;
  for (let r = 0; r < RINGS; r++) {
    const a = 80 + r * 1.25;
    const b = 58 + r * 1.25;
    const upper = r > 18;
    const y = 1 + r * 0.82 + (upper ? 4 : 0);
    const per = Math.floor((2 * Math.PI * Math.sqrt((a * a + b * b) / 2)) / 1.25);
    for (let i = 0; i < per; i++) {
      const th = (i / per) * Math.PI * 2;
      const x = Math.cos(th) * a;
      const z = Math.sin(th) * b;
      if (z < -40 && Math.abs(x) < 40) continue; // 무대 뒤 객석은 판매하지 않는다
      out.push({ x, y, z, upper });
    }
  }
  return out;
}

export function buildStadium(glow: THREE.Texture): Stadium {
  const group = new THREE.Group();

  const field = new THREE.Mesh(new THREE.PlaneGeometry(110, 74), new THREE.MeshStandardMaterial({ color: '#1a2a1e', roughness: 1 }));
  field.rotation.x = -Math.PI / 2;
  group.add(field);
  const track = new THREE.Mesh(
    new THREE.RingGeometry(1, 1.22, 96),
    new THREE.MeshStandardMaterial({ color: '#5a2a22', roughness: 1, side: THREE.DoubleSide }),
  );
  track.scale.set(62, 44, 1);
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.01;
  group.add(track);

  const seats = buildSeats();
  const seatMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), new THREE.MeshStandardMaterial({ roughness: 0.9 }), seats.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  seats.forEach((s, i) => {
    m.makeTranslation(s.x, s.y, s.z);
    seatMesh.setMatrixAt(i, m);
    c.set(s.upper ? '#283250' : '#352a40');
    seatMesh.setColorAt(i, c);
  });
  group.add(seatMesh);

  const stageMat = new THREE.MeshStandardMaterial({ color: '#15161d', roughness: 0.6, metalness: 0.2 });
  const stage = new THREE.Mesh(new THREE.BoxGeometry(STAGE_WIDTH_M, STAGE_HEIGHT_M, STAGE_DEPTH_M), stageMat);
  stage.position.set(0, STAGE_HEIGHT_M / 2, STAGE_Z_M);
  group.add(stage);
  const stageFront = STAGE_Z_M + STAGE_DEPTH_M / 2;
  const runwayLen = Math.abs(RUNWAY_TIP_Z_M - stageFront);
  const runway = new THREE.Mesh(new THREE.BoxGeometry(RUNWAY_WIDTH_M, RUNWAY_HEIGHT_M, runwayLen), stageMat);
  runway.position.set(0, RUNWAY_HEIGHT_M / 2, (RUNWAY_TIP_Z_M + stageFront) / 2);
  group.add(runway);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(RUNWAY_TIP_RADIUS_M, RUNWAY_TIP_RADIUS_M, RUNWAY_HEIGHT_M, 48), stageMat);
  tip.position.set(0, RUNWAY_HEIGHT_M / 2, RUNWAY_TIP_Z_M);
  group.add(tip);
  const back = new THREE.Mesh(new THREE.BoxGeometry(STAGE_WIDTH_M + 2, 22, 1.5), new THREE.MeshStandardMaterial({ color: '#0d0e14' }));
  back.position.set(0, 11, STAGE_Z_M - STAGE_DEPTH_M / 2);
  group.add(back);

  const spot = new THREE.SpotLight('#FFD38A', 1600, 90, 0.2, 0.6, 1.6);
  spot.position.set(0, 30, STAGE_Z_M + 10);
  group.add(spot, spot.target);
  const wash = new THREE.PointLight('#5a6cff', 400, 70, 1.8);
  wash.position.set(0, 12, STAGE_Z_M + 2);
  group.add(wash);

  // 반전 결말에서 혼자 남는 빈 마이크 스탠드
  const micStand = new THREE.Group();
  const micMat = new THREE.MeshStandardMaterial({ color: '#d8d4cc', metalness: 0.7, roughness: 0.3 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 8), micMat);
  pole.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), micMat);
  head.position.set(0, 1.52, 0.06);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 16), micMat);
  micStand.add(pole, head, base);
  micStand.position.set(0, RUNWAY_HEIGHT_M, RUNWAY_TIP_Z_M - 0.8);
  group.add(micStand);

  // 스탠드 관객은 사람 모델 대신 폰 불빛 점으로 — 멀어서 모델이 안 보이고, 4만 명을 모델로 그리면 폰이 버티지 못한다
  const pos: number[] = [];
  for (let i = 0; i < STAND_LIGHTS; i++) {
    const s = seats[(Math.random() * seats.length) | 0];
    pos.push(s.x, s.y + 1.1, s.z);
  }
  const standLights = makePhoneLights(pos, 1.1, glow);
  group.add(standLights);

  return { group, seats, spot, wash, micStand, standLights };
}

/** 위치 배열 → 반짝이는 폰 불빛 점. 색은 매 프레임 animatePhoneLights 가 쓴다 */
export function makePhoneLights(positions: number[], size: number, glow: THREE.Texture): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const n = positions.length / 3;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) phase[i] = Math.random() * Math.PI * 2;
  const mat = new THREE.PointsMaterial({
    size, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.phase = phase;
  return pts;
}

const PHONE_TINT = new THREE.Color('#dfe8ff');

export function animatePhoneLights(pts: THREE.Points, t: number, dim: number): void {
  const col = pts.geometry.getAttribute('color') as THREE.BufferAttribute;
  const phase = pts.userData.phase as Float32Array;
  for (let i = 0; i < col.count; i++) {
    const tw = (0.55 + 0.45 * Math.sin(t * 3 + phase[i])) * dim;
    col.setXYZ(i, PHONE_TINT.r * tw, PHONE_TINT.g * tw, PHONE_TINT.b * tw);
  }
  col.needsUpdate = true;
}
