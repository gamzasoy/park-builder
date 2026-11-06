/**
 * 툴바 아이콘: 게임 화면과 같은 스프라이트(render/sprites.ts)를 작은 캔버스에 그려 이미지로 만든다.
 * 한 번 만든 아이콘은 캐시한다. 캔버스를 쓸 수 없는 환경이면 빈 문자열(아이콘 없이 글자만).
 */
import { getDef } from '../data';
import type { SceneryDef } from '../data/scenery';
import { tileToWorld, type Vec2 } from '../render/iso';
import { drawMascot, drawRideSprite, drawScenery, drawVendorTray, poly, setSeason, type Quad } from '../render/sprites';
import type { StaffKind } from '../sim/staff';

const W = 44;
const H = 40;
const cache = new Map<string, string>();

function render(key: string, paint: (ctx: CanvasRenderingContext2D) => void): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let url = '';
  try {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      paint(ctx);
      url = c.toDataURL();
    }
  } catch {
    url = '';
  }
  cache.set(key, url);
  return url;
}

/** w×h 타일 풋프린트가 아이콘 아래쪽 가운데에 들어가도록 한 Quad와 확대율 */
function fit(w: number, h: number, height: number): { q: Quad; z: number } {
  const span = (w + h) * 32; // 화면 폭(확대 1)
  const z = Math.min((W - 4) / span, (H - 4) / ((w + h) * 16 + height));
  const P = (tx: number, ty: number): Vec2 => {
    const p = tileToWorld(tx - w / 2, ty - h / 2);
    return { x: W / 2 + p.x * z, y: H - 3 - ((w + h) * 16) * z / 2 + p.y * z };
  };
  return { q: { top: P(0, 0), right: P(w, 0), bottom: P(w, h), left: P(0, h) }, z };
}

export function buildingIcon(id: string): string {
  return render(`b:${id}`, (ctx) => {
    const def = getDef(id);
    // 코스터는 역보다 레일이 상징적이라 높이를 낮게 잡아 크게 보이게 한다
    const visualH = { carousel: 60, wheel: 110, bumper: 40, drop: 150, coaster: 34, teacups: 40, swing: 90, viking: 95, haunted: 70, slide: 80 }[id] ?? 34;
    const { q, z } = fit(def.w, def.h, visualH);
    if (id === 'coaster') {
      // 노란 레일 언덕
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#6b4a12';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(4, H - 8);
      ctx.bezierCurveTo(14, 2, 22, 2, 28, 22);
      ctx.quadraticCurveTo(33, 34, 40, 14);
      ctx.stroke();
      ctx.strokeStyle = '#f2c230';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#7a5230';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const x of [12, 18, 24]) { ctx.moveTo(x, 12); ctx.lineTo(x, H - 4); }
      ctx.stroke();
      return;
    }
    drawRideSprite(ctx, id, q, { z, time: 0, running: false, color: def.color, rot: 0 }, def.w, def.h);
  });
}

export function sceneryIcon(def: SceneryDef): string {
  return render(`s:${def.id}`, (ctx) => {
    const { q, z } = fit(1, 1, 30);
    poly(ctx, [q.top, q.right, q.bottom, q.left], '#3f8b3a', 'rgba(0,0,0,0.25)');
    const c = { x: (q.top.x + q.bottom.x) / 2, y: (q.top.y + q.bottom.y) / 2 };
    setSeason('summer'); // 아이콘은 늘 여름 모습(화면은 프레임마다 계절을 다시 정한다)
    drawScenery(ctx, def.kind, c.x, c.y, z * 1.5, 0.5);
  });
}

export function staffIcon(kind: StaffKind): string {
  return render(`staff:${kind}`, (ctx) => {
    const cx = W / 2;
    if (kind === 'entertainer') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx, H - 5, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      drawMascot(ctx, cx, H - 4, 1.55, Math.PI, true);
      return;
    }
    const vest = { janitor: '#f08a24', mechanic: '#2f78d0', vendor: '#d94848' }[kind];
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, H - 5, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a3342';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 3, H - 16); ctx.lineTo(cx - 3, H - 6);
    ctx.moveTo(cx + 3, H - 16); ctx.lineTo(cx + 3, H - 6);
    ctx.stroke();
    ctx.fillStyle = vest;
    ctx.beginPath();
    ctx.roundRect(cx - 8, H - 30, 16, 15, 3);
    ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(cx - 8, H - 23, 16, 3);
    ctx.fillStyle = '#f1d3b0';
    ctx.beginPath();
    ctx.arc(cx, H - 34, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = vest;
    ctx.beginPath();
    ctx.arc(cx, H - 35.5, 6.4, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - 8, H - 36, 16, 2.5);
    if (kind === 'janitor') {
      // 빗자루
      ctx.strokeStyle = '#7a5230';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 11, H - 30); ctx.lineTo(cx + 15, H - 7);
      ctx.stroke();
      ctx.strokeStyle = '#d9b85a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx + 12, H - 6); ctx.lineTo(cx + 19, H - 6);
      ctx.stroke();
    } else if (kind === 'vendor') {
      drawVendorTray(ctx, cx, H - 5.6, 2.14);
    }
  });
}

