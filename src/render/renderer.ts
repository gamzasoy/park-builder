import { getDef } from '../data';
import type { Preview } from '../input/tools';
import type { Tile } from '../sim/map';
import { MAX_QUEUE, type Guest } from '../sim/guest';
import type { Building, World } from '../sim/world';
import type { Camera } from './camera';
import { shade } from './color';
import { TILE_H, TILE_W, tileToWorld, type Vec2 } from './iso';

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  world: World,
  hover: Tile | null,
  preview: Preview | null,
  alpha: number,
): void {
  const map = world.map;
  ctx.fillStyle = '#1b2a1f';
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  const hw = (TILE_W / 2) * cam.zoom;
  const hh = (TILE_H / 2) * cam.zoom;
  const tileScreen = (tx: number, ty: number): Vec2 => {
    const w = tileToWorld(tx, ty);
    return cam.worldToScreen(w.x, w.y);
  };
  const visible = (s: Vec2): boolean =>
    !(s.x < -hw || s.x > cam.viewW + hw || s.y < -2 * hh || s.y > cam.viewH + hh);

  // 1) 지면: 잔디 / 길 / 입구
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const s = tileScreen(tx, ty);
      if (!visible(s)) continue;
      let fill: string;
      if (map.isGate(tx, ty)) fill = '#e0b84a';
      else if (map.isPath(tx, ty)) fill = '#cdb98e';
      else fill = (tx + ty) % 2 === 0 ? '#3a7a48' : '#357043';
      diamond(ctx, s.x, s.y, hw, hh, fill);
    }
  }

  // 2) 건물 입구 표시
  for (const b of world.buildings.values()) {
    const s = tileScreen(b.entrance.x, b.entrance.y);
    if (!visible(s)) continue;
    // 노랑 = 공원 입구와 연결됨(운영 가능), 빨강 = 끊김
    const ok = world.network.isOperational(b);
    inset(ctx, s, hw, hh, ok ? undefined : 'rgba(235,70,70,0.35)', ok ? 'rgba(255,220,80,0.9)' : 'rgba(235,70,70,0.95)');
  }

  // 3) 건물 + 손님: 깊이(타일 x+y 합) 순으로 뒤에서 앞으로.
  //    건물 키 = 풋프린트 앞쪽 모서리 합 - 0.5, 손님 키 = 보간된 위치 x+y. 동률이면 손님이 앞.
  const bKey = (b: Building): number => b.x + b.w + b.y + b.h - 0.5;
  const buildings = [...world.buildings.values()].sort((a, b) => bKey(a) - bKey(b));
  const walkers: { g: Guest; x: number; y: number }[] = [];
  for (const g of world.guests) {
    if (g.state === 'visiting' || g.state === 'gone') continue; // 시설 안에 있는 손님은 그리지 않음
    let x: number;
    let y: number;
    if (g.state === 'queueing') {
      // 입구 타일 안에서 순번별로 3x3 격자로 흩어 줄 선 모습을 표현
      x = g.x + ((g.slot % 3) - 1) * 0.22;
      y = g.y + ((((g.slot / 3) | 0) % 3) - 1) * 0.22;
    } else {
      x = g.px + (g.x - g.px) * alpha + laneOffset(g.id, 7919);
      y = g.py + (g.y - g.py) * alpha + laneOffset(g.id, 104729);
    }
    walkers.push({ g, x, y });
  }
  walkers.sort((a, b) => a.x + a.y - (b.x + b.y));

  let bi = 0;
  for (const w of walkers) {
    while (bi < buildings.length && bKey(buildings[bi]) <= w.x + w.y) drawBuilding(ctx, cam, buildings[bi++]);
    drawGuest(ctx, cam, w.g, w.x, w.y);
  }
  while (bi < buildings.length) drawBuilding(ctx, cam, buildings[bi++]);

  // 대기 인원 표시
  ctx.font = `bold ${Math.max(10, 12 * cam.zoom)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (const b of buildings) {
    if (b.queue.length === 0) continue;
    const s = tileScreen(b.entrance.x, b.entrance.y);
    if (!visible(s)) continue;
    const label = String(b.queue.length);
    const bx = s.x;
    const by = s.y - 22 * cam.zoom;
    const r = 9 * cam.zoom;
    ctx.fillStyle = b.queue.length >= MAX_QUEUE ? 'rgba(220,60,60,0.95)' : 'rgba(20,30,25,0.85)';
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(r, 8), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, bx, by + 4 * cam.zoom);
  }
  ctx.textAlign = 'start';

  // 4) 미리보기 / 호버
  if (preview) {
    for (const t of preview.tiles) {
      const s = tileScreen(t.x, t.y);
      diamond(ctx, s.x, s.y, hw, hh, t.ok ? 'rgba(90,230,130,0.5)' : 'rgba(235,70,70,0.55)', 'rgba(255,255,255,0.8)');
    }
    if (preview.entrance) {
      const s = tileScreen(preview.entrance.x, preview.entrance.y);
      inset(ctx, s, hw, hh, 'rgba(255,220,80,0.5)', 'rgba(255,220,80,1)');
    }
  } else if (hover && map.inBounds(hover.x, hover.y)) {
    const s = tileScreen(hover.x, hover.y);
    diamond(ctx, s.x, s.y, hw, hh, 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.9)');
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, cam: Camera, b: Building): void {
  const def = getDef(b.defId);
  const P = (tx: number, ty: number): Vec2 => {
    const w = tileToWorld(tx, ty);
    return cam.worldToScreen(w.x, w.y);
  };
  const top = P(b.x, b.y);
  const right = P(b.x + b.w, b.y);
  const bottom = P(b.x + b.w, b.y + b.h);
  const left = P(b.x, b.y + b.h);
  const h = def.height * cam.zoom;

  if (right.x < -50 || left.x > cam.viewW + 50 || bottom.y < -50 || top.y - h > cam.viewH + 50) return;

  const up = (p: Vec2): Vec2 => ({ x: p.x, y: p.y - h });
  poly(ctx, [left, bottom, up(bottom), up(left)], shade(def.color, 0.78));
  poly(ctx, [bottom, right, up(right), up(bottom)], shade(def.color, 0.55));
  // 운행 중인 놀이기구는 윗면을 밝게
  poly(ctx, [up(top), up(right), up(bottom), up(left)], b.phase === 'running' ? shade(def.color, 1.25) : def.color);
}

const LOOKS = ['#e8564a', '#4a8fe8', '#e8c24a', '#7bc86c', '#b06ce0', '#ef8fb4', '#4ac9c0', '#f08a3c'];

/** 같은 길 위에서 손님이 한 점에 겹치지 않도록 하는 고정 오프셋(타일 단위, 렌더 전용) */
function laneOffset(id: number, salt: number): number {
  return (((id * salt) % 100) / 100 - 0.5) * 0.3;
}

function drawGuest(ctx: CanvasRenderingContext2D, cam: Camera, g: Guest, tx: number, ty: number): void {
  const w = tileToWorld(tx, ty);
  const s = cam.worldToScreen(w.x, w.y);
  const z = cam.zoom;
  if (s.x < -20 || s.x > cam.viewW + 20 || s.y < -30 || s.y > cam.viewH + 30) return;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 6 * z, 3 * z, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = LOOKS[g.look % LOOKS.length];
  ctx.fillRect(s.x - 3 * z, s.y - 11 * z, 6 * z, 9 * z);
  ctx.fillStyle = '#f1d3b0';
  ctx.beginPath();
  ctx.arc(s.x, s.y - 14 * z, 3 * z, 0, Math.PI * 2);
  ctx.fill();
}

function poly(ctx: CanvasRenderingContext2D, pts: Vec2[], fill: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** (x, y)는 마름모의 위쪽 꼭짓점. */
function diamond(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, hw: number, hh: number,
  fill?: string, stroke?: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + hw, y + hh);
  ctx.lineTo(x, y + 2 * hh);
  ctx.lineTo(x - hw, y + hh);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

/** 타일 중앙에 70% 크기로 축소한 마름모(입구 표시용). s는 타일 위쪽 꼭짓점. */
function inset(
  ctx: CanvasRenderingContext2D,
  s: Vec2, hw: number, hh: number,
  fill?: string, stroke?: string,
): void {
  diamond(ctx, s.x, s.y + hh * 0.3, hw * 0.7, hh * 0.7, fill, stroke);
}
