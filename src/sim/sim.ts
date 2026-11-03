import { buildingDef } from './coaster';
import { DAY_TICKS, settleDay } from './economy';
import { updateGuest } from './guest';
import { trackDebt, updateGoals } from './goals';
import { RATING_EVERY, updateRating } from './rating';
import { updateRide } from './ride';
import { updateShop } from './shop';
import { TUTORIAL_EVERY, updateTutorial } from './tutorial';
import { renumberQueue } from './venue';
import { updateSpawner } from './spawner';
import type { World } from './world';

/** 손님만 한 틱 진행(스포너 제외). 테스트에서 시나리오를 통제할 때 사용. */
export function stepGuests(world: World): void {
  world.tick++;
  world.guestById = new Map(world.guests.map((g) => [g.id, g]));
  for (const b of world.buildings.values()) {
    const def = buildingDef(b);
    if (def.kind === 'ride') updateRide(world, b, def);
    else updateShop(world, b, def);
    renumberQueue(world, b);
  }
  for (const g of world.guests) updateGuest(world, g);
  if (world.guests.some((g) => g.state === 'gone')) {
    world.guests = world.guests.filter((g) => g.state !== 'gone');
  }
}

/** 시뮬레이션 한 틱 */
export function stepWorld(world: World): void {
  // 목표 달성/실패로 끝난 게임은 정지(결과 화면). 'sandbox'는 목표 없이 계속 진행.
  if (world.status === 'won' || world.status === 'lost') return;

  updateSpawner(world);
  stepGuests(world);
  if (world.guests.length > world.stats.peakGuests) world.stats.peakGuests = world.guests.length;
  if (world.tick % RATING_EVERY === 0) updateRating(world);
  if (world.tick % DAY_TICKS === 0) {
    settleDay(world);
    trackDebt(world);
  }
  if (world.tick % TUTORIAL_EVERY === 0) updateTutorial(world);
  updateGoals(world);
}
