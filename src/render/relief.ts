/**
 * 지형 윗면의 모양. 지면 그리기와 마우스 피킹이 같은 기하를 쓰도록 한곳에 둔다.
 * 풀밭·건물 터는 칸 하나가 평평한 한 높이이고, 길은 높이가 1 다른 이웃 길 쪽으로 기울어
 * 칸 경계에서 이웃 길과 높이가 이어지는 경사로가 된다.
 */
import { connected } from '../sim/pathfinding';
import type { TileMap } from '../sim/map';

/** 윗면 네 모서리의 높이(단계, 실수): [위(T), 오른쪽(R), 아래(B), 왼쪽(L)] — 마름모 꼭짓점 순서 */
export type Corners = [number, number, number, number];

export function cornerLevels(map: TileMap, tx: number, ty: number): Corners {
  const t = map.heightAt(tx, ty);
  if (!map.isPath(tx, ty)) return [t, t, t, t];
  const d = (nx: number, ny: number): number => (connected(map, tx, ty, nx, ny) ? (map.heightAt(nx, ny) - t) / 2 : 0);
  const n = d(tx, ty - 1);
  const e = d(tx + 1, ty);
  const s = d(tx, ty + 1);
  const w = d(tx - 1, ty);
  return [t + n + w, t + n + e, t + s + e, t + s + w];
}

/** 연속 타일 좌표 (x, y) 위 윗면의 높이(단계). 맵 밖은 0. */
export function surfaceLevel(map: TileMap, x: number, y: number): number {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!map.inBounds(tx, ty)) return 0;
  if (!map.isPath(tx, ty)) return map.heightAt(tx, ty);
  const [T, R, B, L] = cornerLevels(map, tx, ty);
  const u = x - tx;
  const v = y - ty;
  return T * (1 - u) * (1 - v) + R * u * (1 - v) + B * u * v + L * (1 - u) * v;
}
