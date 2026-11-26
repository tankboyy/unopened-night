import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';

/** 관객으로 쓰는 100 Avatars(CC0) 사람형 아바타. 파일은 public/models/avatars/<id>.vrm */
export const CROWD_AVATAR_IDS = [
  'kyle', 'kate', 'robert', 'erika', 'mikel', 'olivia', 'samuela', 'jennifer', 'bizdude', 'retroman', 'jimmy',
] as const;
export type CrowdAvatarId = (typeof CROWD_AVATAR_IDS)[number];
export const PERFORMER_AVATAR_ID = 'bruno';

export interface LoadedAvatar {
  vrm: VRM;
  /** 정규화 엉덩이 뼈의 휴식 높이 — 점프·무릎 굽힘의 기준 */
  hipsRestY: number;
  /** 원본 키(미터 추정). 키 정규화 배율 계산에 쓴다 */
  sourceHeight: number;
  /** VRM 0.x 여부 — 동작 회전 부호가 달라진다(humanoid-motion trap #2) */
  vrm0: boolean;
}

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

export async function loadAvatar(id: string): Promise<LoadedAvatar> {
  const url = `${import.meta.env.BASE_URL}models/avatars/${id}.vrm`;
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`[avatars] ${id}: file loaded but carries no VRM extension`);

  // VRM 0.x 는 -z 를 보고 있어서 180도 돌려 +z(정면)로 맞춘다. 1.0 이면 아무것도 안 한다.
  VRMUtils.rotateVRM0(vrm);
  VRMUtils.removeUnnecessaryVertices(vrm.scene);

  vrm.scene.traverse((o) => {
    // 스키닝된 메시는 휴식 자세 경계로 컬링돼서 팔을 들면 화면 가장자리에서 깜빡 사라진다
    o.frustumCulled = false;
    // 애니메이션 클립이 이름으로 뼈를 찾는다. 이름 없는 노드는 복제본에서 바인딩이 끊긴다
    if (!o.name) o.name = `${id}_${o.id}`;
  });

  vrm.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const hips = vrm.humanoid.getNormalizedBoneNode('hips');
  return { vrm, hipsRestY: hips ? hips.position.y : 0, sourceHeight: box.max.y - box.min.y, vrm0: vrm.meta.metaVersion === '0' };
}

/** 아바타 하나가 실패해도 나머지로 관객을 채운다 — 관객 다양성은 비핵심 */
export async function loadCrowdAvatars(): Promise<LoadedAvatar[]> {
  const results = await Promise.allSettled(CROWD_AVATAR_IDS.map((id) => loadAvatar(id)));
  const ok: LoadedAvatar[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') ok.push(r.value);
    else console.warn(`[avatars] crowd avatar ${CROWD_AVATAR_IDS[i]} skipped:`, r.reason);
  });
  if (ok.length === 0) throw new Error('[avatars] no crowd avatar could be loaded');
  return ok;
}
