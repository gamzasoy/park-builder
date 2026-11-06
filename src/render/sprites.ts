/**
 * 놀이기구·매점·나무를 절차적으로 그리는 스프라이트 모음.
 * 모든 함수는 화면 좌표(이미 카메라 변환된 값)와 확대율 z를 받으므로
 * 게임 화면(renderer.ts)과 툴바 아이콘(ui/icons.ts)에서 함께 쓴다.
 */
import { BIN, FLOWERS, OAK, PINE } from '../data/scenery';
import { shade } from './color';
import type { Vec2 } from './iso';

/** 풋프린트의 네 모서리(지면 높이, 화면 좌표). top = 타일 좌표 최소 모서리 */
export interface Quad { top: Vec2; right: Vec2; bottom: Vec2; left: Vec2 }

export interface SpriteOpts {
  z: number;
  /** 애니메이션 시간(틱, 보간 포함) */
  time: number;
  running: boolean;
  color: string;
  rot: number;
}

const TAU = Math.PI * 2;
const OUTLINE = 'rgba(0,0,0,0.35)';
export const PALETTE = ['#e8564a', '#4a8fe8', '#f2c230', '#7bc86c', '#b06ce0', '#ef8fb4', '#4ac9c0', '#f08a3c'];

const up = (p: Vec2, h: number): Vec2 => ({ x: p.x, y: p.y - h });
const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const center = (q: Quad): Vec2 => mid(q.top, q.bottom);

/** 풋프린트 안의 (u, v) 지점. u는 top→right(타일 x), v는 top→left(타일 y) 방향 0~1 */
export function quadPoint(q: Quad, u: number, v: number): Vec2 {
  return {
    x: q.top.x + u * (q.right.x - q.top.x) + v * (q.left.x - q.top.x),
    y: q.top.y + u * (q.right.y - q.top.y) + v * (q.left.y - q.top.y),
  };
}

/** 중심 쪽으로 f배 축소한 풋프린트 */
export function insetQuad(q: Quad, f: number): Quad {
  const c = center(q);
  const s = (p: Vec2): Vec2 => ({ x: c.x + (p.x - c.x) * f, y: c.y + (p.y - c.y) * f });
  return { top: s(q.top), right: s(q.right), bottom: s(q.bottom), left: s(q.left) };
}

export function poly(ctx: CanvasRenderingContext2D, pts: Vec2[], fill: string, stroke: string | null = OUTLINE): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function line(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** 높이 h0~h1 사이의 상자(보이는 두 옆면 + 윗면) */
export function box(
  ctx: CanvasRenderingContext2D, q: Quad, h0: number, h1: number,
  top: string, left: string, right: string,
): void {
  poly(ctx, [up(q.left, h0), up(q.bottom, h0), up(q.bottom, h1), up(q.left, h1)], left);
  poly(ctx, [up(q.bottom, h0), up(q.right, h0), up(q.right, h1), up(q.bottom, h1)], right);
  poly(ctx, [up(q.top, h1), up(q.right, h1), up(q.bottom, h1), up(q.left, h1)], top);
}

/** 한 색으로 상자: 왼쪽 면은 조금, 오른쪽 면은 많이 어둡게 */
export function tintBox(ctx: CanvasRenderingContext2D, q: Quad, h0: number, h1: number, color: string): void {
  box(ctx, q, h0, h1, color, shade(color, 0.8), shade(color, 0.6));
}

/** 원기둥(높이 h): 옆면 띠 + 윗면 타원 */
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, h: number, top: string, side: string): void {
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy - h);
  ctx.lineTo(cx - rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rx, cy - h);
  ctx.ellipse(cx, cy - h, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = side;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy - h, rx, ry, 0, 0, TAU);
  ctx.fillStyle = top;
  ctx.fill();
  ctx.stroke();
}

function shadow(ctx: CanvasRenderingContext2D, q: Quad, f = 1): void {
  const c = center(q);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(c.x + 4 * f, c.y + 2 * f, ((q.right.x - q.left.x) / 2) * 0.95, ((q.bottom.y - q.top.y) / 2) * 0.95, 0, 0, TAU);
  ctx.fill();
}

/** 놀이기구 바닥의 포장 받침 */
function plinth(ctx: CanvasRenderingContext2D, q: Quad, z: number): void {
  box(ctx, insetQuad(q, 0.97), 0, 3 * z, '#cfc6ae', '#a69d86', '#8c8470');
  // 포장 줄눈
  const t = insetQuad(q, 0.97);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const a = up(quadPoint(t, i / 4, 0), 3 * z);
    const b = up(quadPoint(t, i / 4, 1), 3 * z);
    const c = up(quadPoint(t, 0, i / 4), 3 * z);
    const d = up(quadPoint(t, 1, i / 4), 3 * z);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  }
  ctx.stroke();
}

/** 원뿔 지붕: 줄무늬 쐐기를 뒤에서 앞 순서로 */
function cone(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, h: number,
  colors: [string, string], segments = 16, phase = 0,
): void {
  const wedges: { a0: number; a1: number; i: number }[] = [];
  for (let i = 0; i < segments; i++) wedges.push({ a0: phase + (i * TAU) / segments, a1: phase + ((i + 1) * TAU) / segments, i });
  wedges.sort((a, b) => Math.sin((a.a0 + a.a1) / 2) - Math.sin((b.a0 + b.a1) / 2));
  const apex = { x: cx, y: cy - h };
  for (const w of wedges) {
    const m = (w.a0 + w.a1) / 2;
    const light = 0.75 + 0.35 * Math.max(0, -Math.cos(m - 0.6)); // 왼쪽 위에서 빛
    const base = colors[w.i % 2];
    poly(ctx, [
      apex,
      { x: cx + Math.cos(w.a0) * rx, y: cy + Math.sin(w.a0) * ry },
      { x: cx + Math.cos(w.a1) * rx, y: cy + Math.sin(w.a1) * ry },
    ], shade(base, light), 'rgba(0,0,0,0.15)');
  }
}

function flag(ctx: CanvasRenderingContext2D, p: Vec2, z: number, color: string, time: number): void {
  line(ctx, p, up(p, 10 * z), '#555', Math.max(1, z));
  const wave = Math.sin(time * 0.2) * 1.5 * z;
  poly(ctx, [up(p, 10 * z), { x: p.x + 7 * z, y: p.y - 8.5 * z + wave }, up(p, 7 * z)], color, null);
}

// ---------------------------------------------------------------- 놀이기구

