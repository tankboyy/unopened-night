import * as THREE from 'three';
import type { Song } from './setlist.js';

/*
 * 특수효과(불꽃): 입자 하나의 풀(pool)로 네 가지를 만든다.
 *  - flame   : 무대 앞 화염 기둥. 에너지 높은 곡에서 8박마다, 그리고 곡 시작에 한 번 크게
 *  - gerb    : 금빛 불꽃 분수. 잔잔한 곡(에너지 0.35 이하) 내내 런웨이 끝 양옆에서
 *  - firework: 하늘 폭죽. 에너지 0.9 이상 곡의 시작, 마지막 곡의 끝 40초
 *  - confetti: 꽃가루. Sunflower·Congratulations 시작
 *  - 하이라이트(setlist 의 highlights, 대개 후렴): 무대 앞·원형 무대 불꽃 분수가 높이 솟고, 앞 트러스에서 불꽃 폭포가
 *    쏟아지고, 화염·폭죽이 같이 터진다
 * 스크롤 빨리감기로 시간이 크게 뛰면 그 사이 신호는 건너뛴다 — 한 번에 수십 발이 터지지 않게.
 */

const POOL = 9_000;
const GRAVITY = -9.8;
/** 박자(Hz) — stage-fx 와 같은 공통 박자 */
const BEAT_HZ = 1.73;
/** 한 프레임에 이보다 크게 시간이 뛰면 빨리감기로 보고 신호를 건너뛴다 */
const JUMP_SEC = 1.0;
const FINALE_TAIL_SEC = 40;

type Kind = 'flame' | 'gerb' | 'fall';

interface Emitter {
  kind: Kind;
  at: THREE.Vector3;
  /** 남은 분사 시간(초) */
  left: number;
  rate: number;
  color: THREE.Color;
}

export interface Pyro {
  group: THREE.Group;
  /** 곡 위치를 넘긴다 — 신호(곡 시작·8박·마지막 곡 끝)는 여기서 판단한다 */
  update(t: number, dt: number, song: Song, songIndex: number, songTime: number, songCount: number, level: number): void;
  /** 화면 높이(px)와 카메라 세로 시야각(도) — 입자 크기 환산에 쓴다 */
  setViewport(heightPx: number, fovDeg: number): void;
  /** 한 점에서 불꽃이 사방으로 튄다(기타가 부서지는 순간) */
  burstAt(at: THREE.Vector3, strength: number): void;
}

