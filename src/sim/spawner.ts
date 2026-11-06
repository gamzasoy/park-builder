import { feeFactor } from './economy';
import { createGuest, type Guest } from './guest';
import { eventActive, FIREWORKS_SPAWN_FACTOR, HYPE_SPAWN_FACTOR } from './events';
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
  const eventFactor = (eventActive(world, 'hype') ? HYPE_SPAWN_FACTOR : 1) * (world.fireworks ? FIREWORKS_SPAWN_FACTOR : 1);
  if (!world.rng.chance(base * ratingFactor * feeFactor(world.entranceFee) * weatherFactor * eventFactor)) return;
  admitGuest(world);
}

/** 손님 한 명을 입구에서 입장시킨다(입장료를 낼 수 없으면 돌아간다). vip면 돈이 모자라도 들어온다 */
export function admitGuest(world: World, vip = false): Guest | null {
  const guest = createGuest(world);
  if (vip && guest.money < world.entranceFee) guest.money = world.entranceFee;
  if (guest.money < world.entranceFee) return null; // 입장료를 낼 수 없으면 돌아감
  guest.money -= world.entranceFee;
  world.transact('entrance', world.entranceFee);
  world.guests.push(guest);
  world.stats.entered++;
  return guest;
}