function carousel(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  const z = o.z;
  shadow(ctx, q, z);
  plinth(ctx, q, z);
  const c = center(q);
  const rx = ((q.right.x - q.left.x) / 2) * 0.72;
  const ry = rx / 2;
  const spin = o.running ? o.time * 0.06 : 0;
  disc(ctx, c.x, c.y - 3 * z, rx, ry, 5 * z, '#e8d6a8', '#9a6b3c');
  const floorY = c.y - 8 * z;
  const poleH = 22 * z;

  const horses = Array.from({ length: 8 }, (_, i) => spin + (i * TAU) / 8)
    .map((a) => ({ a, x: c.x + Math.cos(a) * rx * 0.78, y: floorY + Math.sin(a) * ry * 0.78 }))
    .sort((p, r) => p.y - r.y);
  const drawHorse = (h: { a: number; x: number; y: number }, i: number): void => {
    line(ctx, { x: h.x, y: h.y }, { x: h.x, y: h.y - poleH }, '#f3e3a0', Math.max(1, 1.5 * z));
    const bob = o.running ? Math.sin(o.time * 0.25 + i * 1.3) * 2.5 * z : 0;
    const dir = Math.sin(h.a) > 0 ? -1 : 1; // 진행 방향을 바라본다
    ctx.fillStyle = i % 2 ? '#f6f0e4' : '#8a5a34';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(h.x - 4.5 * z, h.y - 11 * z + bob, 9 * z, 4.5 * z, 2 * z);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(h.x + dir * 3 * z - 1.2 * z, h.y - 14 * z + bob, 2.4 * z, 4 * z); // 머리
  };
  horses.forEach((h, i) => { if (Math.sin(h.a) < 0) drawHorse(h, i); });
  // 중앙 기둥
  ctx.fillStyle = '#d4a24a';
  ctx.fillRect(c.x - 4 * z, floorY - poleH, 8 * z, poleH);
  ctx.strokeStyle = OUTLINE;
  ctx.strokeRect(c.x - 4 * z, floorY - poleH, 8 * z, poleH);
  horses.forEach((h, i) => { if (Math.sin(h.a) >= 0) drawHorse(h, i); });

  // 지붕: 처마 띠 + 줄무늬 원뿔 + 깃발
  const roofY = floorY - poleH;
  disc(ctx, c.x, roofY, rx * 1.08, ry * 1.08, 3 * z, '#f08a24', '#b8561a');
  cone(ctx, c.x, roofY - 3 * z, rx * 1.08, ry * 1.08, 18 * z, ['#f08a24', '#fff3df'], 16, o.running ? spin * 0.15 : 0);
  flag(ctx, { x: c.x, y: roofY - 21 * z }, z, '#e8564a', o.time);
}

function ferrisWheel(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  const z = o.z;
  shadow(ctx, q, z);
  plinth(ctx, q, z);
  const c = center(q);
  const even = o.rot % 2 === 0;
  const u = even ? { x: 0.894, y: 0.447 } : { x: -0.894, y: 0.447 }; // 바퀴 평면 방향
  const v = even ? { x: -0.894, y: 0.447 } : { x: 0.894, y: 0.447 }; // 앞뒤 방향(+ = 화면 앞)
  const scale = 1;
  const R = 40 * z;
  const hub = { x: c.x, y: c.y - R - 16 * z * scale };
  const spin = o.running ? o.time * 0.015 : 0;
  const at = (a: number, off: number, r = R): Vec2 => ({
    x: hub.x + Math.cos(a) * r * u.x + v.x * off,
    y: hub.y + Math.cos(a) * r * u.y - Math.sin(a) * r + v.y * off,
  });
  const ground = (s: number, off: number): Vec2 => ({
    x: c.x + u.x * R * 0.7 * s + v.x * off,
    y: c.y - 3 * z + u.y * R * 0.7 * s + v.y * off,
  });
  const legW = Math.max(1.5, 3 * z * scale);
  const off = 6 * z * scale;
  const legs = (o2: number): void => {
    line(ctx, ground(-1, o2), { x: hub.x + v.x * o2, y: hub.y + v.y * o2 }, '#7c828c', legW);
    line(ctx, ground(1, o2), { x: hub.x + v.x * o2, y: hub.y + v.y * o2 }, '#7c828c', legW);
  };
  const rim = (o2: number, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, 2.5 * z * scale);
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const p = at((i * TAU) / 32, o2);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };
  legs(-off);
  rim(-off * 0.5, shade(o.color, 0.6));
  ctx.strokeStyle = 'rgba(240,240,240,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const p = at(spin + (i * TAU) / 16, 0);
    ctx.moveTo(hub.x, hub.y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  // 곤돌라: 회전해도 항상 아래로 매달린다
  for (let i = 0; i < 8; i++) {
    const p = at(spin + (i * TAU) / 8, 0);
    const gw = 7 * z * scale;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.roundRect(p.x - gw / 2, p.y + 1 * z, gw, gw * 0.9, 2 * z * scale);
    ctx.fill();
    ctx.stroke();
  }
  rim(off * 0.5, o.color);
  legs(off);
  ctx.fillStyle = '#3c4048';
  ctx.beginPath();
  ctx.arc(hub.x, hub.y, 3.5 * z * scale, 0, TAU);
  ctx.fill();
}

function bumperCars(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  const z = o.z;
  shadow(ctx, q, z);
  const f = insetQuad(q, 0.95);
  box(ctx, f, 0, 2 * z, '#4a4f58', '#30343a', '#25282d');
  // 바닥 격자
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    const a = up(quadPoint(f, i / 6, 0), 2 * z);
    const b = up(quadPoint(f, i / 6, 1), 2 * z);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  const fence = (a: Vec2, b: Vec2): void =>
    poly(ctx, [up(a, 2 * z), up(b, 2 * z), up(b, 8 * z), up(a, 8 * z)], 'rgba(224,166,58,0.55)', shade(o.color, 0.6));
  fence(f.left, f.top);
  fence(f.top, f.right);

  const t = o.running ? o.time * 0.035 : 0;
  const cars = Array.from({ length: 6 }, (_, i) => {
    const uu = 0.5 + 0.33 * Math.sin(t * 1.3 + i * 2.1);
    const vv = 0.5 + 0.33 * Math.cos(t * 0.9 + i * 1.3);
    return { p: up(quadPoint(f, uu, vv), 2 * z), i };
  }).sort((a, b) => a.p.y - b.p.y);
  for (const { p, i } of cars) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 6 * z, 3 * z, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(p.x - 5.5 * z, p.y - 5 * z, 11 * z, 5 * z, 2.5 * z);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f1d3b0';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 6.5 * z, 2 * z, 0, TAU);
    ctx.fill();
    line(ctx, { x: p.x + 2 * z, y: p.y - 5 * z }, { x: p.x + 2 * z, y: p.y - 26 * z }, 'rgba(60,60,60,0.6)', 1); // 집전봉
  }
  fence(f.left, f.bottom);
  fence(f.bottom, f.right);

  // 지붕 프레임 + 중앙 간판
  const H = 26 * z;
  for (const p of [f.top, f.right, f.bottom, f.left]) line(ctx, up(p, 2 * z), up(p, H), '#6d6f74', Math.max(1, 2 * z));
  ctx.strokeStyle = '#6d6f74';
  ctx.lineWidth = Math.max(1, 2 * z);
  ctx.beginPath();
  const roof = [f.top, f.right, f.bottom, f.left].map((p) => up(p, H));
  ctx.moveTo(roof[0].x, roof[0].y);
  for (const p of roof.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.stroke();
  const c = up(center(f), H);
  ctx.fillStyle = o.color;
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath();
  ctx.roundRect(c.x - 14 * z, c.y - 9 * z, 28 * z, 9 * z, 2 * z);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(6, 6.5 * z)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('BUMPER', c.x, c.y - 2.5 * z);
  ctx.textAlign = 'start';
}

