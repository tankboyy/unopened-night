import * as THREE from 'three';
import { modelLoader, toFloatAttributes } from './gltf-loader.js';

/*
 * AI 로 만든 공연자 머리.
 *  - 기준 그림: gpt-image-2 로 생성한 정면 캐리커처 — public/models/performer-head-front.jpg (윤곽 밖 배경은 가장자리 색으로 번져 채움)
 *  - 메시·텍스처: Microsoft TRELLIS(MIT) 가 그 그림에서 만든 GLB — public/models/performer-head.glb
 * 텍스처는 두 장을 섞는다: 옆·뒤는 TRELLIS 가 칠한 전 방향 텍스처, 정면을 향한 면은 기준 그림
 * (public/models/performer-head-front.jpg)을 앞에서 투사 — TRELLIS 가 다시 칠한 얼굴은 기준 그림보다 덜 닮아서.
 *
 * intentionally: Hunyuan3D 는 라이선스가 한국·EU·영국을 허용 지역에서 빼고 출력물 사용까지 막아서 쓰지 않는다.
 *
 * 기준 높이는 메시 경계 상자에 대한 비율로 잡는다 — 모델을 다시 뽑아도 상수를 다시 잴 필요가 없게.
 */

/**
 * 인물별 머리 설정. 기준 그림 좌표는 그 그림과 lockstep — 그림을 바꾸면 다시 잰다.
 * 비율은 메시 경계 상자 기준(위가 0) — 모델을 다시 뽑아도 다시 잴 필요가 없다.
 */
export interface HeadSpec {
  glb: string;
  /** 정면에 투사해 섞을 기준 그림(윤곽 밖 배경을 가장자리 색으로 번진 판) */
  front: string;
  /** 메시 위·아래 끝이 닿는 그림의 행, 메시 가로 중심이 닿는 열(가로세로 같은 배율) */
  frontTopRow: number;
  frontBottomRow: number;
  frontCenterCol: number;
  /** 위에서부터 이 비율까지가 머리(모자·머리카락~턱). 그 아래 목·어깨는 버린다 */
  cutFromTop: number;
  /** 위에서부터 두 눈까지의 비율 */
  eyesFromTop: number;
  /** 머리 꼭대기~턱 실제 높이(미터) */
  heightM: number;
}

export const POST_MALONE_HEAD: HeadSpec = {
  glb: 'models/performer-head.glb', front: 'models/performer-head-front.jpg',
  frontTopRow: 29, frontBottomRow: 1023, frontCenterCol: 513.5, cutFromTop: 0.775, eyesFromTop: 0.41, heightM: 0.36,
};
export const DON_TOLIVER_HEAD: HeadSpec = {
  glb: 'models/dt-head.glb', front: 'models/dt-head-front.jpg',
  // 묶어 올린 드레드락 꼭대기 23행, 눈 420행, 턱 아래 옷깃 약 690행
  frontTopRow: 23, frontBottomRow: 1023, frontCenterCol: 534, cutFromTop: 0.667, eyesFromTop: 0.397, heightM: 0.4,
};

const FRONT_IMG_PX = 1024;
// trap: 범위를 아래쪽(법선 z<0.2)까지 넓히면 TRELLIS 가 입체로 빚은 수염·콧수염 위에 피부색이 칠해져 분홍 줄이 생긴다.
// 코밑처럼 아래를 향한 면은 TRELLIS 텍스처에 맡긴다.
const FRONT_BLEND_FROM = 0.2;
const FRONT_BLEND_TO = 0.55;

export interface HeadModel {
  object: THREE.Object3D;
  /** 객체 원점 기준 눈 높이(미터) — 머리 뼈에서 눈까지 거리를 맞추는 데 쓴다 */
  eyeHeightM: number;
}

/** 목 아래 삼각형을 버린 새 인덱스 */
export function cutTrianglesBelow(geo: THREE.BufferGeometry, minY: number): void {
  const pos = geo.getAttribute('position');
  const idx = geo.getIndex();
  if (!idx) return;
  const keep: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    if (pos.getY(a) < minY && pos.getY(b) < minY && pos.getY(c) < minY) continue;
    keep.push(a, b, c);
  }
  geo.setIndex(keep);
}

