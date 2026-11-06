import type { Season } from '../sim/season';
import type { Vec2 } from './iso';

/** 축제 색종이·깃발 색 */
export const FESTIVAL_COLORS: Record<Season, string[]> = {
  spring: ['#ff8fc0', '#ffd1e6', '#ffffff', '#ffb3d1'],
  summer: ['#4fc3f7', '#ffe066', '#ff8a65', '#7be3d6'],
  autumn: ['#ff8c1a', '#8e44ad', '#ffd23f', '#3b2a4a'],
  winter: ['#e53935', '#2e9e4f', '#ffd54f', '#ffffff'],
};

/** 축제 때 길가 장식의 밤 불빛 색 */
export const FESTIVAL_GLOW: Record<Season, string> = {
  spring: 'rgba(255,150,200,A)',
  summer: 'rgba(120,210,255,A)',
  autumn: 'rgba(255,150,40,A)',
  winter: 'rgba(255,230,140,A)',
};

const TAU = Math.PI * 2;

function outline(ctx: CanvasRenderingContext2D, z: number): void {
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1, 0.8 * z);
}

/** 길가 축제 장식 하나. (x, y) = 장식이 서는 땅 위 화면 좌표 */
export function drawFestivalProp(ctx: CanvasRenderingContext2D, season: Season, x: number, y: number, z: number, time: number, seed: number): void {
  ctx.save();
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y, 6 * z, 2.6 * z, 0, 0, TAU);
  ctx.fill();
  if (season === 'spring') drawLanternPole(ctx, x, y, z, time, seed);
  else if (season === 'summer') {
    drawParasol(ctx, x - 3 * z, y - 1 * z, z, seed);
    drawSprinkler(ctx, x + 3 * z, y + 1 * z, z, time, seed);
  } else if (season === 'autumn') {
    drawPumpkin(ctx, x - 2.5 * z, y, z * 1.45, time, seed);
    drawPumpkin(ctx, x + 5 * z, y + 1.5 * z, z * 0.9, time, seed + 0.37);
  }
  else drawXmasTree(ctx, x, y, z, time, seed);
  ctx.restore();
}

