import {
  applyPiece, buildingDef, heightOk, MAX_HEIGHT, MAX_PIECES, PIECE_COST, pieceRange, rebuild, trackTiles,
  type PlacedPiece, type TrackType,
} from './coaster';
import { fairPrice, setPrice } from './economy';
import { evictAll } from './venue';
import type { Building, World } from './world';

export type TrackFailure = 'notrack' | 'closed' | 'max' | 'bounds' | 'occupied' | 'height' | 'underground' | 'entrance' | 'money';
export type TrackCheck = { ok: true } | { ok: false; reason: TrackFailure };

export const TRACK_FAIL_TEXT: Record<TrackFailure, string> = {
  notrack: '롤러코스터가 아닙니다',
  closed: '이미 코스가 이어졌습니다',
  max: '트랙이 너무 깁니다',
  bounds: '맵 밖으로 나갈 수 없습니다',
  occupied: '다음 칸에 놓을 수 없습니다 (건물·길 위는 높이 2 이상, 다른 트랙과는 높이가 2단계 이상 떨어져야 합니다)',
  height: '더 올라가거나 내려갈 수 없습니다',
  underground: '지형 아래로 파고들 수 없습니다 (트랙 높이는 지형 높이 이상이어야 합니다)',
  entrance: '건물 입구를 막을 수 없습니다',
  money: '돈이 부족합니다',
};

/** 타일 하나를 지나는 트랙의 높이 구간 */
export interface TrackSeg { buildingId: number; hMin: number; hMax: number }

/** 이 높이 아래의 트랙은 지면 점유(map.occupant)로 친다. 그 위로 떠 있는 트랙은 아래를 비워 둔다 */
export const GROUND_LEVELS = 2;
/** 높이가 다른 트랙(또는 길 위)을 지나려면 필요한 최소 간격 */
export const CLEARANCE = 2;

/**
 * 모든 트랙의 타일별 높이 구간. 저장하지 않고 건물의 트랙에서 매번 계산한다.
 * (조각 수가 코스터당 60개 이하라 싸다)
 */
export function trackOccupancy(world: World): Map<number, TrackSeg[]> {
  const out = new Map<number, TrackSeg[]>();
  for (const b of world.buildings.values()) {
    if (!b.track) continue;
    for (const p of b.track.placed) {
      const idx = world.map.index(p.x, p.y);
      const { hMin, hMax } = pieceRange(p);
      const list = out.get(idx);
      if (list) list.push({ buildingId: b.id, hMin, hMax });
      else out.set(idx, [{ buildingId: b.id, hMin, hMax }]);
    }
  }
  return out;
}

/** 두 높이 구간이 충분히 떨어져 있는가 */
export function separated(a: { hMin: number; hMax: number }, b: { hMin: number; hMax: number }): boolean {
  return a.hMin >= b.hMax + CLEARANCE || a.hMax <= b.hMin - CLEARANCE;
}

/**
 * 지형과 트랙 높이: 트랙 조각의 높이 h는 지형 높이와 같은 단위의 **절대 높이**다(역 기준 상대값이 아님).
 * 조각의 가장 낮은 높이(hMin)가 그 타일의 지형 높이보다 낮으면(땅속) 놓을 수 없다.
 * 코스가 높이 0의 역 시작 칸으로 돌아와야 하므로, 실질적으로 역은 지형 높이 0 위에 지어야 완성할 수 있다.
 */
export const belowTerrain = (world: World, p: PlacedPiece): boolean =>
  pieceRange(p).hMin < world.map.heightAt(p.x, p.y);

/** 타일이 건물(역 포함)의 풋프린트인가 */
function inFootprint(world: World, x: number, y: number): boolean {
  const id = world.map.occupant[world.map.index(x, y)];
  const o = id ? world.buildings.get(id) : undefined;
  return !!o && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h;
}

/** 이 조각이 지면(map.occupant)을 차지하는가: 낮게 깔린 조각만 */
export const isGrounded = (p: PlacedPiece): boolean => pieceRange(p).hMin < GROUND_LEVELS;

