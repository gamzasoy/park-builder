import { getDef } from '../data';
import type { Preview } from '../input/tools';
import type { Tile } from '../sim/map';
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
    if (visible(s)) inset(ctx, s, hw, hh, undefined, 'rgba(255,220,80,0.9)');
  }

  // 3) 건물: 풋프린트의 가장 앞쪽 타일(x+y 최대) 순으로 뒤에서 앞으로
  const sorted = [...world.buildings.values()].sort((a, b) => (a.x + a.w + a.y + a.h) - (b.x + b.w + b.y + b.h));
  for (const b of sorted) drawBuilding(ctx, cam, b);

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
  poly(ctx, [up(top), up(right), up(bottom), up(left)], def.color);
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
