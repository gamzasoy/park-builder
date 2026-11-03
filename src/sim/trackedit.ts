import {
  applyPiece, buildingDef, heightOk, MAX_PIECES, PIECE_COST, rebuild, trackTiles, type TrackType,
} from './coaster';
import { fairPrice, setPrice } from './economy';
import { evictAll } from './venue';
import type { Building, World } from './world';

export type TrackFailure = 'notrack' | 'closed' | 'max' | 'bounds' | 'occupied' | 'height' | 'entrance' | 'money';
export type TrackCheck = { ok: true } | { ok: false; reason: TrackFailure };

export const TRACK_FAIL_TEXT: Record<TrackFailure, string> = {
  notrack: '롤러코스터가 아닙니다',
  closed: '이미 코스가 이어졌습니다',
  max: '트랙이 너무 깁니다',
  bounds: '맵 밖으로 나갈 수 없습니다',
  occupied: '다음 칸에 이미 무언가 있습니다 (트랙끼리는 교차할 수 없습니다)',
  height: '더 올라가거나 내려갈 수 없습니다',
  entrance: '건물 입구를 막을 수 없습니다',
  money: '돈이 부족합니다',
};

/** 다음 조각을 놓을 수 있는지 */
export function canAppendPiece(world: World, b: Building, type: TrackType): TrackCheck {
  const t = b.track;
  if (!t) return { ok: false, reason: 'notrack' };
  if (t.closed) return { ok: false, reason: 'closed' };
  if (t.pieces.length >= MAX_PIECES) return { ok: false, reason: 'max' };
  const map = world.map;
  const c = t.cursor;
  if (!map.inBounds(c.x, c.y)) return { ok: false, reason: 'bounds' };
  if (map.occupant[map.index(c.x, c.y)] !== 0 || map.path[map.index(c.x, c.y)] === 1) {
    return { ok: false, reason: 'occupied' };
  }
  // 다른 건물(또는 자기 역)의 입구 칸을 덮으면 길을 놓을 수 없게 된다
  for (const o of world.buildings.values()) {
    if (o.entrance.x === c.x && o.entrance.y === c.y) return { ok: false, reason: 'entrance' };
  }
  if (!heightOk(c, type)) return { ok: false, reason: 'height' };
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
  world.map.occupant[world.map.index(next.x, next.y)] = b.id;
  world.map.scenery[world.map.index(next.x, next.y)] = 0;
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
  world.map.occupant[world.map.index(last.x, last.y)] = 0;
  t.spent -= PIECE_COST[type];
  world.transact('construction', PIECE_COST[type]);
  rebuild(b, t);
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

/** 이 코스의 트랙 타일 수(테스트/표시용) */
export const trackLength = (b: Building): number => trackTiles(b).length;
