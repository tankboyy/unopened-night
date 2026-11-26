import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/*
 * 공연자 머리·몸 GLB 용 로더. 두 파일은 gltf-transform optimize(meshopt 압축 + WebP 텍스처 + 좌표 양자화)로 줄였다.
 * VRM 아바타는 avatars.ts 의 자체 로더를 쓴다(VRM 확장이 필요해서).
 */
export const modelLoader = new GLTFLoader();
modelLoader.setMeshoptDecoder(MeshoptDecoder);

/**
 * 양자화된(16비트 정수·정규화) 정점 속성을 32비트 실수로 풀어 둔다.
 * trap: 정수 속성에 applyMatrix4 를 하면 정규화 범위(-1~1) 밖 값이 잘려 모양이 망가진다 —
 * 머리·몸 로더는 노드 변환을 정점에 굳히고 UV 를 다시 계산하므로 반드시 먼저 풀어야 한다.
 */
export function toFloatAttributes(geo: THREE.BufferGeometry): void {
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute;
    if (a.array instanceof Float32Array && !a.normalized) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    }
    geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
}