/**
 * TRELLIS 는 금속도 1 로 내보내서 환경광 없는 무대에선 새까맣게 보인다 — 비금속 무광으로 바꾸고,
 * 무대 조명이 정면에 약하니 텍스처를 약하게 자체 발광시킨다.
 */
export function stageReadyMaterial(src: THREE.Material, emissive: string): THREE.MeshStandardMaterial {
  const map = (src as THREE.MeshStandardMaterial).map ?? null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map, roughness: 1, metalness: 0, emissiveMap: map, emissive: new THREE.Color(emissive),
  });
}

/** 정면 그림을 섞는 셰이더 패치. 정면 비중(frontW)과 투사 UV(uvProj)는 정점 속성으로 미리 계산해 둔다 */
function blendFrontProjection(material: THREE.MeshStandardMaterial, front: THREE.Texture): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.projMap = { value: front };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 uvProj;\nattribute float frontW;\nvarying vec2 vUvProj;\nvarying float vFront;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUvProj = uvProj;\nvFront = frontW;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D projMap;\nvarying vec2 vUvProj;\nvarying float vFront;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 projColor = texture2D(projMap, vUvProj);\ndiffuseColor.rgb = mix(diffuseColor.rgb, projColor.rgb, vFront);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, projColor.rgb * emissive, vFront);');
  };
}

export async function loadHeadModel(spec: HeadSpec): Promise<HeadModel> {
  const base = import.meta.env.BASE_URL;
  const [gltf, front] = await Promise.all([
    modelLoader.loadAsync(`${base}${spec.glb}`),
    new THREE.TextureLoader().loadAsync(`${base}${spec.front}`),
  ]);
  front.colorSpace = THREE.SRGBColorSpace;
  front.anisotropy = 4;
  let found: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  const mesh = found as THREE.Mesh | null;
  if (!mesh) throw new Error(`[head] ${spec.glb} has no mesh`);

  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry.clone();
  toFloatAttributes(geo);
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const h = bb.max.y - bb.min.y;
  const cutY = bb.max.y - h * spec.cutFromTop;
  cutTrianglesBelow(geo, cutY);
  geo.computeVertexNormals();

  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const pxPerUnit = (spec.frontBottomRow - spec.frontTopRow) / h;
  const cx = (bb.min.x + bb.max.x) / 2;
  const uvProj = new Float32Array(pos.count * 2);
  const frontW = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    uvProj[i * 2] = (spec.frontCenterCol + (pos.getX(i) - cx) * pxPerUnit) / FRONT_IMG_PX;
    uvProj[i * 2 + 1] = 1 - (spec.frontTopRow + (bb.max.y - pos.getY(i)) * pxPerUnit) / FRONT_IMG_PX;
    frontW[i] = THREE.MathUtils.smoothstep(nor.getZ(i), FRONT_BLEND_FROM, FRONT_BLEND_TO);
  }
  geo.setAttribute('uvProj', new THREE.BufferAttribute(uvProj, 2));
  geo.setAttribute('frontW', new THREE.BufferAttribute(frontW, 1));

  const material = stageReadyMaterial(mesh.material as THREE.Material, '#5a5a5a');
  blendFrontProjection(material, front);
  const head = new THREE.Mesh(geo, material);
  const scale = spec.heightM / (bb.max.y - cutY);
  head.scale.setScalar(scale);
  // 가로·깊이 중심을 원점에 맞춘다 — 머리 뼈 바로 위에 오도록
  head.position.set(-((bb.min.x + bb.max.x) / 2) * scale, 0, -((bb.min.z + bb.max.z) / 2) * scale);
  const object = new THREE.Group();
  object.add(head);
  return { object, eyeHeightM: (bb.max.y - h * spec.eyesFromTop) * scale };
}
