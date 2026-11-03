import type { BuildingDef } from '../data/types';
import { admit, release } from './venue';
import type { Building, World } from './world';

/** 정원이 차지 않아도 이 시간이 지나면 출발 */
export const LOAD_TICKS = 30;

/**
 * 놀이기구 사이클: idle → loading(탑승 대기, 정원 차거나 시간 초과 시 출발) → running → 하차 → idle.
 * 운영 불가(입구 끊김) 상태에서는 새 탑승을 받지 않고, 운행 중인 사이클만 마무리한다.
 */
export function updateRide(world: World, b: Building, def: BuildingDef): void {
  const operational = world.network.isOperational(b);

  if (b.phase === 'idle' && operational && b.queue.length > 0) {
    b.phase = 'loading';
    b.timer = LOAD_TICKS;
  }

  if (b.phase === 'loading') {
    if (operational) {
      while (b.inside.length < def.capacity && admit(world, b, def)) { /* 탑승 */ }
    }
    b.timer--;
    if (b.inside.length >= def.capacity || (b.timer <= 0 && b.inside.length > 0)) {
      b.phase = 'running';
      b.timer = def.duration;
    } else if (b.timer <= 0) {
      b.phase = 'idle';
    }
  } else if (b.phase === 'running') {
    if (--b.timer <= 0) {
      for (const id of [...b.inside]) release(world, b, def, id);
      b.phase = 'idle';
    }
  }
}
