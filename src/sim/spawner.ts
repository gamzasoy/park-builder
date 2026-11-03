import { createGuest } from './guest';
import type { World } from './world';

export const MAX_GUESTS = 300;

/** 운영 중인 시설이 많을수록 손님이 더 자주 입장. (7단계에서 공원 평점 반영) */
export function updateSpawner(world: World): void {
  if (world.guests.length >= MAX_GUESTS) return;

  let operational = 0;
  for (const b of world.buildings.values()) if (world.network.isOperational(b)) operational++;
  if (operational === 0) return;

  const chance = Math.min(0.12, 0.02 + 0.015 * operational);
  if (world.rng.chance(chance)) {
    world.guests.push(createGuest(world));
    world.stats.entered++;
  }
}
