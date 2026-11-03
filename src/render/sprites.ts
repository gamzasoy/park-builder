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

/** def.id에 맞는 스프라이트를 그린다. 모르는 id면 false(호출한 쪽이 상자로 대체). */
export function drawRideSprite(ctx: CanvasRenderingContext2D, id: string, q: Quad, o: SpriteOpts, w: number, h: number): boolean {
  switch (id) {
    case 'carousel': carousel(ctx, q, o); return true;
    case 'wheel': ferrisWheel(ctx, q, o); return true;
    case 'bumper': bumperCars(ctx, q, o); return true;
    case 'drop': dropTower(ctx, q, o); return true;
    case 'coaster': stationRoof(ctx, q, o, w >= h); return true;
    case 'burger': kiosk(ctx, q, o, '#c0392b'); return true;
    case 'drinks': kiosk(ctx, q, o, '#2a8f86'); return true;
    case 'toilet': toilet(ctx, q, o, w >= h); return true;
    default: return false;
  }
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
