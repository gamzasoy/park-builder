import { getDef } from '../data';
import { MAX_QUEUE } from './guest';
import type { RatingParts, World } from './world';

/** 평점 갱신 주기(틱) 와 한 번에 목표치로 다가가는 비율 */
export const RATING_EVERY = 50;
const SMOOTHING = 0.1;
const LONG_QUEUE = Math.floor((MAX_QUEUE * 2) / 3);

/**
 * 공원 평점(0~1000) 목표치:
 *  기본 150(운영 중인 놀이기구가 있을 때) + 만족도 400 + 다양성 250 + 흐름 200 − 불만 최대 200
 *  − 지저분함 최대 100 (청결 0~100점 중 깎인 만큼. 길이 깨끗하면 감점 없음)
 */
/** 길 한 칸당 쓰레기가 이만큼 쌓이면 청결이 0점 */
const FILTH_PER_TILE = 0.4;

/** 청결 점수(0~100): 길 타일 수 대비 쓰레기 양 */
export function cleanliness(world: World): number {
  const m = world.map;
  let paths = 0;
  let litter = 0;
  for (let i = 0; i < m.path.length; i++) {
    if (m.path[i] === 1) { paths++; litter += m.litter[i]; }
  }
  if (litter === 0) return 100;
  return Math.max(0, Math.round(100 * (1 - litter / (Math.max(20, paths) * FILTH_PER_TILE))));
}

export function computeRating(world: World): { total: number; parts: RatingParts } {
  const operational = [...world.buildings.values()].filter((b) => world.network.isOperational(b));
  const rides = new Set<string>();
  const shops = new Set<string>();
  let longQueues = 0;
  for (const b of operational) {
    const def = getDef(b.defId);
    (def.kind === 'ride' ? rides : shops).add(def.id);
    if (b.queue.length >= LONG_QUEUE) longQueues++;
  }

  const n = world.guests.length;
  const avgHappy = n >= 5 ? world.guests.reduce((a, g) => a + g.needs.happiness, 0) / n : 70;
  const unmet = world.guests.filter((g) => {
    const x = g.needs;
    return x.hunger > 80 || x.thirst > 80 || x.toilet > 80 || x.energy < 20;
  }).length;

  const parts: RatingParts = {
    base: rides.size > 0 ? 150 : 0,
    // 운영 중인 시설이 없으면 만족시킬 것도 없다
    satisfaction: operational.length > 0 ? (400 * avgHappy) / 100 : 0,
    variety: Math.min(rides.size, 8) * 20 + Math.min(shops.size, 6) * 15,
    flow: operational.length > 0 ? 200 * (1 - longQueues / operational.length) : 0,
    complaints: n > 0 ? (200 * unmet) / n : 0,
    cleanliness: cleanliness(world),
  };
  const raw = parts.base + parts.satisfaction + parts.variety + parts.flow - parts.complaints - (100 - parts.cleanliness);
  return { total: Math.max(0, Math.min(1000, Math.round(raw))), parts };
}

export function updateRating(world: World): void {
  const { total, parts } = computeRating(world);
  world.ratingParts = parts;
  world.rating += (total - world.rating) * SMOOTHING;
}
