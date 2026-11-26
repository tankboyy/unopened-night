import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { STAGE_DEPTH_M, STAGE_HEIGHT_M, STAGE_Z_M } from './show.constants.js';

/*
 * LED 벽 전체를 채우는 YouTube 화면.
 * 교차 출처 영상은 WebGL 텍스처로 쓸 수 없어서(보안·DRM) 실제 플레이어 iframe 을 CSS3DRenderer 로 벽 자리에 띄우고,
 * 그 층을 WebGL 캔버스 '뒤'에 둔다. WebGL 은 벽 자리에 투명한 구멍을 뚫는다:
 *   1) 마스크 패스: 몸체가 있는 물체(레이어 0)만 검게, 구멍 판(holeMesh)만 하얗게 그려 "벽이 직접 보이는 픽셀"을 얻는다
 *   2) 합성 패스: 그 픽셀의 알파를 0 으로 — 캔버스 너머 영상이 보인다. 공연자·밴드처럼 벽 앞 물체는 그대로 영상을 가린다
 * 빛·입자(레이어 1)는 마스크에서 빠지므로 영상 위에서는 보이지 않는다(가산 빛을 영상 위에 더할 방법이 없다).
 *
 * ⚠️ YouTube API 약관은 플레이어 위를 다른 요소로 덮는 것을 금지한다 — 공연자가 영상 앞을 지나가는 장면은 그 조항에 걸린다.
 *    사용자 요청(벽 전체 화면)으로 감수한 결정이다.
 */

/** 영상 화면 크기 — LED 벽(44×20m) 높이를 꽉 채우는 16:9 */
const SCREEN_H_M = 20;
const SCREEN_W_M = (SCREEN_H_M * 16) / 9;
const DOM_W_PX = 1280;
const DOM_H_PX = 720;
/** 마스크는 절반 해상도로 — 경계가 조금 무르지만 장면을 한 번 더 그리는 비용을 줄인다 */
const MASK_SCALE = 0.5;

export interface VideoWall {
  /** 플레이어를 넣을 자리 */
  mount: HTMLElement;
  /** 3D 장면에 넣을 구멍 판 */
  holeMesh: THREE.Mesh;
  /** 합성 패스 — 컴포저 맨 끝에 붙인다 */
  compositePass: ShaderPass;
  /** 0 이면 영상을 숨기고 구멍도 닫는다 */
  setLevel(k: number): void;
  /** 매 프레임 메인 렌더 직전에 — 마스크를 그린다 */
  renderMask(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
  /** 매 프레임 메인 렌더 뒤에 — CSS 층 위치를 맞춘다 */
  renderCss(camera: THREE.Camera): void;
  resize(w: number, h: number): void;
}

const COMPOSITE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, tMask: { value: null as THREE.Texture | null }, uOpen: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform sampler2D tMask; uniform float uOpen; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float hole = texture2D(tMask, vUv).r * uOpen;
      float a = 1.0 - hole;
      // 캔버스는 미리 곱한 알파(premultiplied)다
      gl_FragColor = vec4(c.rgb * a, a);
    }
  `,
};

export function createVideoWall(): VideoWall {
  const css = new CSS3DRenderer();
  const root = css.domElement;
  root.classList.add('video-wall');
  document.body.prepend(root);

  const frame = document.createElement('div');
  frame.className = 'video-wall-frame';
  frame.style.width = `${DOM_W_PX}px`;
  frame.style.height = `${DOM_H_PX}px`;
  const mount = document.createElement('div');
  mount.className = 'video-wall-player';
  frame.appendChild(mount);

  const cssScene = new THREE.Scene();
  const obj = new CSS3DObject(frame);
  obj.scale.setScalar(SCREEN_W_M / DOM_W_PX);
  const center = new THREE.Vector3(0, STAGE_HEIGHT_M + SCREEN_H_M / 2, STAGE_Z_M - STAGE_DEPTH_M / 2 + 0.85);
  obj.position.copy(center);
  cssScene.add(obj);

  // 구멍 판: 메인 렌더에서는 검게(영상이 비칠 자리), 마스크 렌더에서는 하얗게
  const black = new THREE.MeshBasicMaterial({ color: '#000000' });
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const holeMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W_M, SCREEN_H_M), black);
  holeMesh.position.copy(center).add(new THREE.Vector3(0, 0, 0.02));

  const maskRT = new THREE.WebGLRenderTarget(1, 1);
  const occluder = new THREE.MeshBasicMaterial({ color: '#000000' });
  const compositePass = new ShaderPass(COMPOSITE);
  compositePass.uniforms.tMask.value = maskRT.texture;

  let open = 0;
  return {
    mount,
    holeMesh,
    compositePass,
    setLevel(k) {
      open = k;
      compositePass.uniforms.uOpen.value = k > 0.02 ? 1 : 0;
      root.style.visibility = k > 0.02 ? 'visible' : 'hidden';
      root.style.opacity = String(k);
    },
    renderMask(renderer, scene, camera) {
      if (open <= 0.02) return;
      const prevTarget = renderer.getRenderTarget();
      const prevBg = scene.background;
      const prevMask = camera.layers.mask;
      scene.background = null;
      scene.overrideMaterial = occluder;
      camera.layers.set(0);
      renderer.setRenderTarget(maskRT);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      // 같은 깊이 버퍼 위에 구멍 판만 하얗게 — 앞에 있는 물체에 가려진 곳은 검게 남는다
      holeMesh.material = white;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(holeMesh, camera);
      renderer.autoClear = autoClear;
      holeMesh.material = black;
      camera.layers.mask = prevMask;
      scene.background = prevBg;
      renderer.setRenderTarget(prevTarget);
    },
    renderCss(camera) {
      css.render(cssScene, camera);
    },
    resize(w, h) {
      css.setSize(w, h);
      maskRT.setSize(Math.max(1, Math.round(w * MASK_SCALE)), Math.max(1, Math.round(h * MASK_SCALE)));
    },
  };
}
