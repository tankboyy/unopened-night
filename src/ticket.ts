/** 티켓의 「연기」 도장을 끌어서 떼어 내면 「입장 확인」으로 바뀐다. 키보드는 Enter/Space 로 같은 동작 */

/** 이 거리(px) 이상 끌고 놓아야 떨어진다 — 그보다 짧으면 제자리로 돌아간다 */
const PEEL_DISTANCE_PX = 90;

export function setupTicket(ticket: HTMLElement, stamp: HTMLElement, status: HTMLElement): void {
  let gone = false;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const peel = (vx = 3, vy = -6): void => {
    if (gone) return;
    gone = true;
    ticket.classList.add('ok');
    status.textContent = '상태: 입장 확인';
    if (reduceMotion) {
      stamp.remove();
      return;
    }
    const base = stamp.getBoundingClientRect();
    stamp.style.position = 'fixed';
    stamp.style.left = `${base.left}px`;
    stamp.style.top = `${base.top}px`;
    const start = performance.now();
    const fall = (now: number): void => {
      const dt = (now - start) / 1000;
      const x = vx * 60 * dt;
      const y = vy * 60 * dt + 900 * dt * dt;
      stamp.style.transform = `translate(${x}px,${y}px) rotate(${-14 + vx * 40 * dt}deg)`;
      if (y < innerHeight + 200) requestAnimationFrame(fall);
      else stamp.remove();
    };
    requestAnimationFrame(fall);
  };

  let drag: { x: number; y: number; lx: number; ly: number; vx: number; vy: number } | null = null;
  stamp.addEventListener('pointerdown', (e) => {
    stamp.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, vx: 0, vy: 0 };
  });
  stamp.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.vx = e.clientX - drag.lx;
    drag.vy = e.clientY - drag.ly;
    drag.lx = e.clientX;
    drag.ly = e.clientY;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    stamp.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${-14 + dx * 0.08}deg)`;
  });
  stamp.addEventListener('pointerup', (e) => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > PEEL_DISTANCE_PX) peel(drag.vx * 0.4, drag.vy * 0.4);
    else stamp.style.transform = 'translate(-50%,-50%) rotate(-14deg)';
    drag = null;
  });
  stamp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      peel();
    }
  });
}
