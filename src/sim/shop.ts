import type { BuildingDef } from '../data/types';
import { admit, release } from './venue';
import type { Building, World } from './world';

/** 매점: 정원(capacity)만큼 동시에 응대하고, 각자 duration 틱 후 해제. */
export function updateShop(world: World, b: Building, def: BuildingDef): void {
  for (const id of [...b.inside]) {
    const g = world.guestById.get(id);
    if (!g) {
      b.inside.splice(b.inside.indexOf(id), 1);
      continue;
    }
    if (--g.timer <= 0) release(world, b, def, id);
  }

  if (!world.network.isOperational(b)) return;
  while (b.inside.length < def.capacity) {
    const g = admit(world, b, def);
    if (!g) break;
    g.timer = def.duration;
  }
}