function dropTower(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  const z = o.z;
  shadow(ctx, q, z);
  plinth(ctx, q, z);
  const c = center(q);
  const H = 132 * z;
  const w = 5 * z;
  const base = c.y - 3 * z;
  ctx.fillStyle = '#5d626c';
  ctx.fillRect(c.x - w, base - H, w * 2, H);
  ctx.strokeStyle = 'rgba(220,225,235,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = base; y > base - H; y -= w * 2) {
    ctx.moveTo(c.x - w, y); ctx.lineTo(c.x + w, y - w * 2);
    ctx.moveTo(c.x + w, y); ctx.lineTo(c.x - w, y - w * 2);
  }
  ctx.stroke();
  ctx.strokeStyle = OUTLINE;
  ctx.strokeRect(c.x - w, base - H, w * 2, H);
  // 받침대 다리
  for (const s of [-1, 1]) line(ctx, { x: c.x + s * 14 * z, y: base + 2 * z }, { x: c.x + s * w, y: base - 22 * z }, '#5d626c', Math.max(1, 2 * z));

  disc(ctx, c.x, base - H, 9 * z, 4.5 * z, 6 * z, shade(o.color, 1.2), shade(o.color, 0.7));
  flag(ctx, { x: c.x, y: base - H - 6 * z }, z, '#f2c230', o.time);

  // 좌석 링: 천천히 올라갔다가 빠르게 떨어진다
  let f = 0;
  if (o.running) {
    const p = (o.time * 0.012) % 1;
    f = p < 0.7 ? p / 0.7 : p < 0.8 ? 1 - (p - 0.7) / 0.1 : 0;
  }
  const ringY = base - 6 * z - f * (H - 26 * z);
  disc(ctx, c.x, ringY, 15 * z, 7.5 * z, 6 * z, shade(o.color, 1.15), shade(o.color, 0.75));
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.15 + 0.175 * i);
    ctx.fillStyle = '#f1d3b0';
    ctx.beginPath();
    ctx.arc(c.x + Math.cos(a) * 13 * z, ringY + Math.sin(a) * 6.5 * z - 7 * z, 2 * z, 0, TAU);
    ctx.fill();
  }
}

