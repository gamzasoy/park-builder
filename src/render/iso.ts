import { LEVEL_PX } from '../sim/coaster';

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

/**
 * 높이 단위: 지형 1단계 = 코스터 트랙 1단계 = LEVEL_PX 화면 px(월드 px, 확대 전).
 * 지형과 트랙이 같은 단위의 절대 높이라서 "트랙 최저 높이 ≥ 지형 높이"가 화면에서도 그대로 보인다.
 */
export const TERRAIN_LEVEL_PX = LEVEL_PX;

/** 높이(단계) → 월드 px */
export function terrainPx(level: number): number {
  return level * TERRAIN_LEVEL_PX;
}

/** 타일 좌표(실수)와 높이(단계) → 월드 픽셀. 높이 z만큼 위로 올라간다. */
export function tileToWorldZ(tx: number, ty: number, z: number): Vec2 {
  const w = tileToWorld(tx, ty);
  return { x: w.x, y: w.y - terrainPx(z) };
}
