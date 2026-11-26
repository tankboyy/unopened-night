import * as THREE from 'three';

/*
 * 공연자 전용 캐리커처 머리. 바탕 아바타(Bruno)의 얼굴은 숨기고 이 머리를 머리 뼈에 따라 붙인다.
 * 사진·실제 텍스처 없이 코드로만 그린 팬아트: 카우보이 모자, 덥수룩한 수염·콧수염, 졸린 눈,
 * 눈 밑 "Always" / "Tired", 눈썹 위 "Stay" / "Away" 글자 문신.
 *
 * 좌표: 원점 = 머리 중심, +z = 얼굴 정면, 단위 미터.
 * 구 UV 에서 u=0.25 가 +z(정면)이고, u 가 커질수록 +x = 공연자의 **왼쪽**이다.
 * 그래서 캔버스 왼쪽(작은 x)에 그린 것이 공연자의 오른쪽 얼굴에 붙는다.
 */

const SKULL_R = 0.104;
const SKIN = '#e3b190';
const HAIR = '#3b2a1e';
const BEARD = '#4a3424';
const INK = '#2a3245';

const TEX_W = 1024;
const TEX_H = 512;
/** 정면 중심의 캔버스 x (u=0.25) */
const FACE_X = TEX_W * 0.25;
/** 눈 높이의 캔버스 y — 적도(256)보다 살짝 위 */
const EYE_Y = 246;
/** 눈 사이 반간격(px). 머리 반지름 0.104m 에서 약 3cm */
const EYE_DX = 46;

function paintFace(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d')!;
  g.fillStyle = SKIN;
  g.fillRect(0, 0, TEX_W, TEX_H);
  // 볼 홍조
  for (const dx of [-62, 62]) {
    const rg = g.createRadialGradient(FACE_X + dx, EYE_Y + 48, 2, FACE_X + dx, EYE_Y + 48, 34);
    rg.addColorStop(0, 'rgba(214,130,110,.45)');
    rg.addColorStop(1, 'rgba(214,130,110,0)');
    g.fillStyle = rg;
    g.fillRect(FACE_X + dx - 40, EYE_Y + 8, 80, 80);
  }

  // 졸린 눈: 흰자 → 홍채 → 윗눈꺼풀이 절반을 덮는다
  for (const dx of [-EYE_DX, EYE_DX]) {
    const x = FACE_X + dx;
    g.fillStyle = '#f4efe8';
    g.beginPath();
    g.ellipse(x, EYE_Y, 15, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4a3020';
    g.beginPath();
    g.arc(x + (dx > 0 ? -1 : 1), EYE_Y + 1, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = SKIN;
    g.beginPath();
    g.ellipse(x, EYE_Y - 5, 17, 6.5, 0, Math.PI, Math.PI * 2);
    g.rect(x - 17, EYE_Y - 12, 34, 7);
    g.fill();
    g.strokeStyle = '#3a2418';
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(x - 16, EYE_Y - 1);
    g.quadraticCurveTo(x, EYE_Y - 5, x + 16, EYE_Y - 1);
    g.stroke();
    // 눈 밑 그늘
    g.strokeStyle = 'rgba(150,90,80,.55)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x - 12, EYE_Y + 9);
    g.quadraticCurveTo(x, EYE_Y + 13, x + 12, EYE_Y + 9);
    g.stroke();
    // 굵은 눈썹
    g.strokeStyle = HAIR;
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath();
    const inner = dx > 0 ? -1 : 1;
    g.moveTo(x + inner * 14, EYE_Y - 22);
    g.quadraticCurveTo(x, EYE_Y - 27, x - inner * 18, EYE_Y - 21);
    g.stroke();
  }

  // 글자 문신 — 손글씨 느낌의 기울어진 세리프
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 무대 거리에서도 읽히도록 실제보다 굵고 크게 — 캐리커처의 과장
  g.font = 'italic 700 21px Georgia, "Times New Roman", serif';
  g.fillText('Always', FACE_X - EYE_DX - 4, EYE_Y + 27);
  g.fillText('Tired', FACE_X + EYE_DX + 4, EYE_Y + 27);
  g.font = 'italic 700 17px Georgia, "Times New Roman", serif';
  g.fillText('Stay', FACE_X - EYE_DX + 2, EYE_Y - 44);
  g.fillText('Away', FACE_X + EYE_DX - 2, EYE_Y - 44);
  // 볼·관자놀이의 작은 그림 문신들(특정 도안이 아닌 낙서풍 기호)
  g.strokeStyle = INK;
  g.lineWidth = 2;
  const doodle = (x: number, y: number, kind: number): void => {
    g.beginPath();
    if (kind === 0) { g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.moveTo(x, y - 6); g.lineTo(x, y + 6); }
    else if (kind === 1) { g.arc(x, y, 5, 0, Math.PI * 2); }
    else { g.moveTo(x - 6, y + 4); g.lineTo(x, y - 5); g.lineTo(x + 6, y + 4); }
    g.stroke();
  };
  doodle(FACE_X - 82, EYE_Y + 4, 0);
  doodle(FACE_X + 84, EYE_Y - 8, 2);
  doodle(FACE_X + 76, EYE_Y + 30, 1);
  doodle(FACE_X - 74, EYE_Y - 30, 1);
  // 이마 가로 철조망 띠
  g.lineWidth = 1.6;
  g.beginPath();
  for (let x = FACE_X - 70; x <= FACE_X + 70; x += 2) g.lineTo(x, EYE_Y - 66 + Math.sin(x * 0.35) * 2.2);
  g.stroke();
  for (let x = FACE_X - 64; x <= FACE_X + 64; x += 16) {
    g.beginPath();
    g.moveTo(x - 3, EYE_Y - 70);
    g.lineTo(x + 3, EYE_Y - 62);
    g.moveTo(x + 3, EYE_Y - 70);
    g.lineTo(x - 3, EYE_Y - 62);
    g.stroke();
  }

  // 모자 아래로 보이는 옆·뒷머리: 정면을 뺀 둘레 위쪽을 머리색으로
  g.fillStyle = HAIR;
  g.fillRect(0, 0, TEX_W, 150);
  g.fillRect(FACE_X + 115, 150, TEX_W - (FACE_X + 115), 140);
  g.fillRect(0, 150, FACE_X - 115, 140);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 수염용 거친 털 질감 */
function scruffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = BEARD;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const l = 18 + Math.random() * 30;
    g.fillStyle = `rgba(${l + 40},${l + 20},${l},${0.35 + Math.random() * 0.4})`;
    g.fillRect(x, y, 1.2, 3 + Math.random() * 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

function buildHat(): THREE.Group {
  const hat = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#2b1e15', roughness: 0.85 });
  // 챙: 양옆이 말려 올라간 카우보이 챙을 반지름별 높이로 흉내 낸다
  const brimPts = [new THREE.Vector2(0.0, 0), new THREE.Vector2(0.11, 0), new THREE.Vector2(0.18, 0.006), new THREE.Vector2(0.215, 0.03), new THREE.Vector2(0.22, 0.042)];
  const brim = new THREE.Mesh(new THREE.LatheGeometry(brimPts, 48), mat);
  brim.scale.set(1, 1, 0.86);
  // 앞뒤 챙은 아래로, 양옆은 위로 — 챙 정점 높이를 각도에 따라 비튼다
  const pos = brim.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.1) continue;
    const side = Math.abs(x) / r;
    pos.setY(i, pos.getY(i) + (side * side * 0.035 - (1 - side) * 0.012) * ((r - 0.1) / 0.12));
  }
  brim.geometry.computeVertexNormals();
  const crownPts = [new THREE.Vector2(0.108, 0), new THREE.Vector2(0.11, 0.07), new THREE.Vector2(0.1, 0.125), new THREE.Vector2(0.055, 0.14), new THREE.Vector2(0.0, 0.128)];
  const crown = new THREE.Mesh(new THREE.LatheGeometry(crownPts, 40), mat);
  crown.scale.set(0.95, 1, 1.05);
  // 정수리 가운데가 눌린 크리스 — 앞뒤로 길게 파인 홈
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.111, 0.111, 0.016, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.6 }));
  band.scale.set(0.95, 1, 1.05);
  band.position.y = 0.018;
  hat.add(brim, crown, band);
  return hat;
}

