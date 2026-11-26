import { MAIN_SETLIST } from './setlist.js';

/*
 * 공유 티켓: "2026.10.02 고양, 나는 그날 밤 그 자리에 있었다" 이미지(1080×1350, 인스타그램 세로)를 만든다.
 * 투표(온라인 투표 100점)로 이어지게 퍼뜨릴 거리 — 이름은 이미지 안에만 들어가고 어디에도 보내지 않는다.
 */

const W = 1080;
const H = 1350;
const SHOT_H = 560;
const PAPER = '#ede7dc';
const INK = '#1b1a1f';
const STAMP_RED = '#d8402e';
const STAMP_GREEN = '#1f8a52';
const NAME_MAX = 12;

/** 사진을 상자에 꽉 차게(cover) 그린다 */
function drawCover(g: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, x: number, y: number, w: number, h: number): void {
  const k = Math.max(w / iw, h / ih);
  const sw = w / k;
  const sh = h / k;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function stamp(g: CanvasRenderingContext2D, x: number, y: number, rot: number, color: string, big: string, small: string, alpha = 1): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 8;
  g.font = '92px "Black Han Sans", sans-serif';
  const w = Math.max(g.measureText(big).width, 260) + 60;
  g.strokeRect(-w / 2, -80, w, 160);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(big, 0, -12);
  g.font = '34px "Bebas Neue", sans-serif';
  g.fillText(small, 0, 52);
  g.restore();
}

/**
 * @param shot 지금 3D 장면 캡처(WebGL 캔버스)
 * @param name 방문자가 넣은 이름(비우면 "나")
 */
export async function drawTicket(shot: HTMLCanvasElement, name: string, siteUrl: string): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#06070b';
  g.fillRect(0, 0, W, H);
  drawCover(g, shot, shot.width, shot.height, 0, 0, W, SHOT_H);
  const fade = g.createLinearGradient(0, SHOT_H - 220, 0, SHOT_H);
  fade.addColorStop(0, 'rgba(6,7,11,0)');
  fade.addColorStop(1, 'rgba(6,7,11,1)');
  g.fillStyle = fade;
  g.fillRect(0, SHOT_H - 220, W, 220);

  g.fillStyle = '#ffc75a';
  g.font = '40px "Bebas Neue", sans-serif';
  g.fillText('10.02 FRI · GOYANG STADIUM', 60, 80);
  g.fillStyle = '#f1eee8';
  g.font = '110px "Black Han Sans", sans-serif';
  g.fillText('열리지 않은 밤', 60, SHOT_H - 60);

  // ─── 티켓 몸통 ───
  const ty = SHOT_H + 20;
  const th = H - ty - 90;
  g.fillStyle = PAPER;
  g.beginPath();
  g.roundRect(40, ty, W - 80, th, 22);
  g.fill();
  // 절취선
  g.setLineDash([14, 12]);
  g.strokeStyle = '#b9b1a4';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(W - 250, ty + 20);
  g.lineTo(W - 250, ty + th - 20);
  g.stroke();
  g.setLineDash([]);

  g.fillStyle = INK;
  g.font = '54px "Bebas Neue", sans-serif';
  g.fillText('THE BIG STADIUM WORLD TOUR IN SEOUL', 80, ty + 80);
  const who = name.trim().slice(0, NAME_MAX) || '나';
  g.font = '46px "Black Han Sans", sans-serif';
  g.fillText(`${who}${name.trim() ? ' 님' : ''}은 그날 밤 그 자리에 있었다`, 80, ty + 150);
  g.font = '26px "Noto Sans KR", sans-serif';
  g.fillStyle = '#6b6660';
  g.fillText(`2026.10.02 (금) · 고양종합운동장 · 그라운드 스탠딩 · ${MAIN_SETLIST.length}곡`, 80, ty + 192);
  g.fillStyle = STAMP_RED;
  g.font = '30px "Bebas Neue", sans-serif';
  g.fillText('SPECIAL GUEST · DON TOLIVER', 80, ty + 228);

  // 세트리스트 두 단
  g.font = '28px "Bebas Neue", sans-serif';
  g.fillStyle = INK;
  const colX = [80, 400];
  MAIN_SETLIST.forEach((s, i) => {
    const col = i < 11 ? 0 : 1;
    const row = i % 11;
    g.fillStyle = '#9a948a';
    g.fillText(String(i + 1).padStart(2, '0'), colX[col], ty + 272 + row * 32);
    g.fillStyle = INK;
    g.fillText(s.title.toUpperCase(), colX[col] + 42, ty + 272 + row * 32);
  });

  // 도장: 지운 연기 도장 위에 '입장 확인'
  stamp(g, W - 140, ty + 230, -0.2, STAMP_RED, '연기', 'POSTPONED', 0.35);
  g.strokeStyle = STAMP_RED;
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(W - 240, ty + 300);
  g.lineTo(W - 40, ty + 160);
  g.stroke();
  stamp(g, W - 140, ty + 470, 0.12, STAMP_GREEN, '입장', 'I WAS THERE');

  g.save();
  g.translate(W - 140, ty + th - 60);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#6b6660';
  g.font = '30px "Bebas Neue", sans-serif';
  g.textAlign = 'center';
  g.fillText('ADMIT ONE', 0, 0);
  g.restore();

  g.fillStyle = '#a3a3ae';
  g.font = '26px "Noto Sans KR", sans-serif';
  g.fillText(`팬이 만든 비공식 작업 · ${siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`, 60, H - 40);
  return c;
}

export interface TicketShare {
  /** 폰은 공유 창(파일 첨부), 안 되면 PNG 저장 + 링크 복사 */
  share(card: HTMLCanvasElement, siteUrl: string): Promise<'shared' | 'downloaded'>;
}

export function createTicketShare(): TicketShare {
  return {
    async share(card, siteUrl) {
      const blob = await new Promise<Blob | null>((res) => card.toBlob(res, 'image/png'));
      if (!blob) throw new Error('[ticket] could not encode ticket image');
      const file = new File([blob], 'unopened-night-ticket.png', { type: 'image/png' });
      const text = '연기된 2026.10.02 고양 공연, 나는 그날 밤 그 자리에 있었다 — 열리지 않은 밤';
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: '열리지 않은 밤', text, url: siteUrl });
          return 'shared';
        } catch (err) {
          // 사용자가 공유 창을 닫은 것도 여기로 온다 — 저장으로 넘어간다(비핵심)
          console.warn('[ticket] share cancelled or failed', err);
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      // 링크 복사는 실패해도 저장은 됐다(비핵심)
      await navigator.clipboard?.writeText(`${text} ${siteUrl}`).catch(() => undefined);
      return 'downloaded';
    },
  };
}
