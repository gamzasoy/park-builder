import { getDef } from '../data';
import { updateGuest } from './guest';
import { updateRide } from './ride';
import { updateShop } from './shop';
import { renumberQueue } from './venue';
import { updateSpawner } from './spawner';
import type { World } from './world';

/** 손님만 한 틱 진행(스포너 제외). 테스트에서 시나리오를 통제할 때 사용. */
export function stepGuests(world: World): void {
  world.tick++;
  world.guestById = new Map(world.guests.map((g) => [g.id, g]));
  for (const b of world.buildings.values()) {
    const def = getDef(b.defId);
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
  updateSpawner(world);
  stepGuests(world);
}