export function buildCaricatureHead(): THREE.Group {
  const head = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 1, metalness: 0, emissive: '#2a160c' });

  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(SKULL_R, 64, 40),
    new THREE.MeshStandardMaterial({ map: paintFace(), roughness: 1, metalness: 0, emissive: '#2a160c' }),
  );
  skull.scale.set(0.86, 1.18, 0.98);
  head.add(skull);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 20, 14), skinMat);
  nose.scale.set(0.95, 1.35, 1.1);
  nose.position.set(0, -0.012, SKULL_R * 0.98);
  head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), skinMat);
    ear.scale.set(0.45, 1.1, 0.8);
    ear.position.set(sx * SKULL_R * 0.9, -0.004, -0.004);
    head.add(ear);
  }

  const scruff = scruffTexture();
  const beardMat = new THREE.MeshStandardMaterial({ map: scruff, roughness: 1, emissive: '#1a1008' });
  // 턱·볼을 감싸는 수염 껍데기: 구의 아래 앞쪽 띠만 쓴다(φ 가 π/2 일 때 +z 정면)
  const beard = new THREE.Mesh(new THREE.SphereGeometry(SKULL_R * 1.07, 48, 24, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.6, Math.PI * 0.3), beardMat);
  beard.scale.set(0.95, 1.16, 1.05);
  beard.position.y = -0.006;
  head.add(beard);
  // 턱 끝 볼륨
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), beardMat);
  chin.scale.set(1.25, 0.9, 0.8);
  chin.position.set(0, -SKULL_R * 0.92, SKULL_R * 0.55);
  head.add(chin);
  const mustache = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.011, 10, 24, Math.PI), beardMat);
  mustache.rotation.z = Math.PI;
  mustache.scale.set(1.15, 0.7, 1);
  mustache.position.set(0, -0.035, SKULL_R * 0.93);
  head.add(mustache);
  const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.026, 4, 8), new THREE.MeshStandardMaterial({ color: '#7a3b33' }));
  mouth.rotation.z = Math.PI / 2;
  mouth.position.set(0, -0.052, SKULL_R * 0.95);
  head.add(mouth);

  const hat = buildHat();
  hat.position.set(0, SKULL_R * 0.62, -0.006);
  hat.rotation.x = -0.1;
  head.add(hat);
  return head;
}
