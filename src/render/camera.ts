import type { Vec2 } from './iso';

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2.5;

/** (x, y)는 화면 중앙에 놓이는 월드 좌표. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  constructor(public viewW = 800, public viewH = 600) {}

  worldToScreen(wx: number, wy: number): Vec2 {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  /** 화면 픽셀만큼 이동(드래그용). */
  panByScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** 커서 아래 월드 지점을 고정한 채 줌. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }
}
