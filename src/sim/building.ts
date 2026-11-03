import { sceneryDef, type SceneryDef } from '../data/scenery';
import type { BuildingDef } from '../data/types';
import { buildingDef, buildingTiles, newTrack } from './coaster';
import type { Tile } from './map';
import { trackOccupancy } from './trackedit';
import { evictAll } from './venue';
import { MAX_RELIABILITY } from './ride';
import { type Building, World } from './world';

export const PATH_COST = 10;
export const PATH_REFUND = 5;
export const REFUND_RATE = 0.5;

export interface Footprint { x: number; y: number; w: number; h: number }
export type PlaceFailure = 'bounds' | 'occupied' | 'path' | 'slope' | 'money';
export type PlaceCheck = { ok: true } | { ok: false; reason: PlaceFailure };

/** 회전(0~3)에 따른 풋프린트 크기. 홀수 회전은 가로/세로 교환. */
export function dims(def: BuildingDef, rot: number): { w: number; h: number } {
  return rot % 2 === 0 ? { w: def.w, h: def.h } : { w: def.h, h: def.w };
}

export function footprintAt(def: BuildingDef, x: number, y: number, rot: number): Footprint {
  const { w, h } = dims(def, rot);
  return { x, y, w, h };
}

/** 입구 타일: 회전 0 = +y쪽, 1 = +x쪽, 2 = -y쪽, 3 = -x쪽 변의 가운데 바깥. */
export function entranceOf(f: Footprint, rot: number): Tile {
  switch (((rot % 4) + 4) % 4) {
    case 0: return { x: f.x + Math.floor(f.w / 2), y: f.y + f.h };
    case 1: return { x: f.x + f.w, y: f.y + Math.floor(f.h / 2) };
    case 2: return { x: f.x + Math.floor(f.w / 2), y: f.y - 1 };
    default: return { x: f.x - 1, y: f.y + Math.floor(f.h / 2) };
  }
}

/** 커서가 풋프린트 중앙에 오도록 좌상단 앵커 계산. */
export function anchorFor(def: BuildingDef, rot: number, cursor: Tile): Tile {
  const { w, h } = dims(def, rot);
  return { x: cursor.x - Math.floor(w / 2), y: cursor.y - Math.floor(h / 2) };
}

export function canPlaceBuilding(world: World, def: BuildingDef, x: number, y: number, rot: number): PlaceCheck {
  const f = footprintAt(def, x, y, rot);
  const map = world.map;
  const occ = trackOccupancy(world);
  for (let ty = f.y; ty < f.y + f.h; ty++) {
    for (let tx = f.x; tx < f.x + f.w; tx++) {
      if (!map.inBounds(tx, ty)) return { ok: false, reason: 'bounds' };
      if (map.occupant[map.index(tx, ty)] !== 0) return { ok: false, reason: 'occupied' };
      if (map.path[map.index(tx, ty)] === 1) return { ok: false, reason: 'path' };
      // 머리 위로 지나가는 트랙 아래에도 지을 수 없다
      if (occ.has(map.index(tx, ty))) return { ok: false, reason: 'occupied' };
    }
  }
  // 건물은 풋프린트와 입구 칸이 모두 같은 높이(평평한 땅)여야 한다.
  // 입구 칸이 맵 밖이면 높이를 비교하지 않는다(기존 동작 유지).
  const base = map.heightAt(f.x, f.y);
  for (let ty = f.y; ty < f.y + f.h; ty++) {
    for (let tx = f.x; tx < f.x + f.w; tx++) if (map.heightAt(tx, ty) !== base) return { ok: false, reason: 'slope' };
  }
  const e = entranceOf(f, rot);
  if (map.inBounds(e.x, e.y) && map.heightAt(e.x, e.y) !== base) return { ok: false, reason: 'slope' };
  if (world.money < def.cost) return { ok: false, reason: 'money' };
  return { ok: true };
}