/** 봄: 나무 기둥에 매단 분홍 등불 두 개와 꼭대기의 벚꽃 */
function drawLanternPole(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, time: number, seed: number): void {
  const H = 24 * z;
  outline(ctx, z);
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(x - 1.2 * z, y - H, 2.4 * z, H);
  ctx.strokeRect(x - 1.2 * z, y - H, 2.4 * z, H);
  ctx.fillRect(x - 7 * z, y - H + 3 * z, 14 * z, 1.6 * z);
  for (const side of [-1, 1]) {
    const sway = Math.sin(time * 0.08 + seed * 10 + side) * 1.2 * z;
    const lx = x + side * 5.5 * z + sway;
    const ly = y - H + 9 * z;
    ctx.strokeStyle = 'rgba(60,40,30,0.8)';
    ctx.beginPath();
    ctx.moveTo(x + side * 5.5 * z, y - H + 4 * z);
    ctx.lineTo(lx, ly - 3.4 * z);
    ctx.stroke();
    ctx.fillStyle = side < 0 ? '#ff7fb3' : '#ffb0d0';
    outline(ctx, z);
    ctx.beginPath();
    ctx.ellipse(lx, ly, 3 * z, 3.6 * z, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(lx - 0.9 * z, ly - 1.2 * z, 0.9 * z, 1.3 * z, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(lx - 1.4 * z, ly + 3.2 * z, 2.8 * z, 1 * z);
  }
  // 꼭대기 벚꽃 송이
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + seed;
    ctx.fillStyle = i % 2 ? '#ffd1e6' : '#ff9cc7';
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 3.2 * z, y - H - 1 * z + Math.sin(a) * 2.2 * z, 2.2 * z, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#fff5a0';
  ctx.beginPath();
  ctx.arc(x, y - H - 1 * z, 1.1 * z, 0, TAU);
  ctx.fill();
}

/** 여름: 줄무늬 비치 파라솔 */
function drawParasol(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, seed: number): void {
  const H = 22 * z;
  outline(ctx, z);
  ctx.fillStyle = '#e8e2d0';
  ctx.fillRect(x - 0.7 * z, y - H, 1.4 * z, H);
  const cols = seed < 0.5 ? ['#ff5a5a', '#ffffff'] : ['#2f9be0', '#ffe066'];
  const R = 11 * z;
  const cy = y - H + 2 * z;
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI + (i / 6) * Math.PI;
    const a1 = Math.PI + ((i + 1) / 6) * Math.PI;
    ctx.fillStyle = cols[i % 2];
    ctx.beginPath();
    ctx.moveTo(x, cy - 8 * z);
    ctx.lineTo(x + Math.cos(a0) * R, cy + Math.sin(a0) * R * 0.25 + 2 * z);
    ctx.lineTo(x + Math.cos(a1) * R, cy + Math.sin(a1) * R * 0.25 + 2 * z);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x, cy - 8 * z);
  ctx.lineTo(x - R, cy + 2 * z);
  ctx.lineTo(x + R, cy + 2 * z);
  ctx.closePath();
  ctx.stroke();
}

/** 여름: 물보라를 뿜는 스프링클러와 비치볼 */
function drawSprinkler(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, time: number, seed: number): void {
  outline(ctx, z);
  // 비치볼
  const bx = x + 5 * z;
  const by = y - 2.6 * z;
  const cols = ['#ff5a5a', '#ffffff', '#3fa9f5', '#ffe066'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.arc(bx, by, 2.8 * z, (i / 4) * TAU + seed, ((i + 1) / 4) * TAU + seed);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(bx, by, 2.8 * z, 0, TAU);
  ctx.stroke();
  // 스프링클러 몸통
  ctx.fillStyle = '#2f80c9';
  ctx.beginPath();
  ctx.ellipse(x - 2 * z, y - 1 * z, 3.6 * z, 1.8 * z, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9fd8ff';
  ctx.fillRect(x - 2.8 * z, y - 6 * z, 1.6 * z, 5 * z);
  // 포물선을 그리며 떨어지는 물방울
  const top = { x: x - 2 * z, y: y - 6 * z };
  for (let i = 0; i < 10; i++) {
    const ph = ((time * 0.025 + i / 10 + seed) % 1);
    const dir = ((i * 7) % 10) / 10 * TAU + time * 0.01;
    const r = ph * 11 * z;
    const px = top.x + Math.cos(dir) * r;
    const py = top.y + Math.sin(dir) * r * 0.5 - (ph * (1 - ph)) * 26 * z;
    ctx.globalAlpha = 0.85 * (1 - ph * 0.6);
    ctx.fillStyle = i % 3 ? '#bfe9ff' : '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, (1 - ph * 0.4) * 1.3 * z, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 가을: 눈·입이 일렁이며 빛나는 호박 등 */
function drawPumpkin(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, time: number, seed: number): void {
  outline(ctx, z);
  const cy = y - 5 * z;
  ctx.fillStyle = '#e8741a';
  for (const [dx, rx] of [[-3.2, 3.4], [3.2, 3.4], [0, 4]] as const) {
    ctx.beginPath();
    ctx.ellipse(x + dx * z, cy, rx * z, 5 * z, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#4c7a2a';
  ctx.fillRect(x - 0.9 * z, cy - 7.4 * z, 1.8 * z, 3 * z);
  // 일렁이는 촛불 빛
  const flicker = 0.75 + 0.25 * Math.sin(time * 0.5 + seed * 20);
  ctx.fillStyle = `rgba(255,${Math.round(200 + 40 * flicker)},80,${flicker.toFixed(2)})`;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * 1 * z, cy - 1 * z);
    ctx.lineTo(x + side * 3.4 * z, cy - 1 * z);
    ctx.lineTo(x + side * 2.2 * z, cy - 3 * z);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x - 3.4 * z, cy + 1 * z);
  for (let i = 0; i <= 6; i++) ctx.lineTo(x - 3.4 * z + i * 1.13 * z, cy + (i % 2 ? 2.8 : 1.4) * z);
  ctx.lineTo(x + 3.4 * z, cy + 1 * z);
  ctx.quadraticCurveTo(x, cy + 4.4 * z, x - 3.4 * z, cy + 1 * z);
  ctx.fill();
}

/** 겨울: 별과 반짝이는 전구를 단 작은 트리 */
function drawXmasTree(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, time: number, seed: number): void {
  outline(ctx, z);
  ctx.fillStyle = '#7a4b2a';
  ctx.fillRect(x - 1.4 * z, y - 3 * z, 2.8 * z, 3 * z);
  const tiers: [number, number, number][] = [[3, 8, 8], [9, 6.5, 7], [14.5, 4.8, 6.5]];
  for (const [base, half, h] of tiers) {
    ctx.fillStyle = '#2e8b47';
    ctx.beginPath();
    ctx.moveTo(x - half * z, y - base * z);
    ctx.lineTo(x + half * z, y - base * z);
    ctx.lineTo(x, y - (base + h) * z);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 눈 쌓인 가장자리
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(x - half * 0.8 * z, y - base * z - 0.8 * z, half * 1.6 * z, 0.8 * z);
  }
  const bulbs = ['#ff4d4d', '#ffd54f', '#4fc3f7', '#ff8af0'];
  for (let i = 0; i < 9; i++) {
    const tier = tiers[i % 3];
    const fx = ((i * 37) % 10) / 10 - 0.5;
    const bx = x + fx * tier[1] * 1.3 * z;
    const by = y - (tier[0] + 1.5 + ((i * 13) % 3)) * z;
    const on = Math.sin(time * 0.15 + i * 1.7 + seed * 9) > -0.2;
    ctx.fillStyle = on ? bulbs[i % bulbs.length] : 'rgba(40,60,40,0.8)';
    ctx.beginPath();
    ctx.arc(bx, by, 0.95 * z, 0, TAU);
    ctx.fill();
  }
  // 꼭대기 별
  const sy = y - 21.6 * z;
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 1.4 : 3.2) * z;
    const a = (i / 10) * TAU - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** 입구 기둥 꼭대기 사이에 늘어뜨린 축제 깃발 줄 */
export function drawBunting(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, season: Season, z: number, time: number): void {
  const colors = FESTIVAL_COLORS[season];
  const sag = 7 * z;
  const at = (t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * sag });
  ctx.save();
  ctx.strokeStyle = 'rgba(60,40,30,0.9)';
  ctx.lineWidth = Math.max(1, 0.7 * z);
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const p = at(i / 16);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.stroke();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const p = at((i + 0.5) / n);
    const flap = Math.sin(time * 0.2 + i) * 0.8 * z;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(p.x - 2.2 * z, p.y);
    ctx.lineTo(p.x + 2.2 * z, p.y);
    ctx.lineTo(p.x + flap, p.y + 5.5 * z);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.stroke();
  }
  ctx.restore();
}
