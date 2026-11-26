import * as THREE from 'three';
import { modelLoader, toFloatAttributes } from './gltf-loader.js';
import { stageReadyMaterial } from './performer-head-model.js';

/*
 * AI 로 만든 공연자 몸.
 *  - 기준 그림: gpt-image-2 T 포즈 정면 그림을 상반신 탈의로 편집한 판(저장소에는 넣지 않는다)
 *  - 메시·텍스처: Microsoft TRELLIS(MIT) 가 그 그림에서 만든 GLB — public/models/performer-body.glb
 * 뼈대가 없는 메시라서, 같은 T 포즈인 바탕 아바타(Bruno)의 뼈 가중치를 가장 가까운 정점에서 복사해 이식한다.
 * 그러면 humanoid-motion 의 동작이 그대로 새 몸을 움직인다.
 *
 * 기준 높이는 메시 경계 상자 비율로 잡는다 — 모델을 다시 뽑아도 상수를 다시 잴 필요가 없게.
 */

/** 위에서부터 이 비율까지(모자~턱)는 버린다. 머리는 performer-head-model 이 맡는다 */
const NECK_CUT_FROM_TOP = 0.19;
/** 모자가 바탕 아바타 머리 꼭대기보다 높이 솟은 만큼(미터) — 키 맞출 때 뺀다 */
const HAT_ABOVE_HAIR_M = 0.06;
/** 가장 가까운 정점 찾기 격자 한 칸(미터) */
const GRID_CELL_M = 0.06;
/** 격자 탐색 반경 상한(칸). 팔 끝처럼 대응점이 먼 곳도 이 안에서 끝난다 */
const GRID_MAX_RING = 6;

export interface BodyModel {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

export async function loadBodyModel(): Promise<BodyModel> {
  const gltf = await modelLoader.loadAsync(`${import.meta.env.BASE_URL}models/performer-body.glb`);
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) throw new Error('[body] performer-body.glb has no mesh');
  const m = mesh as THREE.Mesh;
  m.updateMatrixWorld(true);
  const geometry = m.geometry.clone();
  toFloatAttributes(geometry);
  geometry.applyMatrix4(m.matrixWorld);
  return { geometry, material: stageReadyMaterial(m.material as THREE.Material, '#202020') };
}

interface SkinSource {
  pos: Float32Array;
  /** 정점마다 4개 — 통합 뼈대(skeleton) 기준 뼈 번호 */
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  grid: Map<string, number[]>;
  skeleton: THREE.Skeleton;
}

const cellKey = (x: number, y: number, z: number): string => `${x}|${y}|${z}`;

/**
 * 바탕 아바타의 모든 스킨 메시(재질마다 하나씩 쪼개져 있다)를 휴식 자세 월드 좌표로 모으고,
 * 뼈 번호를 하나의 통합 뼈대 기준으로 다시 매긴다.
 * trap: 첫 스킨 메시만 쓰면 Bruno 는 상체만 잡혀 키가 1m 로 계산되고 몸이 눌린다.
 */
function buildSkinSource(sources: THREE.SkinnedMesh[]): SkinSource {
  const bones: THREE.Bone[] = [];
  const inverses: THREE.Matrix4[] = [];
  const boneSlot = new Map<THREE.Bone, number>();
  for (const m of sources) {
    m.skeleton.bones.forEach((b, i) => {
      if (boneSlot.has(b)) return;
      boneSlot.set(b, bones.length);
      bones.push(b);
      inverses.push(m.skeleton.boneInverses[i].clone());
    });
  }
  const total = sources.reduce((a, m) => a + m.geometry.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const skinIndex = new Uint16Array(total * 4);
  const skinWeight = new Float32Array(total * 4);
  const grid = new Map<string, number[]>();
  const v = new THREE.Vector3();
  let o = 0;
  for (const m of sources) {
    const si = m.geometry.getAttribute('skinIndex');
    const sw = m.geometry.getAttribute('skinWeight');
    const n = m.geometry.getAttribute('position').count;
    for (let i = 0; i < n; i++, o++) {
      m.getVertexPosition(i, v);
      v.applyMatrix4(m.matrixWorld);
      pos.set([v.x, v.y, v.z], o * 3);
      for (let k = 0; k < 4; k++) {
        skinIndex[o * 4 + k] = boneSlot.get(m.skeleton.bones[si.getComponent(i, k)]) ?? 0;
        skinWeight[o * 4 + k] = sw.getComponent(i, k);
      }
      const key = cellKey(Math.floor(v.x / GRID_CELL_M), Math.floor(v.y / GRID_CELL_M), Math.floor(v.z / GRID_CELL_M));
      const bucket = grid.get(key);
      if (bucket) bucket.push(o);
      else grid.set(key, [o]);
    }
  }
  return { pos, skinIndex, skinWeight, grid, skeleton: new THREE.Skeleton(bones, inverses) };
}

function nearest(s: SkinSource, x: number, y: number, z: number): number {
  const cx = Math.floor(x / GRID_CELL_M);
  const cy = Math.floor(y / GRID_CELL_M);
  const cz = Math.floor(z / GRID_CELL_M);
  let best = -1;
  let bestD = Infinity;
  // 링을 넓혀 가다가, 찾은 최단거리가 다음 링 안쪽 경계보다 가까우면 멈춘다
  for (let r = 0; r <= GRID_MAX_RING; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
          const bucket = s.grid.get(cellKey(cx + dx, cy + dy, cz + dz));
          if (!bucket) continue;
          for (const i of bucket) {
            const ddx = s.pos[i * 3] - x;
            const ddy = s.pos[i * 3 + 1] - y;
            const ddz = s.pos[i * 3 + 2] - z;
            const d = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d < bestD) { bestD = d; best = i; }
          }
        }
      }
    }
    if (best >= 0 && Math.sqrt(bestD) < r * GRID_CELL_M) break;
  }
  return best;
}

