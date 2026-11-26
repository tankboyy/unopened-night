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

/** 위에서부터 이 비율까지가 모자~수염 끝. 그 아래(목·어깨)는 버린다 */
const CUT_FROM_TOP = 0.775;
/** 위에서부터 두 눈 높이까지의 비율 */
const EYES_FROM_TOP = 0.41;
/** 모자 꼭대기~수염 끝 실제 높이(미터) */
const HEAD_HEIGHT_M = 0.36;

// ⚠️ 기준 그림과 lockstep — 그림을 바꾸면 다시 잰다. 메시 위·아래 끝이 그림의 이 두 행에 닿는다(가로세로 같은 배율)
const FRONT_IMG_PX = 1024;
const FRONT_TOP_ROW_PX = 29;
const FRONT_BOTTOM_ROW_PX = 1023;
const FRONT_CENTER_COL_PX = 513.5;
/** 법선 z 가 이 구간에서 0→1 로 정면 그림 비중이 올라간다 */
// trap: 범위를 아래쪽(법선 z<0.2)까지 넓히면 TRELLIS 가 입체로 빚은 말린 콧수염 위에 피부색이 칠해져 분홍 줄이 생긴다.
// 코밑처럼 아래를 향한 면은 TRELLIS 텍스처(갈색 콧수염)에 맡긴다.
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

export async function loadHeadModel(): Promise<HeadModel> {
  const base = import.meta.env.BASE_URL;
  const [gltf, front] = await Promise.all([
    modelLoader.loadAsync(`${base}models/performer-head.glb`),
    new THREE.TextureLoader().loadAsync(`${base}models/performer-head-front.jpg`),
  ]);
  front.colorSpace = THREE.SRGBColorSpace;
  front.anisotropy = 4;
  let found: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  const mesh = found as THREE.Mesh | null;
  if (!mesh) throw new Error('[head] performer-head.glb has no mesh');

  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry.clone();
  toFloatAttributes(geo);
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const h = bb.max.y - bb.min.y;
  const cutY = bb.max.y - h * CUT_FROM_TOP;
  cutTrianglesBelow(geo, cutY);
  geo.computeVertexNormals();

  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const pxPerUnit = (FRONT_BOTTOM_ROW_PX - FRONT_TOP_ROW_PX) / h;
  const cx = (bb.min.x + bb.max.x) / 2;
  const uvProj = new Float32Array(pos.count * 2);
  const frontW = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    uvProj[i * 2] = (FRONT_CENTER_COL_PX + (pos.getX(i) - cx) * pxPerUnit) / FRONT_IMG_PX;
    uvProj[i * 2 + 1] = 1 - (FRONT_TOP_ROW_PX + (bb.max.y - pos.getY(i)) * pxPerUnit) / FRONT_IMG_PX;
    frontW[i] = THREE.MathUtils.smoothstep(nor.getZ(i), FRONT_BLEND_FROM, FRONT_BLEND_TO);
  }
  geo.setAttribute('uvProj', new THREE.BufferAttribute(uvProj, 2));
  geo.setAttribute('frontW', new THREE.BufferAttribute(frontW, 1));

  const material = stageReadyMaterial(mesh.material as THREE.Material, '#5a5a5a');
  blendFrontProjection(material, front);
  const head = new THREE.Mesh(geo, material);
  const scale = HEAD_HEIGHT_M / (bb.max.y - cutY);
  head.scale.setScalar(scale);
  // 가로·깊이 중심을 원점에 맞춘다 — 머리 뼈 바로 위에 오도록
  head.position.set(-((bb.min.x + bb.max.x) / 2) * scale, 0, -((bb.min.z + bb.max.z) / 2) * scale);
  const object = new THREE.Group();
  object.add(head);
  return { object, eyeHeightM: (bb.max.y - h * EYES_FROM_TOP) * scale };
}
