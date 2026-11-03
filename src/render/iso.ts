/** 2:1 아이소메트릭 좌표 변환. 타일 (0,0)의 위쪽 꼭짓점이 월드 원점. */
export const TILE_W = 64;
export const TILE_H = 32;

export interface Vec2 { x: number; y: number }

/** 타일 좌표(실수 가능) → 월드 픽셀. 정수 좌표는 타일 마름모의 위쪽 꼭짓점. */
export function tileToWorld(tx: number, ty: number): Vec2 {
  return { x: ((tx - ty) * TILE_W) / 2, y: ((tx + ty) * TILE_H) / 2 };
}

/** 월드 픽셀 → 타일 좌표(실수). 정수 타일은 Math.floor로 얻는다. */
export function worldToTile(wx: number, wy: number): Vec2 {
  const a = wx / (TILE_W / 2);
  const b = wy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