export function fireworksIcon(): string {
  return render('fireworks', (ctx) => {
    ctx.fillStyle = '#1d2547';
    ctx.beginPath();
    ctx.roundRect(4, 3, W - 8, H - 6, 6);
    ctx.fill();
    const bursts: [number, number, number, string][] = [[16, 15, 9, '#f2c230'], [30, 12, 7, '#ef8fb4'], [27, 26, 6, '#4ac9c0']];
    ctx.lineCap = 'round';
    for (const [x, y, r, c] of bursts) {
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.moveTo(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,230,160,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, H - 5); ctx.lineTo(16, 25);
    ctx.stroke();
  });
}

export function photoIcon(): string {
  return render('photo', (ctx) => {
    const x = 7, y = 11, w = W - 14, h = H - 18;
    ctx.fillStyle = '#2a2f3a';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = '#2a2f3a';
    ctx.fillRect(x + 6, y - 4, 10, 5);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(x + w - 8, y + 3, 4, 3);
    const cx = W / 2, cy = y + h / 2 + 1;
    ctx.fillStyle = '#c9ced8';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a6fd0';
    ctx.beginPath();
    ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function pathIcon(): string {
  return render('path', (ctx) => {
    const { q } = fit(2, 2, 0);
    poly(ctx, [q.top, q.right, q.bottom, q.left], '#a3a29c', '#6f6e68');
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo((q.top.x + q.left.x) / 2, (q.top.y + q.left.y) / 2);
    ctx.lineTo((q.right.x + q.bottom.x) / 2, (q.right.y + q.bottom.y) / 2);
    ctx.moveTo((q.top.x + q.right.x) / 2, (q.top.y + q.right.y) / 2);
    ctx.lineTo((q.left.x + q.bottom.x) / 2, (q.left.y + q.bottom.y) / 2);
    ctx.stroke();
  });
}

export function demolishIcon(): string {
  return render('demolish', (ctx) => {
    // 불도저 삽 + 빨간 X
    ctx.fillStyle = '#f2c230';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(10, 16, 22, 12, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(9, 28, 26, 5);
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(4, 22, 5, 11);
    ctx.strokeStyle = '#d33a2c';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(28, 4); ctx.lineTo(40, 14);
    ctx.moveTo(40, 4); ctx.lineTo(28, 14);
    ctx.stroke();
  });
}

/** 지형 도구: 흙 블록 위에 올림(▲)/내림(▼) 화살표 */
export function terrainIcon(mode: 'raise' | 'lower'): string {
  return render(`terrain:${mode}`, (ctx) => {
    const { q } = fit(2, 2, 0);
    const d = 7; // 블록 옆면 두께
    const lift = mode === 'raise' ? -d : 0;
    const sh = (p: Vec2): Vec2 => ({ x: p.x, y: p.y + lift });
    const t = sh(q.top), r = sh(q.right), b = sh(q.bottom), l = sh(q.left);
    poly(ctx, [l, b, { x: b.x, y: b.y + d }, { x: l.x, y: l.y + d }], '#7a5a3a', 'rgba(0,0,0,0.3)');
    poly(ctx, [b, r, { x: r.x, y: r.y + d }, { x: b.x, y: b.y + d }], '#5f4529', 'rgba(0,0,0,0.3)');
    poly(ctx, [t, r, b, l], '#4f9a45', 'rgba(0,0,0,0.25)');
    // 화살표
    const cx = (t.x + b.x) / 2;
    const cy = (t.y + b.y) / 2;
    const up = mode === 'raise';
    ctx.fillStyle = up ? '#fff3b0' : '#d8e6ff';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const s = up ? -1 : 1;
    ctx.moveTo(cx, cy + s * 9);
    ctx.lineTo(cx - 7, cy + s * 1);
    ctx.lineTo(cx - 3, cy + s * 1);
    ctx.lineTo(cx - 3, cy - s * 7);
    ctx.lineTo(cx + 3, cy - s * 7);
    ctx.lineTo(cx + 3, cy + s * 1);
    ctx.lineTo(cx + 7, cy + s * 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}