/** 찻잔: 돌아가는 큰 원판 위에서 찻잔 세 개가 각자 또 돈다 */
function teacups(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  const z = o.z;
  shadow(ctx, q, z);
  plinth(ctx, q, z);
  const c = center(q);
  const rx = ((q.right.x - q.left.x) / 2) * 0.8;
  const ry = rx / 2;
  disc(ctx, c.x, c.y - 3 * z, rx, ry, 4 * z, '#f3ead6', '#8d7a5a');
  const floorY = c.y - 7 * z;
  // 원판 무늬(꽃잎)
  ctx.strokeStyle = 'rgba(95,184,208,0.45)';
  ctx.lineWidth = Math.max(1, z);
  ctx.beginPath();
  ctx.ellipse(c.x, floorY, rx * 0.55, ry * 0.55, 0, 0, TAU);
  ctx.stroke();

  const spin = o.running ? o.time * 0.03 : 0;
  const cupColors = [o.color, '#ef8fb4', '#f2c230'];
  const cups = cupColors.map((col, i) => {
    const a = spin + (i * TAU) / 3 + 0.5;
    return { col, i, x: c.x + Math.cos(a) * rx * 0.55, y: floorY + Math.sin(a) * ry * 0.55 };
  });
  const teapot = (): void => {
    disc(ctx, c.x, floorY, 6 * z, 3 * z, 8 * z, '#fff6e6', '#d9c7a4');
    ctx.fillStyle = '#e8564a';
    ctx.beginPath();
    ctx.arc(c.x, floorY - 9.5 * z, 2 * z, 0, TAU);
    ctx.fill();
  };
  const drawCup = (cup: { col: string; i: number; x: number; y: number }): void => {
    const cr = rx * 0.32;
    const self = o.running ? o.time * 0.12 * (cup.i % 2 ? -1 : 1) : cup.i;
    // 받침 접시
    ctx.fillStyle = shade(cup.col, 0.7);
    ctx.beginPath();
    ctx.ellipse(cup.x, cup.y, cr * 1.1, cr * 0.55, 0, 0, TAU);
    ctx.fill();
    // 잔 몸통(아래가 좁은 그릇)
    const top = cup.y - 9 * z;
    ctx.beginPath();
    ctx.moveTo(cup.x - cr, top);
    ctx.quadraticCurveTo(cup.x - cr * 0.9, cup.y - 1 * z, cup.x, cup.y - 1 * z);
    ctx.quadraticCurveTo(cup.x + cr * 0.9, cup.y - 1 * z, cup.x + cr, top);
    ctx.ellipse(cup.x, top, cr, cr * 0.5, 0, 0, Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = cup.col;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.stroke();
    // 물방울 무늬가 돌아서 잔이 도는 게 보인다
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 3; k++) {
      const a = self + (k * TAU) / 3;
      if (Math.sin(a) < 0) continue;
      ctx.beginPath();
      ctx.arc(cup.x + Math.cos(a) * cr * 0.7, top + 4 * z, 1.3 * z, 0, TAU);
      ctx.fill();
    }
    // 안쪽과 손님 머리
    ctx.fillStyle = shade(cup.col, 0.45);
    ctx.beginPath();
    ctx.ellipse(cup.x, top, cr * 0.85, cr * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f1d3b0';
    for (const d of [-0.35, 0.35]) {
      const a = self + d * Math.PI;
      ctx.beginPath();
      ctx.arc(cup.x + Math.cos(a) * cr * 0.4, top - 2 * z + Math.sin(a) * cr * 0.15, 2 * z, 0, TAU);
      ctx.fill();
    }
  };
  const back = cups.filter((p) => p.y < floorY).sort((a, b) => a.y - b.y);
  const front = cups.filter((p) => p.y >= floorY).sort((a, b) => a.y - b.y);
  back.forEach(drawCup);
  teapot();
  front.forEach(drawCup);
}

/** 회전 그네: 기둥 꼭대기 지붕이 돌면 그네가 바깥으로 날아오른다 */
function swingRide(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  const z = o.z;
  shadow(ctx, q, z);
  plinth(ctx, q, z);
  const c = center(q);
  const base = c.y - 3 * z;
  const R = ((q.right.x - q.left.x) / 2) * 0.62;
  // 운행 중엔 지붕이 조금 올라가고 그네가 펼쳐진다(0~1로 서서히)
  const lift = o.running ? Math.min(1, 0.6 + 0.4 * Math.sin(o.time * 0.02)) : 0;
  const poleH = (52 + 10 * lift) * z;
  const topY = base - poleH;
  const spin = o.running ? o.time * 0.07 : 0;
  const chain = 22 * z;
  const swingOut = lift * 0.9; // 줄이 기울어지는 각(라디안)

  const seats = Array.from({ length: 10 }, (_, i) => {
    const a = spin + (i * TAU) / 10;
    const anchor = { x: c.x + Math.cos(a) * R, y: topY + Math.sin(a) * R * 0.5 };
    const out = R + Math.sin(swingOut) * chain;
    const seat = { x: c.x + Math.cos(a) * out, y: topY + Math.sin(a) * out * 0.5 + Math.cos(swingOut) * chain };
    return { a, anchor, seat, i };
  });
  const drawSeat = (s: (typeof seats)[number]): void => {
    line(ctx, s.anchor, s.seat, 'rgba(70,70,70,0.7)', 1);
    ctx.fillStyle = PALETTE[s.i % PALETTE.length];
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.roundRect(s.seat.x - 2.5 * z, s.seat.y - 1 * z, 5 * z, 3 * z, 1 * z);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f1d3b0';
    ctx.beginPath();
    ctx.arc(s.seat.x, s.seat.y - 2.5 * z, 1.8 * z, 0, TAU);
    ctx.fill();
  };
  seats.filter((s) => Math.sin(s.a) < 0).sort((a, b) => a.seat.y - b.seat.y).forEach(drawSeat);
  // 기둥
  const pw = 4 * z;
  ctx.fillStyle = '#c9ccd2';
  ctx.fillRect(c.x - pw, topY, pw * 2, base - topY);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(c.x, topY, pw, base - topY);
  ctx.strokeStyle = OUTLINE;
  ctx.strokeRect(c.x - pw, topY, pw * 2, base - topY);
  disc(ctx, c.x, base, 9 * z, 4.5 * z, 6 * z, shade(o.color, 0.9), shade(o.color, 0.6));
  seats.filter((s) => Math.sin(s.a) >= 0).sort((a, b) => a.seat.y - b.seat.y).forEach(drawSeat);
  // 지붕
  disc(ctx, c.x, topY, R * 1.05, R * 0.525, 3 * z, o.color, shade(o.color, 0.65));
  cone(ctx, c.x, topY - 3 * z, R * 1.05, R * 0.525, 14 * z, [o.color, '#4a8fe8'], 12, spin * 0.5);
  flag(ctx, { x: c.x, y: topY - 17 * z }, z, '#e8564a', o.time);
}

/** 바이킹: A자 지지대에 매달린 배가 길이 방향으로 크게 흔들린다 */
function vikingShip(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts, alongX: boolean): void {
  const z = o.z;
  shadow(ctx, q, z);
  plinth(ctx, q, z);
  const c = center(q);
  const u = alongX ? { x: 0.894, y: 0.447 } : { x: -0.894, y: 0.447 }; // 흔들리는 방향(긴 변)
  const v = alongX ? { x: -0.894, y: 0.447 } : { x: 0.894, y: 0.447 }; // 회전축 방향(+ = 화면 앞)
  const pivotH = 60 * z;
  const pivot = { x: c.x, y: c.y - 3 * z - pivotH };
  const theta = o.running ? 1.05 * Math.sin(o.time * 0.055) * Math.min(1, 0.4 + 0.6 * Math.abs(Math.sin(o.time * 0.004))) : 0;
  const cs = Math.cos(theta);
  const sn = Math.sin(theta);
  const halfW = 9 * z; // 배의 폭(축 방향 절반)
  /** 배 기준 좌표(lx: 길이 방향, ly: 피벗에서 아래로) → 화면 */
  const P = (lx: number, ly: number, off: number): Vec2 => {
    const rx = lx * cs - ly * sn;
    const ry = lx * sn + ly * cs;
    return { x: pivot.x + u.x * rx + v.x * off, y: pivot.y + u.y * rx + ry + v.y * off };
  };
  const L = 38 * z;
  const hull: [number, number][] = [
    [-34 * z, L - 12 * z], [-26 * z, L], [26 * z, L], [34 * z, L - 12 * z],
    [24 * z, L + 9 * z], [0, L + 12 * z], [-24 * z, L + 9 * z],
  ];
  const deck: [number, number][] = [[-26 * z, L], [26 * z, L]];
  const legs = (off: number): void => {
    const g = (s: number): Vec2 => ({ x: c.x + u.x * 40 * z * s + v.x * off, y: c.y - 3 * z + u.y * 40 * z * s + v.y * off });
    const top = { x: pivot.x + v.x * off, y: pivot.y + v.y * off };
    line(ctx, g(-1), top, '#7a5a3a', Math.max(1.5, 3.5 * z));
    line(ctx, g(1), top, '#7a5a3a', Math.max(1.5, 3.5 * z));
  };
  const arms = (off: number): void => {
    for (const lx of [-18 * z, 18 * z]) line(ctx, { x: pivot.x + v.x * off, y: pivot.y + v.y * off }, P(lx, L, off), '#5d626c', Math.max(1, 2 * z));
  };
  legs(-halfW - 3 * z);
  arms(-halfW);
  // 뒷면 선체
  poly(ctx, hull.map(([a, b]) => P(a, b, -halfW)), shade(o.color, 0.55));
  // 갑판 + 승객 머리
  poly(ctx, [P(deck[0][0], deck[0][1], -halfW), P(deck[1][0], deck[1][1], -halfW), P(deck[1][0], deck[1][1], halfW), P(deck[0][0], deck[0][1], halfW)], '#8a6a46');
  ctx.fillStyle = '#f1d3b0';
  for (let i = 0; i < 6; i++) {
    for (const off of [-halfW * 0.5, halfW * 0.5]) {
      const p = P(-20 * z + i * 8 * z, L - 3 * z, off);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.9 * z, 0, TAU);
      ctx.fill();
    }
  }
  // 앞면 선체: 줄무늬 + 뱃머리 장식
  poly(ctx, hull.map(([a, b]) => P(a, b, halfW)), o.color);
  poly(ctx, [P(-27 * z, L + 3 * z, halfW), P(27 * z, L + 3 * z, halfW), P(25 * z, L + 6 * z, halfW), P(-25 * z, L + 6 * z, halfW)], '#f2c230', null);
  for (const s of [-1, 1]) {
    const tip = P(s * 36 * z, L - 16 * z, 0);
    ctx.fillStyle = '#f2c230';
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3 * z, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  arms(halfW);
  // 회전축
  line(ctx, { x: pivot.x + v.x * (-halfW - 3 * z), y: pivot.y + v.y * (-halfW - 3 * z) }, { x: pivot.x + v.x * (halfW + 3 * z), y: pivot.y + v.y * (halfW + 3 * z) }, '#3c4048', Math.max(1.5, 3 * z));
  legs(halfW + 3 * z);
}

/** 유령의 집: 어두운 저택. 창문이 깜빡이고 지붕 위로 유령이 떠다닌다 */
function hauntedHouse(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts, alongX: boolean): void {
  const z = o.z;
  shadow(ctx, q, z);
  const f = insetQuad(q, 0.9);
  const H = 24 * z;
  box(ctx, f, 0, H, shade(o.color, 0.9), shade(o.color, 0.75), shade(o.color, 0.55));
  // 앞 두 벽에 창문
  const flicker = o.running ? (Math.sin(o.time * 0.4) > 0.2 ? 1 : 0.55) : 0.8;
  const glow = `rgba(255,214,90,${flicker})`;
  for (const [a, b, n] of [[f.left, f.bottom, alongX ? 3 : 2], [f.bottom, f.right, alongX ? 2 : 3]] as const) {
    for (let i = 0; i < n; i++) {
      const t0 = (i + 0.3) / n;
      const t1 = (i + 0.7) / n;
      const p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
      const p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
      poly(ctx, [up(p0, 10 * z), up(p1, 10 * z), up(p1, 19 * z), up(p0, 19 * z)], glow, 'rgba(0,0,0,0.5)');
    }
  }
  // 문(입구 쪽 벽 가운데)
  const [da, db] = alongX ? [f.left, f.bottom] : [f.bottom, f.right];
  const d0 = { x: da.x + (db.x - da.x) * 0.42, y: da.y + (db.y - da.y) * 0.42 };
  const d1 = { x: da.x + (db.x - da.x) * 0.58, y: da.y + (db.y - da.y) * 0.58 };
  poly(ctx, [d0, d1, up(d1, 9 * z), up(d0, 9 * z)], '#2a1a12', null);
  gableRoof(ctx, insetQuad(q, 0.96), H, 16 * z, '#3a3248', alongX);
  // 굴뚝 위 유령
  const bob = Math.sin(o.time * (o.running ? 0.15 : 0.05)) * 4 * z;
  const gx = up(center(q), H + 24 * z);
  const gy = gx.y + bob;
  ctx.fillStyle = 'rgba(245,245,255,0.92)';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(gx.x, gy, 6 * z, Math.PI, 0);
  ctx.lineTo(gx.x + 6 * z, gy + 7 * z);
  for (let i = 0; i < 3; i++) {
    ctx.lineTo(gx.x + 6 * z - (i * 4 + 2) * z, gy + 5 * z);
    ctx.lineTo(gx.x + 6 * z - (i * 4 + 4) * z, gy + 7 * z);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#222';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(gx.x + s * 2.2 * z, gy - 0.5 * z, 1 * z, 0, TAU);
    ctx.fill();
  }
}

/** 나선 미끄럼틀: 줄무늬 탑을 감아 내려오는 미끄럼판 */
function helterSkelter(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  const z = o.z;
  shadow(ctx, q, z);
  plinth(ctx, q, z);
  const c = center(q);
  const base = c.y - 3 * z;
  const tr = 8 * z; // 탑 반지름
  const H = 54 * z;
  const sr = 15 * z; // 미끄럼판 반지름
  const turns = 2.25;
  const N = 54;
  const pt = (t: number): Vec2 => {
    const a = t * turns * TAU;
    return { x: c.x + Math.cos(a) * sr, y: base - 4 * z - (1 - t) * (H - 8 * z) + Math.sin(a) * sr * 0.5 };
  };
  const seg = (front: boolean): void => {
    ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const t0 = i / N;
      const t1 = (i + 1) / N;
      const a = ((t0 + t1) / 2) * turns * TAU;
      if ((Math.sin(a) >= 0) !== front) continue;
      const p0 = pt(t0);
      const p1 = pt(t1);
      line(ctx, p0, p1, '#8a6a20', Math.max(2, 5 * z));
      line(ctx, p0, p1, i % 4 < 2 ? '#f2c230' : '#f6e08a', Math.max(1, 3.2 * z));
    }
    ctx.lineCap = 'butt';
  };
  // 내려오는 손님(미끄럼판 위 위치)
  const rider = o.running ? pt((o.time * 0.01) % 1) : null;
  const drawRider = (front: boolean): void => {
    if (!rider) return;
    const t = (o.time * 0.01) % 1;
    if ((Math.sin(t * turns * TAU) >= 0) !== front) return;
    ctx.fillStyle = '#7a4a2a';
    ctx.beginPath();
    ctx.ellipse(rider.x, rider.y - 1 * z, 3 * z, 1.5 * z, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f1d3b0';
    ctx.beginPath();
    ctx.arc(rider.x, rider.y - 4 * z, 2 * z, 0, TAU);
    ctx.fill();
  };
  seg(false);
  drawRider(false);
  // 탑: 줄무늬 원기둥
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = base - (i * H) / bands;
    const h = H / bands;
    disc(ctx, c.x, y0, tr, tr * 0.5, h, i % 2 ? '#fff' : o.color, i % 2 ? '#e8e2d6' : shade(o.color, 0.8));
  }
  seg(true);
  drawRider(true);
  // 꼭대기 지붕
  cone(ctx, c.x, base - H, tr * 1.6, tr * 0.8, 14 * z, [o.color, '#fff3df'], 10);
  flag(ctx, { x: c.x, y: base - H - 14 * z }, z, '#4a8fe8', o.time);
}