/**
 * AI 몸을 바탕 아바타 뼈대에 묶어 그 자리를 대신한다. 바탕 아바타가 휴식(T) 자세일 때 불러야 한다.
 * 반환된 메시는 원본 스킨 메시와 같은 부모·변환·바인드 행렬을 쓰고, 원본 메시는 숨긴다.
 */
export function skinBodyOnto(avatarScene: THREE.Object3D, body: BodyModel): THREE.SkinnedMesh {
  avatarScene.updateMatrixWorld(true);
  const sources: THREE.SkinnedMesh[] = [];
  avatarScene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) sources.push(o as THREE.SkinnedMesh);
  });
  if (sources.length === 0) throw new Error('[body] avatar has no skinned mesh to borrow bones from');
  const from = sources[0];
  const skin = buildSkinSource(sources);

  // 바탕 아바타 휴식 자세의 경계 — 발바닥 높이·키·팔 폭·중심
  const bb = new THREE.Box3();
  for (let i = 0; i < skin.pos.length; i += 3) bb.expandByPoint(new THREE.Vector3(skin.pos[i], skin.pos[i + 1], skin.pos[i + 2]));
  const srcH = bb.max.y - bb.min.y;
  const srcW = bb.max.x - bb.min.x;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;

  const geo = body.geometry.clone();
  geo.computeBoundingBox();
  const mb = geo.boundingBox!;
  const meshH = mb.max.y - mb.min.y;
  const meshCx = (mb.min.x + mb.max.x) / 2;
  const meshCz = (mb.min.z + mb.max.z) / 2;
  // 팔 폭과 키를 따로 맞춘다 — 생성 모델과 바탕 아바타의 팔 길이 비율이 달라서 한 배율로는 손끝이 어긋난다
  const sy = (srcH + HAT_ABOVE_HAIR_M) / meshH;
  const sx = srcW / (mb.max.x - mb.min.x);
  // 목 위(모자·얼굴)는 버린다 — 세 꼭짓점이 모두 목선 위인 삼각형 제거
  const neckY = mb.max.y - meshH * NECK_CUT_FROM_TOP;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const idx = geo.getIndex()!;
  const keep: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    if (pos.getY(a) > neckY && pos.getY(b) > neckY && pos.getY(c) > neckY) continue;
    keep.push(a, b, c);
  }
  geo.setIndex(keep);

  const n = pos.count;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const toLocal = from.matrixWorld.clone().invert();
  const w = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    w.set(cx + (x - meshCx) * sx, bb.min.y + (y - mb.min.y) * sy, cz + (z - meshCz) * sy);
    const j = nearest(skin, w.x, w.y, w.z);
    if (j >= 0) {
      for (let k = 0; k < 4; k++) {
        skinIndex[i * 4 + k] = skin.skinIndex[j * 4 + k];
        skinWeight[i * 4 + k] = skin.skinWeight[j * 4 + k];
      }
    } else {
      skinWeight[i * 4] = 1; // 대응점이 없으면 뼈 0(보통 엉덩이)에 붙인다
    }
    w.applyMatrix4(toLocal);
    pos.setXYZ(i, w.x, w.y, w.z);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mesh = new THREE.SkinnedMesh(geo, body.material);
  mesh.name = 'performer-ai-body';
  mesh.frustumCulled = false;
  mesh.position.copy(from.position);
  mesh.quaternion.copy(from.quaternion);
  mesh.scale.copy(from.scale);
  from.parent!.add(mesh);
  mesh.bind(skin.skeleton, from.bindMatrix);

  avatarScene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && o !== mesh) o.visible = false;
  });
  return mesh;
}
