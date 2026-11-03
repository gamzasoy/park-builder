import { feeFactor } from './economy';
import { createGuest } from './guest';
import { isRaining, RAIN_SPAWN_FACTOR } from './weather';
import type { World } from './world';

export const MAX_GUESTS = 300;

/**
 * 입장 확률(틱당) = 운영 중 시설 수에 따른 기본값 × 평점 보정 × 입장료 보정.
 * 입장료는 입장 시 손님에게서 받는다.
 */
export function updateSpawner(world: World): void {
  if (world.guests.length >= MAX_GUESTS) return;

  let operational = 0;
  for (const b of world.buildings.values()) if (world.network.isOperational(b)) operational++;
  if (operational === 0) return;

  const base = Math.min(0.12, 0.02 + 0.015 * operational);
  const ratingFactor = 0.4 + (world.rating / 1000) * 1.2;
  const weatherFactor = isRaining(world) ? RAIN_SPAWN_FACTOR : 1;
  if (!world.rng.chance(base * ratingFactor * feeFactor(world.entranceFee) * weatherFactor)) return;

  const guest = createGuest(world);
  if (guest.money < world.entranceFee) return; // 입장료를 낼 수 없으면 돌아감
  guest.money -= world.entranceFee;
  world.transact('entrance', world.entranceFee);
  world.guests.push(guest);
  world.stats.entered++;
}
