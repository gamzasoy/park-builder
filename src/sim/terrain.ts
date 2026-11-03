import { MAX_TERRAIN } from './map';
import type { Tile } from './map';
import { trackOccupancy } from './trackedit';
import type { World } from './world';

/** 지형 한 칸을 ±1 바꾸는 비용(환급 없음) */
export const TERRAIN_COST = 20;
/** 이웃한 칸(상하좌우)끼리 지형 높이가 이 값보다 더 벌어지게 할 수 없다 */
export const MAX_TERRAIN_STEP = 1;

export type TerrainMode = 'raise' | 'lower';
export type TerrainFailure = 'bounds' | 'limit' | 'path' | 'occupied' | 'entrance' | 'step' | 'money';
export type TerrainCheck = { ok: true } | { ok: false; reason: TerrainFailure };

const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * 타일 하나의 지형을 모드에 따라 ±1 바꿀 수 있는가. 돈은 보지 않는다(money 판정은 changeTerrain).
 * 막는 것: 맵 밖, 0~MAX_TERRAIN 밖, 길(입구 포함), 건물·낮은 트랙(map.occupant), 건물 입구 칸,
 * 올리면 땅에 묻히는 높은 트랙, 이웃과의 높이차가 1을 넘게 되는 변경.
 */
export function canChangeTerrain(world: World, x: number, y: number, mode: TerrainMode): TerrainCheck {
  const map = world.map;
  if (!map.inBounds(x, y)) return { ok: false, reason: 'bounds' };
  const next = map.heightAt(x, y) + (mode === 'raise' ? 1 : -1);
  if (next < 0 || next > MAX_TERRAIN) return { ok: false, reason: 'limit' };
  if (map.isPath(x, y)) return { ok: false, reason: 'path' };
  if (map.occupant[map.index(x, y)] !== 0) return { ok: false, reason: 'occupied' };
  // 아직 길이 없는 입구 칸도 건물과 같은 높이를 유지해야 한다
  for (const b of world.buildings.values()) {
    if (b.entrance.x === x && b.entrance.y === y) return { ok: false, reason: 'entrance' };
  }
  // 위로 떠 있는 트랙(지면 점유가 아닌 것)은 땅이 올라와 트랙 높이에 닿으면 안 된다
  if (mode === 'raise') {
    const idx = map.index(x, y);
    for (const seg of trackOccupancy(world).get(idx) ?? []) if (next > seg.hMin) return { ok: false, reason: 'occupied' };
  }
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (map.inBounds(nx, ny) && Math.abs(map.heightAt(nx, ny) - next) > MAX_TERRAIN_STEP) return { ok: false, reason: 'step' };
  }
  return { ok: true };
}

/** 한 칸을 바꾸고 비용을 낸다. 돈이 모자라면 'money'. */
export function changeTerrain(world: World, x: number, y: number, mode: TerrainMode): TerrainCheck {
  const check = canChangeTerrain(world, x, y, mode);
  if (!check.ok) return check;
  if (world.money < TERRAIN_COST) return { ok: false, reason: 'money' };
  world.map.setHeight(x, y, world.map.heightAt(x, y) + (mode === 'raise' ? 1 : -1));
  world.transact('construction', -TERRAIN_COST);
  return { ok: true };
}

/** 순서대로 각 칸을 ±1 한다(앞 칸의 변경이 뒤 칸의 이웃 검사에 반영됨). 돈이 모자라면 거기서 멈춘다. */
export function paintTerrain(
  world: World, tiles: Tile[], mode: TerrainMode,
): { changed: number; short: boolean; firstFail: TerrainFailure | null } {
  let changed = 0;
  let firstFail: TerrainFailure | null = null;
  for (const t of tiles) {
    const r = changeTerrain(world, t.x, t.y, mode);
    if (r.ok) changed++;
    else if (r.reason === 'money') return { changed, short: true, firstFail };
    else firstFail ??= r.reason;
  }
  return { changed, short: false, firstFail };
}

