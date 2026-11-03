import type { Camera } from './camera';
import { TILE_H, TILE_W, tileToWorld } from './iso';
import type { TileMap } from '../sim/map';

export interface Hover { x: number; y: number }

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  map: TileMap,
  hover: Hover | null,
): void {
  ctx.fillStyle = '#1b2a1f';
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  const hw = (TILE_W / 2) * cam.zoom;
  const hh = (TILE_H / 2) * cam.zoom;

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const w = tileToWorld(tx, ty);
      const s = cam.worldToScreen(w.x, w.y);
      // 화면 밖 타일 컬링
      if (s.x < -hw || s.x > cam.viewW + hw || s.y < -2 * hh || s.y > cam.viewH + hh) continue;
      const shade = (tx + ty) % 2 === 0 ? '#3a7a48' : '#357043';
      diamond(ctx, s.x, s.y, hw, hh, shade);
    }
  }

  if (hover && map.inBounds(hover.x, hover.y)) {
    const w = tileToWorld(hover.x, hover.y);
    const s = cam.worldToScreen(w.x, w.y);
    diamond(ctx, s.x, s.y, hw, hh, 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.9)');
  }
}

/** (x, y)는 마름모의 위쪽 꼭짓점. */
function diamond(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, hw: number, hh: number,
  fill: string, stroke?: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + hw, y + hh);
  ctx.lineTo(x, y + 2 * hh);
  ctx.lineTo(x - hw, y + hh);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
