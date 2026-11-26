import type * as THREE from 'three';

/*
 * 렌더 레이어.
 *  0 = 몸체가 있는 물체(무대·사람·악기). 영상 벽 앞을 지나가면 영상을 가린다.
 *  1 = 빛·입자 효과(빔·레이저·불꽃·폰 불빛·연무). 가산 합성이라 영상 벽 구멍 판정(마스크)에서 빠진다 —
 *      넣으면 빔이 지나가는 자리마다 영상이 검게 뚫린다.
 * 메인 카메라는 둘 다 보고, 영상 벽 마스크를 그릴 때만 0 만 본다.
 */
export const FX_LAYER = 1;
/** 2 = IMAG 중계 화면. 중계 카메라가 자기 화면을 다시 비추면 렌더 타깃을 읽으며 쓰는 피드백 루프가 생겨서 그 카메라에서만 뺀다 */
export const SCREEN_LAYER = 2;

/** 이 물체와 그 아래 전부를 효과 레이어로 옮긴다. 빛(Light)은 옮기지 않는다 — 카메라 레이어에 없으면 꺼진다 */
export function toFxLayer(obj: THREE.Object3D): void {
  toLayer(obj, FX_LAYER);
}

export function toLayer(obj: THREE.Object3D, layer: number): void {
  obj.traverse((o) => {
    if ((o as THREE.Light).isLight) return;
    o.layers.set(layer);
  });
}
