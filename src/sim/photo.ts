import { hash32 } from '../core/hash';
import type { PlacedPiece, Track } from './coaster';
import { think, type Guest } from './guest';
import type { Building, World } from './world';

/** 롤러코스터 탑승 사진: 가격 / 사는 손님의 최소 행복 / 살 확률(%) / 산 손님의 행복 상승 */
export const PHOTO_PRICE = 8;
export const PHOTO_HAPPY = 50;
export const PHOTO_CHANCE = 45;
export const PHOTO_JOY = 3;

/**
 * 코스터에서 내린 손님이 탑승 사진을 산다. 기분이 좋고 돈이 있는 어른만(아이 사진은 보호자가 산다고 친다),
 * 같은 코스터 사진은 연달아 사지 않는다. 살지는 손님 id·운행 횟수로 결정한다(RNG를 쓰지 않는다).
 */
export function sellRidePhoto(world: World, b: Building, g: Guest): boolean {
  if (g.kid || g.photo === b.id || g.money < PHOTO_PRICE || g.needs.happiness < PHOTO_HAPPY) return false;
  if (hash32(g.id, b.cycles, 97) % 100 >= PHOTO_CHANCE) return false;
  g.money -= PHOTO_PRICE;
  g.photo = b.id;
  g.needs.happiness = Math.min(100, g.needs.happiness + PHOTO_JOY);
  world.transact('photos', PHOTO_PRICE);
  b.photos = (b.photos ?? 0) + 1;
  b.income += PHOTO_PRICE;
  world.stats.photos = (world.stats.photos ?? 0) + 1;
  think(g, 'photo');
  return true;
}

/**
 * 사진기가 서 있는 곳: 가장 크게 떨어지는 내리막 구간의 맨 아래 조각.
 * 내리막이 없는 코스는 null(사진은 팔지만 화면에 사진기를 그리지 않는다).
 */
export function photoSpot(t: Track): { piece: PlacedPiece; t: number } | null {
  let best: { i: number; drop: number } | null = null;
  let runStart = -1;
  for (let i = 0; i <= t.placed.length; i++) {
    const down = i < t.placed.length && t.placed[i].type === 'down';
    if (down && runStart < 0) runStart = i;
    if (!down && runStart >= 0) {
      const drop = t.placed[runStart].hIn - t.placed[i - 1].hOut;
      if (!best || drop > best.drop) best = { i: i - 1, drop };
      runStart = -1;
    }
  }
  if (!best || !t.pieceT[best.i]) return null;
  return { piece: t.placed[best.i], t: t.pieceT[best.i][1] };
}