const VERT = /* glsl */ `
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha; varying vec3 vColor;
  void main(){
    vAlpha = aAlpha; vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // aSize 는 미터 — 화면 높이와 시야각으로 원근에 맞는 픽셀 크기로 바꾼다
    gl_PointSize = aSize * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying float vAlpha; varying vec3 vColor;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    // trap: smoothstep(0.5, 0.0, d) 처럼 edge0 > edge1 은 GLSL 에서 결과가 정의되지 않아(대개 0) 입자가 전부 투명해진다
    float a = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const HIGHLIGHT_GERB_SEC = 4;
const HIGHLIGHT_FALL_SEC = 5;

export function createPyro(pyroSpots: readonly THREE.Vector3[], curtain: { y: number; z: number; halfWidth: number }): Pyro {
  const group = new THREE.Group();
  const pos = new Float32Array(POOL * 3);
  const vel = new Float32Array(POOL * 3);
  const col = new Float32Array(POOL * 3);
  const size = new Float32Array(POOL);
  const alpha = new Float32Array(POOL);
  const age = new Float32Array(POOL);
  const life = new Float32Array(POOL);
  const drag = new Float32Array(POOL);
  const grav = new Float32Array(POOL);
  const kindOf = new Uint8Array(POOL); // 0 불꽃류(색이 식는다) 1 꽃가루(색 유지)
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const uScale = { value: 1 };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale },
  }));
  points.frustumCulled = false;
  group.add(points);

  // 화염이 터질 때 무대와 관객 앞줄을 주황으로 물들이는 빛
  const flameLight = new THREE.PointLight('#ff7a2a', 0, 60, 1.5);
  flameLight.position.set(0, 6, pyroSpots[0]?.z ?? 0);
  group.add(flameLight);

  const spawn = (p: THREE.Vector3, v: THREE.Vector3, c: THREE.Color, s: number, l: number, d: number, g: number, k: number): void => {
    const i = cursor;
    cursor = (cursor + 1) % POOL;
    pos.set([p.x, p.y, p.z], i * 3);
    vel.set([v.x, v.y, v.z], i * 3);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = s;
    life[i] = l;
    age[i] = 0;
    drag[i] = d;
    grav[i] = g;
    kindOf[i] = k;
    alpha[i] = 1;
  };

  const emitters: Emitter[] = [];
  const tmpV = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  // 가산 합성으로 수백 개가 겹치므로 색을 미리 어둡게 둔다 — 원색 그대로면 하얀 덩어리가 된다
  const FLAME = new THREE.Color('#ff8a2a').multiplyScalar(0.55);
  const GOLD = new THREE.Color('#ffd27a').multiplyScalar(0.7);
  const SPARK = new THREE.Color('#fff2c8').multiplyScalar(0.6);
  const CONFETTI = ['#ff4f6d', '#ffd23f', '#3fd0ff', '#ffffff', '#8cff6b'].map((h) => new THREE.Color(h));

  const burstFirework = (color: THREE.Color): void => {
    // 무대 위 하늘 — 스탠딩 시점에서 트러스 위로 보이는 높이
    const at = new THREE.Vector3((Math.random() - 0.5) * 60, 34 + Math.random() * 16, -62 + Math.random() * 30);
    const n = 260;
    for (let i = 0; i < n; i++) {
      tmpV.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(14 + Math.random() * 4);
      spawn(at, tmpV, color, 0.7, 1.8 + Math.random() * 0.8, 1.6, -3, 0);
    }
  };
  const fireFlames = (strength: number): void => {
    for (const p of pyroSpots.slice(0, 6)) emitters.push({ kind: 'flame', at: p, left: 0.7 * strength, rate: 140, color: FLAME });
  };
  const fireHighlight = (song: Song): void => {
    for (const p of pyroSpots) emitters.push({ kind: 'gerb', at: p, left: HIGHLIGHT_GERB_SEC, rate: 320, color: GOLD });
    emitters.push({ kind: 'fall', at: new THREE.Vector3(0, curtain.y, curtain.z), left: HIGHLIGHT_FALL_SEC, rate: 700, color: SPARK });
    // intentionally: 하이라이트엔 화염을 겹치지 않는다 — 분수·폭포·화염·스트로브가 한꺼번에 가산되면 화면이 하얗게 탄다
    for (let i = 0; i < 3; i++) setTimeout(() => burstFirework(new THREE.Color(song.look.b)), 300 + i * 450);
    if (song.look.energy >= 0.7) fireConfetti();
  };
  const fireConfetti = (): void => {
    for (let i = 0; i < 700; i++) {
      tmpP.set((Math.random() - 0.5) * 40, 2 + Math.random() * 4, pyroSpots[0].z + Math.random() * 4);
      tmpV.set((Math.random() - 0.5) * 8, 18 + Math.random() * 10, 6 + Math.random() * 10);
      spawn(tmpP, tmpV, CONFETTI[i % CONFETTI.length], 0.18, 7 + Math.random() * 3, 1.2, -2.2, 1);
    }
  };

  let prevIndex = -1;
  let prevTime = 0;
  let finaleTimer = 0;

  return {
    group,
    burstAt(at, strength) {
      const n = Math.round(350 * strength);
      for (let i = 0; i < n; i++) {
        tmpV.set((Math.random() - 0.5) * 2, Math.random() * 1.4, (Math.random() - 0.5) * 2).normalize().multiplyScalar(5 + Math.random() * 8 * strength);
        spawn(at, tmpV, i % 3 ? GOLD : SPARK, 0.08 + Math.random() * 0.06, 0.8 + Math.random() * 0.8, 0.8, GRAVITY, 0);
      }
    },
    setViewport(heightPx, fovDeg) {
      uScale.value = heightPx / 2 / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
    },
    update(t, dt, song, songIndex, songTime, songCount, level) {
      // ─── 신호 판단 ───
      const jumped = songIndex !== prevIndex ? songTime > 1.5 : Math.abs(songTime - prevTime) > JUMP_SEC;
      if (level > 0.5 && !jumped) {
        const energy = song.look.energy;
        if (songIndex !== prevIndex || (prevTime > songTime)) {
          // 곡 시작
          if (energy >= 0.7) fireFlames(1.6);
          if (energy >= 0.9) for (let i = 0; i < 4; i++) setTimeout(() => burstFirework(new THREE.Color(song.look.b)), i * 350);
          if (song.title === 'Sunflower' || song.title === 'Congratulations') fireConfetti();
        } else if (energy >= 0.8) {
          // 8박(약 4.6초)마다 화염
          const period = 8 / BEAT_HZ;
          if (Math.floor(songTime / period) !== Math.floor(prevTime / period)) fireFlames(1);
        }
        // 하이라이트를 지나는 순간
        if (songIndex === prevIndex) {
          for (const h of song.highlights) if (prevTime < h && songTime >= h) fireHighlight(song);
        }
        // 마지막 곡 끝 40초는 폭죽이 이어진다
        const last = songIndex === songCount - 1 && songTime > song.durationMs / 1000 - FINALE_TAIL_SEC;
        if (last) {
          finaleTimer -= dt;
          if (finaleTimer <= 0) {
            finaleTimer = 0.6 + Math.random() * 0.8;
            burstFirework(CONFETTI[(Math.random() * CONFETTI.length) | 0]);
          }
        }
        // 잔잔한 곡은 불꽃 분수가 계속
        if (energy <= 0.35) {
          for (const p of pyroSpots.slice(6)) {
            const n = Math.floor(dt * 260);
            for (let i = 0; i < n; i++) {
              tmpV.set((Math.random() - 0.5) * 2.2, 7 + Math.random() * 3, (Math.random() - 0.5) * 2.2);
              spawn(p, tmpV, GOLD, 0.12, 1.1 + Math.random() * 0.5, 0.4, GRAVITY, 0);
            }
          }
        }
      }
      prevIndex = songIndex;
      prevTime = songTime;

      // ─── 분사기 ───
      let flameGlow = 0;
      for (let e = emitters.length - 1; e >= 0; e--) {
        const em = emitters[e];
        em.left -= dt;
        if (em.left <= 0) {
          emitters.splice(e, 1);
          continue;
        }
        const n = Math.floor(em.rate * dt) + 1;
        for (let i = 0; i < n; i++) {
          if (em.kind === 'flame') {
            tmpP.set(em.at.x + (Math.random() - 0.5) * 0.4, em.at.y, em.at.z + (Math.random() - 0.5) * 0.4);
            tmpV.set((Math.random() - 0.5) * 1.5, 16 + Math.random() * 6, (Math.random() - 0.5) * 1.5);
            spawn(tmpP, tmpV, em.color, 1.0 + Math.random() * 0.8, 0.6 + Math.random() * 0.3, 2.0, 6, 0);
          } else if (em.kind === 'gerb') {
            // 하이라이트 불꽃 분수: 평소 분수보다 훨씬 높이(약 10m) 튄다
            tmpV.set((Math.random() - 0.5) * 3.2, 13 + Math.random() * 6, (Math.random() - 0.5) * 3.2);
            spawn(em.at, tmpV, em.color, 0.14, 1.4 + Math.random() * 0.6, 0.35, GRAVITY, 0);
          } else {
            // 불꽃 폭포: 트러스 선 위 아무 데서나 떨어진다
            tmpP.set(em.at.x + (Math.random() * 2 - 1) * curtain.halfWidth, em.at.y, em.at.z + (Math.random() - 0.5) * 0.3);
            tmpV.set((Math.random() - 0.5) * 0.6, -Math.random() * 1.5, (Math.random() - 0.5) * 0.6);
            spawn(tmpP, tmpV, em.color, 0.1, 2.0 + Math.random() * 0.6, 0.6, GRAVITY, 0);
          }
        }
        if (em.kind === 'flame') flameGlow += 1;
      }
      flameLight.intensity = Math.min(1, flameGlow / 6) * 900 * level;

      // ─── 입자 진행 ───
      for (let i = 0; i < POOL; i++) {
        if (alpha[i] <= 0) continue;
        age[i] += dt;
        const k = age[i] / life[i];
        if (k >= 1) {
          alpha[i] = 0;
          continue;
        }
        const d = Math.exp(-drag[i] * dt);
        vel[i * 3] *= d;
        vel[i * 3 + 1] = vel[i * 3 + 1] * d + grav[i] * dt;
        vel[i * 3 + 2] *= d;
        if (kindOf[i] === 1) vel[i * 3] += Math.sin(t * 3 + i) * 0.05; // 꽃가루는 팔랑인다
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        alpha[i] = (1 - k) * (kindOf[i] === 1 ? 1 : 1 - k * 0.3) * level;
        if (kindOf[i] === 0 && k > 0.4) {
          // 불꽃은 식으며 붉어진다
          col[i * 3 + 1] *= 0.985;
          col[i * 3 + 2] *= 0.96;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    },
  };
}
