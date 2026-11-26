import * as THREE from 'three';
import type { SongLook } from './setlist.js';
import { SETLIST } from './setlist.js';
import { STAGE_DEPTH_M, STAGE_HEIGHT_M, STAGE_WIDTH_M, STAGE_Z_M } from './show.constants.js';
import { toFxLayer } from './layers.js';

export interface StageFx {
  group: THREE.Group;
  /** 곡이 바뀔 때 색을 넘긴다. 실제 색 전환은 update 에서 부드럽게 */
  setLook(look: SongLook): void;
  /** 지금 무대 색(LED 띠·연무가 같이 쓴다) */
  color(): THREE.Color;
  /** 지금 곡 에너지 0~1 (불꽃이 같이 쓴다) */
  energy(): number;
  update(t: number, dt: number, dim: number): void;
}

const LASER_COUNT = 12;
const BEAM_LENGTH_M = 52;
/** 박자(Hz) — 곡별 BPM 을 모를 때 쓰는 공통값(약 104 BPM). 패턴 전환·스트로브가 이 박자를 탄다 */
const BEAT_HZ = 1.73;
/** 이 박 수마다 빔 패턴을 바꾼다 */
const BEATS_PER_PATTERN = 16;

// LED 벽: 세로 막대 이퀄라이저 + 흐르는 그라디언트 + 가로 훑기 + 박자 섬광. 블룸이 이 밝기를 빛 번짐으로 만든다
const LED_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uEnergy; uniform float uDim; uniform float uFlash;
  varying vec2 vUv;
  float hash(float n){ return fract(sin(n)*43758.5453); }
  void main(){
    float cols = 48.0;
    float col = floor(vUv.x * cols);
    float h = 0.25 + 0.55 * abs(sin(uTime * (1.5 + 3.0*uEnergy) + hash(col) * 6.283)) * (0.5 + 0.5*hash(col+3.0));
    float bar = step(vUv.y, h) * step(0.12, fract(vUv.x * cols));
    // edge0 < edge1 순서로 — 반대로 쓰면 GLSL 에서 결과가 정의되지 않는다(pyro.ts 와 같은 함정)
    float sweep = 1.0 - smoothstep(0.0, 0.08, abs(fract(vUv.y - uTime*0.25) - 0.5) - 0.42);
    vec3 grad = mix(uA, uB, vUv.y + 0.15*sin(uTime + vUv.x*4.0));
    vec3 c = grad * (0.18 + 0.9*bar) + uB * sweep * 0.6 + vec3(uFlash);
    vec2 px = fract(vUv * vec2(cols*4.0, 88.0));
    c *= 0.75 + 0.25 * step(0.2, px.x) * step(0.2, px.y);
    gl_FragColor = vec4(c * 0.42 * uDim, 1.0);
  }
`;
const UV_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

/*
 * 빔: 원뿔 하나에 두 겹을 그린다 — 시선과 나란한 가운데의 선명한 중심선(core) + 넓고 옅은 빛무리(halo).
 * 연무 질감은 월드 좌표 값 잡음으로, 회전하는 무늬(gobo)는 원뿔 둘레 uv.x 줄무늬로 흉내 낸다.
 */
const BEAM_VERT = /* glsl */ `
  varying vec2 vUv; varying float vEdge; varying vec3 vWorld;
  void main(){
    vUv = uv;
    vec4 w = modelMatrix * vec4(position,1.0);
    vWorld = w.xyz;
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = viewMatrix * w;
    vEdge = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uGobo;
  varying vec2 vUv; varying float vEdge; varying vec3 vWorld;
  float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
  float noise(vec3 p){
    vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x), f.y), f.z);
  }
  void main(){
    float along = pow(vUv.y, 1.3);
    float core = pow(vEdge, 9.0);
    float halo = pow(vEdge, 1.6);
    float haze = 0.45 + 0.55 * noise(vWorld * 0.22 + vec3(0.0, uTime * 0.35, uTime * 0.12));
    float gobo = mix(1.0, 0.45 + 0.55 * step(0.0, sin(vUv.x * 6.2832 * 5.0 + uTime * 1.7)), uGobo);
    float a = (core * 1.6 + halo * 0.85) * along * haze * gobo * uAlpha;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export const BEAM_PATTERNS = ['fan', 'sweep', 'cross', 'circle'] as const;
export type BeamPattern = (typeof BEAM_PATTERNS)[number];

interface Beam {
  head: THREE.Group;
  mat: THREE.ShaderMaterial;
  index: number;
  useB: boolean;
}

/** 무빙 라이트 몸체(요크 + 머리). 머리가 빔과 같이 돈다 */
function buildFixture(): { yoke: THREE.Group; head: THREE.Group } {
  const body = new THREE.MeshStandardMaterial({ color: '#1b1c22', metalness: 0.6, roughness: 0.4 });
  const yoke = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.5), body);
  base.position.y = 0.35;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.3), body);
  const armR = armL.clone();
  armL.position.set(-0.32, 0.05, 0);
  armR.position.set(0.32, 0.05, 0);
  const head = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.55, 16), body);
  can.position.y = -0.05;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  lens.rotation.x = Math.PI / 2;
  lens.position.y = -0.33;
  head.add(can, lens);
  head.userData.lens = lens;
  yoke.add(base, armL, armR, head);
  return { yoke, head };
}

