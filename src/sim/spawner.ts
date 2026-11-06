import { hash32 } from '../core/hash';
import { PARADE_SPAWN_FACTOR } from './parade';
import { feeFactor } from './economy';
import { createGuest, type Guest } from './guest';
import { eventActive, FIREWORKS_SPAWN_FACTOR, HYPE_SPAWN_FACTOR } from './events';
import { isRaining, RAIN_SPAWN_FACTOR, STORM_SPAWN_FACTOR } from './weather';
import { maybeThief } from './thief';
import type { World } from './world';

export const MAX_GUESTS = 300;
/** 입장하는 손님 중 가족(보호자 + 아이 1~2명)의 비율(%) / 아이 입장료 배율 / 보호자가 더 챙겨 오는 돈 */
export const FAMILY_PCT = 25;
export const KID_FEE_FACTOR = 0.5;
export const PARENT_EXTRA_MONEY = 60;

/** 아이 입장료(반값, 원 단위 반올림) */
export const kidFee = (fee: number): number => Math.round(fee * KID_FEE_FACTOR);

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
  const weatherFactor = (isRaining(world) ? RAIN_SPAWN_FACTOR : 1) * (world.storm ? STORM_SPAWN_FACTOR : 1);
  const eventFactor = (eventActive(world, 'hype') ? HYPE_SPAWN_FACTOR : 1) * (world.fireworks ? FIREWORKS_SPAWN_FACTOR : 1) * (world.parade ? PARADE_SPAWN_FACTOR : 1);
  if (!world.rng.chance(base * ratingFactor * feeFactor(world.entranceFee) * weatherFactor * eventFactor)) return;
  // 가족인지는 다음 손님 id로 정한다(RNG 순서를 바꾸지 않는다)
  if (hash32(world.nextGuestId, 0, 89) % 100 < FAMILY_PCT) admitFamily(world);
  else {
    const g = admitGuest(world);
    if (g) maybeThief(world, g);
  }
}

/**
 * 보호자와 아이 1~2명을 함께 입장시킨다. 보호자가 자기 입장료와 아이 입장료(반값)를 모두 낸다.
 * 보호자가 입장료를 못 내면 가족 모두 돌아가고, 아이 몫이 모자라면 그 아이는 오지 않는다. 입장한 보호자를 돌려준다.
 */
export function admitFamily(world: World, kidCount = 1 + (hash32(world.nextGuestId, 0, 97) % 2)): Guest | null {
  const parent = admitGuest(world);
  if (!parent) return null;
  parent.money += PARENT_EXTRA_MONEY;
  const fee = kidFee(world.entranceFee);
  const kids: number[] = [];
  for (let i = 0; i < kidCount && world.guests.length < MAX_GUESTS && parent.money >= fee; i++) {
    const kid = createGuest(world);
    kid.kid = true;
    kid.leader = parent.id;
    kid.money = world.rng.int(20, 45); // 용돈
    kid.needs.happiness = Math.min(100, kid.needs.happiness + 8);
    kid.needs.energy = 100;
    parent.money -= fee;
    world.transact('entrance', fee);
    world.guests.push(kid);
    world.stats.entered++;
    kids.push(kid.id);
  }
  if (kids.length) {
    parent.kids = kids;
    parent.trip = 0;
    world.stats.families = (world.stats.families ?? 0) + 1;
  }
  return parent;
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
