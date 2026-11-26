import * as THREE from 'three';
import { STAGE_WIDTH_M, STAGE_Z_M } from './show.constants.js';
import { FX_LAYER, SCREEN_LAYER, toLayer } from './layers.js';

/*
 * IMAG(대형 중계 화면): 실제 스타디움처럼 공연자 얼굴 클로즈업을 화면에 띄운다.
 *  - 무대 양옆 큰 화면 2개 + 스탠딩석 양쪽 기둥에 2개씩(딜레이 스크린) = 6개
 *  - 별도 카메라가 공연자 얼굴 앞에서 손으로 든 듯 살짝 흔들리며 따라간다
 *  - 화면 아래 곡 제목 자막 띠
 * 중계 장면은 두 프레임에 한 번만 그린다 — 장면을 한 번 더 그리는 비용이 커서.
 */

const RT_W = 640;
const RT_H = 360;
const SIDE_W_M = 18;
const DELAY_W_M = 10;
/** 얼굴까지 거리(미터) */
const CAM_DIST_M = 1.5;

interface ScreenSpec {
  x: number;
  y: number;
  z: number;
  w: number;
  /** y축 회전 — 객석 가운데를 보게 */
  yaw: number;
}

const SIDE_X = STAGE_WIDTH_M / 2 + 11;
const SCREENS: readonly ScreenSpec[] = [
  { x: -SIDE_X, y: 12, z: STAGE_Z_M + 1, w: SIDE_W_M, yaw: 0.15 },
  { x: SIDE_X, y: 12, z: STAGE_Z_M + 1, w: SIDE_W_M, yaw: -0.15 },
  // 스탠딩석 양쪽 딜레이 스크린(뒤쪽 관객용) — 그라운드 가장자리 기둥 위
  { x: -38, y: 10, z: -12, w: DELAY_W_M, yaw: 0.55 },
  { x: -38, y: 10, z: 14, w: DELAY_W_M, yaw: 0.45 },
  { x: 38, y: 10, z: -12, w: DELAY_W_M, yaw: -0.55 },
  { x: 38, y: 10, z: 14, w: DELAY_W_M, yaw: -0.45 },
];

export interface Imag {
  group: THREE.Group;
  setTitle(title: string, feat: string | undefined): void;
  /** 얼굴 위치·공연자가 보는 방향(라디안)·밝기 */
  update(face: THREE.Vector3, facing: number, t: number, level: number): void;
  /** 메인 렌더 전에 부른다. 두 프레임에 한 번만 실제로 그린다 */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void;
}

/** @param everyNthFrame 중계 장면을 몇 프레임에 한 번 그릴지 — 폰에서는 3 */
export function createImag(everyNthFrame = 2): Imag {
  const group = new THREE.Group();
  const rt = new THREE.WebGLRenderTarget(RT_W, RT_H, { samples: 2 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(28, RT_W / RT_H, 0.1, 120);
  cam.layers.set(0);
  cam.layers.enable(FX_LAYER);

  const liveMat = new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#0c0d12', metalness: 0.5, roughness: 0.5 });
  const lower = document.createElement('canvas');
  lower.width = 1024;
  lower.height = 120;
  const lctx = lower.getContext('2d')!;
  const lowerTex = new THREE.CanvasTexture(lower);
  lowerTex.colorSpace = THREE.SRGBColorSpace;
  const lowerMat = new THREE.MeshBasicMaterial({ map: lowerTex, transparent: true, toneMapped: false });

  for (const s of SCREENS) {
    const h = (s.w * RT_H) / RT_W;
    const holder = new THREE.Group();
    holder.position.set(s.x, s.y, s.z);
    holder.rotation.y = s.yaw;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.6, h + 0.6, 0.4), frameMat);
    frame.position.z = -0.25;
    const live = new THREE.Mesh(new THREE.PlaneGeometry(s.w, h), liveMat);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.w * (120 / 1024)), lowerMat);
    strip.position.set(0, -h / 2 + (s.w * 120) / 1024 / 2 + 0.1, 0.02);
    holder.add(frame, live, strip);
    // 기둥: 화면 아래부터 땅까지
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.8, s.y - h / 2, 0.8), frameMat);
    pole.position.set(0, -(s.y + h / 2) / 2, -0.3);
    holder.add(pole);
    toLayer(holder, SCREEN_LAYER);
    group.add(holder);
  }

  let frameNo = 0;
  return {
    group,
    setTitle(title, feat) {
      lctx.clearRect(0, 0, 1024, 120);
      const g = lctx.createLinearGradient(0, 0, 1024, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.85)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.fillRect(0, 10, 1024, 100);
      lctx.fillStyle = '#ffc75a';
      lctx.fillRect(24, 26, 8, 68);
      lctx.fillStyle = '#ffffff';
      lctx.font = '64px "Bebas Neue", Impact, sans-serif';
      lctx.textBaseline = 'middle';
      lctx.fillText(title.toUpperCase(), 52, 64);
      if (feat) {
        const w = lctx.measureText(title.toUpperCase()).width;
        lctx.fillStyle = 'rgba(255,255,255,0.6)';
        lctx.font = '34px "Bebas Neue", Impact, sans-serif';
        lctx.fillText(`WITH ${feat.toUpperCase()}`, 72 + w, 68);
      }
      lowerTex.needsUpdate = true;
    },
    update(face, facing, t, level) {
      // 손으로 든 카메라처럼 천천히 흔들리고, 가끔 옆으로 조금 돈다
      const orbit = facing + Math.sin(t * 0.21) * 0.35;
      const sway = new THREE.Vector3(Math.sin(t * 1.3) * 0.03, Math.sin(t * 1.7) * 0.025, 0);
      cam.position.set(face.x + Math.sin(orbit) * CAM_DIST_M, face.y + 0.05, face.z + Math.cos(orbit) * CAM_DIST_M).add(sway);
      cam.lookAt(face.x, face.y - 0.02, face.z);
      liveMat.color.setScalar(0.08 + 0.92 * level);
      lowerMat.opacity = level;
    },
    render(renderer, scene) {
      frameNo++;
      if (frameNo % everyNthFrame) return;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
    },
  };
}