/**
 * 조각을 그 타일에 놓을 수 있는가(범위·입구는 호출한 쪽에서 본다).
 * 건물 풋프린트는 불가, 다른 트랙과는 높이 구간이 2단계 이상 떨어져야 하고, 길 위는 최소 높이 2 이상이어야 한다.
 */
function tileFits(world: World, occ: Map<number, TrackSeg[]>, p: PlacedPiece): boolean {
  const map = world.map;
  const idx = map.index(p.x, p.y);
  if (inFootprint(world, p.x, p.y)) return false;
  const r = pieceRange(p);
  if (map.path[idx] === 1 && r.hMin < GROUND_LEVELS) return false;
  for (const s of occ.get(idx) ?? []) if (!separated(r, s)) return false;
  return true;
}

/** 저장된 코스터들의 트랙이 서로·길·건물과 충돌하지 않는지 확인하고, 지면 점유를 표시한다(불러오기용, 위반이면 throw) */
export function claimLoadedTracks(world: World): void {
  const map = world.map;
  const bs = [...world.buildings.values()].filter((b) => b.track);
  for (const b of bs) {
    for (const p of b.track!.placed) {
      if (!map.inBounds(p.x, p.y) || belowTerrain(world, p)) throw new Error('bad track footprint');
      const r = pieceRange(p);
      const idx = map.index(p.x, p.y);
      if (inFootprint(world, p.x, p.y) || (map.path[idx] === 1 && r.hMin < GROUND_LEVELS)) {
        throw new Error('bad track footprint');
      }
    }
  }
  const occ = trackOccupancy(world);
  for (const list of occ.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) if (!separated(list[i], list[j])) throw new Error('bad track crossing');
    }
  }
  for (const b of bs) {
    for (const p of b.track!.placed) {
      if (isGrounded(p)) map.occupant[map.index(p.x, p.y)] = b.id;
    }
  }
}

/** 마지막 조각을 걷어낸 뒤 그 타일의 지면 점유를 놓아 준다(같은 코스터의 낮은 조각이 남아 있으면 유지) */
function releaseTile(world: World, b: Building, p: PlacedPiece): void {
  const map = world.map;
  const idx = map.index(p.x, p.y);
  if (map.occupant[idx] !== b.id || inFootprint(world, p.x, p.y)) return;
  if (b.track!.placed.some((q) => q.x === p.x && q.y === p.y && isGrounded(q))) return;
  map.occupant[idx] = 0;
}

/**
 * 조각 아래 지지대가 닿을 높이. 같은 타일의 더 낮은 트랙 위에서 끝나고, 길 위라면 지지대를 세우지 않는다(null).
 */
export function supportBase(world: World, occ: Map<number, TrackSeg[]>, p: PlacedPiece): number | null {
  const idx = world.map.index(p.x, p.y);
  const r = pieceRange(p);
  if (world.map.path[idx] === 1 && r.hMin >= GROUND_LEVELS) return null;
  let base = 0;
  for (const s of occ.get(idx) ?? []) if (s.hMax < r.hMin) base = Math.max(base, s.hMax);
  return base;
}

/** 다음 조각을 놓을 수 있는지 */
export function canAppendPiece(world: World, b: Building, type: TrackType): TrackCheck {
  const t = b.track;
  if (!t) return { ok: false, reason: 'notrack' };
  if (t.closed) return { ok: false, reason: 'closed' };
  if (t.pieces.length >= MAX_PIECES) return { ok: false, reason: 'max' };
  const map = world.map;
  const c = t.cursor;
  if (!map.inBounds(c.x, c.y)) return { ok: false, reason: 'bounds' };
  // 다른 건물(또는 자기 역)의 입구 칸을 덮으면 길을 놓을 수 없게 된다
  for (const o of world.buildings.values()) {
    if (o.entrance.x === c.x && o.entrance.y === c.y) return { ok: false, reason: 'entrance' };
  }
  if (!heightOk(c, type)) return { ok: false, reason: 'height' };
  const next = applyPiece(c, type).placed;
  if (belowTerrain(world, next)) return { ok: false, reason: 'underground' };
  if (!tileFits(world, trackOccupancy(world), next)) return { ok: false, reason: 'occupied' };
  if (world.money < PIECE_COST[type]) return { ok: false, reason: 'money' };
  return { ok: true };
}