/** 박공지붕. alongX면 용마루가 타일 x 방향(top→right)으로 뻗는다 */
function gableRoof(ctx: CanvasRenderingContext2D, q: Quad, h0: number, rise: number, color: string, alongX: boolean): void {
  const e = [q.top, q.right, q.bottom, q.left].map((p) => up(p, h0));
  const [T, Rt, B, L] = e;
  if (alongX) {
    const r0 = up(mid(T, L), rise);
    const r1 = up(mid(Rt, B), rise);
    poly(ctx, [T, Rt, r1, r0], shade(color, 0.75)); // 뒤쪽 면
    poly(ctx, [Rt, B, r1], shade(color, 0.6)); // 박공 삼각형
    poly(ctx, [L, B, r1, r0], color); // 앞쪽 면
  } else {
    const r0 = up(mid(T, Rt), rise);
    const r1 = up(mid(L, B), rise);
    poly(ctx, [T, L, r1, r0], shade(color, 0.9));
    poly(ctx, [L, B, r1], shade(color, 0.7));
    poly(ctx, [Rt, B, r1, r0], shade(color, 0.65));
  }
}

function pyramidRoof(ctx: CanvasRenderingContext2D, q: Quad, h0: number, rise: number, color: string): void {
  const [T, Rt, B, L] = [q.top, q.right, q.bottom, q.left].map((p) => up(p, h0));
  const apex = up(center(q), h0 + rise);
  poly(ctx, [L, T, apex], shade(color, 0.95));
  poly(ctx, [T, Rt, apex], shade(color, 0.7));
  poly(ctx, [L, B, apex], color);
  poly(ctx, [B, Rt, apex], shade(color, 0.6));
}