/** 패턴별 빔의 기울기(x: 앞뒤, z: 좌우). k = 빔 순서 0~1, s = 박자 위상(초) */
function aim(pattern: BeamPattern, k: number, s: number, i: number): [number, number] {
  const side = k * 2 - 1;
  switch (pattern) {
    case 'fan':
      return [-(0.55 + Math.sin(s * 0.8) * 0.12), side * 0.65];
    case 'sweep':
      return [-(0.5 + Math.sin(s * 1.2 + k * 0.6) * 0.3), Math.sin(s * 0.9) * 0.7];
    case 'cross':
      return [-(0.6 + Math.sin(s * 1.5) * 0.15), (i % 2 ? 1 : -1) * (0.25 + Math.abs(Math.sin(s * 0.7)) * 0.5)];
    case 'circle':
      return [-(0.55 + Math.cos(s * 2 + k * 6.28) * 0.25), Math.sin(s * 2 + k * 6.28) * 0.35];
  }
}

export function createStageFx(fixtureSpots: readonly THREE.Vector3[]): StageFx {
  const group = new THREE.Group();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const first = SETLIST[0].look;
  const colA = new THREE.Color(first.a);
  const colB = new THREE.Color(first.b);
  const goalA = colA.clone();
  const goalB = colB.clone();
  let energy = first.energy;
  let goalEnergy = energy;

  const led = new THREE.ShaderMaterial({
    vertexShader: UV_VERT,
    fragmentShader: LED_FRAG,
    uniforms: { uTime: { value: 0 }, uA: { value: colA }, uB: { value: colB }, uEnergy: { value: energy }, uDim: { value: 1 }, uFlash: { value: 0 } },
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(STAGE_WIDTH_M, 20), led);
  wall.position.set(0, STAGE_HEIGHT_M + 10, STAGE_Z_M - STAGE_DEPTH_M / 2 + 0.8);
  group.add(wall);

  // 빔: 원뿔 꼭짓점이 원점에 오게 옮겨 두고 조명기 머리에 단다
  const beamGeo = new THREE.ConeGeometry(2.6, BEAM_LENGTH_M, 40, 1, true);
  beamGeo.translate(0, -BEAM_LENGTH_M / 2 - 0.3, 0);
  const beams: Beam[] = fixtureSpots.map((p, i) => {
    const { yoke, head } = buildFixture();
    yoke.position.copy(p);
    const mat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0.6 }, uTime: { value: 0 }, uGobo: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beamMesh = new THREE.Mesh(beamGeo, mat);
    toFxLayer(beamMesh);
    head.add(beamMesh);
    group.add(yoke);
    return { head, mat, index: i, useB: i % 2 === 1 };
  });

  // 레이저: 무대 뒤 바닥에서 객석 위로 부채꼴
  const laserGeo = new THREE.CylinderGeometry(0.02, 0.02, 150, 6, 1, true);
  laserGeo.translate(0, 75, 0);
  const lasers: Array<{ pivot: THREE.Group; mat: THREE.MeshBasicMaterial; seed: number }> = [];
  for (let i = 0; i < LASER_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const pivot = new THREE.Group();
    pivot.position.set((i - (LASER_COUNT - 1) / 2) * 3.2, STAGE_HEIGHT_M + 0.5, STAGE_Z_M + 6);
    pivot.add(new THREE.Mesh(laserGeo, mat));
    toFxLayer(pivot);
    group.add(pivot);
    lasers.push({ pivot, mat, seed: i * 0.9 });
  }

  // 스트로브 섬광: 무대 전체를 순간적으로 하얗게 — 에너지 높은 곡의 박자마다
  const strobe = new THREE.PointLight('#ffffff', 0, 120, 1.2);
  strobe.position.set(0, 18, STAGE_Z_M + 10);
  group.add(strobe);

  return {
    group,
    setLook(look) {
      goalA.set(look.a);
      goalB.set(look.b);
      goalEnergy = look.energy;
    },
    color: () => colA,
    energy: () => energy,
    update(t, dt, dim) {
      const k = Math.min(1, dt * 1.5);
      colA.lerp(goalA, k);
      colB.lerp(goalB, k);
      energy += (goalEnergy - energy) * k;

      const beat = t * BEAT_HZ;
      const pattern = BEAM_PATTERNS[Math.floor(beat / BEATS_PER_PATTERN) % BEAM_PATTERNS.length];
      const s = t * (0.5 + energy * 0.9);
      // 박자 직후 짧게 번쩍 — 에너지가 0.85 이상인 곡에서만, 동작 감소 설정이면 끈다(광과민 배려)
      const strobeOn = !reduceMotion && energy > 0.85 && dim > 0.5;
      const flash = strobeOn ? Math.pow(Math.max(0, 1 - (beat % 1) * 6), 2) : 0;

      led.uniforms.uTime.value = t;
      led.uniforms.uEnergy.value = energy;
      // 공연 전엔 LED 가 꺼진 화면처럼 거의 검어야 무대 조명이 켜지는 순간이 산다
      led.uniforms.uDim.value = 0.03 + 0.97 * dim;
      led.uniforms.uFlash.value = flash * 0.3;
      strobe.intensity = flash * 280 * dim;

      const n = beams.length;
      for (const b of beams) {
        const [tx, tz] = aim(pattern, (b.index % 7) / 6, s + (b.index >= 7 ? 0.5 : 0), b.index);
        // 한 번에 확 돌지 않게 머리가 목표 각도를 따라간다(실제 무빙 라이트도 모터 속도가 있다)
        b.head.rotation.x += (tx - b.head.rotation.x) * Math.min(1, dt * 3);
        b.head.rotation.z += (tz - b.head.rotation.z) * Math.min(1, dt * 3);
        b.mat.uniforms.uColor.value.copy(b.useB ? colB : colA);
        b.mat.uniforms.uTime.value = t + b.index;
        b.mat.uniforms.uGobo.value = pattern === 'circle' || pattern === 'cross' ? 1 : 0;
        // 뒤 줄(index >= 7, stage-set 의 조명기 순서와 lockstep)은 조금 옅게 — 앞뒤 깊이감
        b.mat.uniforms.uAlpha.value = (b.index >= n / 2 ? 0.55 : 0.8) * dim * (0.85 + flash * 0.6);
        const lens = b.head.userData.lens as THREE.Mesh;
        (lens.material as THREE.MeshBasicMaterial).color.copy(b.useB ? colB : colA).multiplyScalar(0.3 + 2.2 * dim);
      }

      const laserOn = Math.max(0, (energy - 0.7) / 0.3) * dim;
      for (const l of lasers) {
        l.pivot.rotation.x = 1.2 + Math.sin(t * 1.3 + l.seed) * 0.15;
        l.pivot.rotation.z = Math.sin(t * 0.9 + l.seed * 1.9) * 0.7;
        l.mat.color.copy(colB);
        l.mat.opacity = laserOn * (0.55 + 0.45 * Math.sin(t * 20 + l.seed * 7));
      }
    },
  };
}