/** 조각을 이어 붙이고 비용을 낸다. 성공하면 true. */
export function appendPiece(world: World, b: Building, type: TrackType): TrackCheck {
  const check = canAppendPiece(world, b, type);
  if (!check.ok) return check;
  const t = b.track!;
  const wasOk = t.ok;
  const next = applyPiece(t.cursor, type).placed;
  if (isGrounded(next)) {
    // 낮게 깔린 트랙은 지면을 차지하고 장식을 치운다. 높이 떠 있는 트랙은 아래를 그대로 둔다
    world.map.occupant[world.map.index(next.x, next.y)] = b.id;
    world.map.scenery[world.map.index(next.x, next.y)] = 0;
  }
  t.pieces.push(type);
  t.spent += PIECE_COST[type];
  world.transact('construction', -PIECE_COST[type]);
  rebuild(b, t);
  // 처음 완성되는 순간 요금을 적정가로 맞춰 준다(손님이 외면하지 않게)
  if (!wasOk && t.ok && b.served === 0) setPrice(b, fairPrice(buildingDef(b)));
  return { ok: true };
}

/** 마지막 조각을 지우고 전액 환불. 지울 것이 없으면 false. */
export function undoPiece(world: World, b: Building): boolean {
  const t = b.track;
  if (!t || t.pieces.length === 0) return false;
  const last = t.placed[t.placed.length - 1];
  const type = t.pieces.pop()!;
  t.spent -= PIECE_COST[type];
  world.transact('construction', PIECE_COST[type]);
  rebuild(b, t);
  releaseTile(world, b, last);
  return true;
}

/** 트랙을 모두 걷어내고 환불(역은 남는다). 지운 조각 수를 반환. */
export function clearTrack(world: World, b: Building): number {
  let n = 0;
  while (undoPiece(world, b)) n++;
  return n;
}

/** 편집을 시작: 운행 중이던 손님은 내보내고 기구는 멈춘다. */
export function beginEdit(world: World, b: Building): void {
  evictAll(world, b);
  b.phase = 'idle';
  b.timer = 0;
}

/**
 * 코스터를 옮긴 뒤(moved: 새 역 위치로 다시 깐 트랙)의 트랙이 새 자리에 맞는가. 맞으면 null, 아니면 첫 실패 이유.
 * 자기 자신의 옛 역·트랙은 장애물로 치지 않는다.
 */
export function trackFitsAfterMove(world: World, b: Building, moved: Building): TrackFailure | null {
  const map = world.map;
  const occ = trackOccupancy(world);
  const inNew = (x: number, y: number): boolean => x >= moved.x && x < moved.x + moved.w && y >= moved.y && y < moved.y + moved.h;
  for (const p of moved.track!.placed) {
    if (!map.inBounds(p.x, p.y)) return 'bounds';
    const r = pieceRange(p);
    if (r.hMin < 0 || r.hMax > MAX_HEIGHT) return 'height';
    if (belowTerrain(world, p)) return 'underground';
    if (moved.entrance.x === p.x && moved.entrance.y === p.y) return 'entrance';
    for (const o of world.buildings.values()) {
      if (o.id !== b.id && o.entrance.x === p.x && o.entrance.y === p.y) return 'entrance';
    }
    const idx = map.index(p.x, p.y);
    const id = map.occupant[idx];
    if (inNew(p.x, p.y) || (id !== 0 && id !== b.id && inFootprint(world, p.x, p.y))) return 'occupied';
    if (map.path[idx] === 1 && r.hMin < GROUND_LEVELS) return 'occupied';
    for (const seg of occ.get(idx) ?? []) if (seg.buildingId !== b.id && !separated(r, seg)) return 'occupied';
  }
  return null;
}

/** 이 코스의 트랙 타일 수(테스트/표시용) */
export const trackLength = (b: Building): number => trackTiles(b).length;