/** 롤러코스터 역의 바닥(플랫폼과 레일). 열차보다 먼저 그린다. */
export function drawStationFloor(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts, alongX: boolean): void {
  const z = o.z;
  const f = insetQuad(q, 0.98);
  box(ctx, f, 0, 4 * z, '#bdb6a2', '#958e7a', '#7d7765');
  const a = alongX ? quadPoint(f, 0, 0.5) : quadPoint(f, 0.5, 0);
  const b = alongX ? quadPoint(f, 1, 0.5) : quadPoint(f, 0.5, 1);
  line(ctx, up(a, 4 * z), up(b, 4 * z), '#6b4a12', Math.max(2, 6 * z));
  line(ctx, up(a, 4 * z), up(b, 4 * z), '#f2c230', Math.max(1, 3 * z));
}

/** 롤러코스터 역의 기둥과 지붕 */
function stationRoof(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts, alongX: boolean): void {
  const z = o.z;
  const f = insetQuad(q, 0.92);
  for (const p of [f.top, f.right, f.bottom, f.left]) line(ctx, up(p, 4 * z), up(p, 20 * z), '#efe6d2', Math.max(1, 2.5 * z));
  gableRoof(ctx, insetQuad(q, 1.02), 20 * z, 10 * z, '#c0392b', alongX);
}

