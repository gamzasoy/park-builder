/**
 * 지형 윗면의 모양. 지면 그리기와 마우스 피킹이 같은 기하를 쓰도록 한곳에 둔다.
 * 풀밭·건물 터는 칸 하나가 평평한 한 높이이고, 길은 높이가 1 다른 이웃 길 쪽으로 기울어
 * 칸 경계에서 이웃 길과 높이가 이어지는 경사로가 된다.
 */
import { connected } from '../sim/pathfinding';
import type { TileMap } from '../sim/map';

/** 윗면 네 모서리의 높이(단계, 실수): [위(T), 오른쪽(R), 아래(B), 왼쪽(L)] — 마름모 꼭짓점 순서 */
export type Corners = [number, number, number, number];

/**
 * 격자 꼭짓점 (vx, vy)의 높이. 그 꼭짓점에 닿은 길 칸 가운데, 그 꼭짓점을 지나는 변으로 이웃 길과 이어진 칸들의
 * 높이 평균이다(그런 칸이 없으면 undefined). 꼭짓점마다 값이 하나라서 이어진 두 칸의 맞닿은 변이 항상 맞는다.
 */
function vertexLevel(map: TileMap, vx: number, vy: number): number | undefined {
  let sum = 0;
  let n = 0;
  for (const [tx, ty] of [[vx - 1, vy - 1], [vx, vy - 1], [vx - 1, vy], [vx, vy]]) {
    if (!map.isPath(tx, ty)) continue;
    // 이 꼭짓점이 칸의 어느 모서리인지 → 그 모서리를 지나는 두 변의 이웃
    const right = vx === tx + 1;
    const bottom = vy === ty + 1;
    const nx = right ? tx + 1 : tx - 1;
    const ny = bottom ? ty + 1 : ty - 1;
    if (connected(map, tx, ty, nx, ty) || connected(map, tx, ty, tx, ny)) {
      sum += map.heightAt(tx, ty);
      n++;
    }
  }
  return n > 0 ? sum / n : undefined;
}

export function cornerLevels(map: TileMap, tx: number, ty: number): Corners {
  const t = map.heightAt(tx, ty);
  if (!map.isPath(tx, ty)) return [t, t, t, t];
  return [
    vertexLevel(map, tx, ty) ?? t,
    vertexLevel(map, tx + 1, ty) ?? t,
    vertexLevel(map, tx + 1, ty + 1) ?? t,
    vertexLevel(map, tx, ty + 1) ?? t,
  ];
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