export function placeBuilding(world: World, def: BuildingDef, x: number, y: number, rot: number): Building | null {
  if (!canPlaceBuilding(world, def, x, y, rot).ok) return null;
  const f = footprintAt(def, x, y, rot);
  const b: Building = {
    id: world.nextBuildingId++,
    defId: def.id,
    ...f,
    rot,
    entrance: entranceOf(f, rot),
    queue: [],
    inside: [],
    phase: 'idle',
    timer: 0,
    price: def.price,
    served: 0,
    income: 0,
    reliability: MAX_RELIABILITY,
    broken: false,
    brokenTicks: 0,
    cycles: 0,
  };
  const map = world.map;
  for (let ty = f.y; ty < f.y + f.h; ty++) {
    for (let tx = f.x; tx < f.x + f.w; tx++) {
      map.occupant[map.index(tx, ty)] = b.id;
      map.scenery[map.index(tx, ty)] = 0; // 건물 자리의 나무·꽃은 치운다
    }
  }
  if (def.coaster) b.track = newTrack(b, def.cost);
  world.buildings.set(b.id, b);
  world.transact('construction', -def.cost);
  return b;
}

export function buildingAt(world: World, x: number, y: number): Building | null {
  if (!world.map.inBounds(x, y)) return null;
  const id = world.map.occupant[world.map.index(x, y)];
  return id ? (world.buildings.get(id) ?? null) : null;
}

/** 해당 타일의 건물, 길 또는 장식을 철거하고 환급액을 반환. 철거할 것이 없으면 null. 장식은 환급 없이 치운다. */
export function demolishAt(world: World, x: number, y: number): number | null {
  const map = world.map;
  const b = buildingAt(world, x, y);
  if (b) {
    evictAll(world, b);
    // 롤러코스터는 역 풋프린트뿐 아니라 트랙이 차지한 타일도 비운다(다른 건물/코스터의 점유는 건드리지 않는다)
    for (const t of buildingTiles(b)) {
      const i = map.index(t.x, t.y);
      if (map.occupant[i] === b.id) map.occupant[i] = 0;
    }
    world.buildings.delete(b.id);
    // 코스터의 cost는 지금까지 쓴 돈(역 + 조각)이라 환급도 그 절반
    const refund = Math.floor(buildingDef(b).cost * REFUND_RATE);
    world.transact('construction', refund);
    return refund;
  }
  if (map.isPath(x, y) && !map.isGate(x, y)) {
    map.setPath(x, y, false);
    world.transact('construction', PATH_REFUND);
    return PATH_REFUND;
  }
  if (map.sceneryAt(x, y) !== 0) {
    map.scenery[map.index(x, y)] = 0;
    return 0;
  }
  return null;
}

/** 장식은 길·건물이 없는 빈 타일에만, 이미 있는 장식 위에는 놓지 않는다 */
export function isSceneryPlaceable(world: World, x: number, y: number): boolean {
  const map = world.map;
  return isPathPlaceable(world, x, y) && map.scenery[map.index(x, y)] === 0;
}

/** 순서대로 장식을 놓되 돈이 허락하는 만큼만. placePaths와 같은 규칙. */
export function placeScenery(world: World, tiles: Tile[], def: SceneryDef): { placed: number; short: boolean } {
  if (!sceneryDef(def.kind)) return { placed: 0, short: false };
  let placed = 0;
  let short = false;
  for (const t of tiles) {
    if (!isSceneryPlaceable(world, t.x, t.y)) continue;
    if (world.money < def.cost) { short = true; break; }
    world.map.scenery[world.map.index(t.x, t.y)] = def.kind;
    world.transact('construction', -def.cost);
    placed++;
  }
  return { placed, short };
}

export function isPathPlaceable(world: World, x: number, y: number): boolean {
  const map = world.map;
  return map.inBounds(x, y) && !map.isPath(x, y) && map.occupant[map.index(x, y)] === 0;
}

/** a→b의 직선 타일(우세한 축 방향, 양 끝 포함). */
export function lineTiles(a: Tile, b: Tile): Tile[] {
  const out: Tile[] = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const step = dx >= 0 ? 1 : -1;
    for (let x = a.x; x !== b.x + step; x += step) out.push({ x, y: a.y });
  } else {
    const step = dy >= 0 ? 1 : -1;
    for (let y = a.y; y !== b.y + step; y += step) out.push({ x: a.x, y });
  }
  return out;
}

/** 순서대로 설치 가능한 타일에 길을 깔되 돈이 허락하는 만큼만. 설치한 수와 부족 여부를 반환. */
export function placePaths(world: World, tiles: Tile[]): { placed: number; short: boolean } {
  let placed = 0;
  let short = false;
  for (const t of tiles) {
    if (!isPathPlaceable(world, t.x, t.y)) continue;
    if (world.money < PATH_COST) { short = true; break; }
    world.map.setPath(t.x, t.y, true);
    world.transact('construction', -PATH_COST);
    placed++;
  }
  return { placed, short };
}