function kiosk(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts, roof: string): void {
  const z = o.z;
  shadow(ctx, q, z);
  const f = insetQuad(q, 0.8);
  box(ctx, f, 0, 15 * z, '#efe3c4', '#e4d5b0', '#c9b98f');
  // 판매대 차양 줄무늬
  for (const [a, b] of [[f.left, f.bottom], [f.bottom, f.right]] as const) {
    for (let i = 0; i < 4; i++) {
      const p0 = { x: a.x + ((b.x - a.x) * i) / 4, y: a.y + ((b.y - a.y) * i) / 4 };
      const p1 = { x: a.x + ((b.x - a.x) * (i + 1)) / 4, y: a.y + ((b.y - a.y) * (i + 1)) / 4 };
      poly(ctx, [up(p0, 9 * z), up(p1, 9 * z), up(p1, 13 * z), up(p0, 13 * z)], i % 2 ? '#fff' : o.color, null);
    }
  }
  // 창구
  const w = mid(f.bottom, f.right);
  poly(ctx, [up(mid(f.bottom, w), 3 * z), up(mid(w, f.right), 3 * z), up(mid(w, f.right), 8 * z), up(mid(f.bottom, w), 8 * z)], '#3a2e26', null);
  pyramidRoof(ctx, insetQuad(q, 0.92), 15 * z, 14 * z, roof);
  const apex = up(center(q), 29 * z);
  ctx.fillStyle = o.color;
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(apex.x, apex.y - 3 * z, 3.5 * z, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

/** 우산 가게: 키오스크 위에 파란 우산을 펼쳐 둔다 */
function umbrellaShop(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  kiosk(ctx, q, o, '#2f5fb8');
  const z = o.z;
  const c = up(center(q), 31 * z);
  const r = 10 * z;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(1, z);
  const cols = ['#e8453c', '#fff', '#e8453c', '#fff'];
  for (let i = 0; i < 4; i++) {
    const a0 = Math.PI + (i * Math.PI) / 4;
    const a1 = a0 + Math.PI / 4;
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, r, a0, a1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function toilet(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts, alongX: boolean): void {
  const z = o.z;
  shadow(ctx, q, z);
  const f = insetQuad(q, 0.88);
  box(ctx, f, 0, 15 * z, '#dfe6ea', '#c5cfd6', '#a8b4bd');
  // 문 두 개
  const [a, b] = alongX ? [f.left, f.bottom] : [f.bottom, f.right];
  for (const t of [0.25, 0.65]) {
    const p0 = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const p1 = { x: a.x + (b.x - a.x) * (t + 0.15), y: a.y + (b.y - a.y) * (t + 0.15) };
    poly(ctx, [p0, p1, up(p1, 10 * z), up(p0, 10 * z)], t < 0.5 ? '#4a7fc8' : '#d0607a', null);
  }
  gableRoof(ctx, insetQuad(q, 0.95), 15 * z, 9 * z, '#5f7d94', alongX);
}

/** 피자 가게(2×1): 차양이 달린 가게 위에 피자 간판 */
function pizzaShop(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts, alongX: boolean): void {
  const z = o.z;
  shadow(ctx, q, z);
  const f = insetQuad(q, 0.88);
  box(ctx, f, 0, 16 * z, '#f3e6c8', '#e6d3a8', '#c9b48a');
  // 앞면 차양 줄무늬와 창구
  const [a, b] = alongX ? [f.left, f.bottom] : [f.bottom, f.right];
  for (let i = 0; i < 6; i++) {
    const p0 = { x: a.x + ((b.x - a.x) * i) / 6, y: a.y + ((b.y - a.y) * i) / 6 };
    const p1 = { x: a.x + ((b.x - a.x) * (i + 1)) / 6, y: a.y + ((b.y - a.y) * (i + 1)) / 6 };
    poly(ctx, [up(p0, 10 * z), up(p1, 10 * z), up(p1, 14 * z), up(p0, 14 * z)], i % 2 ? '#fff' : '#3c9a4a', null);
  }
  const w0 = { x: a.x + (b.x - a.x) * 0.2, y: a.y + (b.y - a.y) * 0.2 };
  const w1 = { x: a.x + (b.x - a.x) * 0.8, y: a.y + (b.y - a.y) * 0.8 };
  poly(ctx, [up(w0, 3 * z), up(w1, 3 * z), up(w1, 9 * z), up(w0, 9 * z)], '#3a2e26', null);
  gableRoof(ctx, insetQuad(q, 0.95), 16 * z, 8 * z, '#c0392b', alongX);
  // 피자 간판: 노란 치즈 원에 페퍼로니
  const c = up(center(q), 32 * z);
  line(ctx, up(center(q), 22 * z), c, '#555', Math.max(1, z));
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(1, z);
  ctx.fillStyle = '#d98a2b';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 7 * z, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f5c842';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 5.6 * z, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c0392b';
  for (const [dx, dy] of [[-2.5, -1.5], [2, -2.5], [0.5, 2.2], [-2.8, 2.5], [3, 1.2]]) {
    ctx.beginPath();
    ctx.arc(c.x + dx * z, c.y + dy * z, 1.1 * z, 0, TAU);
    ctx.fill();
  }
}

/** 아이스크림 가판대: 키오스크 위에 커다란 콘 */
function iceCreamShop(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  kiosk(ctx, q, o, '#e86f9f');
  const z = o.z;
  const base = up(center(q), 30 * z);
  poly(ctx, [base, { x: base.x - 4 * z, y: base.y - 9 * z }, { x: base.x + 4 * z, y: base.y - 9 * z }], '#d9a45a');
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(1, z);
  for (const [dy, col] of [[-11, '#fff4d6'], [-15.5, '#f29bc0']] as const) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(base.x, base.y + dy * z, 4.4 * z, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(base.x + 0.5 * z, base.y - 20.5 * z, 1.4 * z, 0, TAU);
  ctx.fill();
}

/** 카페: 키오스크 위에 김이 오르는 커피잔 */
function cafeShop(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  kiosk(ctx, q, o, '#6b4430');
  const z = o.z;
  const c = up(center(q), 31 * z);
  // 받침 접시와 잔
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(1, z);
  ctx.fillStyle = '#f4efe6';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 7 * z, 2.2 * z, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  poly(ctx, [
    { x: c.x - 4.5 * z, y: c.y - 8 * z }, { x: c.x + 4.5 * z, y: c.y - 8 * z },
    { x: c.x + 3.5 * z, y: c.y - 1 * z }, { x: c.x - 3.5 * z, y: c.y - 1 * z },
  ], '#fff');
  ctx.beginPath();
  ctx.arc(c.x + 5 * z, c.y - 5 * z, 2 * z, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = '#6b4430';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 8 * z, 4.5 * z, 1.3 * z, 0, 0, TAU);
  ctx.fill();
  // 김
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = Math.max(1, 1.2 * z);
  const t = o.time * 0.15;
  for (const dx of [-1.5, 1.5]) {
    ctx.beginPath();
    ctx.moveTo(c.x + dx * z, c.y - 10 * z);
    ctx.quadraticCurveTo(c.x + (dx + Math.sin(t + dx) * 2) * z, c.y - 13 * z, c.x + dx * z, c.y - 16 * z);
    ctx.stroke();
  }
}

/** 기념품 가게: 키오스크 위로 줄에 매달린 풍선 세 개가 흔들린다 */
function souvenirShop(ctx: CanvasRenderingContext2D, q: Quad, o: SpriteOpts): void {
  kiosk(ctx, q, o, '#7d3fb0');
  const z = o.z;
  const anchor = up(center(q), 30 * z);
  const cols = ['#e8453c', '#f2c230', '#4a8fe8'];
  for (let i = 0; i < 3; i++) {
    const sway = Math.sin(o.time * 0.08 + i * 2) * 1.5 * z;
    const p = { x: anchor.x + (i - 1) * 5 * z + sway, y: anchor.y - (12 + (i % 2) * 3) * z };
    line(ctx, anchor, { x: p.x, y: p.y + 4 * z }, 'rgba(60,60,60,0.7)', Math.max(1, 0.7 * z));
    ctx.fillStyle = cols[i];
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1, z);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 3.2 * z, 4 * z, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(p.x - 1.1 * z, p.y - 1.4 * z, 0.9 * z, 0, TAU);
    ctx.fill();
  }
}

/** def.id에 맞는 스프라이트를 그린다. 모르는 id면 false(호출한 쪽이 상자로 대체). */
export function drawRideSprite(ctx: CanvasRenderingContext2D, id: string, q: Quad, o: SpriteOpts, w: number, h: number): boolean {
  switch (id) {
    case 'carousel': carousel(ctx, q, o); return true;
    case 'wheel': ferrisWheel(ctx, q, o); return true;
    case 'bumper': bumperCars(ctx, q, o); return true;
    case 'drop': dropTower(ctx, q, o); return true;
    case 'teacups': teacups(ctx, q, o); return true;
    case 'swing': swingRide(ctx, q, o); return true;
    case 'viking': vikingShip(ctx, q, o, w >= h); return true;
    case 'haunted': hauntedHouse(ctx, q, o, w >= h); return true;
    case 'slide': helterSkelter(ctx, q, o); return true;
    case 'coaster': stationRoof(ctx, q, o, w >= h); return true;
    case 'burger': kiosk(ctx, q, o, '#c0392b'); return true;
    case 'drinks': kiosk(ctx, q, o, '#2a8f86'); return true;
    case 'umbrella': umbrellaShop(ctx, q, o); return true;
    case 'pizza': pizzaShop(ctx, q, o, w >= h); return true;
    case 'icecream': iceCreamShop(ctx, q, o); return true;
    case 'cafe': cafeShop(ctx, q, o); return true;
    case 'souvenir': souvenirShop(ctx, q, o); return true;
    case 'toilet': toilet(ctx, q, o, w >= h); return true;
    default: return false;
  }
}

// ---------------------------------------------------------------- 직원

/**
 * 인형탈 연기자: 노란 몸통에 큰 곰 머리. (x, y)는 발 위치, dancing이면 팔을 흔들며 들썩인다.
 * 게임 화면과 툴바 아이콘이 함께 쓴다.
 */
export function drawMascot(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, time: number, dancing: boolean, walkSwing = 0): void {
  const hop = dancing ? Math.abs(Math.sin(time * 0.35)) * 1.6 * z : 0;
  const by = y - hop;
  // 다리
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = Math.max(1.5, 2.2 * z);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 1.5 * z, by - 5 * z); ctx.lineTo(x - 1.5 * z + walkSwing, by - 0.5 * z);
  ctx.moveTo(x + 1.5 * z, by - 5 * z); ctx.lineTo(x + 1.5 * z - walkSwing, by - 0.5 * z);
  ctx.stroke();
  // 팔(춤출 때는 번갈아 위로)
  const wave = dancing ? Math.sin(time * 0.5) : 0;
  ctx.beginPath();
  ctx.moveTo(x - 3.5 * z, by - 9.5 * z); ctx.lineTo(x - 6 * z, by - (8 + 5 * Math.max(0, wave)) * z);
  ctx.moveTo(x + 3.5 * z, by - 9.5 * z); ctx.lineTo(x + 6 * z, by - (8 + 5 * Math.max(0, -wave)) * z);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // 몸통
  ctx.fillStyle = '#f2c230';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(1, 0.8 * z);
  ctx.beginPath();
  ctx.ellipse(x, by - 8.5 * z, 4.2 * z, 4.6 * z, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // 머리와 귀
  const hy = by - 16 * z;
  ctx.fillStyle = '#a8703a';
  for (const dx of [-3.6, 3.6]) {
    ctx.beginPath();
    ctx.arc(x + dx * z, hy - 3.4 * z, 1.8 * z, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, hy, 5 * z, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f1d9b0';
  ctx.beginPath();
  ctx.ellipse(x, hy + 1.6 * z, 2.6 * z, 1.9 * z, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2a2a2a';
  for (const dx of [-1.8, 1.8]) {
    ctx.beginPath();
    ctx.arc(x + dx * z, hy - 1 * z, 0.7 * z, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, hy + 1 * z, 0.8 * z, 0, TAU);
  ctx.fill();
  // 빨간 나비넥타이
  ctx.fillStyle = '#e8453c';
  poly(ctx, [
    { x: x - 2.4 * z, y: by - 12.6 * z }, { x, y: by - 11.8 * z }, { x: x - 2.4 * z, y: by - 11 * z },
  ], '#e8453c', null);
  poly(ctx, [
    { x: x + 2.4 * z, y: by - 12.6 * z }, { x, y: by - 11.8 * z }, { x: x + 2.4 * z, y: by - 11 * z },
  ], '#e8453c', null);
}

/** 음료 판매원이 앞에 메고 다니는 컵 상자. (x, y)는 발 위치 */
export function drawVendorTray(ctx: CanvasRenderingContext2D, x: number, y: number, z: number): void {
  ctx.strokeStyle = '#555';
  ctx.lineWidth = Math.max(1, 0.6 * z);
  ctx.beginPath();
  ctx.moveTo(x - 3 * z, y - 11 * z); ctx.lineTo(x - 3.5 * z, y - 7 * z);
  ctx.moveTo(x + 3 * z, y - 11 * z); ctx.lineTo(x + 3.5 * z, y - 7 * z);
  ctx.stroke();
  // 컵 세 개
  const cups = ['#3ab0a0', '#e8453c', '#f2c230'];
  for (let i = 0; i < 3; i++) {
    const cx = x + (i - 1) * 2.4 * z;
    poly(ctx, [
      { x: cx - 1 * z, y: y - 10.2 * z }, { x: cx + 1 * z, y: y - 10.2 * z },
      { x: cx + 0.8 * z, y: y - 7.5 * z }, { x: cx - 0.8 * z, y: y - 7.5 * z },
    ], cups[i], null);
  }
  poly(ctx, [
    { x: x - 4.2 * z, y: y - 7.8 * z }, { x: x + 4.2 * z, y: y - 7.8 * z },
    { x: x + 4.2 * z, y: y - 5.4 * z }, { x: x - 4.2 * z, y: y - 5.4 * z },
  ], '#c8a06a');
}

// ---------------------------------------------------------------- 장식

/** 나무·꽃. (x, y)는 타일 중앙의 지면 화면 좌표, seed는 0~1 고정값(모양 변주) */
export function drawScenery(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, z: number, seed: number): void {
  const s = z * (0.85 + seed * 0.35);
  if (kind === FLOWERS) {
    ctx.fillStyle = '#2f7a34';
    ctx.beginPath();
    ctx.ellipse(x, y, 16 * z, 8 * z, 0, 0, TAU);
    ctx.fill();
    const colors = ['#ff6fa8', '#ffd84a', '#ff5a4a', '#ffffff', '#c77dff'];
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996 + seed * 6;
      const r = Math.sqrt((i + 0.5) / 14);
      ctx.fillStyle = colors[(i + Math.floor(seed * 5)) % colors.length];
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 13 * z, y + Math.sin(a) * r * 6.5 * z - 1.5 * z, 1.8 * z, 0, TAU);
      ctx.fill();
    }
    return;
  }
  if (kind === BIN) {
    // 초록 쓰레기통: 몸통 + 뚜껑 + 투입구
    const bs = z * 1.1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 1.5 * bs, y + 0.5 * bs, 6 * bs, 3 * bs, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2f7d4a';
    ctx.beginPath();
    ctx.moveTo(x - 4.5 * bs, y - 11 * bs);
    ctx.lineTo(x + 4.5 * bs, y - 11 * bs);
    ctx.lineTo(x + 3.6 * bs, y);
    ctx.lineTo(x - 3.6 * bs, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#245f39';
    ctx.fillRect(x + 0.5 * bs, y - 11 * bs, 4 * bs, 11 * bs);
    ctx.fillStyle = '#3f9a5e';
    ctx.beginPath();
    ctx.ellipse(x, y - 11 * bs, 5.4 * bs, 2.4 * bs, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#10261a';
    ctx.beginPath();
    ctx.ellipse(x, y - 11.2 * bs, 3 * bs, 1.1 * bs, 0, 0, TAU);
    ctx.fill();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 3 * s, y + 1 * s, 9 * s, 4.5 * s, 0, 0, TAU);
  ctx.fill();
  if (kind === PINE) {
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(x - 1.5 * s, y - 6 * s, 3 * s, 6 * s);
    const tiers: [number, number, number][] = [[11, 6, 20], [9, 15, 18], [6.5, 23, 15]]; // 반폭, 밑단 높이, 탑 높이
    for (const [hw, base, hgt] of tiers) {
      const by = y - base * s;
      const top = { x, y: by - hgt * s };
      poly(ctx, [top, { x: x - hw * s, y: by }, { x, y: by + 2 * s }], '#3f8f45', null);
      poly(ctx, [top, { x, y: by + 2 * s }, { x: x + hw * s, y: by }], '#2a6630', null);
    }
    return;
  }
  if (kind === OAK) {
    ctx.fillStyle = '#6a4428';
    ctx.fillRect(x - 2 * s, y - 10 * s, 4 * s, 10 * s);
    const blossom = seed < 0.2; // 가끔 벚꽃
    const dark = blossom ? '#d98ab0' : '#3c7d33';
    const mid2 = blossom ? '#f0a8c8' : '#4f9a3e';
    const light = blossom ? '#ffd0e4' : '#73b955';
    const blobs: [number, number, number][] = [[-6, -15, 7], [6, -15, 7], [0, -20, 8], [-3, -25, 6], [4, -24, 5.5]];
    for (const [dx, dy, r] of blobs) {
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
      ctx.fill();
    }
    for (const [dx, dy, r] of blobs) {
      ctx.fillStyle = mid2;
      ctx.beginPath();
      ctx.arc(x + (dx - 1) * s, y + (dy - 1.2) * s, r * 0.72 * s, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = light;
    for (const [dx, dy, r] of blobs.slice(2)) {
      ctx.beginPath();
      ctx.arc(x + (dx - 2) * s, y + (dy - 2.5) * s, r * 0.35 * s, 0, TAU);
      ctx.fill();
    }
  }
}
